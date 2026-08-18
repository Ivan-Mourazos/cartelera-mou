import { describe, expect, it } from "vitest";

import { createMediaItem, type MediaItem } from "../../services/item-pipeline";
import type { RenamePlanItem } from "../../services/rename/plan";
import { DEFAULT_SETTINGS } from "../../services/settings";
import { countByState, filterItems, rowStateOf, toggleSelection } from "./row-model";

const item = (name: string, overrides: Partial<MediaItem> = {}): MediaItem => ({
  ...createMediaItem({ name, size: 1, handle: undefined, file: undefined }, DEFAULT_SETTINGS),
  analysisPending: false,
  ...overrides,
});

const blocked: RenamePlanItem = {
  id: "1",
  currentName: "a.mkv",
  proposedName: "b.mkv",
  canRename: false,
  issues: [{ code: "no-handle", severity: "blocking", message: "Sin acceso de escritura" }],
} as unknown as RenamePlanItem;

describe("rowStateOf", () => {
  it("analizando mientras el análisis está pendiente", () => {
    expect(rowStateOf(item("a.mkv", { analysisPending: true }), undefined)).toBe("analyzing");
  });

  it("error cuando el archivo falló", () => {
    expect(rowStateOf(item("a.mkv", { error: "ilegible" }), undefined)).toBe("error");
  });

  it("error cuando el plan lo bloquea", () => {
    expect(rowStateOf(item("a.mkv"), blocked)).toBe("error");
  });

  it("revisar cuando la banda de coincidencia no es alta", () => {
    const base = item("Dune.2021.mkv");
    const medium = {
      ...base,
      identification: { ...base.identification, matchBand: "medium" as const },
      name: { ...base.name, alerts: [] },
    };
    expect(rowStateOf(medium, undefined)).toBe("review");
  });

  it("revisar cuando el nombre trae alertas", () => {
    const base = item("Dune.2021.mkv");
    const alerted = {
      ...base,
      identification: { ...base.identification, matchBand: "high" as const },
      name: { ...base.name, alerts: ["No se ha detectado audio en castellano."] },
    };
    expect(rowStateOf(alerted, undefined)).toBe("review");
  });

  it("listo cuando todo está en orden", () => {
    const base = item("Dune.2021.mkv");
    const ready = {
      ...base,
      identification: { ...base.identification, matchBand: "high" as const },
      name: { ...base.name, alerts: [] },
    };
    expect(rowStateOf(ready, undefined)).toBe("ready");
  });
});

describe("countByState", () => {
  it("cuenta cada estado", () => {
    expect(countByState(["ready", "ready", "review", "error"])).toEqual({
      analyzing: 0,
      ready: 2,
      review: 1,
      error: 1,
    });
  });
});

describe("filterItems", () => {
  const items = [item("Dune.2021.mkv"), item("Heat.1995.mkv", { error: "roto" })];

  it("filtra por texto en el nombre actual", () => {
    expect(filterItems(items, { text: "dune" })).toHaveLength(1);
  });

  it("filtra por estado", () => {
    expect(filterItems(items, { state: "error" })).toHaveLength(1);
  });

  it("sin filtros devuelve todo", () => {
    expect(filterItems(items, {})).toHaveLength(2);
  });

  it("el texto vacío no filtra nada", () => {
    expect(filterItems(items, { text: "   " })).toHaveLength(2);
  });
});

describe("toggleSelection", () => {
  it("añade y quita", () => {
    const once = toggleSelection(new Set<string>(), "a");
    expect([...once]).toEqual(["a"]);
    expect([...toggleSelection(once, "a")]).toEqual([]);
  });

  it("selecciona un rango desde el ancla", () => {
    const result = toggleSelection(new Set(["a"]), "c", { range: ["a", "b", "c", "d"] });
    expect([...result].sort()).toEqual(["a", "b", "c"]);
  });

  it("el rango funciona hacia atrás", () => {
    const result = toggleSelection(new Set(["d"]), "b", { range: ["a", "b", "c", "d"] });
    expect([...result].sort()).toEqual(["b", "c", "d"]);
  });
});
