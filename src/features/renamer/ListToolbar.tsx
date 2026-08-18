import { Film, RefreshCw, Trash2, Tv } from "lucide-react";

import type { ListFilter, RowState } from "./row-model";

export interface ListToolbarProps {
  readonly counts: Record<RowState, number>;
  readonly total: number;
  readonly filter: ListFilter;
  readonly onFilter: (filter: ListFilter) => void;
  readonly selectedCount: number;
  readonly onBatchKind: (kind: "movie" | "series") => void;
  readonly onRetrySelected: () => void;
  readonly onRemoveSelected: () => void;
}

const FILTERS: readonly { readonly state: RowState | undefined; readonly label: string }[] = [
  { state: undefined, label: "Todos" },
  { state: "ready", label: "Listos" },
  { state: "review", label: "Revisar" },
  { state: "error", label: "Error" },
];

/**
 * Contadores que además filtran: el recuento y el acceso a lo que falla son la
 * misma cosa, así que se pulsa donde se lee.
 */
export const ListToolbar = ({
  counts,
  total,
  filter,
  onFilter,
  selectedCount,
  onBatchKind,
  onRetrySelected,
  onRemoveSelected,
}: ListToolbarProps) => (
  <div className="list-toolbar">
    <div className="state-filters" role="group" aria-label="Filtrar por estado">
      {FILTERS.map(({ state, label }) => (
        <button
          key={label}
          type="button"
          className={`state-filter ${filter.state === state ? "is-active" : ""} ${
            state === undefined ? "" : `state-${state}`
          }`}
          aria-pressed={filter.state === state}
          onClick={() => {
            onFilter({ ...filter, state });
          }}
        >
          {label} <span>{state === undefined ? total : counts[state]}</span>
        </button>
      ))}
    </div>

    <label className="visually-hidden" htmlFor="list-filter">
      Filtrar por nombre
    </label>
    <input
      id="list-filter"
      className="list-filter"
      type="search"
      placeholder="Filtrar…"
      value={filter.text ?? ""}
      onChange={(event) => {
        onFilter({ ...filter, text: event.target.value });
      }}
    />

    {selectedCount === 0 ? null : (
      <div className="batch-actions">
        <span className="batch-count">{selectedCount} seleccionados</span>
        <button
          type="button"
          className="apple-button apple-button-ghost"
          onClick={() => {
            onBatchKind("movie");
          }}
        >
          <Film size={14} aria-hidden /> Película
        </button>
        <button
          type="button"
          className="apple-button apple-button-ghost"
          onClick={() => {
            onBatchKind("series");
          }}
        >
          <Tv size={14} aria-hidden /> Serie
        </button>
        <button type="button" className="apple-button apple-button-ghost" onClick={onRetrySelected}>
          <RefreshCw size={14} aria-hidden /> Reintentar
        </button>
        <button
          type="button"
          className="apple-button apple-button-ghost"
          onClick={onRemoveSelected}
        >
          <Trash2 size={14} aria-hidden /> Quitar
        </button>
      </div>
    )}
  </div>
);
