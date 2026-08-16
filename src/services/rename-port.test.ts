import { describe, expect, it, vi } from "vitest";

import {
  createDirectoryRenamePort,
  createHandleRenamePort,
  filesFromDataTransfer,
} from "./file-system";
import { buildRenamePlan } from "./rename/plan";

/**
 * Regresión: al cargar archivos sueltos el renombrado no hacía nada.
 *
 * Dos causas, ambas cubiertas aquí:
 * 1. `showOpenFilePicker` concede solo lectura, así que `move()` fallaba con
 *    NotAllowedError si no se pedía permiso de escritura.
 * 2. Sin carpeta abierta no existía ningún puerto de renombrado.
 */

interface FakeHandleOptions {
  readonly permission?: PermissionState;
  readonly withMove?: boolean;
}

const fakeHandle = (name: string, options: FakeHandleOptions = {}) => {
  const state = options.permission ?? "granted";
  const moved: string[] = [];
  const handle = {
    kind: "file" as const,
    name,
    queryPermission: vi.fn(() => Promise.resolve(state)),
    requestPermission: vi.fn(() => Promise.resolve(state)),
    ...(options.withMove === false
      ? {}
      : {
          move: vi.fn((to: string) => {
            moved.push(to);
            return Promise.resolve();
          }),
        }),
  };
  return { handle: handle as unknown as FileSystemFileHandle, raw: handle, moved };
};

describe("renombrado de archivos sueltos (sin carpeta abierta)", () => {
  it("renombra usando el handle del archivo cargado", async () => {
    const { handle, moved } = fakeHandle("original.mkv");
    const port = createHandleRenamePort(new Map([["1", handle]]));

    await port.move({ id: "1", from: "original.mkv", to: "Película (2024).mkv" });

    expect(moved).toEqual(["Película (2024).mkv"]);
  });

  it("pide permiso de escritura antes de mover", async () => {
    const { handle, raw } = fakeHandle("original.mkv", { permission: "prompt" });
    const port = createHandleRenamePort(new Map([["1", handle]]));

    await expect(port.move({ id: "1", from: "original.mkv", to: "nuevo.mkv" })).rejects.toThrow(
      /permiso de escritura/iu,
    );
    expect(raw.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
  });

  it("explica que el navegador no soporta renombrar", async () => {
    const { handle } = fakeHandle("original.mkv", { withMove: false });
    const port = createHandleRenamePort(new Map([["1", handle]]));

    await expect(port.move({ id: "1", from: "original.mkv", to: "nuevo.mkv" })).rejects.toThrow(
      /Chromium/u,
    );
  });

  it("avisa si el archivo ya no está cargado", async () => {
    const port = createHandleRenamePort(new Map());
    await expect(port.move({ id: "1", from: "a.mkv", to: "b.mkv" })).rejects.toThrow(
      /vuelve a cargarlo/iu,
    );
  });

  it("sin carpeta no puede comprobar el destino, y no lo finge", async () => {
    const port = createHandleRenamePort(new Map());
    await expect(port.entryExists("lo-que-sea.mkv")).resolves.toBe(false);
  });
});

describe("renombrado con carpeta abierta", () => {
  const directory = (existing: readonly string[]) =>
    ({
      getFileHandle: (name: string) =>
        existing.includes(name)
          ? Promise.resolve(fakeHandle(name).handle)
          : Promise.reject(Object.assign(new Error("no existe"), { name: "NotFoundError" })),
      getDirectoryHandle: () =>
        Promise.reject(Object.assign(new Error("no existe"), { name: "NotFoundError" })),
    }) as unknown as FileSystemDirectoryHandle;

  it("detecta que el destino ya existe", async () => {
    const port = createDirectoryRenamePort(directory(["ocupado.mkv"]), new Map());
    await expect(port.entryExists("ocupado.mkv")).resolves.toBe(true);
    await expect(port.entryExists("libre.mkv")).resolves.toBe(false);
  });

  it("mueve con el handle conocido del archivo", async () => {
    const { handle, moved } = fakeHandle("a.mkv");
    const port = createDirectoryRenamePort(directory(["a.mkv"]), new Map([["1", handle]]));

    await port.move({ id: "1", from: "a.mkv", to: "b.mkv" });
    expect(moved).toEqual(["b.mkv"]);
  });
});

describe("arrastrar y soltar conserva el acceso al archivo", () => {
  const dataTransfer = (
    entries: readonly { name: string; handle: (() => Promise<unknown>) | null }[],
  ): DataTransfer =>
    ({
      items: entries.map((entry) => ({
        kind: "file",
        getAsFile: () => new File(["x"], entry.name),
        ...(entry.handle === null ? {} : { getAsFileSystemHandle: entry.handle }),
      })),
    }) as unknown as DataTransfer;

  it("conserva el handle aunque el navegador rechace pedir permiso al soltar", async () => {
    // Regresión: pedir `requestPermission` durante el drop puede fallar porque
    // la activación de usuario ya se consumió. Antes eso descartaba el handle y
    // el archivo quedaba imposible de renombrar.
    const { handle, raw } = fakeHandle("peli.mkv");
    raw.requestPermission.mockRejectedValue(new Error("User activation is required"));

    const [picked] = await filesFromDataTransfer(
      dataTransfer([{ name: "peli.mkv", handle: () => Promise.resolve(handle) }]),
    );

    expect(picked?.handle).toBe(handle);
    expect(picked?.file).toBeDefined();
  });

  it("carga el archivo aunque no haya handle, y entonces el plan lo bloquea con un motivo claro", async () => {
    const [picked] = await filesFromDataTransfer(
      dataTransfer([{ name: "peli.mkv", handle: () => Promise.reject(new Error("sin handle")) }]),
    );
    expect(picked?.handle).toBeUndefined();

    const plan = buildRenamePlan(
      [{ id: "1", currentName: "peli.mkv", proposedName: "Peli (2020).mkv", hasHandle: false }],
      { requireHandles: true },
    );
    expect(plan.items[0]?.status).toBe("blocked");
    expect(plan.items[0]?.issues.map((issue) => issue.message).join(" ")).not.toContain("script");
  });

  it("descarta lo que no es vídeo", async () => {
    const picked = await filesFromDataTransfer(dataTransfer([{ name: "notas.txt", handle: null }]));
    expect(picked).toHaveLength(0);
  });
});
