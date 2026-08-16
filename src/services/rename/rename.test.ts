import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeRenamePlan, type RenameFileSystemPort } from "./executor";
import { buildRenamePlan } from "./plan";
import { buildUndoPlan, undoRenameBatch, type RenameBatchRecord } from "./undo";

/**
 * Sistema de archivos en memoria: permite probar el renombrado completo y el
 * deshacer sin tocar ficheros reales.
 */
const createFakeFileSystem = (initial: readonly string[]) => {
  const entries = new Set(initial);
  const failures = new Map<string, string>();

  const port: RenameFileSystemPort = {
    entryExists: (name) => Promise.resolve(entries.has(name)),
    move: ({ from, to }) => {
      const failure = failures.get(from);
      if (failure !== undefined) return Promise.reject(new Error(failure));
      if (!entries.has(from)) return Promise.reject(new Error("El origen ya no existe."));
      if (entries.has(to) && to !== from) return Promise.reject(new Error("El destino ya existe."));
      entries.delete(from);
      entries.add(to);
      return Promise.resolve();
    },
  };

  return {
    port,
    entries,
    names: () => [...entries].sort(),
    failOn: (name: string, message: string) => failures.set(name, message),
  };
};

const candidate = (id: string, currentName: string, proposedName: string) => ({
  id,
  currentName,
  proposedName,
  hasHandle: true,
});

describe("preflight del renombrado", () => {
  it("marca listo un cambio limpio", () => {
    const plan = buildRenamePlan([candidate("1", "a.mkv", "Película (2020).mkv")], {
      existingNames: ["a.mkv"],
    });
    expect(plan.items[0]?.status).toBe("ready");
    expect(plan.readyCount).toBe(1);
  });

  it("bloquea si el destino ya existe en la carpeta", () => {
    const plan = buildRenamePlan([candidate("1", "a.mkv", "b.mkv")], {
      existingNames: ["a.mkv", "b.mkv"],
    });
    expect(plan.items[0]?.status).toBe("blocked");
    expect(plan.items[0]?.issues.map((issue) => issue.code)).toContain("target-exists");
  });

  it("bloquea dos elementos del lote que generan el mismo nombre", () => {
    const plan = buildRenamePlan(
      [candidate("1", "a.mkv", "Igual.mkv"), candidate("2", "b.mkv", "Igual.mkv")],
      { existingNames: ["a.mkv", "b.mkv"] },
    );
    expect(plan.blockedCount).toBe(2);
    for (const item of plan.items) {
      expect(item.issues.map((issue) => issue.code)).toContain("duplicate-in-batch");
    }
  });

  it("permite el cambio de solo mayúsculas", () => {
    const plan = buildRenamePlan([candidate("1", "pelicula.mkv", "Película.mkv")], {
      existingNames: ["pelicula.mkv"],
    });
    expect(plan.items[0]?.status).toBe("ready");

    const caseOnly = buildRenamePlan([candidate("1", "pelicula.mkv", "PELICULA.mkv")], {
      existingNames: ["pelicula.mkv"],
    });
    expect(caseOnly.items[0]?.status).toBe("ready");
  });

  it("bloquea el cambio de extensión", () => {
    const plan = buildRenamePlan([candidate("1", "a.mkv", "a.mp4")]);
    expect(plan.items[0]?.issues.map((issue) => issue.code)).toContain("extension-changed");
  });

  it("bloquea nombres inválidos y reservados de Windows", () => {
    const invalid = buildRenamePlan([candidate("1", "a.mkv", "co:lon.mkv")]);
    expect(invalid.items[0]?.status).toBe("blocked");

    const reserved = buildRenamePlan([candidate("2", "a.mkv", "CON.mkv")]);
    expect(reserved.items[0]?.issues.map((issue) => issue.code)).toContain("invalid-name");
  });

  it("bloquea nombres demasiado largos sin recortarlos en silencio", () => {
    const long = `${"x".repeat(300)}.mkv`;
    const plan = buildRenamePlan([candidate("1", "a.mkv", long)]);
    expect(plan.items[0]?.issues.map((issue) => issue.code)).toContain("too-long");
    expect(plan.items[0]?.proposedName).toHaveLength(long.length);
  });

  it("clasifica como «sin cambios» un nombre idéntico", () => {
    const plan = buildRenamePlan([candidate("1", "a.mkv", "a.mkv")]);
    expect(plan.items[0]?.status).toBe("unchanged");
    expect(plan.readyCount).toBe(0);
  });

  it("bloquea cuando falta el acceso al fichero y se exige", () => {
    const plan = buildRenamePlan([{ ...candidate("1", "a.mkv", "b.mkv"), hasHandle: false }], {
      requireHandles: true,
    });
    expect(plan.items[0]?.issues.map((issue) => issue.code)).toContain("no-handle");
  });
});

describe("ejecución del renombrado", () => {
  let fs: ReturnType<typeof createFakeFileSystem>;

  beforeEach(() => {
    fs = createFakeFileSystem(["a.mkv", "b.mkv"]);
  });

  it("dry run no toca el disco", async () => {
    const plan = buildRenamePlan([candidate("1", "a.mkv", "Nuevo.mkv")], {
      existingNames: fs.names(),
    });
    const result = await executeRenamePlan(plan, fs.port, { dryRun: true });

    expect(result.simulated).toBe(1);
    expect(result.renamed).toBe(0);
    expect(fs.names()).toEqual(["a.mkv", "b.mkv"]);
  });

  it("renombra realmente cuando no es simulación", async () => {
    const plan = buildRenamePlan([candidate("1", "a.mkv", "Nuevo.mkv")], {
      existingNames: fs.names(),
    });
    const result = await executeRenamePlan(plan, fs.port, { dryRun: false });

    expect(result.renamed).toBe(1);
    expect(fs.names()).toEqual(["Nuevo.mkv", "b.mkv"]);
    expect(result.undoable).toEqual([{ id: "1", from: "a.mkv", to: "Nuevo.mkv" }]);
  });

  it("nunca sobrescribe: si el destino aparece entre la previsualización y la ejecución, falla", async () => {
    const plan = buildRenamePlan([candidate("1", "a.mkv", "Nuevo.mkv")], {
      existingNames: fs.names(),
    });
    // Alguien crea el destino después del preflight.
    fs.entries.add("Nuevo.mkv");

    const result = await executeRenamePlan(plan, fs.port, { dryRun: false });
    expect(result.renamed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.entries[0]?.error).toContain("ya existe");
    expect(fs.entries.has("a.mkv")).toBe(true);
  });

  it("un fallo individual no detiene el lote y queda registrado", async () => {
    fs = createFakeFileSystem(["a.mkv", "b.mkv", "c.mkv"]);
    fs.failOn("b.mkv", "Archivo bloqueado por otro proceso");

    const plan = buildRenamePlan(
      [
        candidate("1", "a.mkv", "A nueva.mkv"),
        candidate("2", "b.mkv", "B nueva.mkv"),
        candidate("3", "c.mkv", "C nueva.mkv"),
      ],
      { existingNames: fs.names() },
    );

    const result = await executeRenamePlan(plan, fs.port, { dryRun: false });
    expect(result.renamed).toBe(2);
    expect(result.failed).toBe(1);
    expect(fs.names()).toEqual(["A nueva.mkv", "C nueva.mkv", "b.mkv"]);

    const failed = result.entries.find((entry) => entry.outcome === "failed");
    expect(failed?.from).toBe("b.mkv");
    expect(failed?.error).toContain("bloqueado");
    // El resultado se informa por id, no por nombre.
    expect(result.entries.every((entry) => entry.id.length > 0)).toBe(true);
  });

  it("respeta la cancelación", async () => {
    const controller = new AbortController();
    controller.abort();
    const plan = buildRenamePlan([candidate("1", "a.mkv", "Nuevo.mkv")], {
      existingNames: fs.names(),
    });

    const result = await executeRenamePlan(plan, fs.port, {
      dryRun: false,
      signal: controller.signal,
    });
    expect(result.cancelled).toBe(true);
    expect(result.renamed).toBe(0);
    expect(fs.names()).toEqual(["a.mkv", "b.mkv"]);
  });

  it("informa del progreso", async () => {
    const onProgress = vi.fn();
    const plan = buildRenamePlan([candidate("1", "a.mkv", "Nuevo.mkv")], {
      existingNames: fs.names(),
    });
    await executeRenamePlan(plan, fs.port, { dryRun: true, onProgress });
    expect(onProgress).toHaveBeenCalledWith(1, 1, "a.mkv");
  });

  it("intercambio circular de nombres: se bloquea en vez de destruir datos", async () => {
    const plan = buildRenamePlan(
      [candidate("1", "a.mkv", "b.mkv"), candidate("2", "b.mkv", "a.mkv")],
      { existingNames: fs.names() },
    );
    const result = await executeRenamePlan(plan, fs.port, { dryRun: false });
    expect(result.renamed).toBe(0);
    expect(fs.names()).toEqual(["a.mkv", "b.mkv"]);
  });
});

describe("deshacer", () => {
  const record = (moves: RenameBatchRecord["moves"]): RenameBatchRecord => ({
    batchId: "batch-1",
    timestamp: new Date().toISOString(),
    folderName: "Películas",
    moves,
  });

  it("restaura los nombres originales", async () => {
    const fs = createFakeFileSystem(["A nueva.mkv", "B nueva.mkv"]);
    const result = await undoRenameBatch(
      record([
        { id: "1", from: "a.mkv", to: "A nueva.mkv" },
        { id: "2", from: "b.mkv", to: "B nueva.mkv" },
      ]),
      fs.port,
      { existingNames: fs.names() },
    );

    expect(result.renamed).toBe(2);
    expect(fs.names()).toEqual(["a.mkv", "b.mkv"]);
  });

  it("no sobrescribe si el nombre antiguo volvió a existir", async () => {
    const fs = createFakeFileSystem(["A nueva.mkv", "a.mkv"]);
    const plan = buildUndoPlan(record([{ id: "1", from: "a.mkv", to: "A nueva.mkv" }]), {
      existingNames: fs.names(),
    });
    expect(plan.items[0]?.status).toBe("blocked");

    const result = await undoRenameBatch(
      record([{ id: "1", from: "a.mkv", to: "A nueva.mkv" }]),
      fs.port,
      { existingNames: fs.names() },
    );
    expect(result.renamed).toBe(0);
    expect(fs.names()).toEqual(["A nueva.mkv", "a.mkv"]);
  });

  it("deshace en orden inverso al aplicado", () => {
    const plan = buildUndoPlan(
      record([
        { id: "1", from: "a.mkv", to: "1.mkv" },
        { id: "2", from: "b.mkv", to: "2.mkv" },
      ]),
    );
    expect(plan.items.map((item) => item.currentName)).toEqual(["2.mkv", "1.mkv"]);
  });
});
