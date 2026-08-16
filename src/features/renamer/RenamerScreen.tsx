import { FileText, FolderOpen, Loader2, Settings, Trash2, Undo2, Zap } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";

import {
  filesFromDataTransfer,
  openDirectoryPicker,
  openFilesPicker,
  supportsDirectRename,
} from "../../services/file-system";
import { MediaItemCard } from "./MediaItemCard";
import { SettingsPanel } from "./SettingsPanel";
import { useRenamerState } from "./useRenamerState";

export function RenamerScreen() {
  const state = useRenamerState();
  const [showSettings, setShowSettings] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const planById = useMemo(
    () => new Map(state.plan.items.map((item) => [item.id, item])),
    [state.plan],
  );

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
    onDragLeave: () => setDragOver(false),
    onDrop: (event: DragEvent<HTMLDivElement>) => void onDrop(event),
  };

  return (
    <div className="app-main">
      {showSettings ? (
        <SettingsPanel
          settings={state.settings}
          onChange={state.updateSettings}
          onClose={() => setShowSettings(false)}
        />
      ) : null}

      {state.items.length === 0 ? (
        <div className={`dropzone-container ${dragOver ? "is-dragover" : ""}`} {...dropHandlers}>
          <div className="dropzone-title">Arrastra tus vídeos aquí</div>
          <div className="dropzone-subtitle">
            Se analiza el archivo de verdad y se propone un nombre. Puedes editarlo antes de
            renombrar.
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
              onClick={() => setShowSettings(true)}
            >
              <Settings size={16} aria-hidden />
            </button>
          </div>
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
                onClick={() => setShowSettings((value) => !value)}
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

          {state.canCheckDestination ? null : (
            <p className="settings-warning">
              Con archivos sueltos no se puede comprobar si ya existe otro archivo con el nombre
              nuevo en esa carpeta. Abre la carpeta si quieres esa comprobación.
            </p>
          )}

          <div className={`file-list ${dragOver ? "is-dragover" : ""}`} {...dropHandlers}>
            {state.items.map((item) => (
              <MediaItemCard
                key={item.id}
                item={item}
                planItem={planById.get(item.id)}
                onRemove={state.removeItem}
                onOverrideName={state.setNameOverride}
                onGrantAccess={() => void state.grantAccess()}
                onEditField={state.editIdentification}
                onSetKind={state.setKind}
                onSetSource={state.setSource}
                onSearch={state.searchWork}
                onChooseCandidate={(id, candidate) => void state.chooseCandidate(id, candidate)}
              />
            ))}
          </div>

          <div className="floating-dock">
            <button
              type="button"
              className="apple-button apple-button-primary"
              onClick={() => void state.renameAll()}
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

      {state.notice === null ? null : (
        <div className="toast" role="status" aria-live="polite">
          {state.notice}
          <button type="button" className="icon-button" onClick={() => state.setNotice(null)}>
            ×
          </button>
        </div>
      )}

      {state.provider.available ? (
        <footer className="provider-attribution">{state.provider.attribution.notice}</footer>
      ) : null}
    </div>
  );
}
