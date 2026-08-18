import { AlertTriangle, Check, ChevronDown, Loader2, X } from "lucide-react";

import { effectiveName, type MediaItem } from "../../services/item-pipeline";
import { ROW_STATE_LABEL, type RowState } from "./row-model";

export interface FileRowProps {
  readonly item: MediaItem;
  readonly state: RowState;
  readonly selected: boolean;
  readonly expanded: boolean;
  readonly onToggleExpanded: (id: string) => void;
  readonly onToggleSelected: (id: string, withRange: boolean) => void;
  readonly onOverrideName: (id: string, value: string | undefined) => void;
  readonly onRemove: (id: string) => void;
}

/**
 * Fila compacta: el nombre propuesto en primer plano —que es lo que se va a
 * escribir— y el actual debajo, atenuado. El punto de estado a la izquierda
 * dice de un vistazo qué filas piden atención.
 */
export const FileRow = ({
  item,
  state,
  selected,
  expanded,
  onToggleExpanded,
  onToggleSelected,
  onOverrideName,
  onRemove,
}: FileRowProps) => (
  <div className={`file-row state-${state} ${selected ? "is-selected" : ""}`}>
    <button
      type="button"
      className={`row-state row-state-${state}`}
      title={`${ROW_STATE_LABEL[state]} · pulsa para seleccionar`}
      aria-label={ROW_STATE_LABEL[state]}
      aria-pressed={selected}
      onClick={(event) => {
        onToggleSelected(item.id, event.shiftKey);
      }}
    >
      {state === "analyzing" ? <Loader2 size={11} className="spin" aria-hidden /> : null}
      {state === "error" ? <AlertTriangle size={11} aria-hidden /> : null}
      {state === "ready" && item.status === "renamed" ? <Check size={11} aria-hidden /> : null}
    </button>

    <div className="row-names">
      <label className="visually-hidden" htmlFor={`name-${item.id}`}>
        Nombre propuesto para {item.currentName}
      </label>
      <input
        id={`name-${item.id}`}
        className="row-proposed"
        value={effectiveName(item)}
        spellCheck={false}
        onChange={(event) => {
          onOverrideName(
            item.id,
            event.target.value === item.name.filename ? undefined : event.target.value,
          );
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") onOverrideName(item.id, undefined);
        }}
      />
      <div className="row-current" title={item.currentName}>
        {item.currentName}
      </div>
    </div>

    <button
      type="button"
      className="icon-button"
      aria-expanded={expanded}
      title="Ver y corregir los datos"
      onClick={() => {
        onToggleExpanded(item.id);
      }}
    >
      <ChevronDown size={14} className={expanded ? "is-open" : ""} />
    </button>
    <button
      type="button"
      className="icon-button"
      title="Quitar de la lista"
      onClick={() => {
        onRemove(item.id);
      }}
    >
      <X size={14} />
    </button>
  </div>
);
