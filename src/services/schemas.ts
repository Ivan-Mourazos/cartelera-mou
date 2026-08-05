import { z } from "zod";

import type {
  AppSettings,
  FfprobeValidation,
  HistoryEntry,
  MovieRecord,
  PreflightResult,
  RenameBatchResult,
  ScanFolderResult,
  ScanProgress,
  TmdbCandidate,
  UndoResult,
} from "./types";

const nullableString = z.string().nullable().default(null);
const nullableNumber = z.number().nullable().default(null);

const scoreReasonSchema = z.object({
  label: z.string(),
  points: z.number(),
});

const namingTokenSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.enum(["filename", "ffprobe", "tmdb", "manual"]),
  kind: z.enum(["title", "year", "tag", "extension"]),
  edited: z.boolean().default(false),
});

const videoDetailsSchema = z.object({
  codec: z.string(),
  profile: nullableString,
  dolbyVisionProfile: nullableString,
  level: nullableString,
  width: nullableNumber,
  height: nullableNumber,
  bitDepth: nullableNumber,
  frameRate: nullableString,
  bitrate: nullableNumber,
  hdrFormat: nullableString,
  colorSpace: nullableString,
});

const audioTrackSchema = z.object({
  index: z.number().int(),
  language: nullableString,
  title: nullableString,
  codec: z.string(),
  channels: nullableNumber,
  channelLayout: nullableString,
  bitrate: nullableNumber,
  hasAtmos: z.boolean().default(false),
  hasDtsX: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isCommentary: z.boolean().default(false),
});

const subtitleTrackSchema = z.object({
  index: z.number().int(),
  language: nullableString,
  title: nullableString,
  codec: z.string(),
  isDefault: z.boolean().default(false),
  isForced: z.boolean().default(false),
  isHearingImpaired: z.boolean().default(false),
});

export const scanProgressSchema = z.object({
  stage: z.enum(["discovering", "probing", "identifying", "proposing", "complete"]),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  currentFile: nullableString,
  message: z.string(),
});

export const scanItemSchema = z.object({
  id: z.string(),
  mediaFileId: z.number().int(),
  movieId: nullableNumber,
  path: z.string(),
  originalFilename: z.string(),
  proposedFilename: z.string(),
  title: z.string(),
  originalTitle: nullableString,
  year: nullableNumber,
  extension: z.string(),
  container: nullableString,
  sizeBytes: z.number().nonnegative(),
  resolution: nullableString,
  source: nullableString,
  releaseType: nullableString,
  posterUrl: nullableString,
  matchScore: nullableNumber,
  matchLevel: z.enum(["high", "medium", "low", "unmatched"]),
  scoreReasons: z.array(scoreReasonSchema).default([]),
  status: z.enum(["ready", "review", "conflict", "error", "excluded", "renamed"]),
  warnings: z.array(z.string()).default([]),
  tokens: z.array(namingTokenSchema).default([]),
  video: videoDetailsSchema.nullable().default(null),
  audioTracks: z.array(audioTrackSchema).default([]),
  subtitleTracks: z.array(subtitleTrackSchema).default([]),
});

export const scanFolderResultSchema = z.object({
  folderPath: z.string(),
  items: z.array(scanItemSchema),
  warnings: z.array(z.string()).default([]),
});

export const movieRecordSchema = z.object({
  id: z.number().int(),
  mediaFileId: z.number().int(),
  tmdbId: nullableNumber,
  title: z.string(),
  originalTitle: nullableString,
  year: nullableNumber,
  releaseDate: nullableString,
  overview: nullableString,
  runtimeMinutes: nullableNumber,
  genres: z.array(z.string()).default([]),
  posterUrl: nullableString,
  backdropUrl: nullableString,
  collectionName: nullableString,
  currentFilename: z.string(),
  currentPath: z.string(),
  extension: z.string(),
  container: nullableString,
  sizeBytes: z.number().nonnegative(),
  resolution: nullableString,
  source: nullableString,
  releaseType: nullableString,
  addedAt: z.string(),
  video: videoDetailsSchema.nullable().default(null),
  audioTracks: z.array(audioTrackSchema).default([]),
  subtitleTracks: z.array(subtitleTrackSchema).default([]),
});

export const identifiedMovieSchema = movieRecordSchema;

export const libraryResponseSchema = z
  .union([z.array(movieRecordSchema), z.object({ items: z.array(movieRecordSchema) })])
  .transform((response) => (Array.isArray(response) ? response : response.items));

const historyStatusSchema = z
  .enum(["completed", "failed", "partial", "undone", "recoveryRequired", "recovery_required"])
  .transform((value) => (value === "recovery_required" ? "recoveryRequired" : value));

export const historyEntrySchema = z.object({
  id: z.number().int(),
  batchId: z.number().int(),
  mediaFileId: z.number().int(),
  oldPath: z.string(),
  newPath: z.string(),
  status: historyStatusSchema,
  errorMessage: nullableString,
  performedAt: z.string(),
  undoneAt: nullableString,
  canUndo: z.boolean(),
});

export const historyResponseSchema = z
  .union([z.array(historyEntrySchema), z.object({ items: z.array(historyEntrySchema) })])
  .transform((response) => (Array.isArray(response) ? response : response.items));

const namingTagSchema = z.enum([
  "resolution",
  "source",
  "releaseType",
  "videoCodec",
  "bitDepth",
  "dolbyVision",
  "dolbyVisionProfile",
  "hdr",
  "audioCodec",
  "spatialAudio",
  "channels",
  "audioLanguages",
  "subtitles",
  "edition",
  "identifier",
]);

export const settingsSchema = z
  .object({
    titleLanguage: z.string(),
    region: z.string(),
    ffprobePath: z.string(),
    namingTemplate: z.string(),
    matchThreshold: z.number().min(0).max(100),
    includeIdentifier: z.boolean(),
    tagOrder: z.array(namingTagSchema),
    enabledTags: z.array(namingTagSchema),
    theme: z.enum(["dark", "light", "system"]),
    tmdbConfigured: z.boolean(),
    tmdbCredentialSource: z.enum(["none", "session", "environment"]).optional(),
    tmdbCredentialPersistence: z.literal("processMemoryOnly").optional(),
    credentialSource: z.string().optional(),
    credentialPersistence: z.literal("processMemoryOnly").optional(),
  })
  .transform(
    ({
      credentialPersistence,
      credentialSource,
      tmdbCredentialPersistence,
      tmdbCredentialSource,
      ...settings
    }) => {
      const rawSource = tmdbCredentialSource ?? credentialSource ?? "none";
      const source =
        rawSource === "environment"
          ? ("environment" as const)
          : rawSource === "none"
            ? ("none" as const)
            : ("session" as const);
      const persistence = tmdbCredentialPersistence ?? credentialPersistence ?? "processMemoryOnly";
      return {
        ...settings,
        tmdbCredentialSource: source,
        tmdbCredentialPersistence: persistence,
      };
    },
  );

export const ffprobeValidationSchema = z.object({
  valid: z.boolean(),
  detectedPath: nullableString,
  version: nullableString,
  message: z.string(),
});

export const preflightResultSchema = z.object({
  valid: z.boolean(),
  readyCount: z.number().int().nonnegative(),
  issues: z
    .array(
      z.object({
        clientId: z.string(),
        code: z.string(),
        message: z.string(),
        severity: z.enum(["warning", "error"]),
      }),
    )
    .default([]),
});

export const renameBatchResultSchema = z.object({
  batchId: z.number().int(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      clientId: z.string(),
      mediaFileId: z.number().int(),
      status: z.enum(["completed", "failed"]),
      oldPath: z.string(),
      newPath: nullableString,
      errorMessage: nullableString,
    }),
  ),
});

export const undoResultSchema = z.object({
  historyId: z.number().int(),
  status: z.enum(["undone", "failed"]),
  restoredPath: nullableString,
  errorMessage: nullableString,
});

export const tmdbCandidateSchema = z.object({
  tmdbId: z.number().int(),
  title: z.string(),
  originalTitle: z.string(),
  year: nullableNumber,
  overview: nullableString,
  posterUrl: nullableString,
  matchScore: z.number(),
  matchLevel: z.enum(["high", "medium", "low", "unmatched"]),
  scoreReasons: z.array(scoreReasonSchema).default([]),
});

export const tmdbSearchResponseSchema = z
  .union([z.array(tmdbCandidateSchema), z.object({ items: z.array(tmdbCandidateSchema) })])
  .transform((response) => (Array.isArray(response) ? response : response.items));

export class GatewayContractError extends Error {
  public readonly issues: string[];

  public constructor(operation: string, error: z.ZodError) {
    const issues = error.issues.map(
      (issue) => `${issue.path.join(".") || "response"}: ${issue.message}`,
    );
    super(`La respuesta de ${operation} no cumple el contrato local.`);
    this.name = "GatewayContractError";
    this.issues = issues;
  }
}

function parseContract<T>(operation: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new GatewayContractError(operation, result.error);
  }
  return result.data;
}

export const parseScanProgress = (value: unknown): ScanProgress =>
  parseContract("scan-progress", scanProgressSchema, value);

export const parseScanResult = (value: unknown): ScanFolderResult =>
  parseContract("scan_folder", scanFolderResultSchema, value);

export const parseLibrary = (value: unknown): MovieRecord[] =>
  parseContract("list_library", libraryResponseSchema, value);

export const parseIdentifiedMovie = (value: unknown): MovieRecord =>
  parseContract("identify_media_file", identifiedMovieSchema, value);

export const parseHistory = (value: unknown): HistoryEntry[] =>
  parseContract("list_history", historyResponseSchema, value);

export const parseSettings = (value: unknown): AppSettings =>
  parseContract("get_settings", settingsSchema, value);

export const parseFfprobeValidation = (value: unknown): FfprobeValidation =>
  parseContract("validate_ffprobe", ffprobeValidationSchema, value);

export const parsePreflight = (value: unknown): PreflightResult =>
  parseContract("preflight_rename_batch", preflightResultSchema, value);

export const parseRenameBatch = (value: unknown): RenameBatchResult =>
  parseContract("execute_rename_batch", renameBatchResultSchema, value);

export const parseUndoResult = (value: unknown): UndoResult =>
  parseContract("undo_rename", undoResultSchema, value);

export const parseTmdbCandidates = (value: unknown): TmdbCandidate[] =>
  parseContract("search_tmdb", tmdbSearchResponseSchema, value);

export const parseSavedSettings = (value: unknown): AppSettings =>
  parseContract("save_settings", settingsSchema, value);
