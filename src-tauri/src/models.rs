use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanFolderRequest {
    #[serde(alias = "folderPath")]
    pub root_path: String,
    #[serde(default)]
    pub ffprobe_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanFolderResult {
    pub folder_path: String,
    pub items: Vec<ScanItem>,
    pub warnings: Vec<String>,
    pub ffprobe: FfprobeValidation,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub stage: String,
    pub completed: usize,
    pub total: usize,
    pub current_file: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfprobeValidation {
    pub valid: bool,
    pub detected_path: Option<String>,
    pub version: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScoreReason {
    pub label: String,
    pub points: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NamingToken {
    pub id: String,
    pub label: String,
    pub source: String,
    pub kind: String,
    pub edited: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoDetails {
    pub codec: String,
    pub profile: Option<String>,
    #[serde(default)]
    pub dolby_vision_profile: Option<String>,
    pub level: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub bit_depth: Option<i64>,
    pub frame_rate: Option<String>,
    pub display_aspect_ratio: Option<String>,
    pub bitrate: Option<i64>,
    pub hdr_format: Option<String>,
    pub color_space: Option<String>,
    pub color_transfer: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrack {
    pub index: i64,
    pub language: Option<String>,
    pub title: Option<String>,
    pub codec: String,
    pub profile: Option<String>,
    pub channels: Option<i64>,
    pub channel_layout: Option<String>,
    pub bitrate: Option<i64>,
    pub has_atmos: bool,
    pub has_dts_x: bool,
    pub is_default: bool,
    pub is_commentary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub index: i64,
    pub language: Option<String>,
    pub title: Option<String>,
    pub codec: String,
    pub is_default: bool,
    pub is_forced: bool,
    pub is_hearing_impaired: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanItem {
    pub id: String,
    pub media_file_id: i64,
    pub movie_id: Option<i64>,
    pub path: String,
    pub original_filename: String,
    pub proposed_filename: String,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<i32>,
    pub extension: String,
    pub container: Option<String>,
    pub size_bytes: u64,
    pub resolution: Option<String>,
    pub source: Option<String>,
    pub release_type: Option<String>,
    pub poster_url: Option<String>,
    pub match_score: Option<i32>,
    pub match_level: String,
    pub score_reasons: Vec<ScoreReason>,
    pub status: String,
    pub warnings: Vec<String>,
    pub tokens: Vec<NamingToken>,
    pub video: Option<VideoDetails>,
    pub audio_tracks: Vec<AudioTrack>,
    pub subtitle_tracks: Vec<SubtitleTrack>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovieRecord {
    pub id: i64,
    pub media_file_id: i64,
    pub tmdb_id: Option<i64>,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<i32>,
    pub release_date: Option<String>,
    pub overview: Option<String>,
    pub runtime_minutes: Option<i64>,
    pub genres: Vec<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub collection_name: Option<String>,
    pub current_filename: String,
    pub current_path: String,
    pub extension: String,
    pub container: Option<String>,
    pub size_bytes: u64,
    pub resolution: Option<String>,
    pub source: Option<String>,
    pub release_type: Option<String>,
    pub added_at: String,
    pub video: Option<VideoDetails>,
    pub audio_tracks: Vec<AudioTrack>,
    pub subtitle_tracks: Vec<SubtitleTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameItemRequest {
    #[serde(default)]
    pub client_id: Option<String>,
    pub media_file_id: i64,
    pub proposed_filename: String,
    #[serde(default)]
    pub manual_override: bool,
}

impl RenameItemRequest {
    pub fn resolved_client_id(&self) -> String {
        self.client_id
            .clone()
            .unwrap_or_else(|| self.media_file_id.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameBatchRequest {
    pub items: Vec<RenameItemRequest>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightIssue {
    pub client_id: String,
    pub code: String,
    pub message: String,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightResult {
    pub valid: bool,
    pub ready_count: usize,
    pub issues: Vec<PreflightIssue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameItemResult {
    pub client_id: String,
    pub media_file_id: i64,
    pub status: String,
    pub old_path: String,
    pub new_path: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameBatchResult {
    pub batch_id: i64,
    pub succeeded: usize,
    pub failed: usize,
    pub results: Vec<RenameItemResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: i64,
    pub batch_id: i64,
    pub media_file_id: i64,
    pub old_path: String,
    pub new_path: String,
    pub status: String,
    pub error_message: Option<String>,
    pub performed_at: String,
    pub undone_at: Option<String>,
    pub can_undo: bool,
    pub expected_size: Option<u64>,
    pub expected_modified_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoResult {
    pub history_id: i64,
    pub status: String,
    pub restored_path: Option<String>,
    pub error_message: Option<String>,
}

fn default_title_language() -> String {
    "es-ES".into()
}

fn default_region() -> String {
    "ES".into()
}

fn default_naming_template() -> String {
    "{title} ({year}) {tags}".into()
}

fn default_match_threshold() -> i32 {
    80
}

fn default_theme() -> String {
    "dark".into()
}

fn default_tag_order() -> Vec<String> {
    [
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
    ]
    .into_iter()
    .map(str::to_owned)
    .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_title_language")]
    pub title_language: String,
    #[serde(default = "default_region")]
    pub region: String,
    #[serde(default)]
    pub ffprobe_path: String,
    #[serde(default)]
    pub tmdb_configured: bool,
    #[serde(default)]
    pub credential_source: String,
    #[serde(default)]
    pub credential_persistence: String,
    #[serde(default = "default_naming_template")]
    pub naming_template: String,
    #[serde(default = "default_match_threshold")]
    pub match_threshold: i32,
    #[serde(default)]
    pub include_identifier: bool,
    #[serde(default = "default_tag_order")]
    pub tag_order: Vec<String>,
    #[serde(default = "default_tag_order")]
    pub enabled_tags: Vec<String>,
    #[serde(default = "default_theme")]
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            title_language: default_title_language(),
            region: default_region(),
            ffprobe_path: String::new(),
            tmdb_configured: false,
            credential_source: "none".into(),
            credential_persistence: "processMemoryOnly".into(),
            naming_template: default_naming_template(),
            match_threshold: default_match_threshold(),
            include_identifier: false,
            tag_order: default_tag_order(),
            enabled_tags: default_tag_order(),
            theme: default_theme(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSettingsRequest {
    #[serde(default = "default_title_language")]
    pub title_language: String,
    #[serde(default = "default_region")]
    pub region: String,
    #[serde(default)]
    pub ffprobe_path: String,
    #[serde(default)]
    pub tmdb_token: Option<String>,
    #[serde(default = "default_naming_template")]
    pub naming_template: String,
    #[serde(default = "default_match_threshold")]
    pub match_threshold: i32,
    #[serde(default)]
    pub include_identifier: bool,
    #[serde(default = "default_tag_order")]
    pub tag_order: Vec<String>,
    #[serde(default = "default_tag_order")]
    pub enabled_tags: Vec<String>,
    #[serde(default = "default_theme")]
    pub theme: String,
}

impl SaveSettingsRequest {
    pub fn into_public_settings(self) -> AppSettings {
        AppSettings {
            title_language: self.title_language,
            region: self.region,
            ffprobe_path: self.ffprobe_path,
            tmdb_configured: false,
            credential_source: "none".into(),
            credential_persistence: "processMemoryOnly".into(),
            naming_template: self.naming_template,
            match_threshold: self.match_threshold,
            include_identifier: self.include_identifier,
            tag_order: self.tag_order,
            enabled_tags: self.enabled_tags,
            theme: self.theme,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbSearchRequest {
    pub query: String,
    #[serde(default)]
    pub year: Option<i32>,
    #[serde(default = "default_title_language")]
    pub language: String,
    #[serde(default = "default_region")]
    pub region: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbCandidate {
    pub tmdb_id: i64,
    pub title: String,
    pub original_title: String,
    pub year: Option<i32>,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub match_score: i32,
    pub match_level: String,
    pub score_reasons: Vec<ScoreReason>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentifyMediaFileRequest {
    pub media_file_id: i64,
    pub candidate: TmdbCandidate,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedGenre {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedAlternativeTitle {
    pub iso_3166_1: Option<String>,
    pub title: String,
    pub title_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedMovieMetadata {
    pub tmdb_id: i64,
    pub title: String,
    pub original_title: Option<String>,
    pub release_date: Option<String>,
    pub overview: Option<String>,
    pub runtime_minutes: Option<i64>,
    pub genres: Vec<VerifiedGenre>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub collection_id: Option<i64>,
    pub collection_name: Option<String>,
    pub original_language: Option<String>,
    pub alternative_titles: Vec<VerifiedAlternativeTitle>,
}

#[derive(Debug, Clone, Default)]
pub struct ParsedMediaName {
    pub title: String,
    pub year: Option<i32>,
    pub extension: String,
    pub resolution: Option<String>,
    pub source: Option<String>,
    pub release_type: Option<String>,
    pub video_codec: Option<String>,
    pub bit_depth: Option<String>,
    pub dolby_vision: bool,
    pub dolby_vision_profile: Option<String>,
    pub hdr: Option<String>,
    pub audio_codec: Option<String>,
    pub spatial_audio: Option<String>,
    pub channels: Option<String>,
    pub audio_languages: Vec<String>,
    pub subtitles: Vec<String>,
    pub edition: Option<String>,
    pub release_group: Option<String>,
    pub tokens: Vec<NamingToken>,
}

#[derive(Debug, Clone, Default)]
pub struct ProbeData {
    pub container: Option<String>,
    pub duration_seconds: Option<f64>,
    pub bitrate: Option<i64>,
    pub video: Option<VideoDetails>,
    pub video_streams: Vec<VideoStream>,
    pub audio_tracks: Vec<AudioTrack>,
    pub subtitle_tracks: Vec<SubtitleTrack>,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Clone)]
pub struct VideoStream {
    pub index: i64,
    pub details: VideoDetails,
}

#[derive(Debug, Clone)]
pub struct Chapter {
    pub index: i64,
    pub start_seconds: Option<f64>,
    pub end_seconds: Option<f64>,
    pub title: Option<String>,
}

#[derive(Debug, Clone)]
pub struct StoredMediaFile {
    pub id: i64,
    pub current_path: PathBuf,
    pub current_filename: String,
    pub extension: String,
}

#[derive(Debug, Clone)]
pub struct RenamePlan {
    pub client_id: String,
    pub media_file_id: i64,
    pub source: PathBuf,
    pub target: PathBuf,
    pub stage: PathBuf,
    pub expected_size: u64,
    pub expected_modified_at: Option<u64>,
    pub manual_override: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameJournal {
    pub batch_id: i64,
    pub batch_uuid: String,
    pub status: String,
    pub entries: Vec<RenameJournalEntry>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameJournalEntry {
    pub media_file_id: i64,
    pub source: PathBuf,
    pub target: PathBuf,
    pub stage: PathBuf,
    pub state: String,
    pub expected_size: u64,
    pub expected_modified_at: Option<u64>,
}
