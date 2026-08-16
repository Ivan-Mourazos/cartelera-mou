import type { RenameBatchResult } from "./executor";
import type { RenameBatchRecord } from "./undo";

/**
 * Registro de operaciones: `archivo original → archivo nuevo`, con los errores.
 * Se guarda en `localStorage` con un tope, para que la sesión siguiente pueda
 * seguir deshaciendo el último lote y consultar qué ocurrió.
 */

const STORAGE_KEY = "renombrador.rename-log.v1";
const MAX_RECORDS = 20;

export interface RenameLogRecord extends RenameBatchRecord {
  readonly renamed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly errors: readonly string[];
  readonly undone: boolean;
}

const isRecord = (value: unknown): value is RenameLogRecord => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<RenameLogRecord>;
  return typeof record.batchId === "string" && Array.isArray(record.moves);
};

const read = (): RenameLogRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
};

const write = (records: readonly RenameLogRecord[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    // El registro es una ayuda, no un requisito: si el almacenamiento falla se
    // continúa sin él.
  }
};

/** Último lote que todavía puede deshacerse. */
export const latestUndoableBatch = (): RenameLogRecord | undefined =>
  read().find((record) => !record.undone && record.moves.length > 0);

export const recordRenameBatch = (
  result: RenameBatchResult,
  context: { readonly batchId: string; readonly folderName?: string | undefined },
): RenameLogRecord => {
  const record: RenameLogRecord = {
    batchId: context.batchId,
    timestamp: new Date().toISOString(),
    folderName: context.folderName,
    moves: result.undoable,
    renamed: result.renamed,
    failed: result.failed,
    skipped: result.skipped,
    errors: result.entries
      .filter((entry) => entry.outcome === "failed")
      .map((entry) => `${entry.from} → ${entry.to}: ${entry.error ?? "error desconocido"}`),
    undone: false,
  };

  write([record, ...read()]);
  return record;
};

export const markBatchUndone = (batchId: string): void => {
  write(
    read().map((record) => (record.batchId === batchId ? { ...record, undone: true } : record)),
  );
};
