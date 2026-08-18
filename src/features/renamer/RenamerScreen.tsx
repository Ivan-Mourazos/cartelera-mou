import {
  FileText,
  FolderOpen,
  KeyRound,
  Loader2,
  Settings,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import {
  filesFromDataTransfer,
  openDirectoryPicker,
  openFilesPicker,
  supportsDirectRename,
} from "../../services/file-system";
import { BatchPreviewDialog } from "./BatchPreviewDialog";
import { FileRow } from "./FileRow";
import { ListToolbar } from "./ListToolbar";
import { RowDetail } from "./RowDetail";
import { rowStateOf } from "./row-model";
import { SettingsPanel } from "./SettingsPanel";
import { useRenamerState } from "./useRenamerState";
import { VirtualFileList } from "./VirtualFileList";

/** A partir de aquí la lista se virtualiza. Por debajo no compensa. */
const VIRTUALIZE_FROM = 50;

export function RenamerScreen() {
  const state = useRenamerState();
  const [showSettings, setShowSettings] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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

  const onDrop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault();
    setDragOver(false);
    await state.addFiles(await filesFromDataTransfer(event.dataTransfer), false);
  };

  const dropHandlers = {
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => {
      setDragOver(false);
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => void onDrop(event),
  };

  const visible = state.visibleItems;
  const virtualized = visible.length >= VIRTUALIZE_FROM;

  const renderRow = (index: number) => {
    const item = visible[index];
    if (item === undefined) return null;
    const planItem = state.planById.get(item.id);
    const expanded = state.expandedId === item.id;

    return (
      <article key={item.id} className="file-entry">
        <FileRow
          item={item}
          state={rowStateOf(item, planItem)}
          selected={state.selected.has(item.id)}
          expanded={expanded}
          onToggleExpanded={state.toggleExpanded}
          onToggleSelected={state.toggleSelected}
          onOverrideName={state.setNameOverride}
          onRemove={state.removeItem}
        />
        {expanded ? (
          <RowDetail
            item={item}
            planItem={planItem}
            onEditField={state.editIdentification}
            onSetKind={state.setKind}
            onSetSource={state.setSource}
            onSearch={state.searchWork}
            onChooseCandidate={(id, candidate) => void state.chooseCandidate(id, candidate)}
            onChooseSummary={(id, candidate) => void state.chooseSummary(id, candidate)}
            onGrantAccess={() => void state.grantAccess()}
          />
        ) : null}
      </article>
    );
  };

  return (
    <div className="app-main">
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

      {state.items.length === 0 ? (
        <div className={`dropzone-container ${dragOver ? "is-dragover" : ""}`} {...dropHandlers}>
          <div className="dropzone-title">Arrastra tus vídeos aquí</div>
          <div className="dropzone-subtitle">
            Se lee el archivo de verdad y se propone un nombre. Puedes editarlo antes de renombrar.
          </div>
          <div className="dropzone-actions">
            <button
              type="button"
              className="apple-button apple-button-primary"
              onClick={() => void addFiles()}
            >
              <FileText size={16} aria-hidden /> Elegir archivos
            </button>
            <button
              type="button"
              className="apple-button apple-button-secondary"
              onClick={() => void openFolder()}
            >
              <FolderOpen size={16} aria-hidden /> Abrir carpeta
            </button>
            <button
              type="button"
              className="apple-button apple-button-ghost"
              onClick={() => {
                setShowSettings(true);
              }}
              title="Configuración"
            >
              <Settings size={16} aria-hidden />
            </button>
          </div>

          {state.provider.available ? null : (
            <p className="dropzone-warning">
              <KeyRound size={13} aria-hidden /> Sin clave de TMDb los títulos salen del nombre del
              archivo.{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setShowSettings(true);
                }}
              >
                Añadir clave
              </button>
            </p>
          )}

          {supportsDirectRename() ? null : (
            <p className="dropzone-warning">
              Este navegador no puede renombrar archivos. Usa Chrome, Edge u otro navegador basado
              en Chromium.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="list-header">
            <span className="list-count">
              {state.items.length} archivo(s)
              {state.progress.active ? (
                <span className="progress-inline">
                  <Loader2 size={12} className="spin" aria-hidden />
                  {state.progress.label} {state.progress.done}/{state.progress.total}
                  <button
                    type="button"
                    className="apple-button apple-button-ghost"
                    onClick={state.cancel}
                  >
                    Cancelar
                  </button>
                </span>
              ) : null}
            </span>

            <div className="list-header-right">
              <button
                type="button"
                className="apple-button apple-button-secondary"
                onClick={() => void addFiles()}
              >
                <FileText size={15} aria-hidden /> Añadir
              </button>
              <button
                type="button"
                className="apple-button apple-button-ghost"
                onClick={() => {
                  setShowSettings((value) => !value);
                }}
                title="Configuración"
              >
                <Settings size={15} aria-hidden />
              </button>
              <button
                type="button"
                className="apple-button apple-button-ghost"
                onClick={state.clearAll}
                title="Vaciar lista"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          </div>

          <ListToolbar
            counts={state.counts}
            total={state.items.length}
            filter={state.filter}
            onFilter={state.setFilter}
            selectedCount={state.selected.size}
            onBatchKind={state.batchSetKind}
            onRetrySelected={() => void state.retrySelected()}
            onRemoveSelected={state.removeSelected}
          />

          {state.canCheckDestination ? null : (
            <p className="settings-warning">
              Con archivos sueltos no se puede comprobar si ya existe otro archivo con el nombre
              nuevo en esa carpeta. Abre la carpeta si quieres esa comprobación.
            </p>
          )}

          <div
            ref={listRef}
            className={`file-list ${dragOver ? "is-dragover" : ""}`}
            {...dropHandlers}
          >
            {visible.length === 0 ? (
              <p className="list-empty">Ningún archivo coincide con el filtro.</p>
            ) : virtualized ? (
              <VirtualFileList count={visible.length} scrollRef={listRef} renderRow={renderRow} />
            ) : (
              visible.map((_, index) => renderRow(index))
            )}
          </div>

          <div className="floating-dock">
            <button
              type="button"
              className="apple-button apple-button-primary"
              onClick={state.openPreview}
              disabled={state.plan.readyCount === 0 || state.progress.active}
            >
              <Zap size={15} aria-hidden /> Renombrar {state.plan.readyCount}
            </button>
            {state.undoable === undefined ? null : (
              <button
                type="button"
                className="apple-button apple-button-secondary"
                onClick={() => void state.undoLast()}
              >
                <Undo2 size={14} aria-hidden /> Deshacer
              </button>
            )}
          </div>
        </>
      )}

      {state.notices.length === 0 ? null : (
        <div className="toast-stack" role="status" aria-live="polite">
          {state.notices.map((notice) => (
            <div key={notice.id} className="toast">
              {notice.text}
              <button
                type="button"
                className="icon-button"
                aria-label="Descartar aviso"
                onClick={() => {
                  state.dismissNotice(notice.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {state.provider.available ? (
        <footer className="provider-attribution">{state.provider.attribution.notice}</footer>
      ) : null}
    </div>
  );
}
