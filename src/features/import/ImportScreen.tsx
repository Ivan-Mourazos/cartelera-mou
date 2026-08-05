import {
  AlertTriangle,
  Check,
  CheckCheck,
  Edit3,
  FileSearch,
  FolderOpen,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { Poster } from "../../components/Poster";
import { ProgressPanel } from "../../components/ProgressPanel";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SpliceBand } from "../../components/SpliceBand";
import { StatusBadge } from "../../components/StatusBadge";
import { formatBytes } from "../../components/format";
import { sanitizeWindowsFilenameComponent } from "../../domain";
import { generateCandidateFilename } from "../../services/naming-bridge";
import type {
  AppSettings,
  DesktopGateway,
  PreflightResult,
  RenameBatchResult,
  ScanItem,
  ScanProgress,
  TmdbCandidate,
} from "../../services/types";
import { VirtualMediaList } from "./VirtualMediaList";

interface ImportScreenProps {
  gateway: DesktopGateway;
  settings: AppSettings;
  onProgressChange: (progress: ScanProgress | null) => void;
  onIdentified: () => Promise<void>;
  onCompleted: (result: RenameBatchResult) => Promise<void>;
}

function deriveStatus(item: ScanItem): ScanItem["status"] {
  if (item.warnings.some((warning) => warning.toLocaleLowerCase("es-ES").includes("existe")))
    return "conflict";
  if (item.matchLevel === "medium" || item.matchLevel === "low") return "review";
  return "ready";
}

function preserveExtension(value: string, extension: string): string {
  const requiredExtension = `.${extension.toLocaleLowerCase("es-ES")}`;
  const trimmed = value.trimEnd();
  if (trimmed.toLocaleLowerCase("es-ES").endsWith(requiredExtension)) return trimmed;
  const withoutTypedExtension = trimmed.replace(/\.[a-z0-9]{1,5}$/iu, "");
  return `${withoutTypedExtension}${requiredExtension}`;
}

function tagsFromFilename(filename: string): string[] {
  return [...filename.matchAll(/\[([^\]]+)\]/gu)]
    .map((match) => match[1]?.trim())
    .filter((tag): tag is string => Boolean(tag));
}

function filenameWithTags(filename: string, extension: string, tags: readonly string[]): string {
  const normalizedTags = tags
    .map((tag) => tag.replaceAll("[", " ").replaceAll("]", " "))
    .map((tag) => sanitizeWindowsFilenameComponent(tag.trim()).value)
    .filter((tag) => tag !== "_");
  const renderedTags = normalizedTags.map((tag) => `[${tag}]`).join(" ");
  const matches = [...filename.matchAll(/\[[^\]]+\]/gu)];
  if (matches.length > 0) {
    const first = matches[0];
    const last = matches.at(-1);
    if (first?.index !== undefined && last?.index !== undefined) {
      const prefix = filename.slice(0, first.index).trimEnd();
      const suffix = filename.slice(last.index + last[0].length).trimStart();
      const rebuilt = [prefix, renderedTags, suffix].filter(Boolean).join(" ");
      return preserveExtension(rebuilt.replace(/\s+\./gu, "."), extension);
    }
  }
  const requiredExtension = `.${extension.toLocaleLowerCase("es-ES")}`;
  const extensionStart = filename.toLocaleLowerCase("es-ES").lastIndexOf(requiredExtension);
  const stem = (extensionStart >= 0 ? filename.slice(0, extensionStart) : filename).trimEnd();
  return preserveExtension(`${stem}${renderedTags ? ` ${renderedTags}` : ""}`, extension);
}

export function ImportScreen({
  gateway,
  settings,
  onProgressChange,
  onIdentified,
  onCompleted,
}: ImportScreenProps) {
  const [folderPath, setFolderPath] = useState("");
  const [items, setItems] = useState<ScanItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [preflighting, setPreflighting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultNotice, setResultNotice] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<TmdbCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [identifyingCandidateId, setIdentifyingCandidateId] = useState<number | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState<string[]>([]);

  const activeItem = items.find((item) => item.id === activeId) ?? null;
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id) && item.status !== "excluded"),
    [items, selectedIds],
  );

  const summary = useMemo(() => {
    const counts = { ready: 0, review: 0, conflict: 0, excluded: 0 };
    for (const item of items) {
      if (item.status === "ready") counts.ready += 1;
      else if (item.status === "review") counts.review += 1;
      else if (item.status === "conflict" || item.status === "error") counts.conflict += 1;
      else if (item.status === "excluded") counts.excluded += 1;
    }
    return counts;
  }, [items]);

  async function chooseFolder() {
    setError(null);
    try {
      const selected = await gateway.selectFolder();
      if (selected) setFolderPath(selected);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo abrir el selector de carpetas.",
      );
    }
  }

  async function startScan() {
    if (!folderPath.trim()) {
      setError("Elige una carpeta antes de iniciar el análisis.");
      return;
    }
    setScanning(true);
    setError(null);
    setResultNotice(null);
    setItems([]);
    setSelectedIds(new Set());
    setCandidates([]);
    setSelectedCandidateId(null);
    try {
      const result = await gateway.scanFolder({ folderPath }, (nextProgress) => {
        setProgress(nextProgress);
        onProgressChange(nextProgress);
      });
      setItems(result.items);
      setActiveId(result.items[0]?.id ?? null);
      if (result.warnings.length > 0) setError(result.warnings.join(" "));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "El análisis no pudo completarse.");
      setProgress(null);
    } finally {
      setScanning(false);
      onProgressChange(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectReady() {
    setSelectedIds(new Set(items.filter((item) => item.status === "ready").map((item) => item.id)));
  }

  function toggleExcluded(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: item.status === "excluded" ? deriveStatus(item) : "excluded" }
          : item,
      ),
    );
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function changeProposal(value: string) {
    if (!activeId) return;
    setItems((current) =>
      current.map((item) =>
        item.id === activeId
          ? {
              ...item,
              proposedFilename: preserveExtension(value, item.extension),
              status: item.status === "excluded" ? "excluded" : "ready",
              tokens: [
                { id: "manual", label: value, source: "manual", kind: "title", edited: true },
              ],
            }
          : item,
      ),
    );
  }

  async function reviewCandidates() {
    if (!activeItem) return;
    setLoadingCandidates(true);
    setCandidates([]);
    try {
      const result = await gateway.searchTmdb({
        query: activeItem.title,
        year: activeItem.year,
        language: settings.titleLanguage,
        region: settings.region,
      });
      setCandidates(result);
      const preferredCandidate = result.reduce<TmdbCandidate | null>(
        (best, candidate) =>
          candidate.matchLevel === "high" &&
          candidate.matchScore >= settings.matchThreshold &&
          (best === null || candidate.matchScore > best.matchScore)
            ? candidate
            : best,
        null,
      );
      if (preferredCandidate) {
        await applyCandidate(preferredCandidate, { keepCandidates: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron consultar candidatos.");
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function applyCandidate(
    candidate: TmdbCandidate,
    options: { keepCandidates?: boolean } = {},
  ) {
    if (!activeId || !activeItem) return;
    const targetId = activeId;
    const generation = generateCandidateFilename(activeItem, candidate, settings);
    setIdentifyingCandidateId(candidate.tmdbId);
    try {
      const identifiedMovie = await gateway.identifyMediaFile({
        mediaFileId: activeItem.mediaFileId,
        candidate,
      });
      setItems((current) =>
        current.map((item) => {
          if (item.id !== targetId) return item;
          const matchWarnings = item.warnings.filter(
            (warning) => !/(candidat|resultado|título parecido|ya existe)/iu.test(warning),
          );
          return {
            ...item,
            movieId: identifiedMovie.id,
            title: candidate.title,
            originalTitle: candidate.originalTitle,
            year: candidate.year,
            posterUrl: identifiedMovie.posterUrl,
            proposedFilename: generation.generated.filename,
            matchScore: candidate.matchScore,
            matchLevel: candidate.matchLevel,
            scoreReasons: candidate.scoreReasons,
            status: generation.generated.validation.valid
              ? candidate.matchLevel === "high"
                ? "ready"
                : "review"
              : "conflict",
            warnings: [...matchWarnings, ...generation.generated.warnings],
            tokens: generation.tokens,
          };
        }),
      );
      if (!options.keepCandidates) setCandidates([]);
      setSelectedCandidateId(candidate.tmdbId);
      await onIdentified();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo guardar la identificación elegida.",
      );
    } finally {
      setIdentifyingCandidateId(null);
    }
  }

  function openTagEditor() {
    if (!activeItem) return;
    setTagDraft(tagsFromFilename(activeItem.proposedFilename));
    setTagEditorOpen(true);
  }

  function applyTagEdits() {
    if (!activeId || !activeItem) return;
    const proposedFilename = filenameWithTags(
      activeItem.proposedFilename,
      activeItem.extension,
      tagDraft,
    );
    const normalizedTags = tagsFromFilename(proposedFilename);
    setItems((current) =>
      current.map((item) => {
        if (item.id !== activeId) return item;
        const extensionToken = item.tokens.find((token) => token.kind === "extension");
        const leadingTokens = item.tokens.filter(
          (token) => token.kind !== "tag" && token.kind !== "extension",
        );
        const warnings = item.warnings.filter(
          (warning) => !warning.toLocaleLowerCase("es-ES").includes("existe"),
        );
        return {
          ...item,
          proposedFilename,
          status: item.status === "excluded" ? "excluded" : "ready",
          warnings,
          tokens: [
            ...leadingTokens,
            ...normalizedTags.map((label, index) => ({
              id: `manual-tag-${index}`,
              label: `[${label}]`,
              source: "manual" as const,
              kind: "tag" as const,
              edited: true,
            })),
            ...(extensionToken ? [extensionToken] : []),
          ],
        };
      }),
    );
    setTagEditorOpen(false);
  }

  async function runPreflight() {
    if (selectedItems.length === 0) {
      setError("Selecciona al menos un archivo listo antes de continuar.");
      return;
    }
    setPreflighting(true);
    setError(null);
    try {
      const result = await gateway.preflightRenameBatch({
        items: selectedItems.map((item) => ({
          clientId: item.id,
          mediaFileId: item.mediaFileId,
          proposedFilename: item.proposedFilename,
          manualOverride: item.tokens.some((token) => token.source === "manual" || token.edited),
        })),
      });
      setPreflight(result);
      setConfirmationOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo comprobar el lote.");
    } finally {
      setPreflighting(false);
    }
  }

  async function executeRename() {
    if (!preflight?.valid || selectedItems.length === 0) return;
    setExecuting(true);
    try {
      const result = await gateway.executeRenameBatch({
        items: selectedItems.map((item) => ({
          clientId: item.id,
          mediaFileId: item.mediaFileId,
          proposedFilename: item.proposedFilename,
          manualOverride: item.tokens.some((token) => token.source === "manual" || token.edited),
        })),
      });
      const statuses = new Map(result.results.map((item) => [item.clientId, item.status]));
      setItems((current) =>
        current.map((item) => {
          const status = statuses.get(item.id);
          return status ? { ...item, status: status === "completed" ? "renamed" : "error" } : item;
        }),
      );
      setSelectedIds(new Set());
      setConfirmationOpen(false);
      setResultNotice(
        `${result.succeeded} archivos renombrados${result.failed > 0 ? ` · ${result.failed} no cambiaron` : ""}.`,
      );
      await onCompleted(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "El lote no pudo ejecutarse.");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="screen import-screen">
      <ScreenHeader
        eyebrow="Renombrado seguro"
        title="Importar"
        description="Analiza primero, revisa cada propuesta y confirma el cambio de forma explícita."
        actions={
          <div className="header-actions">
            <Button
              leadingIcon={<FolderOpen size={17} />}
              onClick={() => void chooseFolder()}
              disabled={scanning}
            >
              Elegir carpeta
            </Button>
            <Button
              variant="primary"
              leadingIcon={<FileSearch size={17} />}
              onClick={() => void startScan()}
              disabled={scanning || !folderPath.trim()}
            >
              {scanning ? "Analizando…" : "Iniciar análisis"}
            </Button>
          </div>
        }
      />

      <label className="folder-field">
        <span>Carpeta</span>
        <input
          value={folderPath}
          onChange={(event) => setFolderPath(event.target.value)}
          placeholder="Selecciona una carpeta de películas"
          spellCheck={false}
          disabled={scanning}
        />
        <span className="folder-field__read-only">Solo lectura durante el análisis</span>
      </label>

      {error ? (
        <Notice
          tone="error"
          title="La operación necesita atención"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}
      {resultNotice ? (
        <Notice
          tone="success"
          title="Lote completado"
          message={resultNotice}
          onDismiss={() => setResultNotice(null)}
        />
      ) : null}
      {progress ? <ProgressPanel progress={progress} /> : null}

      {items.length === 0 && !scanning ? (
        <EmptyState
          icon={FolderOpen}
          title="Selecciona una carpeta para empezar"
          description="La aplicación solo leerá los archivos hasta que confirmes un cambio. Nunca sobrescribe un destino existente."
          action={
            <Button variant="primary" onClick={() => void chooseFolder()}>
              Elegir una carpeta
            </Button>
          }
        />
      ) : null}

      {items.length > 0 ? (
        <>
          <section className="import-summary" aria-label="Resumen del análisis">
            <span>
              <Check size={15} aria-hidden="true" /> {summary.ready} listos
            </span>
            <span>
              <Search size={15} aria-hidden="true" /> {summary.review} por revisar
            </span>
            <span>
              <AlertTriangle size={15} aria-hidden="true" /> {summary.conflict} conflictos
            </span>
            <span>{summary.excluded} excluidos</span>
            <Button
              size="compact"
              variant="ghost"
              leadingIcon={<CheckCheck size={16} />}
              onClick={selectReady}
            >
              Seleccionar listos
            </Button>
          </section>
          <div className="import-workbench">
            <VirtualMediaList
              items={items}
              selectedIds={selectedIds}
              activeId={activeId}
              onActivate={(id) => {
                setActiveId(id);
                setCandidates([]);
                setSelectedCandidateId(null);
              }}
              onToggleSelected={toggleSelected}
              onToggleExcluded={toggleExcluded}
            />
            <aside className="import-inspector" aria-label="Inspector del archivo seleccionado">
              {activeItem ? (
                <>
                  <div className="inspector-heading">
                    <span className="inspector-poster">
                      <Poster
                        src={activeItem.posterUrl}
                        title={activeItem.title}
                        accentKey={activeItem.mediaFileId}
                      />
                    </span>
                    <div>
                      <p className="eyebrow">Archivo seleccionado</p>
                      <h2>{activeItem.title}</h2>
                      <p>
                        {activeItem.year ?? "Año por revisar"} ·{" "}
                        {activeItem.resolution ?? "Resolución desconocida"} ·{" "}
                        {formatBytes(activeItem.sizeBytes)}
                      </p>
                      <div className="inspector-heading__badges">
                        <StatusBadge status={activeItem.status} />
                        <StatusBadge
                          status={activeItem.matchLevel}
                          label={
                            activeItem.matchScore === null
                              ? "Sin puntuación"
                              : `${activeItem.matchScore} puntos`
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <SpliceBand
                    currentName={activeItem.originalFilename}
                    proposedName={activeItem.proposedFilename}
                    tokens={activeItem.tokens}
                    editable
                    onProposedNameChange={changeProposal}
                  />

                  <div className="inspector-actions">
                    <Button
                      leadingIcon={<Search size={16} />}
                      onClick={() => void reviewCandidates()}
                      disabled={loadingCandidates}
                    >
                      {loadingCandidates ? "Buscando…" : "Revisar candidatos"}
                    </Button>
                    <Button
                      variant="ghost"
                      leadingIcon={<Edit3 size={16} />}
                      onClick={() => document.getElementById("proposed-filename")?.focus()}
                    >
                      Editar propuesta
                    </Button>
                    <Button variant="ghost" onClick={openTagEditor}>
                      Editar etiquetas
                    </Button>
                  </div>

                  {activeItem.warnings.length > 0 ? (
                    <div className="inspector-warning">
                      <AlertTriangle size={17} aria-hidden="true" />
                      <div>
                        <strong>Revisión necesaria</strong>
                        {activeItem.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {candidates.length > 0 ? (
                    <section className="candidate-list" aria-label="Candidatos de TMDb">
                      <p className="eyebrow">Candidatos</p>
                      {candidates.map((candidate) => (
                        <article key={candidate.tmdbId}>
                          <div>
                            <strong>{candidate.title}</strong>
                            <span>
                              {candidate.originalTitle} · {candidate.year ?? "Sin año"}
                            </span>
                            <small>
                              {candidate.matchScore} puntos ·{" "}
                              {candidate.scoreReasons.map((reason) => reason.label).join(" · ")}
                            </small>
                          </div>
                          <Button
                            size="compact"
                            disabled={
                              identifyingCandidateId !== null ||
                              selectedCandidateId === candidate.tmdbId
                            }
                            onClick={() => void applyCandidate(candidate)}
                          >
                            {identifyingCandidateId === candidate.tmdbId
                              ? "Guardando…"
                              : selectedCandidateId === candidate.tmdbId
                                ? "Aplicado"
                                : "Usar"}
                          </Button>
                        </article>
                      ))}
                    </section>
                  ) : null}

                  <section className="score-reasons">
                    <p className="eyebrow">Cómo se calculó</p>
                    {activeItem.scoreReasons.map((reason) => (
                      <div key={`${reason.label}-${reason.points}`}>
                        <span>{reason.label}</span>
                        <strong className={reason.points < 0 ? "is-negative" : ""}>
                          {reason.points > 0 ? "+" : ""}
                          {reason.points}
                        </strong>
                      </div>
                    ))}
                  </section>
                </>
              ) : (
                <p>Selecciona un archivo para revisar la propuesta.</p>
              )}
            </aside>
          </div>
          <footer className="import-action-bar">
            <div>
              <strong>{selectedItems.length} seleccionados</strong>
              <span>
                {summary.conflict > 0
                  ? `${summary.conflict} conflictos no se incluirán`
                  : "Sin conflictos seleccionados"}
              </span>
            </div>
            <Button
              variant="primary"
              leadingIcon={<ShieldCheck size={18} />}
              onClick={() => void runPreflight()}
              disabled={preflighting || selectedItems.length === 0}
            >
              {preflighting
                ? "Comprobando…"
                : `Revisar y renombrar ${selectedItems.length || ""}`.trim()}
            </Button>
          </footer>
        </>
      ) : null}

      {confirmationOpen && preflight ? (
        <Modal
          title="Confirmar renombrado"
          description={`${selectedItems.length} archivos cambiarán en la carpeta seleccionada.`}
          onClose={() => setConfirmationOpen(false)}
          closeDisabled={executing}
          footer={
            <>
              <Button onClick={() => setConfirmationOpen(false)} disabled={executing}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                leadingIcon={<ShieldCheck size={17} />}
                disabled={!preflight.valid || executing}
                onClick={() => void executeRename()}
              >
                {executing ? "Renombrando…" : `Renombrar ${preflight.readyCount} archivos`}
              </Button>
            </>
          }
        >
          <div className="confirmation-summary">
            <div className="confirmation-count">
              <strong>{preflight.readyCount}</strong>
              <span>listos para cambiar</span>
            </div>
            <div className="safety-list">
              <p>
                <Check size={16} /> El origen se validará de nuevo antes de cada cambio.
              </p>
              <p>
                <Check size={16} /> Ningún archivo existente se sobrescribirá.
              </p>
              <p>
                <Check size={16} /> Cada resultado quedará registrado en Historial.
              </p>
            </div>
            {preflight.issues.length > 0 ? (
              <div className="preflight-issues">
                <strong>
                  {preflight.valid ? "Avisos del lote" : "Resuelve estos bloqueos para continuar"}
                </strong>
                {preflight.issues.map((issue, index) => (
                  <p key={`${issue.clientId}-${issue.code}-${index}`}>
                    <AlertTriangle size={15} /> {issue.message}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {tagEditorOpen && activeItem ? (
        <Modal
          title="Editar etiquetas"
          description="Cada característica se conservará en su propio par de corchetes."
          onClose={() => setTagEditorOpen(false)}
          footer={
            <>
              <Button onClick={() => setTagEditorOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={applyTagEdits}>
                Aplicar etiquetas
              </Button>
            </>
          }
        >
          <div className="tag-editor-list">
            {tagDraft.length === 0 ? (
              <p className="tag-editor-empty">Este archivo no tiene etiquetas técnicas.</p>
            ) : null}
            {tagDraft.map((tag, index) => (
              <label className="tag-editor-row" key={`tag-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <input
                  value={tag}
                  aria-label={`Etiqueta ${index + 1}`}
                  onChange={(event) =>
                    setTagDraft((current) =>
                      current.map((value, currentIndex) =>
                        currentIndex === index ? event.target.value : value,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Eliminar etiqueta ${tag || index + 1}`}
                  onClick={() =>
                    setTagDraft((current) =>
                      current.filter((_, currentIndex) => currentIndex !== index),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </label>
            ))}
            <Button
              size="compact"
              variant="ghost"
              leadingIcon={<Plus size={15} />}
              onClick={() => setTagDraft((current) => [...current, ""])}
            >
              Añadir etiqueta
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
