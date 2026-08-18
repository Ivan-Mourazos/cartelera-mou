import { effectiveName, type MediaItem } from "../../services/item-pipeline";
import type { RenamePlanItem } from "../../services/rename/plan";

/**
 * Estado visible de cada fila y utilidades de la lista.
 *
 * Vive aparte de los componentes para poder probarse sin montar React: es la
 * lógica que decide qué mira la persona usuaria y qué puede ignorar.
 */

export type RowState = "analyzing" | "ready" | "review" | "error";

export const ROW_STATES: readonly RowState[] = ["analyzing", "ready", "review", "error"];

export const ROW_STATE_LABEL: Readonly<Record<RowState, string>> = {
  analyzing: "Analizando",
  ready: "Listo",
  review: "Necesita revisión",
  error: "Error",
};

export const rowStateOf = (item: MediaItem, planItem: RenamePlanItem | undefined): RowState => {
  if (item.analysisPending) return "analyzing";
  if (item.error !== undefined) return "error";
  if (planItem?.issues.some((issue) => issue.severity === "blocking") === true) return "error";
  // Una coincidencia que no es de banda alta merece un vistazo, aunque se aplique.
  if (item.identification.matchBand !== undefined && item.identification.matchBand !== "high") {
    return "review";
  }
  if (item.name.alerts.length > 0) return "review";
  return "ready";
};

export const countByState = (states: readonly RowState[]): Record<RowState, number> => {
  const counts: Record<RowState, number> = { analyzing: 0, ready: 0, review: 0, error: 0 };
  for (const state of states) counts[state] += 1;
  return counts;
};

export interface ListFilter {
  readonly state?: RowState | undefined;
  readonly text?: string | undefined;
}

export const filterItems = (
  items: readonly MediaItem[],
  filter: ListFilter,
  planById?: ReadonlyMap<string, RenamePlanItem>,
): readonly MediaItem[] => {
  const text = filter.text?.trim().toLowerCase();
  return items.filter((item) => {
    if (filter.state !== undefined && rowStateOf(item, planById?.get(item.id)) !== filter.state) {
      return false;
    }
    if (text === undefined || text.length === 0) return true;
    return (
      item.currentName.toLowerCase().includes(text) ||
      effectiveName(item).toLowerCase().includes(text)
    );
  });
};

/**
 * Alterna la selección. Con `range` (mayúsculas pulsadas) selecciona desde la
 * primera fila ya seleccionada hasta la pulsada, en cualquier dirección.
 */
export const toggleSelection = (
  selected: ReadonlySet<string>,
  id: string,
  options: { readonly range?: readonly string[] } = {},
): ReadonlySet<string> => {
  const next = new Set(selected);
  const range = options.range;

  if (range !== undefined && selected.size > 0) {
    const anchorIndex = range.findIndex((entry) => selected.has(entry));
    const targetIndex = range.indexOf(id);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const from = Math.min(anchorIndex, targetIndex);
      const to = Math.max(anchorIndex, targetIndex);
      for (const entry of range.slice(from, to + 1)) next.add(entry);
      return next;
    }
  }

  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};
