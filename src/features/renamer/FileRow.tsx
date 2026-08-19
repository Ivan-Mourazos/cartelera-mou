import { AlertTriangle, Check, Loader2, SlidersHorizontal, X } from "lucide-react";

import { effectiveName, type MediaItem } from "../../services/item-pipeline";
import { ROW_STATE_LABEL, type RowState } from "./row-model";

export interface FileRowProps {
  readonly item: MediaItem;
  readonly state: RowState;
  readonly selected: boolean;
  readonly onToggleSelected: (id: string, withRange: boolean) => void;
  readonly onOverrideName: (id: string, value: string | undefined) => void;
  readonly onReview: (id: string) => void;
  readonly onRemove: (id: string) => void;
}

/**
 * Una línea por archivo: el nombre propuesto arriba, el actual debajo en
 * secundario. Nada se despliega aquí; lo que necesita decisión se resuelve en el
 * modo revisión, que es donde caben las opciones sin apretar la lista.
 */
export const FileRow = ({
  item,
  state,
  selected,
  onToggleSelected,
  onOverrideName,
  onReview,
  onRemove,
}: FileRowProps) => (
  <div className={`row state-${state} ${selected ? "is-selected" : ""}`}>
    <button
      type="button"
      className={`row-dot dot-${state}`}
      title={`${ROW_STATE_LABEL[state]} · pulsa para seleccionar`}
      aria-label={ROW_STATE_LABEL[state]}
      aria-pressed={selected}
      onClick={(event) => {
        onToggleSelected(item.id, event.shiftKey);
      }}
    >
      {state === "analyzing" ? <Loader2 size={10} className="spin" aria-hidden /> : null}
      {state === "error" ? <AlertTriangle size={10} aria-hidden /> : null}
      {state === "ready" && item.status === "renamed" ? <Check size={10} aria-hidden /> : null}
    </button>

    <div className="row-text">
      <label className="visually-hidden" htmlFor={`name-${item.id}`}>
        Nombre propuesto para {item.currentName}
      </label>
      <input
        id={`name-${item.id}`}
        className="row-name"
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
      <span className="row-original" title={item.currentName}>
        {item.currentName}
      </span>
    </div>

    <div className="row-actions">
      <button
        type="button"
        className="icon-btn"
        title="Revisar y corregir este archivo"
        onClick={() => {
          onReview(item.id);
        }}
      >
        <SlidersHorizontal size={13} />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Quitar de la lista"
        onClick={() => {
          onRemove(item.id);
        }}
      >
        <X size={13} />
      </button>
    </div>
  </div>
);
