import type { RenameFileSystemPort } from "./rename/executor";

/**
 * Acceso al sistema de archivos del navegador (File System Access API).
 *
 * Esta capa no decide nada: selecciona ficheros, lista nombres existentes y
 * ejecuta movimientos. La validación vive en `services/rename/plan.ts`.
 */

export interface PickedFile {
  readonly name: string;
  readonly size: number;
  readonly handle?: FileSystemFileHandle | undefined;
  readonly file?: File | undefined;
  /** Ruta relativa dentro de la carpeta elegida, si se conoce. */
  readonly relativePath?: string | undefined;
  readonly folderName?: string | undefined;
}

export interface PickDirectoryResult {
  readonly folderName: string;
  readonly files: readonly PickedFile[];
  readonly directoryHandle?: FileSystemDirectoryHandle | undefined;
  /** Todos los nombres del primer nivel, para detectar conflictos de destino. */
  readonly existingNames: readonly string[];
}

/** Contenedores de vídeo admitidos. La herramienta organiza vídeo, no música. */
export const VIDEO_EXTENSIONS = new Set([
  "mkv",
  "mp4",
  "m4v",
  "avi",
  "mov",
  "wmv",
  "flv",
  "webm",
  "ts",
  "m2ts",
  "mts",
  "mpg",
  "mpeg",
  "vob",
  "ogv",
  "divx",
  "rmvb",
  "3gp",
  "asf",
]);

export const extensionOf = (filename: string): string => {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
};

export const isVideoFile = (filename: string): boolean => {
  if (filename.length === 0 || filename.startsWith(".")) return false;
  return VIDEO_EXTENSIONS.has(extensionOf(filename));
};

// ── Permisos ────────────────────────────────────────────────────────────

interface PermissionCapableHandle {
  queryPermission?: (options: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
}

export const verifyPermission = async (
  handle: FileSystemHandle,
  mode: "read" | "readwrite" = "readwrite",
): Promise<boolean> => {
  const capable = handle as unknown as PermissionCapableHandle;
  try {
    if (typeof capable.queryPermission === "function") {
      if ((await capable.queryPermission({ mode })) === "granted") return true;
    }
    if (typeof capable.requestPermission === "function") {
      return (await capable.requestPermission({ mode })) === "granted";
    }
  } catch {
    return false;
  }
  return false;
};

// ── Selección ───────────────────────────────────────────────────────────

interface DirectoryIterable {
  values?: () => AsyncIterable<FileSystemHandle>;
}

const collectFiles = async (
  directory: FileSystemDirectoryHandle,
  folderName: string,
  prefix: string,
  recursive: boolean,
  files: PickedFile[],
  names: string[],
): Promise<void> => {
  const iterable = directory as unknown as DirectoryIterable;
  if (typeof iterable.values !== "function") return;

  for await (const entry of iterable.values()) {
    if (prefix === "") names.push(entry.name);

    if (entry.kind === "file") {
      if (!isVideoFile(entry.name)) continue;
      try {
        const handle = entry as FileSystemFileHandle;
        const file = await handle.getFile();
        files.push({
          name: file.name,
          size: file.size,
          handle,
          file,
          relativePath: `${prefix}${file.name}`,
          folderName,
        });
      } catch {
        // Un fichero ilegible no debe abortar el recorrido completo.
      }
      continue;
    }

    if (recursive) {
      try {
        await collectFiles(
          entry as FileSystemDirectoryHandle,
          entry.name,
          `${prefix}${entry.name}/`,
          recursive,
          files,
          names,
        );
      } catch {
        // Carpeta sin permisos: se ignora y se continúa.
      }
    }
  }
};

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle[]>;
}

export const supportsDirectRename = (): boolean =>
  typeof window !== "undefined" &&
  typeof (window as unknown as DirectoryPickerWindow).showDirectoryPicker === "function";

export const openDirectoryPicker = async (): Promise<PickDirectoryResult | null> => {
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;

  if (typeof picker === "function") {
    let directory: FileSystemDirectoryHandle;
    try {
      directory = await picker({ mode: "readwrite" });
    } catch (error) {
      if ((error as Error).name === "AbortError") return null;
      throw error;
    }

    await verifyPermission(directory, "readwrite");

    const files: PickedFile[] = [];
    const names: string[] = [];
    await collectFiles(directory, directory.name, "", true, files, names);

    return { folderName: directory.name, files, directoryHandle: directory, existingNames: names };
  }

  // Reserva universal: `webkitdirectory` da los ficheros pero no permite
  // renombrar; la interfaz lo indica y ofrece el script.
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.multiple = true;

    input.onchange = () => {
      const selected = input.files;
      if (selected === null || selected.length === 0) {
        resolve(null);
        return;
      }

      const files: PickedFile[] = [];
      const names: string[] = [];
      let folderName = "Carpeta";

      for (const file of selected) {
        names.push(file.name);
        const parts = file.webkitRelativePath.split("/");
        if (parts[0] !== undefined && parts[0].length > 0) folderName = parts[0];
        if (!isVideoFile(file.name)) continue;
        files.push({
          name: file.name,
          size: file.size,
          file,
          relativePath: file.webkitRelativePath,
          folderName,
        });
      }

      resolve({ folderName, files, existingNames: names });
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
};

export const openFilesPicker = async (): Promise<readonly PickedFile[] | null> => {
  const picker = (window as unknown as DirectoryPickerWindow).showOpenFilePicker;

  if (typeof picker === "function") {
    let handles: FileSystemFileHandle[];
    try {
      handles = await picker({
        multiple: true,
        types: [
          {
            description: "Archivos de vídeo",
            accept: {
              "video/*": [...VIDEO_EXTENSIONS].map((extension) => `.${extension}`),
            },
          },
        ],
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") return null;
      throw error;
    }

    const files: PickedFile[] = [];
    for (const handle of handles) {
      if (!isVideoFile(handle.name)) continue;
      // `showOpenFilePicker` concede solo lectura: sin pedir escritura, `move()`
      // fallaría después con NotAllowedError y el archivo no se renombraría.
      await verifyPermission(handle, "readwrite");
      const file = await handle.getFile();
      files.push({ name: file.name, size: file.size, handle, file });
    }
    return files;
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = [...VIDEO_EXTENSIONS].map((extension) => `.${extension}`).join(",");
    input.onchange = () => {
      const selected = input.files;
      if (selected === null || selected.length === 0) {
        resolve(null);
        return;
      }
      const files: PickedFile[] = [];
      for (const file of selected) {
        if (!isVideoFile(file.name)) continue;
        files.push({ name: file.name, size: file.size, file });
      }
      resolve(files);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
};

export const filesFromDataTransfer = async (
  dataTransfer: DataTransfer,
): Promise<readonly PickedFile[]> => {
  // `DataTransferItem` deja de ser válido en cuanto se cede el control con un
  // `await`, así que primero se recoge todo de forma síncrona.
  const pending = Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => {
      const withHandle = item as unknown as {
        getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
      };
      return {
        file: item.getAsFile(),
        handle:
          typeof withHandle.getAsFileSystemHandle === "function"
            ? withHandle.getAsFileSystemHandle()
            : null,
      };
    });

  const files: PickedFile[] = [];
  for (const entry of pending) {
    const file = entry.file;
    if (file === null || !isVideoFile(file.name)) continue;

    // El permiso de escritura NO se pide aquí: al soltar, la activación de
    // usuario puede estar consumida y el navegador rechazaría la petición. Si
    // eso hiciera perder el handle, el archivo quedaría sin poder renombrarse.
    // Se pide en el momento de renombrar, que es otra pulsación del usuario.
    let handle: FileSystemFileHandle | undefined;
    try {
      const candidate = await entry.handle;
      if (candidate?.kind === "file") handle = candidate as FileSystemFileHandle;
    } catch {
      handle = undefined;
    }

    files.push({ name: file.name, size: file.size, handle, file });
  }

  return files;
};

// ── Puerto de renombrado ────────────────────────────────────────────────

interface MovableFileHandle {
  move?: (destination: FileSystemDirectoryHandle | string, name?: string) => Promise<void>;
}

export const supportsHandleMove = (handle: FileSystemFileHandle | undefined): boolean =>
  handle !== undefined && typeof (handle as unknown as MovableFileHandle).move === "function";

/**
 * Puerto real sobre una carpeta abierta.
 *
 * Solo usa `move()`. Si el navegador no lo implementa, la operación falla con un
 * mensaje claro: jamás se recurre a copiar y borrar, porque eso puede destruir
 * el fichero de destino y duplicar decenas de gigabytes.
 */
export const createDirectoryRenamePort = (
  directory: FileSystemDirectoryHandle,
  handlesById: ReadonlyMap<string, FileSystemFileHandle>,
): RenameFileSystemPort => ({
  entryExists: async (name: string): Promise<boolean> => {
    try {
      await directory.getFileHandle(name);
      return true;
    } catch (error) {
      if ((error as Error).name !== "NotFoundError") throw error;
    }
    try {
      await directory.getDirectoryHandle(name);
      return true;
    } catch (error) {
      if ((error as Error).name !== "NotFoundError") throw error;
    }
    return false;
  },

  move: async ({ id, from, to }): Promise<void> => {
    const handle = handlesById.get(id) ?? (await directory.getFileHandle(from));
    await moveHandle(handle, to);
  },
});

const NO_MOVE_SUPPORT =
  "Este navegador no permite renombrar archivos. Usa Chrome, Edge u otro navegador basado en Chromium.";

const NO_WRITE_PERMISSION =
  "No hay permiso de escritura sobre el archivo. Vuelve a cargarlo y acepta el permiso que pide el navegador.";

const moveHandle = async (handle: FileSystemFileHandle, to: string): Promise<void> => {
  const movable = handle as unknown as MovableFileHandle;
  if (typeof movable.move !== "function") throw new Error(NO_MOVE_SUPPORT);
  if (!(await verifyPermission(handle, "readwrite"))) throw new Error(NO_WRITE_PERMISSION);
  await movable.move(to);
};

/**
 * Puerto para archivos sueltos, sin carpeta abierta.
 *
 * Es el caso de «Seleccionar archivos» y de arrastrar y soltar. No se puede
 * listar la carpeta, así que no es posible comprobar si el destino ya existe: el
 * plan avisa de ello y la única protección real son las colisiones dentro del
 * propio lote.
 */
export const createHandleRenamePort = (
  handlesById: ReadonlyMap<string, FileSystemFileHandle>,
): RenameFileSystemPort => ({
  entryExists: () => Promise.resolve(false),
  move: async ({ id, to }): Promise<void> => {
    const handle = handlesById.get(id);
    if (handle === undefined) {
      throw new Error("El archivo ya no está disponible. Vuelve a cargarlo.");
    }
    await moveHandle(handle, to);
  },
});
