export type GatewayMode = "desktop" | "demo";

export type AppSection = "library" | "import" | "history" | "settings";

export type MatchLevel = "high" | "medium" | "low" | "unmatched";

export type ScanItemStatus = "ready" | "review" | "conflict" | "error" | "excluded" | "renamed";

export type MetadataSource = "filename" | "ffprobe" | "tmdb" | "manual";

export type HistoryStatus = "completed" | "failed" | "partial" | "undone" | "recoveryRequired";

export type ThemePreference = "dark" | "light" | "system";

export type TmdbCredentialPersistence = "processMemoryOnly";

export type ScanStage = "discovering" | "probing" | "identifying" | "proposing" | "complete";

export type NamingTag =
  | "resolution"
  | "source"
  | "releaseType"
  | "videoCodec"
  | "bitDepth"
  | "dolbyVision"
  | "dolbyVisionProfile"
  | "hdr"
  | "audioCodec"
  | "spatialAudio"
  | "channels"
  | "audioLanguages"
  | "subtitles"
  | "edition"
  | "identifier";

export interface ScoreReason {
  label: string;
  points: number;
}

export interface NamingToken {
  id: string;
  label: string;
  source: MetadataSource;
  kind: "title" | "year" | "tag" | "extension";
  edited: boolean;
}

export interface AudioTrack {
  index: number;
  language: string | null;
  title: string | null;
  codec: string;
  channels: number | null;
  channelLayout: string | null;
  bitrate: number | null;
  hasAtmos: boolean;
  hasDtsX: boolean;
  isDefault: boolean;
  isCommentary: boolean;
}

export interface SubtitleTrack {
  index: number;
  language: string | null;
  title: string | null;
  codec: string;
  isDefault: boolean;
  isForced: boolean;
  isHearingImpaired: boolean;
}

export interface VideoDetails {
  codec: string;
  profile: string | null;
  dolbyVisionProfile: string | null;
  level: string | null;
  width: number | null;
  height: number | null;
  bitDepth: number | null;
  frameRate: string | null;
  bitrate: number | null;
  hdrFormat: string | null;
  colorSpace: string | null;
}

export interface ScanItem {
  id: string;
  mediaFileId: number;
  movieId: number | null;
  path: string;
  originalFilename: string;
  proposedFilename: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  extension: string;
  container: string | null;
  sizeBytes: number;
  resolution: string | null;
  source: string | null;
  releaseType: string | null;
  posterUrl: string | null;
  matchScore: number | null;
  matchLevel: MatchLevel;
  scoreReasons: ScoreReason[];
  status: ScanItemStatus;
  warnings: string[];
  tokens: NamingToken[];
  video: VideoDetails | null;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
}

export interface ScanProgress {
  stage: ScanStage;
  completed: number;
  total: number;
  currentFile: string | null;
  message: string;
}

export interface ScanFolderRequest {
  folderPath: string;
}

export interface ScanFolderResult {
  folderPath: string;
  items: ScanItem[];
  warnings: string[];
}

export interface MovieRecord {
  id: number;
  mediaFileId: number;
  tmdbId: number | null;
  title: string;
  originalTitle: string | null;
  year: number | null;
  releaseDate: string | null;
  overview: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  posterUrl: string | null;
  backdropUrl: string | null;
  collectionName: string | null;
  currentFilename: string;
  currentPath: string;
  extension: string;
  container: string | null;
  sizeBytes: number;
  resolution: string | null;
  source: string | null;
  releaseType: string | null;
  addedAt: string;
  video: VideoDetails | null;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
}

export interface RenameItemRequest {
  clientId: string;
  mediaFileId: number;
  proposedFilename: string;
  manualOverride?: boolean;
}

export interface RenameBatchRequest {
  items: RenameItemRequest[];
}

export interface PreflightIssue {
  clientId: string;
  code: string;
  message: string;
  severity: "warning" | "error";
}

export interface PreflightResult {
  valid: boolean;
  readyCount: number;
  issues: PreflightIssue[];
}

export interface RenameItemResult {
  clientId: string;
  mediaFileId: number;
  status: "completed" | "failed";
  oldPath: string;
  newPath: string | null;
  errorMessage: string | null;
}

export interface RenameBatchResult {
  batchId: number;
  succeeded: number;
  failed: number;
  results: RenameItemResult[];
}

export interface HistoryEntry {
  id: number;
  batchId: number;
  mediaFileId: number;
  oldPath: string;
  newPath: string;
  status: HistoryStatus;
  errorMessage: string | null;
  performedAt: string;
  undoneAt: string | null;
  canUndo: boolean;
}

export interface UndoResult {
  historyId: number;
  status: "undone" | "failed";
  restoredPath: string | null;
  errorMessage: string | null;
}

export interface AppSettings {
  titleLanguage: string;
  region: string;
  ffprobePath: string;
  tmdbConfigured: boolean;
  tmdbCredentialSource: "none" | "session" | "environment";
  tmdbCredentialPersistence: TmdbCredentialPersistence;
  namingTemplate: string;
  matchThreshold: number;
  includeIdentifier: boolean;
  tagOrder: NamingTag[];
  enabledTags: NamingTag[];
  theme: ThemePreference;
}

export interface SaveSettingsRequest extends AppSettings {
  tmdbToken?: string;
}

export interface FfprobeValidation {
  valid: boolean;
  detectedPath: string | null;
  version: string | null;
  message: string;
}

export interface TmdbSearchRequest {
  query: string;
  year: number | null;
  language: string;
  region: string;
}

export interface TmdbCandidate {
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: number | null;
  overview: string | null;
  posterUrl: string | null;
  matchScore: number;
  matchLevel: MatchLevel;
  scoreReasons: ScoreReason[];
}

export interface IdentifyMediaFileRequest {
  mediaFileId: number;
  candidate: TmdbCandidate;
}

export interface DesktopGateway {
  readonly mode: GatewayMode;
  selectFolder(): Promise<string | null>;
  scanFolder(
    request: ScanFolderRequest,
    onProgress: (progress: ScanProgress) => void,
  ): Promise<ScanFolderResult>;
  validateFfprobe(path: string): Promise<FfprobeValidation>;
  listLibrary(): Promise<MovieRecord[]>;
  identifyMediaFile(request: IdentifyMediaFileRequest): Promise<MovieRecord>;
  listHistory(): Promise<HistoryEntry[]>;
  getSettings(): Promise<AppSettings>;
  saveSettings(request: SaveSettingsRequest): Promise<AppSettings>;
  preflightRenameBatch(request: RenameBatchRequest): Promise<PreflightResult>;
  executeRenameBatch(request: RenameBatchRequest): Promise<RenameBatchResult>;
  undoRename(historyId: number): Promise<UndoResult>;
  searchTmdb(request: TmdbSearchRequest): Promise<TmdbCandidate[]>;
}
