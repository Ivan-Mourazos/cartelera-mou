CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER UNIQUE,
  title TEXT NOT NULL,
  original_title TEXT,
  release_year INTEGER,
  release_date TEXT,
  overview TEXT,
  runtime_minutes INTEGER,
  genres_json TEXT NOT NULL DEFAULT '[]',
  poster_path TEXT,
  backdrop_path TEXT,
  collection_id INTEGER,
  collection_name TEXT,
  original_language TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movie_genres (
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE RESTRICT,
  PRIMARY KEY(movie_id, genre_id)
);

CREATE TABLE IF NOT EXISTS movie_alternative_titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  iso_3166_1 TEXT,
  title TEXT NOT NULL,
  title_type TEXT,
  UNIQUE(movie_id, iso_3166_1, title)
);

CREATE INDEX IF NOT EXISTS idx_movie_alternative_titles_title
  ON movie_alternative_titles(title COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS media_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER REFERENCES movies(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  current_filename TEXT NOT NULL,
  original_path TEXT NOT NULL,
  current_path TEXT NOT NULL UNIQUE,
  extension TEXT NOT NULL,
  container TEXT,
  file_size INTEGER NOT NULL,
  checksum TEXT,
  resolution TEXT,
  source TEXT,
  release_type TEXT,
  edition TEXT,
  storage_status TEXT NOT NULL DEFAULT 'local'
    CHECK (storage_status IN ('local', 'cloudOnly', 'localAndCloud', 'uploading', 'downloading', 'unavailable')),
  local_path TEXT,
  remote_object_key TEXT,
  parsed_title TEXT NOT NULL,
  parsed_year INTEGER,
  duration_seconds REAL,
  bitrate INTEGER,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_files_movie_id ON media_files(movie_id);
CREATE INDEX IF NOT EXISTS idx_media_files_title ON media_files(parsed_title);
CREATE INDEX IF NOT EXISTS idx_media_files_storage ON media_files(storage_status);

CREATE TABLE IF NOT EXISTS video_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  stream_index INTEGER NOT NULL,
  codec TEXT NOT NULL,
  profile TEXT,
  level TEXT,
  width INTEGER,
  height INTEGER,
  bit_depth INTEGER,
  frame_rate TEXT,
  display_aspect_ratio TEXT,
  bitrate INTEGER,
  hdr_format TEXT,
  color_space TEXT,
  color_transfer TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  UNIQUE(media_file_id, stream_index)
);

CREATE TABLE IF NOT EXISTS audio_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  stream_index INTEGER NOT NULL,
  language TEXT,
  title TEXT,
  codec TEXT NOT NULL,
  profile TEXT,
  channels INTEGER,
  channel_layout TEXT,
  bitrate INTEGER,
  has_atmos INTEGER NOT NULL DEFAULT 0,
  has_dts_x INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_commentary INTEGER NOT NULL DEFAULT 0,
  UNIQUE(media_file_id, stream_index)
);

CREATE TABLE IF NOT EXISTS subtitle_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  stream_index INTEGER NOT NULL,
  language TEXT,
  title TEXT,
  codec TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_forced INTEGER NOT NULL DEFAULT 0,
  is_hearing_impaired INTEGER NOT NULL DEFAULT 0,
  UNIQUE(media_file_id, stream_index)
);

CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  start_seconds REAL,
  end_seconds REAL,
  title TEXT,
  UNIQUE(media_file_id, chapter_index)
);

CREATE TABLE IF NOT EXISTS metadata_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('filename', 'ffprobe', 'tmdb', 'manual')),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  is_manual_correction INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metadata_values_media_field
  ON metadata_values(media_file_id, field_name);

CREATE TABLE IF NOT EXISTS rename_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_uuid TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'recoveryRequired', 'rolledBack')),
  total_items INTEGER NOT NULL,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS rename_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES rename_batches(id),
  media_file_id INTEGER NOT NULL REFERENCES media_files(id),
  old_path TEXT NOT NULL,
  new_path TEXT NOT NULL,
  temp_path TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'partial', 'undone', 'recoveryRequired')),
  state TEXT NOT NULL DEFAULT 'planned'
    CHECK (state IN ('planned', 'staged', 'completed', 'failed', 'rolledBack', 'recoveryRequired', 'undone')),
  expected_size INTEGER,
  expected_modified_at INTEGER,
  error_message TEXT,
  performed_at TEXT NOT NULL,
  undone_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_rename_history_performed_at ON rename_history(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rename_history_media_file ON rename_history(media_file_id);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
