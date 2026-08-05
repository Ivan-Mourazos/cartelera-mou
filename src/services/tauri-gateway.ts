import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import {
  parseFfprobeValidation,
  parseHistory,
  parseIdentifiedMovie,
  parseLibrary,
  parsePreflight,
  parseRenameBatch,
  parseSavedSettings,
  parseScanProgress,
  parseScanResult,
  parseSettings,
  parseTmdbCandidates,
  parseUndoResult,
} from "./schemas";
import type {
  AppSettings,
  DesktopGateway,
  FfprobeValidation,
  HistoryEntry,
  IdentifyMediaFileRequest,
  MovieRecord,
  PreflightResult,
  RenameBatchRequest,
  RenameBatchResult,
  SaveSettingsRequest,
  ScanFolderRequest,
  ScanFolderResult,
  ScanProgress,
  TmdbCandidate,
  TmdbSearchRequest,
  UndoResult,
} from "./types";

export class DesktopOperationError extends Error {
  public readonly code: string;
  public readonly details: string | null;
  public readonly retryable: boolean;

  public constructor(
    message: string,
    options: { code?: string; details?: string | null; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "DesktopOperationError";
    this.code = options.code ?? "desktop_operation_failed";
    this.details = options.details ?? null;
    this.retryable = options.retryable ?? false;
  }
}

function normalizeDesktopError(error: unknown): DesktopOperationError {
  if (error instanceof DesktopOperationError) return error;
  if (error instanceof Error) {
    return new DesktopOperationError(error.message, { details: error.stack ?? null });
  }
  if (typeof error === "object" && error !== null) {
    const value = error as Record<string, unknown>;
    const code = typeof value.code === "string" ? value.code : undefined;
    return new DesktopOperationError(
      typeof value.message === "string" ? value.message : "La operación local no pudo completarse.",
      {
        ...(code === undefined ? {} : { code }),
        details: typeof value.details === "string" ? value.details : null,
        retryable: value.retryable === true,
      },
    );
  }
  return new DesktopOperationError(
    typeof error === "string" ? error : "La operación local no pudo completarse.",
  );
}

async function invokeDesktop(command: string, args?: Record<string, unknown>): Promise<unknown> {
  try {
    return await invoke<unknown>(command, args);
  } catch (error) {
    throw normalizeDesktopError(error);
  }
}

export class TauriDesktopGateway implements DesktopGateway {
  public readonly mode = "desktop" as const;

  public async selectFolder(): Promise<string | null> {
    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: "Elegir carpeta de películas",
      });
      return typeof selection === "string" ? selection : null;
    } catch (error) {
      throw normalizeDesktopError(error);
    }
  }

  public async scanFolder(
    request: ScanFolderRequest,
    onProgress: (progress: ScanProgress) => void,
  ): Promise<ScanFolderResult> {
    onProgress({
      stage: "discovering",
      completed: 0,
      total: 0,
      currentFile: null,
      message: "Buscando archivos de vídeo…",
    });

    const unlisten = await listen<unknown>("scan-progress", (event) => {
      try {
        onProgress(parseScanProgress(event.payload));
      } catch {
        // Un evento inválido no debe interrumpir el resultado transaccional del comando.
      }
    });

    try {
      const result = parseScanResult(await invokeDesktop("scan_folder", { request }));
      onProgress({
        stage: "complete",
        completed: result.items.length,
        total: result.items.length,
        currentFile: null,
        message: `${result.items.length} archivos preparados para revisión.`,
      });
      return result;
    } finally {
      unlisten();
    }
  }

  public async validateFfprobe(path: string): Promise<FfprobeValidation> {
    return parseFfprobeValidation(await invokeDesktop("validate_ffprobe", { path }));
  }

  public async listLibrary(): Promise<MovieRecord[]> {
    return parseLibrary(await invokeDesktop("list_library"));
  }

  public async identifyMediaFile(request: IdentifyMediaFileRequest): Promise<MovieRecord> {
    return parseIdentifiedMovie(await invokeDesktop("identify_media_file", { request }));
  }

  public async listHistory(): Promise<HistoryEntry[]> {
    return parseHistory(await invokeDesktop("list_history"));
  }

  public async getSettings(): Promise<AppSettings> {
    return parseSettings(await invokeDesktop("get_settings"));
  }

  public async saveSettings(request: SaveSettingsRequest): Promise<AppSettings> {
    const privateRequest = {
      titleLanguage: request.titleLanguage,
      region: request.region,
      ffprobePath: request.ffprobePath,
      namingTemplate: request.namingTemplate,
      matchThreshold: request.matchThreshold,
      includeIdentifier: request.includeIdentifier,
      tagOrder: request.tagOrder,
      enabledTags: request.enabledTags,
      theme: request.theme,
      ...(request.tmdbToken === undefined ? {} : { tmdbToken: request.tmdbToken }),
    };
    return parseSavedSettings(await invokeDesktop("save_settings", { request: privateRequest }));
  }

  public async preflightRenameBatch(request: RenameBatchRequest): Promise<PreflightResult> {
    return parsePreflight(await invokeDesktop("preflight_rename_batch", { request }));
  }

  public async executeRenameBatch(request: RenameBatchRequest): Promise<RenameBatchResult> {
    return parseRenameBatch(await invokeDesktop("execute_rename_batch", { request }));
  }

  public async undoRename(historyId: number): Promise<UndoResult> {
    return parseUndoResult(await invokeDesktop("undo_rename", { historyId }));
  }

  public async searchTmdb(request: TmdbSearchRequest): Promise<TmdbCandidate[]> {
    return parseTmdbCandidates(await invokeDesktop("search_tmdb", { request }));
  }
}
