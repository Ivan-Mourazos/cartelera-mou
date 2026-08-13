import type { RenamerItem } from "./renamer-types";

export interface PickedFile {
  name: string;
  size: number;
  handle?: FileSystemFileHandle | undefined;
  fileObj?: File | undefined;
}

export interface PickDirectoryResult {
  folderName: string;
  files: PickedFile[];
  directoryHandle?: FileSystemDirectoryHandle | undefined;
}

export const MEDIA_EXTENSIONS = new Set([
  // Video formats
  "mkv",
  "mp4",
  "avi",
  "m4v",
  "mov",
  "wmv",
  "flv",
  "webm",
  "ts",
  "m2ts",
  "mts",
  "vob",
  "ogv",
  "iso",
  "divx",
  "rmvb",
  "3gp",
  // Audio formats
  "mp3",
  "flac",
  "m4a",
  "aac",
  "wav",
  "ogg",
  "opus",
  "wma",
  "ac3",
  "dts",
  "eac3",
  "alac",
  "aiff",
]);

export function isMediaFile(filename: string): boolean {
  if (!filename) return false;
  if (filename.startsWith(".")) return false;
  const parts = filename.split(".");
  if (parts.length < 2) return false;
  const ext = parts[parts.length - 1]?.toLowerCase();
  return ext !== undefined && MEDIA_EXTENSIONS.has(ext);
}

// ── Permissions helper ──────────────────────────────────────────────────

export async function verifyPermission(
  handle: FileSystemHandle,
  readWrite = true,
): Promise<boolean> {
  const options: { mode?: "read" | "readwrite" } = {};
  if (readWrite) {
    options.mode = "readwrite";
  }
  try {
    const handleWithPerms = handle as unknown as {
      queryPermission?: (opts: typeof options) => Promise<string>;
      requestPermission?: (opts: typeof options) => Promise<string>;
    };

    if (typeof handleWithPerms.queryPermission === "function") {
      const state = await handleWithPerms.queryPermission(options);
      if (state === "granted") return true;
    }
    if (typeof handleWithPerms.requestPermission === "function") {
      const state = await handleWithPerms.requestPermission(options);
      if (state === "granted") return true;
    }
  } catch (err) {
    console.warn("Permission check failed:", err);
  }
  return false;
}

// ── Directory picker ────────────────────────────────────────────────────

async function collectFilesFromDirectory(
  dirHandle: FileSystemDirectoryHandle,
  recursive = true,
): Promise<PickedFile[]> {
  const files: PickedFile[] = [];

  const dirAny = dirHandle as unknown as {
    values?: () => AsyncIterable<FileSystemHandle>;
    entries?: () => AsyncIterable<[string, FileSystemHandle]>;
  };

  try {
    if (typeof dirAny.values === "function") {
      for await (const entry of dirAny.values()) {
        if (entry.kind === "file") {
          if (!isMediaFile(entry.name)) continue;
          try {
            const fileHandle = entry as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            files.push({ name: file.name, size: file.size, handle: fileHandle, fileObj: file });
          } catch (e) {
            console.warn("Could not read file handle:", entry.name, e);
          }
        } else if (recursive) {
          try {
            const sub = await collectFilesFromDirectory(
              entry as FileSystemDirectoryHandle,
              recursive,
            );
            files.push(...sub);
          } catch (e) {
            console.warn("Could not read subfolder:", entry.name, e);
          }
        }
      }
    } else if (typeof dirAny.entries === "function") {
      for await (const [, entry] of dirAny.entries()) {
        if (entry.kind === "file") {
          if (!isMediaFile(entry.name)) continue;
          try {
            const fileHandle = entry as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            files.push({ name: file.name, size: file.size, handle: fileHandle, fileObj: file });
          } catch (e) {
            console.warn("Could not read file handle:", entry.name, e);
          }
        } else if (recursive) {
          try {
            const sub = await collectFilesFromDirectory(
              entry as FileSystemDirectoryHandle,
              recursive,
            );
            files.push(...sub);
          } catch (e) {
            console.warn("Could not read subfolder:", entry.name, e);
          }
        }
      }
    }
  } catch (err) {
    console.warn("Error iterating directory:", err);
  }

  return files;
}

export async function openDirectoryPicker(): Promise<PickDirectoryResult | null> {
  if ("showDirectoryPicker" in window) {
    try {
      const dirHandle = await (
        window as unknown as {
          showDirectoryPicker: (opts?: {
            mode?: "read" | "readwrite";
          }) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker({ mode: "readwrite" });

      await verifyPermission(dirHandle, true);

      const files = await collectFilesFromDirectory(dirHandle, true);

      return { folderName: dirHandle.name, files, directoryHandle: dirHandle };
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return null;
      console.warn("showDirectoryPicker failed, falling back to input:", err);
    }
  }

  // Universal fallback: webkitdirectory input
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.multiple = true;

    input.onchange = () => {
      if (!input.files || input.files.length === 0) {
        resolve(null);
        return;
      }

      const files: PickedFile[] = [];
      let folderName = "Carpeta";

      for (const file of input.files) {
        if (!isMediaFile(file.name)) continue;
        if (file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split("/");
          if (parts[0]) folderName = parts[0];
        }
        files.push({ name: file.name, size: file.size, fileObj: file });
      }

      resolve({ folderName, files });
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

// ── File picker ─────────────────────────────────────────────────────────

export async function openFilesPicker(): Promise<PickedFile[] | null> {
  if ("showOpenFilePicker" in window) {
    try {
      const handles = await (
        window as unknown as {
          showOpenFilePicker: (options?: {
            multiple?: boolean;
            types?: { description: string; accept: Record<string, string[]> }[];
          }) => Promise<FileSystemFileHandle[]>;
        }
      ).showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "Archivos Multimedia (Vídeo y Audio)",
            accept: {
              "video/*": [".mkv", ".mp4", ".avi", ".m4v", ".mov", ".wmv", ".webm", ".ts", ".m2ts"],
              "audio/*": [".mp3", ".flac", ".m4a", ".aac", ".wav", ".ogg", ".opus", ".ac3", ".dts"],
            },
          },
        ],
      });

      const files: PickedFile[] = [];
      for (const handle of handles) {
        if (!isMediaFile(handle.name)) continue;
        await verifyPermission(handle, true);
        const file = await handle.getFile();
        files.push({ name: file.name, size: file.size, handle, fileObj: file });
      }
      return files;
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return null;
      console.warn("showOpenFilePicker failed, falling back to input:", err);
    }
  }

  // Fallback
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept =
      "video/*,audio/*,.mkv,.mp4,.avi,.m4v,.mov,.wmv,.flv,.webm,.ts,.m2ts,.mp3,.flac,.m4a,.aac,.wav,.ogg";

    input.onchange = () => {
      if (!input.files || input.files.length === 0) {
        resolve(null);
        return;
      }
      const files: PickedFile[] = [];
      for (const file of input.files) {
        if (!isMediaFile(file.name)) continue;
        files.push({ name: file.name, size: file.size, fileObj: file });
      }
      resolve(files);
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

// ── Direct in-place rename ──────────────────────────────────────────────

export async function renameDirectInDirectory(
  items: RenamerItem[],
  onProgress?: (index: number, total: number, itemName: string) => void,
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || !item.selected || item.originalName === item.suggestedName) continue;

    onProgress?.(i + 1, items.length, item.originalName);

    try {
      const handle = item.fileHandle;
      if (handle) {
        await verifyPermission(handle, true);
        if (
          "move" in handle &&
          typeof (handle as unknown as { move: unknown }).move === "function"
        ) {
          await (handle as unknown as { move: (newName: string) => Promise<void> }).move(
            item.suggestedName,
          );
          succeeded++;
        } else {
          throw new Error(
            `El navegador no soporta el método directo .move() en este archivo. Usa el script .bat.`,
          );
        }
      } else {
        throw new Error(
          `No se dispone de handle con permiso de escritura para ${item.originalName}`,
        );
      }
    } catch (err) {
      failed++;
      errors.push(`${item.originalName}: ${(err as Error).message}`);
    }
  }

  return { succeeded, failed, errors };
}

// ── Script generation ───────────────────────────────────────────────────

export function generateBatchScript(items: RenamerItem[], format: "bat" | "ps1" | "sh"): string {
  const selected = items.filter(
    (item) => item.selected && item.originalName !== item.suggestedName,
  );

  if (format === "bat") {
    const lines = [
      "@echo off",
      "chcp 65001 > nul",
      "echo =========================================",
      "echo  Renombrador Inteligente - Batch Rename",
      "echo =========================================",
      "echo.",
    ];
    for (const item of selected) {
      lines.push(`if exist "${item.originalName}" (`);
      lines.push(`    ren "${item.originalName}" "${item.suggestedName}"`);
      lines.push(`    echo [OK] "${item.originalName}" -> "${item.suggestedName}"`);
      lines.push(`) else (`);
      lines.push(`    echo [NO ENCONTRADO] "${item.originalName}"`);
      lines.push(`)`);
    }
    lines.push("echo.", "echo Proceso completado con exito.", "pause");
    return lines.join("\r\n");
  }

  if (format === "ps1") {
    const lines = [
      "# Renombrador Inteligente - PowerShell Script",
      "$OutputEncoding = [System.Text.Encoding]::UTF8",
      "Write-Host '=========================================' -ForegroundColor Cyan",
      "Write-Host ' Renombrador Inteligente - PowerShell' -ForegroundColor Cyan",
      "Write-Host '=========================================' -ForegroundColor Cyan",
      "",
    ];
    for (const item of selected) {
      lines.push(`if (Test-Path -LiteralPath "${item.originalName}") {`);
      lines.push(
        `    Rename-Item -LiteralPath "${item.originalName}" -NewName "${item.suggestedName}"`,
      );
      lines.push(
        `    Write-Host "[OK] ${item.originalName} -> ${item.suggestedName}" -ForegroundColor Green`,
      );
      lines.push(`} else {`);
      lines.push(`    Write-Host "[NO ENCONTRADO] ${item.originalName}" -ForegroundColor Yellow`);
      lines.push(`}`);
    }
    lines.push("", "Write-Host 'Completado con exito.' -ForegroundColor Green");
    return lines.join("\r\n");
  }

  // sh
  const lines = [
    "#!/bin/bash",
    "# Renombrador Inteligente - Shell Script",
    'echo "========================================="',
    'echo " Renombrador Inteligente - Shell Script"',
    'echo "========================================="',
    "",
  ];
  for (const item of selected) {
    lines.push(`if [ -f "${item.originalName}" ]; then`);
    lines.push(`    mv "${item.originalName}" "${item.suggestedName}"`);
    lines.push(`    echo "[OK] ${item.originalName} -> ${item.suggestedName}"`);
    lines.push(`else`);
    lines.push(`    echo "[NO ENCONTRADO] ${item.originalName}"`);
    lines.push(`fi`);
  }
  lines.push("", 'echo "Completado."');
  return lines.join("\n");
}

// ── Utilities ───────────────────────────────────────────────────────────

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
