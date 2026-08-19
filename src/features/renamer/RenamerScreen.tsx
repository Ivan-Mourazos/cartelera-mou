import {
  FileVideo,
  FolderOpen,
  KeyRound,
  ListChecks,
  Loader2,
  Plus,
  Settings,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";

import {
  filesFromDataTransfer,
  openDirectoryPicker,
  openFilesPicker,
  supportsDirectRename,
} from "../../services/file-system";
import { BatchPreviewDialog } from "./BatchPreviewDialog";
import { FileRow } from "./FileRow";
import { NoticeStack } from "./NoticeStack";
import { ReviewMode } from "./ReviewMode";
import { rowStateOf, type RowState } from "./row-model";
import { SettingsPanel } from "./SettingsPanel";
import { useRenamerState } from "./useRenamerState";

const FILTERS: readonly { readonly state: RowState | undefined; readonly label: string }[] = [
  { state: undefined, label: "Todos" },
  { state: "ready", label: "Listos" },
  { state: "review", label: "Revisar" },
  { state: "error", label: "Error" },
];

export function RenamerScreen() {
  const state = useRenamerState();
  const [showSettings, setShowSettings] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const openFolder = async (): Promise<void> => {
    const result = await openDirectoryPicker();
    if (result === null) return;
    state.setDirectory(result.directoryHandle ?? null);
    state.setFolderName(result.folderName);
    state.setExistingNames(result.existingNames);
    await state.addFiles(result.files, true);
  };

  const addFiles = async (): Promise<void> => {
    const files = await openFilesPicker();
    if (files === null) return;
    await state.addFiles(files, false);
  };

  const dropHandlers = {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => {
      setDragOver(false);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOver(false);
      void (async () => {
        await state.addFiles(await filesFromDataTransfer(event.dataTransfer), false);
      })();
    },
  };

  /** Los que piden una decisión: son los que alimentan el modo revisión. */
  const pending = useMemo(
    () =>
      state.items.filter((item) => {
        const rowState = rowStateOf(item, state.planById.get(item.id));
        return rowState === "review" || rowState === "error";
      }),
    [state.items, state.planById],
  );

  const reviewQueue =
    state.reviewId === null ? pending : state.items.filter((item) => item.id === state.reviewId);

  return (
    <>
      <main className="app-main" {...dropHandlers}>
        {state.items.length === 0 ? (
          <section className={`dropzone ${dragOver ? "is-over" : ""}`}>
            <span className="dropzone-icon" aria-hidden>
              <FileVideo size={22} />
            </span>
            <h1 className="dropzone-title">Arrastra tus vídeos aquí</h1>
            <p className="dropzone-sub">
              Se lee el archivo de verdad —resolución, códec, audio, peso— y se propone un nombre.
            </p>
            <div className="dropzone-actions">
              <button type="button" className="btn btn-primary" onClick={() => void addFiles()}>
                <Plus size={14} aria-hidden /> Elegir archivos
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void openFolder()}>
                <FolderOpen size={14} aria-hidden /> Abrir carpeta
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setShowSettings(true);
                }}
                title="Configuración"
              >
                <Settings size={14} />
              </button>
            </div>

            {state.provider.available ? null : (
              <p className="notice-inline">
                <KeyRound size={12} aria-hidden />
                Sin clave de TMDb los títulos salen del nombre del archivo.
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setShowSettings(true);
                  }}
                >
                  Añadir clave
                </button>
              </p>
            )}

            {supportsDirectRename() ? null : (
              <p className="notice-inline warn">
                Este navegador no puede renombrar. Usa Chrome, Edge u otro basado en Chromium.
              </p>
            )}
          </section>
        ) : (
          <>
            {/* Toda la acción vive aquí arriba: nada flota al pie. */}
            <section className="command-bar">
              <div className="counters">
                <span className="counter-total">{state.items.length} archivos</span>
                {state.counts.analyzing > 0 ? (
                  <span className="counter c-idle">{state.counts.analyzing} analizando</span>
                ) : null}
                {state.counts.ready > 0 ? (
                  <span className="counter c-ready">{state.counts.ready} listos</span>
                ) : null}
                {state.counts.review > 0 ? (
                  <span className="counter c-review">{state.counts.review} revisar</span>
                ) : null}
                {state.counts.error > 0 ? (
                  <span className="counter c-error">{state.counts.error} error</span>
                ) : null}
                {state.progress.active ? (
                  <span className="counter c-busy">
                    <Loader2 size={11} className="spin" aria-hidden />
                    {state.progress.label} {state.progress.done}/{state.progress.total}
                    <button type="button" className="link" onClick={state.cancel}>
                      cancelar
                    </button>
                  </span>
                ) : null}
              </div>

              <div className="command-actions">
                {pending.length > 0 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      state.openReview(null);
                    }}
                  >
                    <ListChecks size={14} aria-hidden /> Revisar {pending.length}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={pending.length > 0 ? "btn btn-ghost" : "btn btn-primary"}
                  onClick={state.openPreview}
                  disabled={state.plan.readyCount === 0 || state.progress.active}
                  title={
                    pending.length > 0
                      ? `${String(pending.length)} archivo(s) siguen sin confirmar; se renombrarán igual si continúas`
                      : "Previsualizar y renombrar"
                  }
                >
                  <Wand2 size={14} aria-hidden /> Renombrar {state.plan.readyCount}
                </button>
                {state.undoable === undefined ? null : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void state.undoLast()}
                    title="Deshacer el último lote"
                  >
                    <Undo2 size={14} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void addFiles()}
                  title="Añadir archivos"
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => {
                    setShowSettings(true);
                  }}
                  title="Configuración"
                >
                  <Settings size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={state.clearAll}
                  title="Vaciar la lista"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </section>

            <section className="filter-bar">
              <div className="segmented" role="group" aria-label="Filtrar por estado">
                {FILTERS.map(({ state: rowState, label }) => (
                  <button
                    key={label}
                    type="button"
                    className={state.filter.state === rowState ? "seg is-on" : "seg"}
                    aria-pressed={state.filter.state === rowState}
                    onClick={() => {
                      state.setFilter({ ...state.filter, state: rowState });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="visually-hidden" htmlFor="filter-text">
                Filtrar por nombre
              </label>
              <input
                id="filter-text"
                className="filter-input"
                type="search"
                placeholder="Filtrar…"
                value={state.filter.text ?? ""}
                onChange={(event) => {
                  state.setFilter({ ...state.filter, text: event.target.value });
                }}
              />

              {state.selected.size === 0 ? null : (
                <div className="bulk">
                  <span>{state.selected.size} sel.</span>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => {
                      state.batchSetKind("movie");
                    }}
                  >
                    Película
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => {
                      state.batchSetKind("series");
                    }}
                  >
                    Serie
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => void state.retrySelected()}
                  >
                    Reintentar
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={state.removeSelected}>
                    Quitar
                  </button>
                </div>
              )}
            </section>

            {state.canCheckDestination ? null : (
              <p className="notice-inline warn">
                Con archivos sueltos no se puede comprobar si ya existe otro con el nombre nuevo.
                Abre la carpeta si quieres esa comprobación.
              </p>
            )}

            <section className={`file-list ${dragOver ? "is-over" : ""}`}>
              {state.visibleItems.length === 0 ? (
                <p className="list-empty">Ningún archivo coincide con el filtro.</p>
              ) : (
                state.visibleItems.map((item) => (
                  <FileRow
                    key={item.id}
                    item={item}
                    state={rowStateOf(item, state.planById.get(item.id))}
                    selected={state.selected.has(item.id)}
                    onToggleSelected={state.toggleSelected}
                    onOverrideName={state.setNameOverride}
                    onReview={(id) => {
                      state.openReview(id);
                    }}
                    onRemove={state.removeItem}
                  />
                ))
              )}
            </section>
          </>
        )}
      </main>

      {state.provider.available ? (
        <footer className="app-footer">{state.provider.attribution.notice}</footer>
      ) : null}

      {showSettings ? (
        <SettingsPanel
          settings={state.settings}
          provider={state.provider}
          onChange={state.updateSettings}
          onClose={() => {
            setShowSettings(false);
          }}
        />
      ) : null}

      {state.previewOpen ? (
        <BatchPreviewDialog
          plan={state.plan}
          onConfirm={() => void state.renameAll()}
          onCancel={state.closePreview}
        />
      ) : null}

      {state.reviewOpen && reviewQueue.length > 0 ? (
        <ReviewMode
          items={reviewQueue}
          onClose={state.closeReview}
          onEditField={state.editIdentification}
          onSetKind={state.setKind}
          onSetSource={state.setSource}
          onSetSpanishVariant={state.setSpanishVariant}
          onChooseSummary={(id, candidate) => void state.chooseSummary(id, candidate)}
          onChooseCandidate={(id, candidate) => void state.chooseCandidate(id, candidate)}
          onSearch={state.searchWork}
        />
      ) : null}

      <NoticeStack notices={state.notices} onDismiss={state.dismissNotice} />
    </>
  );
}
