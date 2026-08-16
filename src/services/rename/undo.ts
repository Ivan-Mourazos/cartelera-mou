import { buildRenamePlan, type RenamePlan } from "./plan";
import { executeRenamePlan, type RenameBatchResult, type RenameFileSystemPort } from "./executor";

/**
 * Deshacer el último lote.
 *
 * Se reconstruye un plan inverso y se vuelve a validar por completo: si alguien
 * creó mientras tanto un archivo con el nombre antiguo, ese elemento queda
 * bloqueado y no se sobrescribe nada.
 */

export interface UndoableMove {
  readonly id: string;
  readonly from: string;
  readonly to: string;
}

export interface RenameBatchRecord {
  readonly batchId: string;
  readonly timestamp: string;
  readonly folderName: string | undefined;
  readonly moves: readonly UndoableMove[];
}

export const buildUndoPlan = (
  record: RenameBatchRecord,
  options: { readonly existingNames?: Iterable<string>; readonly requireHandles?: boolean } = {},
): RenamePlan =>
  buildRenamePlan(
    // Se invierte cada movimiento: el destino actual vuelve a ser el original.
    [...record.moves].reverse().map((move) => ({
      id: move.id,
      currentName: move.to,
      proposedName: move.from,
      hasHandle: true,
    })),
    {
      ...(options.existingNames === undefined ? {} : { existingNames: options.existingNames }),
      ...(options.requireHandles === undefined ? {} : { requireHandles: options.requireHandles }),
    },
  );

export const undoRenameBatch = async (
  record: RenameBatchRecord,
  port: RenameFileSystemPort,
  options: {
    readonly existingNames?: Iterable<string>;
    readonly dryRun?: boolean;
    readonly signal?: AbortSignal;
    readonly onProgress?: (done: number, total: number, currentName: string) => void;
  } = {},
): Promise<RenameBatchResult> => {
  const plan = buildUndoPlan(record, {
    ...(options.existingNames === undefined ? {} : { existingNames: options.existingNames }),
  });
  return executeRenamePlan(plan, port, {
    dryRun: options.dryRun ?? false,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
  });
};
