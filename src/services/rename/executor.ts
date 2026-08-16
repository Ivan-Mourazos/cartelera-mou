import type { RenamePlan, RenamePlanItem } from "./plan";

/**
 * Ejecución del renombrado.
 *
 * Solo se mueve el archivo (`FileSystemFileHandle.move`). Nunca se copia y borra:
 * copiar un REMUX de 80 GB para renombrarlo es lento, duplica el espacio y, si
 * el proceso se interrumpe, deja un destino truncado y el original ya borrado.
 * Antes de cada movimiento se vuelve a comprobar que el destino esté libre
 * (el estado del disco pudo cambiar entre la previsualización y la ejecución).
 */

export type RenameOutcome = "renamed" | "skipped" | "failed" | "simulated";

export interface RenameEntry {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly outcome: RenameOutcome;
  readonly error: string | undefined;
}

export interface RenameBatchResult {
  readonly entries: readonly RenameEntry[];
  readonly renamed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly simulated: number;
  /** Movimientos realmente aplicados, en orden, para poder deshacerlos. */
  readonly undoable: readonly { readonly id: string; readonly from: string; readonly to: string }[];
  readonly cancelled: boolean;
}

export interface RenameFileSystemPort {
  /** ¿Existe una entrada con ese nombre en la carpeta de destino? */
  entryExists: (name: string) => Promise<boolean>;
  /** Renombra dentro de la misma carpeta. Debe fallar si no puede. */
  move: (item: { id: string; from: string; to: string }) => Promise<void>;
}

export interface ExecuteOptions {
  readonly dryRun?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number, currentName: string) => void;
}

const sameNameIgnoringCase = (left: string, right: string): boolean =>
  left.toLocaleLowerCase("es-ES") === right.toLocaleLowerCase("es-ES");

export const executeRenamePlan = async (
  plan: RenamePlan,
  port: RenameFileSystemPort,
  options: ExecuteOptions = {},
): Promise<RenameBatchResult> => {
  const dryRun = options.dryRun ?? true;
  const executable = plan.items.filter((item: RenamePlanItem) => item.status === "ready");
  const entries: RenameEntry[] = [];
  const undoable: { id: string; from: string; to: string }[] = [];
  let cancelled = false;

  for (const [position, item] of executable.entries()) {
    if (options.signal?.aborted === true) {
      cancelled = true;
      entries.push({
        id: item.id,
        from: item.currentName,
        to: item.proposedName,
        outcome: "skipped",
        error: "Cancelado antes de ejecutarse.",
      });
      continue;
    }

    options.onProgress?.(position + 1, executable.length, item.currentName);

    // Revalidación justo antes de tocar el disco (TOCTOU).
    const caseOnly = sameNameIgnoringCase(item.currentName, item.proposedName);
    if (!caseOnly) {
      let occupied = false;
      try {
        occupied = await port.entryExists(item.proposedName);
      } catch (error) {
        entries.push({
          id: item.id,
          from: item.currentName,
          to: item.proposedName,
          outcome: "failed",
          error: `No se pudo comprobar el destino: ${(error as Error).message}`,
        });
        continue;
      }
      if (occupied) {
        entries.push({
          id: item.id,
          from: item.currentName,
          to: item.proposedName,
          outcome: "failed",
          error: "El destino ya existe en la carpeta. No se sobrescribe nada.",
        });
        continue;
      }
    }

    if (dryRun) {
      entries.push({
        id: item.id,
        from: item.currentName,
        to: item.proposedName,
        outcome: "simulated",
        error: undefined,
      });
      continue;
    }

    try {
      await port.move({ id: item.id, from: item.currentName, to: item.proposedName });
      entries.push({
        id: item.id,
        from: item.currentName,
        to: item.proposedName,
        outcome: "renamed",
        error: undefined,
      });
      undoable.push({ id: item.id, from: item.currentName, to: item.proposedName });
    } catch (error) {
      entries.push({
        id: item.id,
        from: item.currentName,
        to: item.proposedName,
        outcome: "failed",
        error: (error as Error).message,
      });
    }
  }

  for (const item of plan.items) {
    if (item.status === "ready") continue;
    entries.push({
      id: item.id,
      from: item.currentName,
      to: item.proposedName,
      outcome: "skipped",
      error:
        item.status === "unchanged"
          ? "El nombre no cambia."
          : item.issues
              .filter((entry) => entry.severity === "blocking")
              .map((entry) => entry.message)
              .join(" "),
    });
  }

  return {
    entries,
    renamed: entries.filter((entry) => entry.outcome === "renamed").length,
    failed: entries.filter((entry) => entry.outcome === "failed").length,
    skipped: entries.filter((entry) => entry.outcome === "skipped").length,
    simulated: entries.filter((entry) => entry.outcome === "simulated").length,
    undoable,
    cancelled,
  };
};
