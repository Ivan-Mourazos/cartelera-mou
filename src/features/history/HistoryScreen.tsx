import { AlertTriangle, ArrowRight, Check, History, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { ScreenHeader } from "../../components/ScreenHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { filenameFromPath, formatDate } from "../../components/format";
import type { DesktopGateway, HistoryEntry, HistoryStatus } from "../../services/types";

type HistoryFilter = "all" | "completed" | "failed" | "undone";

interface HistoryScreenProps {
  gateway: DesktopGateway;
  entries: HistoryEntry[];
  loading: boolean;
  onUpdated: () => Promise<void>;
}

function dayKey(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "full" }).format(new Date(value));
}

function statusMatches(status: HistoryStatus, filter: HistoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "failed") return ["failed", "partial", "recoveryRequired"].includes(status);
  return status === filter;
}

export function HistoryScreen({ gateway, entries, loading, onUpdated }: HistoryScreenProps) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [query, setQuery] = useState("");
  const [pendingUndo, setPendingUndo] = useState<HistoryEntry | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-ES");
    const map = new Map<string, HistoryEntry[]>();
    for (const entry of entries) {
      if (!statusMatches(entry.status, filter)) continue;
      if (
        normalizedQuery &&
        !`${entry.oldPath} ${entry.newPath}`.toLocaleLowerCase("es-ES").includes(normalizedQuery)
      )
        continue;
      const key = dayKey(entry.performedAt);
      const current = map.get(key);
      if (current) current.push(entry);
      else map.set(key, [entry]);
    }
    return [...map.entries()];
  }, [entries, filter, query]);

  async function confirmUndo() {
    if (!pendingUndo) return;
    setUndoing(true);
    try {
      const result = await gateway.undoRename(pendingUndo.id);
      if (result.status === "failed") {
        setNotice({
          tone: "error",
          message: result.errorMessage ?? "No se pudo restaurar el nombre anterior.",
        });
      } else {
        setNotice({
          tone: "success",
          message: "El nombre anterior se restauró y quedó registrado.",
        });
      }
      setPendingUndo(null);
      await onUpdated();
    } catch (cause) {
      setNotice({
        tone: "error",
        message: cause instanceof Error ? cause.message : "No se pudo deshacer la operación.",
      });
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div className="screen history-screen">
      <ScreenHeader
        eyebrow="Registro local"
        title="Historial"
        description="Cada cambio conserva el origen, el destino y su resultado para poder auditarlo."
      />

      {notice ? (
        <Notice
          tone={notice.tone}
          title={notice.tone === "success" ? "Operación deshecha" : "No se pudo deshacer"}
          message={notice.message}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      <section className="history-toolbar" aria-label="Filtros del historial">
        <div className="segmented-control">
          {[
            ["all", "Todos"],
            ["completed", "Correctos"],
            ["failed", "Con error"],
            ["undone", "Deshechos"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "is-active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value as HistoryFilter)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-field search-field--small">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Buscar por ruta o archivo</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar una ruta…"
          />
        </label>
      </section>

      {loading ? (
        <div className="history-loading" aria-busy="true">
          Leyendo el registro local…
        </div>
      ) : null}
      {!loading && entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Todavía no hay operaciones"
          description="Los lotes de renombrado aparecerán aquí con su resultado y la opción de deshacer cuando sea seguro."
        />
      ) : null}
      {!loading && entries.length > 0 && groups.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No hay operaciones que coincidan"
          description="Prueba otro filtro o borra la búsqueda para ver todo el historial."
          action={
            <Button
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
            >
              Limpiar filtros
            </Button>
          }
        />
      ) : null}

      <div className="history-ledger">
        {groups.map(([day, dayEntries]) => (
          <section className="history-day" key={day}>
            <h2>{day}</h2>
            <div className="history-day__entries">
              {dayEntries.map((entry) => (
                <article className="history-entry" key={entry.id}>
                  <div
                    className="history-entry__rail"
                    data-status={entry.status}
                    aria-hidden="true"
                  />
                  <header>
                    <div>
                      <span className="history-entry__batch">Lote {entry.batchId}</span>
                      <time dateTime={entry.performedAt}>{formatDate(entry.performedAt)}</time>
                    </div>
                    <StatusBadge status={entry.status} />
                  </header>
                  <div className="history-paths">
                    <div>
                      <span>Anterior</span>
                      <bdi title={entry.oldPath}>{filenameFromPath(entry.oldPath)}</bdi>
                      <small>{entry.oldPath}</small>
                    </div>
                    <ArrowRight size={20} aria-hidden="true" />
                    <div>
                      <span>Nuevo</span>
                      <bdi title={entry.newPath}>{filenameFromPath(entry.newPath)}</bdi>
                      <small>{entry.newPath}</small>
                    </div>
                  </div>
                  {entry.errorMessage ? (
                    <p className="history-entry__error">
                      <AlertTriangle size={15} /> {entry.errorMessage}
                    </p>
                  ) : null}
                  <footer>
                    {entry.undoneAt ? (
                      <span>Deshecho el {formatDate(entry.undoneAt)}</span>
                    ) : (
                      <span />
                    )}
                    <Button
                      size="compact"
                      variant="ghost"
                      leadingIcon={<RotateCcw size={15} />}
                      disabled={!entry.canUndo}
                      onClick={() => setPendingUndo(entry)}
                    >
                      Deshacer
                    </Button>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {pendingUndo ? (
        <Modal
          title="Restaurar el nombre anterior"
          description="La ruta anterior se comprobará de nuevo antes de hacer el cambio."
          onClose={() => setPendingUndo(null)}
          closeDisabled={undoing}
          footer={
            <>
              <Button onClick={() => setPendingUndo(null)} disabled={undoing}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                leadingIcon={<RotateCcw size={16} />}
                onClick={() => void confirmUndo()}
                disabled={undoing}
              >
                {undoing ? "Comprobando…" : "Restaurar nombre anterior"}
              </Button>
            </>
          }
        >
          <div className="undo-preview">
            <div>
              <span>Nombre actual</span>
              <bdi>{pendingUndo.newPath}</bdi>
            </div>
            <ArrowRight size={19} aria-hidden="true" />
            <div>
              <span>Se restaurará</span>
              <bdi>{pendingUndo.oldPath}</bdi>
            </div>
            <p>
              <Check size={16} /> No se sobrescribirá ningún archivo existente.
            </p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
