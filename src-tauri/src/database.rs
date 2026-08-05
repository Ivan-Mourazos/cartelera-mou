use crate::error::{BackendError, BackendResult};
use crate::models::{
    AppSettings, AudioTrack, HistoryEntry, MovieRecord, ParsedMediaName, ProbeData, RenamePlan,
    StoredMediaFile, SubtitleTrack, VerifiedMovieMetadata, VideoDetails,
};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

const INITIAL_MIGRATION: &str = include_str!("../migrations/001_initial.sql");
const RECOVERY_EVENTS_MIGRATION: &str = include_str!("../migrations/002_recovery_events.sql");
const DOLBY_VISION_PROFILE_MIGRATION: &str =
    include_str!("../migrations/003_dolby_vision_profile.sql");

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> BackendResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let connection = Connection::open(path)?;
        Self::configure(connection)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> BackendResult<Self> {
        Self::configure(Connection::open_in_memory()?)
    }

    fn configure(mut connection: Connection) -> BackendResult<Self> {
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
        )?;
        let mut version: i64 =
            connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version < 1 {
            let transaction = connection.transaction()?;
            transaction.execute_batch(INITIAL_MIGRATION)?;
            transaction.pragma_update(None, "user_version", 1)?;
            transaction.commit()?;
            version = 1;
        }
        if version < 2 {
            let transaction = connection.transaction()?;
            transaction.execute_batch(RECOVERY_EVENTS_MIGRATION)?;
            transaction.pragma_update(None, "user_version", 2)?;
            transaction.commit()?;
            version = 2;
        }
        if version < 3 {
            let transaction = connection.transaction()?;
            transaction.execute_batch(DOLBY_VISION_PROFILE_MIGRATION)?;
            transaction.pragma_update(None, "user_version", 3)?;
            transaction.commit()?;
        }
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    fn lock(&self) -> BackendResult<MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| BackendError::State("el bloqueo de SQLite está contaminado".into()))
    }

    pub fn get_settings(&self) -> BackendResult<AppSettings> {
        let connection = self.lock()?;
        let json: Option<String> = connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = 'app'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        match json {
            Some(json) => Ok(serde_json::from_str(&json)?),
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save_settings(&self, settings: &AppSettings) -> BackendResult<()> {
        let now = Utc::now().to_rfc3339();
        let json = serde_json::to_string(settings)?;
        self.lock()?.execute(
            "INSERT INTO settings(key, value_json, updated_at) VALUES ('app', ?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
            params![json, now],
        )?;
        Ok(())
    }

    pub fn upsert_scanned_file(
        &self,
        path: &Path,
        parsed: &ParsedMediaName,
        probe: &ProbeData,
        file_size: u64,
    ) -> BackendResult<i64> {
        let path_string = path.to_string_lossy().into_owned();
        let filename = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| {
                BackendError::InvalidInput("el nombre del archivo no es Unicode".into())
            })?;
        let file_size = i64::try_from(file_size).map_err(|_| {
            BackendError::InvalidInput("el archivo supera el tamaño admitido".into())
        })?;
        let now = Utc::now().to_rfc3339();
        let resolution = probe
            .video
            .as_ref()
            .and_then(|video| normalized_resolution(video.height))
            .or_else(|| parsed.resolution.clone());
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let media_file_id: i64 = transaction.query_row(
            "INSERT INTO media_files(
                original_filename, current_filename, original_path, current_path, extension,
                container, file_size, resolution, source, release_type, edition, storage_status,
                local_path, parsed_title, parsed_year, duration_seconds, bitrate, chapter_count,
                added_at, created_at, updated_at
             ) VALUES (
                ?1, ?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'local', ?2, ?10, ?11,
                ?12, ?13, ?14, ?15, ?15, ?15
             )
             ON CONFLICT(current_path) DO UPDATE SET
                current_filename = excluded.current_filename,
                extension = excluded.extension,
                container = excluded.container,
                file_size = excluded.file_size,
                resolution = excluded.resolution,
                source = excluded.source,
                release_type = excluded.release_type,
                edition = excluded.edition,
                local_path = excluded.local_path,
                parsed_title = excluded.parsed_title,
                parsed_year = excluded.parsed_year,
                duration_seconds = excluded.duration_seconds,
                bitrate = excluded.bitrate,
                chapter_count = excluded.chapter_count,
                updated_at = excluded.updated_at
             RETURNING id",
            params![
                filename,
                path_string,
                parsed.extension,
                probe.container,
                file_size,
                resolution,
                parsed.source,
                parsed.release_type,
                parsed.edition,
                parsed.title,
                parsed.year,
                probe.duration_seconds,
                probe.bitrate,
                probe.chapters.len() as i64,
                now,
            ],
            |row| row.get(0),
        )?;

        replace_streams(&transaction, media_file_id, probe)?;
        replace_metadata(&transaction, media_file_id, parsed, probe, &now)?;
        transaction.commit()?;
        Ok(media_file_id)
    }

    pub fn list_library(&self) -> BackendResult<Vec<MovieRecord>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT
                mf.id, mf.id, m.tmdb_id, COALESCE(m.title, mf.parsed_title),
                m.original_title, COALESCE(m.release_year, mf.parsed_year), m.release_date,
                m.overview, m.runtime_minutes, COALESCE(m.genres_json, '[]'), m.poster_path,
                m.backdrop_path, m.collection_name, mf.current_filename, mf.current_path,
                mf.extension, mf.container, mf.file_size, mf.resolution, mf.source,
                mf.release_type, mf.added_at
             FROM media_files mf
             LEFT JOIN movies m ON m.id = mf.movie_id
             ORDER BY COALESCE(m.title, mf.parsed_title) COLLATE NOCASE, mf.current_filename COLLATE NOCASE",
        )?;
        let rows = statement.query_map([], |row| {
            let genres_json: String = row.get(9)?;
            let poster_path: Option<String> = row.get(10)?;
            let backdrop_path: Option<String> = row.get(11)?;
            let size: i64 = row.get(17)?;
            Ok(MovieRecord {
                id: row.get(0)?,
                media_file_id: row.get(1)?,
                tmdb_id: row.get(2)?,
                title: row.get(3)?,
                original_title: row.get(4)?,
                year: row.get(5)?,
                release_date: row.get(6)?,
                overview: row.get(7)?,
                runtime_minutes: row.get(8)?,
                genres: serde_json::from_str(&genres_json).unwrap_or_default(),
                poster_url: image_url(poster_path.as_deref(), "w500"),
                backdrop_url: image_url(backdrop_path.as_deref(), "w1280"),
                collection_name: row.get(12)?,
                current_filename: row.get(13)?,
                current_path: row.get(14)?,
                extension: row.get(15)?,
                container: row.get(16)?,
                size_bytes: size.max(0) as u64,
                resolution: row.get(18)?,
                source: row.get(19)?,
                release_type: row.get(20)?,
                added_at: row.get(21)?,
                video: None,
                audio_tracks: Vec::new(),
                subtitle_tracks: Vec::new(),
            })
        })?;
        let mut records = rows.collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        for record in &mut records {
            record.video = load_video(&connection, record.media_file_id)?;
            record.audio_tracks = load_audio(&connection, record.media_file_id)?;
            record.subtitle_tracks = load_subtitles(&connection, record.media_file_id)?;
        }
        Ok(records)
    }

    pub fn identify_media_file(
        &self,
        media_file_id: i64,
        metadata: &VerifiedMovieMetadata,
    ) -> BackendResult<MovieRecord> {
        if media_file_id <= 0 || metadata.tmdb_id <= 0 || metadata.title.trim().is_empty() {
            return Err(BackendError::InvalidInput(
                "el archivo, el identificador TMDb y el título son obligatorios".into(),
            ));
        }
        let now = Utc::now().to_rfc3339();
        let release_year = metadata
            .release_date
            .as_deref()
            .and_then(|date| date.get(0..4))
            .and_then(|year| year.parse::<i32>().ok());
        let genre_names = metadata
            .genres
            .iter()
            .map(|genre| genre.name.clone())
            .collect::<Vec<_>>();
        let genres_json = serde_json::to_string(&genre_names)?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let movie_id: i64 = transaction.query_row(
            "INSERT INTO movies(
                tmdb_id, title, original_title, release_year, release_date, overview,
                runtime_minutes, genres_json, poster_path, backdrop_path, collection_id,
                collection_name, original_language, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
             ON CONFLICT(tmdb_id) DO UPDATE SET
                title = excluded.title,
                original_title = excluded.original_title,
                release_year = excluded.release_year,
                release_date = excluded.release_date,
                overview = excluded.overview,
                runtime_minutes = excluded.runtime_minutes,
                genres_json = excluded.genres_json,
                poster_path = excluded.poster_path,
                backdrop_path = excluded.backdrop_path,
                collection_id = excluded.collection_id,
                collection_name = excluded.collection_name,
                original_language = excluded.original_language,
                updated_at = excluded.updated_at
             RETURNING id",
            params![
                metadata.tmdb_id,
                metadata.title.trim(),
                metadata.original_title,
                release_year,
                metadata.release_date,
                metadata.overview,
                metadata.runtime_minutes,
                genres_json,
                metadata.poster_path,
                metadata.backdrop_path,
                metadata.collection_id,
                metadata.collection_name,
                metadata.original_language,
                now,
            ],
            |row| row.get(0),
        )?;
        transaction.execute("DELETE FROM movie_genres WHERE movie_id = ?1", [movie_id])?;
        for genre in &metadata.genres {
            transaction.execute(
                "INSERT INTO genres(id, name) VALUES (?1, ?2)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name",
                params![genre.id, genre.name],
            )?;
            transaction.execute(
                "INSERT INTO movie_genres(movie_id, genre_id) VALUES (?1, ?2)",
                params![movie_id, genre.id],
            )?;
        }
        transaction.execute(
            "DELETE FROM movie_alternative_titles WHERE movie_id = ?1",
            [movie_id],
        )?;
        for alternative in &metadata.alternative_titles {
            transaction.execute(
                "INSERT INTO movie_alternative_titles(movie_id, iso_3166_1, title, title_type)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    movie_id,
                    alternative.iso_3166_1,
                    alternative.title,
                    alternative.title_type,
                ],
            )?;
        }
        let changed = transaction.execute(
            "UPDATE media_files SET movie_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![movie_id, now, media_file_id],
        )?;
        if changed != 1 {
            return Err(BackendError::NotFound(format!(
                "archivo multimedia {media_file_id}"
            )));
        }
        transaction.execute(
            "DELETE FROM metadata_values WHERE media_file_id = ?1 AND source = 'tmdb'",
            [media_file_id],
        )?;
        insert_metadata(
            &transaction,
            media_file_id,
            "tmdbId",
            metadata.tmdb_id,
            "tmdb",
            100,
            &now,
        )?;
        insert_metadata(
            &transaction,
            media_file_id,
            "title",
            &metadata.title,
            "tmdb",
            100,
            &now,
        )?;
        if let Some(original_title) = &metadata.original_title {
            insert_metadata(
                &transaction,
                media_file_id,
                "originalTitle",
                original_title,
                "tmdb",
                100,
                &now,
            )?;
        }
        if let Some(release_date) = &metadata.release_date {
            insert_metadata(
                &transaction,
                media_file_id,
                "releaseDate",
                release_date,
                "tmdb",
                100,
                &now,
            )?;
        }
        if let Some(overview) = &metadata.overview {
            insert_metadata(
                &transaction,
                media_file_id,
                "overview",
                overview,
                "tmdb",
                100,
                &now,
            )?;
        }
        if let Some(runtime_minutes) = metadata.runtime_minutes {
            insert_metadata(
                &transaction,
                media_file_id,
                "runtimeMinutes",
                runtime_minutes,
                "tmdb",
                100,
                &now,
            )?;
        }
        insert_metadata(
            &transaction,
            media_file_id,
            "genres",
            &genre_names,
            "tmdb",
            100,
            &now,
        )?;
        if let Some(poster_path) = &metadata.poster_path {
            insert_metadata(
                &transaction,
                media_file_id,
                "posterPath",
                poster_path,
                "tmdb",
                100,
                &now,
            )?;
        }
        if let Some(backdrop_path) = &metadata.backdrop_path {
            insert_metadata(
                &transaction,
                media_file_id,
                "backdropPath",
                backdrop_path,
                "tmdb",
                100,
                &now,
            )?;
        }
        if let Some(collection_id) = metadata.collection_id {
            insert_metadata(
                &transaction,
                media_file_id,
                "collectionId",
                collection_id,
                "tmdb",
                100,
                &now,
            )?;
        }
        if let Some(collection_name) = &metadata.collection_name {
            insert_metadata(
                &transaction,
                media_file_id,
                "collectionName",
                collection_name,
                "tmdb",
                100,
                &now,
            )?;
        }
        if let Some(original_language) = &metadata.original_language {
            insert_metadata(
                &transaction,
                media_file_id,
                "originalLanguage",
                original_language,
                "tmdb",
                100,
                &now,
            )?;
        }
        insert_metadata(
            &transaction,
            media_file_id,
            "alternativeTitles",
            &metadata.alternative_titles,
            "tmdb",
            100,
            &now,
        )?;
        transaction.commit()?;
        drop(connection);

        self.list_library()?
            .into_iter()
            .find(|record| record.media_file_id == media_file_id)
            .ok_or_else(|| BackendError::State("la identificación no se pudo releer".into()))
    }

    pub fn tmdb_id_for_media(&self, media_file_id: i64) -> BackendResult<Option<i64>> {
        Ok(self
            .lock()?
            .query_row(
                "SELECT m.tmdb_id
                 FROM media_files mf
                 LEFT JOIN movies m ON m.id = mf.movie_id
                 WHERE mf.id = ?1",
                [media_file_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten())
    }

    pub fn media_file(&self, id: i64) -> BackendResult<StoredMediaFile> {
        self.lock()?
            .query_row(
                "SELECT id, current_path, current_filename, extension FROM media_files WHERE id = ?1",
                [id],
                |row| {
                    let path: String = row.get(1)?;
                    Ok(StoredMediaFile {
                        id: row.get(0)?,
                        current_path: PathBuf::from(path),
                        current_filename: row.get(2)?,
                        extension: row.get(3)?,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| BackendError::NotFound(format!("archivo multimedia {id}")))
    }

    pub fn create_batch(&self, batch_uuid: &str, plans: &[RenamePlan]) -> BackendResult<i64> {
        let now = Utc::now().to_rfc3339();
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "INSERT INTO rename_batches(batch_uuid, status, total_items, started_at)
             VALUES (?1, 'running', ?2, ?3)",
            params![batch_uuid, plans.len() as i64, now],
        )?;
        let batch_id = transaction.last_insert_rowid();
        for plan in plans {
            let expected_size = i64::try_from(plan.expected_size).map_err(|_| {
                BackendError::InvalidInput("el archivo supera el tamaño admitido".into())
            })?;
            transaction.execute(
                "INSERT INTO rename_history(
                    batch_id, media_file_id, old_path, new_path, temp_path, status, state,
                    expected_size, expected_modified_at, performed_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 'partial', 'planned', ?6, ?7, ?8)",
                params![
                    batch_id,
                    plan.media_file_id,
                    plan.source.to_string_lossy(),
                    plan.target.to_string_lossy(),
                    plan.stage.to_string_lossy(),
                    expected_size,
                    plan.expected_modified_at.map(|value| value as i64),
                    now,
                ],
            )?;
        }
        transaction.commit()?;
        Ok(batch_id)
    }

    pub fn set_rename_state(
        &self,
        batch_id: i64,
        media_file_id: i64,
        state: &str,
    ) -> BackendResult<()> {
        if !matches!(
            state,
            "planned" | "staged" | "completed" | "failed" | "rolledBack" | "recoveryRequired"
        ) {
            return Err(BackendError::InvalidInput(format!(
                "estado de journal desconocido: {state}"
            )));
        }
        let changed = self.lock()?.execute(
            "UPDATE rename_history SET state = ?1 WHERE batch_id = ?2 AND media_file_id = ?3",
            params![state, batch_id, media_file_id],
        )?;
        if changed != 1 {
            return Err(BackendError::State(format!(
                "no existe la entrada de journal {batch_id}/{}",
                media_file_id
            )));
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn batch_status(&self, batch_id: i64) -> BackendResult<Option<String>> {
        Ok(self
            .lock()?
            .query_row(
                "SELECT status FROM rename_batches WHERE id = ?1",
                [batch_id],
                |row| row.get(0),
            )
            .optional()?)
    }

    pub fn batch_by_uuid(&self, batch_uuid: &str) -> BackendResult<Option<(i64, String)>> {
        Ok(self
            .lock()?
            .query_row(
                "SELECT id, status FROM rename_batches WHERE batch_uuid = ?1",
                [batch_uuid],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?)
    }

    pub fn rename_plans_for_batch(&self, batch_id: i64) -> BackendResult<Vec<RenamePlan>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT media_file_id, old_path, new_path, temp_path, expected_size,
                    expected_modified_at
             FROM rename_history WHERE batch_id = ?1 ORDER BY id",
        )?;
        let plans = statement
            .query_map([batch_id], |row| {
                let media_file_id: i64 = row.get(0)?;
                let temp_path: Option<String> = row.get(3)?;
                let expected_size: Option<i64> = row.get(4)?;
                let expected_modified_at: Option<i64> = row.get(5)?;
                Ok((
                    media_file_id,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    temp_path,
                    expected_size,
                    expected_modified_at,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        plans
            .into_iter()
            .map(
                |(media_file_id, source, target, stage, expected_size, expected_modified_at)| {
                    let stage = stage.ok_or_else(|| {
                        BackendError::State(format!(
                            "el lote {batch_id} no conserva su ruta temporal"
                        ))
                    })?;
                    let expected_size =
                        expected_size.filter(|value| *value >= 0).ok_or_else(|| {
                            BackendError::State(format!(
                                "el lote {batch_id} no conserva el tamaño esperado"
                            ))
                        })? as u64;
                    Ok(RenamePlan {
                        client_id: media_file_id.to_string(),
                        media_file_id,
                        source: PathBuf::from(source),
                        target: PathBuf::from(target),
                        stage: PathBuf::from(stage),
                        expected_size,
                        expected_modified_at: expected_modified_at
                            .filter(|value| *value >= 0)
                            .map(|value| value as u64),
                        manual_override: false,
                    })
                },
            )
            .collect()
    }

    pub fn record_recovery_event(
        &self,
        batch_id: Option<i64>,
        batch_uuid: &str,
        event_type: &str,
        message: &str,
    ) -> BackendResult<()> {
        self.lock()?.execute(
            "INSERT INTO rename_recovery_events(
                batch_id, batch_uuid, event_type, message, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                batch_id,
                batch_uuid,
                event_type,
                message,
                Utc::now().to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    #[cfg(test)]
    pub fn recovery_event_count(&self) -> BackendResult<i64> {
        Ok(self
            .lock()?
            .query_row("SELECT COUNT(*) FROM rename_recovery_events", [], |row| {
                row.get(0)
            })?)
    }

    #[cfg(test)]
    pub fn manual_filename_correction_count(&self, media_file_id: i64) -> BackendResult<i64> {
        Ok(self.lock()?.query_row(
            "SELECT COUNT(*) FROM metadata_values
             WHERE media_file_id = ?1 AND field_name = 'filename'
               AND source = 'manual' AND is_manual_correction = 1",
            [media_file_id],
            |row| row.get(0),
        )?)
    }

    pub fn complete_batch(
        &self,
        batch_id: i64,
        plans: &[RenamePlan],
    ) -> BackendResult<Vec<HistoryEntry>> {
        let now = Utc::now().to_rfc3339();
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let mut histories = Vec::with_capacity(plans.len());
        // Free every source path inside this uncommitted SQLite transaction before assigning
        // final targets. This mirrors filesystem staging and permits swaps/cycles despite the
        // UNIQUE constraint on media_files.current_path.
        for plan in plans {
            let source = plan.source.to_string_lossy();
            let stage = plan.stage.to_string_lossy();
            let changed = transaction.execute(
                "UPDATE media_files
                 SET current_path = ?1, local_path = ?1, updated_at = ?2
                 WHERE id = ?3 AND current_path = ?4",
                params![stage, now, plan.media_file_id, source],
            )?;
            if changed != 1 {
                return Err(BackendError::Conflict(format!(
                    "el archivo {} cambió en la base de datos durante el lote",
                    plan.media_file_id
                )));
            }
        }
        for plan in plans {
            let source = plan.source.to_string_lossy();
            let target = plan.target.to_string_lossy();
            let stage = plan.stage.to_string_lossy();
            let filename = plan
                .target
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| BackendError::InvalidInput("destino no Unicode".into()))?;
            let changed = transaction.execute(
                "UPDATE media_files
                 SET current_filename = ?1, current_path = ?2, local_path = ?2, updated_at = ?3
                 WHERE id = ?4 AND current_path = ?5",
                params![filename, target, now, plan.media_file_id, stage],
            )?;
            if changed != 1 {
                return Err(BackendError::Conflict(format!(
                    "el archivo {} cambió en la base de datos durante el lote",
                    plan.media_file_id
                )));
            }
            let history_changed = transaction.execute(
                "UPDATE rename_history
                 SET status = 'completed', state = 'completed', error_message = NULL, performed_at = ?1
                 WHERE batch_id = ?2 AND media_file_id = ?3",
                params![now, batch_id, plan.media_file_id],
            )?;
            if history_changed != 1 {
                return Err(BackendError::State(format!(
                    "falta la entrada de journal {batch_id}/{}",
                    plan.media_file_id
                )));
            }
            replace_filename_metadata(
                &transaction,
                plan.media_file_id,
                filename,
                plan.manual_override,
                &now,
            )?;
            histories.push(HistoryEntry {
                id: transaction.query_row(
                    "SELECT id FROM rename_history WHERE batch_id = ?1 AND media_file_id = ?2",
                    params![batch_id, plan.media_file_id],
                    |row| row.get(0),
                )?,
                batch_id,
                media_file_id: plan.media_file_id,
                old_path: source.into_owned(),
                new_path: target.into_owned(),
                status: "completed".into(),
                error_message: None,
                performed_at: now.clone(),
                undone_at: None,
                can_undo: true,
                expected_size: Some(plan.expected_size),
                expected_modified_at: plan.expected_modified_at,
            });
        }
        transaction.execute(
            "UPDATE rename_batches
             SET status = 'completed', completed_at = ?1, error_message = NULL
             WHERE id = ?2 AND status = 'running'",
            params![now, batch_id],
        )?;
        transaction.commit()?;
        Ok(histories)
    }

    pub fn fail_batch(
        &self,
        batch_id: i64,
        plans: &[RenamePlan],
        error_message: &str,
        recovery_required: bool,
    ) -> BackendResult<()> {
        let now = Utc::now().to_rfc3339();
        let batch_status = if recovery_required {
            "recoveryRequired"
        } else {
            "rolledBack"
        };
        let history_status = if recovery_required {
            "recoveryRequired"
        } else {
            "failed"
        };
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "UPDATE rename_batches SET status = ?1, error_message = ?2, completed_at = ?3 WHERE id = ?4",
            params![batch_status, error_message, now, batch_id],
        )?;
        let state = if recovery_required {
            "recoveryRequired"
        } else {
            "rolledBack"
        };
        for plan in plans {
            transaction.execute(
                "UPDATE rename_history
                 SET status = ?1, state = ?2, error_message = ?3, performed_at = ?4
                 WHERE batch_id = ?5 AND media_file_id = ?6",
                params![
                    history_status,
                    state,
                    error_message,
                    now,
                    batch_id,
                    plan.media_file_id,
                ],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn list_history(&self) -> BackendResult<Vec<HistoryEntry>> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, batch_id, media_file_id, old_path, new_path, status,
                    error_message, performed_at, undone_at, expected_size, expected_modified_at
             FROM rename_history
             ORDER BY performed_at DESC, id DESC",
        )?;
        let entries = statement
            .query_map([], |row| {
                let status: String = row.get(5)?;
                let undone_at: Option<String> = row.get(8)?;
                let expected_size: Option<i64> = row.get(9)?;
                let expected_modified_at: Option<i64> = row.get(10)?;
                Ok(HistoryEntry {
                    id: row.get(0)?,
                    batch_id: row.get(1)?,
                    media_file_id: row.get(2)?,
                    old_path: row.get(3)?,
                    new_path: row.get(4)?,
                    can_undo: status == "completed" && undone_at.is_none(),
                    status,
                    error_message: row.get(6)?,
                    performed_at: row.get(7)?,
                    undone_at,
                    expected_size: expected_size.map(|value| value.max(0) as u64),
                    expected_modified_at: expected_modified_at.map(|value| value.max(0) as u64),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(entries)
    }

    pub fn history(&self, history_id: i64) -> BackendResult<HistoryEntry> {
        self.lock()?
            .query_row(
                "SELECT id, batch_id, media_file_id, old_path, new_path, status,
                        error_message, performed_at, undone_at, expected_size, expected_modified_at
                 FROM rename_history WHERE id = ?1",
                [history_id],
                |row| {
                    let status: String = row.get(5)?;
                    let undone_at: Option<String> = row.get(8)?;
                    let expected_size: Option<i64> = row.get(9)?;
                    let expected_modified_at: Option<i64> = row.get(10)?;
                    Ok(HistoryEntry {
                        id: row.get(0)?,
                        batch_id: row.get(1)?,
                        media_file_id: row.get(2)?,
                        old_path: row.get(3)?,
                        new_path: row.get(4)?,
                        can_undo: status == "completed" && undone_at.is_none(),
                        status,
                        error_message: row.get(6)?,
                        performed_at: row.get(7)?,
                        undone_at,
                        expected_size: expected_size.map(|value| value.max(0) as u64),
                        expected_modified_at: expected_modified_at.map(|value| value.max(0) as u64),
                    })
                },
            )
            .optional()?
            .ok_or_else(|| BackendError::NotFound(format!("historial {history_id}")))
    }

    pub fn complete_undo(&self, history: &HistoryEntry) -> BackendResult<()> {
        let now = Utc::now().to_rfc3339();
        let old_path = Path::new(&history.old_path);
        let filename = old_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| BackendError::InvalidInput("ruta original no Unicode".into()))?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let media_changed = transaction.execute(
            "UPDATE media_files
             SET current_filename = ?1, current_path = ?2, local_path = ?2, updated_at = ?3
             WHERE id = ?4 AND current_path = ?5",
            params![
                filename,
                history.old_path,
                now,
                history.media_file_id,
                history.new_path
            ],
        )?;
        let history_changed = transaction.execute(
            "UPDATE rename_history SET status = 'undone', state = 'undone', undone_at = ?1
             WHERE id = ?2 AND status = 'completed' AND undone_at IS NULL",
            params![now, history.id],
        )?;
        if media_changed != 1 || history_changed != 1 {
            return Err(BackendError::Conflict(
                "el historial o la biblioteca cambiaron durante el deshacer".into(),
            ));
        }
        replace_filename_metadata(&transaction, history.media_file_id, filename, false, &now)?;
        transaction.commit()?;
        Ok(())
    }
}

fn image_url(path: Option<&str>, size: &str) -> Option<String> {
    path.filter(|path| path.starts_with('/'))
        .map(|path| format!("https://image.tmdb.org/t/p/{size}{path}"))
}

fn normalized_resolution(height: Option<i64>) -> Option<String> {
    match height? {
        value if value >= 4000 => Some("4320p".into()),
        value if value >= 2000 => Some("2160p".into()),
        value if value >= 1300 => Some("1440p".into()),
        value if value >= 1000 => Some("1080p".into()),
        value if value >= 700 => Some("720p".into()),
        value if value >= 550 => Some("576p".into()),
        value if value >= 450 => Some("480p".into()),
        _ => None,
    }
}

fn replace_streams(
    transaction: &Transaction<'_>,
    media_file_id: i64,
    probe: &ProbeData,
) -> BackendResult<()> {
    transaction.execute(
        "DELETE FROM video_streams WHERE media_file_id = ?1",
        [media_file_id],
    )?;
    transaction.execute(
        "DELETE FROM audio_streams WHERE media_file_id = ?1",
        [media_file_id],
    )?;
    transaction.execute(
        "DELETE FROM subtitle_streams WHERE media_file_id = ?1",
        [media_file_id],
    )?;
    transaction.execute(
        "DELETE FROM chapters WHERE media_file_id = ?1",
        [media_file_id],
    )?;

    for stream in &probe.video_streams {
        let video = &stream.details;
        transaction.execute(
            "INSERT INTO video_streams(
                media_file_id, stream_index, codec, profile, dolby_vision_profile, level, width, height, bit_depth,
                frame_rate, display_aspect_ratio, bitrate, hdr_format, color_space,
                color_transfer, is_default
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                media_file_id,
                stream.index,
                video.codec,
                video.profile,
                video.dolby_vision_profile,
                video.level,
                video.width,
                video.height,
                video.bit_depth,
                video.frame_rate,
                video.display_aspect_ratio,
                video.bitrate,
                video.hdr_format,
                video.color_space,
                video.color_transfer,
                video.is_default as i64,
            ],
        )?;
    }
    for audio in &probe.audio_tracks {
        transaction.execute(
            "INSERT INTO audio_streams(
                media_file_id, stream_index, language, title, codec, profile, channels,
                channel_layout, bitrate, has_atmos, has_dts_x, is_default, is_commentary
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                media_file_id,
                audio.index,
                audio.language,
                audio.title,
                audio.codec,
                audio.profile,
                audio.channels,
                audio.channel_layout,
                audio.bitrate,
                audio.has_atmos as i64,
                audio.has_dts_x as i64,
                audio.is_default as i64,
                audio.is_commentary as i64,
            ],
        )?;
    }
    for subtitle in &probe.subtitle_tracks {
        transaction.execute(
            "INSERT INTO subtitle_streams(
                media_file_id, stream_index, language, title, codec, is_default, is_forced,
                is_hearing_impaired
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                media_file_id,
                subtitle.index,
                subtitle.language,
                subtitle.title,
                subtitle.codec,
                subtitle.is_default as i64,
                subtitle.is_forced as i64,
                subtitle.is_hearing_impaired as i64,
            ],
        )?;
    }
    for chapter in &probe.chapters {
        transaction.execute(
            "INSERT INTO chapters(
                media_file_id, chapter_index, start_seconds, end_seconds, title
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                media_file_id,
                chapter.index,
                chapter.start_seconds,
                chapter.end_seconds,
                chapter.title,
            ],
        )?;
    }
    Ok(())
}

fn replace_metadata(
    transaction: &Transaction<'_>,
    media_file_id: i64,
    parsed: &ParsedMediaName,
    probe: &ProbeData,
    now: &str,
) -> BackendResult<()> {
    transaction.execute(
        "DELETE FROM metadata_values
         WHERE media_file_id = ?1 AND source IN ('filename', 'ffprobe')",
        [media_file_id],
    )?;
    insert_metadata(
        transaction,
        media_file_id,
        "title",
        &parsed.title,
        "filename",
        90,
        now,
    )?;
    if let Some(year) = parsed.year {
        insert_metadata(
            transaction,
            media_file_id,
            "year",
            year,
            "filename",
            90,
            now,
        )?;
    }
    for (field, value) in [
        ("resolution", parsed.resolution.as_ref()),
        ("source", parsed.source.as_ref()),
        ("releaseType", parsed.release_type.as_ref()),
        ("edition", parsed.edition.as_ref()),
    ] {
        if let Some(value) = value {
            insert_metadata(
                transaction,
                media_file_id,
                field,
                value,
                "filename",
                80,
                now,
            )?;
        }
    }
    if let Some(video) = &probe.video {
        insert_metadata(
            transaction,
            media_file_id,
            "videoCodec",
            &video.codec,
            "ffprobe",
            100,
            now,
        )?;
        if let Some(height) = video.height {
            insert_metadata(
                transaction,
                media_file_id,
                "height",
                height,
                "ffprobe",
                100,
                now,
            )?;
        }
        if let Some(hdr) = &video.hdr_format {
            insert_metadata(
                transaction,
                media_file_id,
                "hdrFormat",
                hdr,
                "ffprobe",
                100,
                now,
            )?;
        }
        if let Some(profile) = &video.dolby_vision_profile {
            insert_metadata(
                transaction,
                media_file_id,
                "dolbyVisionProfile",
                profile,
                "ffprobe",
                100,
                now,
            )?;
        }
    }
    Ok(())
}

fn insert_metadata<T: serde::Serialize>(
    transaction: &Transaction<'_>,
    media_file_id: i64,
    field: &str,
    value: T,
    source: &str,
    confidence: i64,
    now: &str,
) -> BackendResult<()> {
    transaction.execute(
        "INSERT INTO metadata_values(
            media_file_id, field_name, value_json, source, confidence, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            media_file_id,
            field,
            serde_json::to_string(&value)?,
            source,
            confidence,
            now,
        ],
    )?;
    Ok(())
}

fn replace_filename_metadata(
    transaction: &Transaction<'_>,
    media_file_id: i64,
    filename: &str,
    manual_override: bool,
    now: &str,
) -> BackendResult<()> {
    transaction.execute(
        "DELETE FROM metadata_values
         WHERE media_file_id = ?1 AND field_name = 'filename'
           AND source IN ('filename', 'manual')",
        [media_file_id],
    )?;
    transaction.execute(
        "INSERT INTO metadata_values(
            media_file_id, field_name, value_json, source, confidence,
            is_manual_correction, created_at
         ) VALUES (?1, 'filename', ?2, ?3, ?4, ?5, ?6)",
        params![
            media_file_id,
            serde_json::to_string(filename)?,
            if manual_override {
                "manual"
            } else {
                "filename"
            },
            if manual_override { 100 } else { 80 },
            i64::from(manual_override),
            now,
        ],
    )?;
    Ok(())
}

fn load_video(connection: &Connection, media_file_id: i64) -> BackendResult<Option<VideoDetails>> {
    Ok(connection
        .query_row(
            "SELECT codec, profile, dolby_vision_profile, level, width, height, bit_depth, frame_rate,
                    display_aspect_ratio, bitrate, hdr_format, color_space, color_transfer, is_default
             FROM video_streams WHERE media_file_id = ?1
             ORDER BY is_default DESC, stream_index LIMIT 1",
            [media_file_id],
            |row| {
                let is_default: i64 = row.get(13)?;
                Ok(VideoDetails {
                    codec: row.get(0)?,
                    profile: row.get(1)?,
                    dolby_vision_profile: row.get(2)?,
                    level: row.get(3)?,
                    width: row.get(4)?,
                    height: row.get(5)?,
                    bit_depth: row.get(6)?,
                    frame_rate: row.get(7)?,
                    display_aspect_ratio: row.get(8)?,
                    bitrate: row.get(9)?,
                    hdr_format: row.get(10)?,
                    color_space: row.get(11)?,
                    color_transfer: row.get(12)?,
                    is_default: is_default != 0,
                })
            },
        )
        .optional()?)
}

fn load_audio(connection: &Connection, media_file_id: i64) -> BackendResult<Vec<AudioTrack>> {
    let mut statement = connection.prepare(
        "SELECT stream_index, language, title, codec, profile, channels, channel_layout,
                bitrate, has_atmos, has_dts_x, is_default, is_commentary
         FROM audio_streams WHERE media_file_id = ?1 ORDER BY stream_index",
    )?;
    let rows = statement
        .query_map([media_file_id], |row| {
            let has_atmos: i64 = row.get(8)?;
            let has_dts_x: i64 = row.get(9)?;
            let is_default: i64 = row.get(10)?;
            let is_commentary: i64 = row.get(11)?;
            Ok(AudioTrack {
                index: row.get(0)?,
                language: row.get(1)?,
                title: row.get(2)?,
                codec: row.get(3)?,
                profile: row.get(4)?,
                channels: row.get(5)?,
                channel_layout: row.get(6)?,
                bitrate: row.get(7)?,
                has_atmos: has_atmos != 0,
                has_dts_x: has_dts_x != 0,
                is_default: is_default != 0,
                is_commentary: is_commentary != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn load_subtitles(
    connection: &Connection,
    media_file_id: i64,
) -> BackendResult<Vec<SubtitleTrack>> {
    let mut statement = connection.prepare(
        "SELECT stream_index, language, title, codec, is_default, is_forced, is_hearing_impaired
         FROM subtitle_streams WHERE media_file_id = ?1 ORDER BY stream_index",
    )?;
    let rows = statement
        .query_map([media_file_id], |row| {
            let is_default: i64 = row.get(4)?;
            let is_forced: i64 = row.get(5)?;
            let is_hearing_impaired: i64 = row.get(6)?;
            Ok(SubtitleTrack {
                index: row.get(0)?,
                language: row.get(1)?,
                title: row.get(2)?,
                codec: row.get(3)?,
                is_default: is_default != 0,
                is_forced: is_forced != 0,
                is_hearing_impaired: is_hearing_impaired != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{VerifiedAlternativeTitle, VerifiedGenre};
    use crate::naming::parse_filename;

    #[test]
    fn migration_and_scan_persistence_work_in_memory() {
        let database = Database::open_in_memory().unwrap();
        let parsed = parse_filename(Path::new("Dune.2024.2160p.mkv"));
        let id = database
            .upsert_scanned_file(
                Path::new("C:\\Movies\\Dune.2024.2160p.mkv"),
                &parsed,
                &ProbeData::default(),
                42,
            )
            .unwrap();
        assert!(id > 0);
        let library = database.list_library().unwrap();
        assert_eq!(library.len(), 1);
        assert_eq!(library[0].title, "Dune");
        assert_eq!(library[0].size_bytes, 42);
    }

    #[test]
    fn dolby_vision_profile_round_trips_through_sqlite() {
        let database = Database::open_in_memory().unwrap();
        let parsed = parse_filename(Path::new("Movie.2024.2160p.mkv"));
        let details = VideoDetails {
            codec: "hevc".into(),
            height: Some(2160),
            hdr_format: Some("Dolby Vision".into()),
            dolby_vision_profile: Some("8".into()),
            ..VideoDetails::default()
        };
        let probe = ProbeData {
            video: Some(details.clone()),
            video_streams: vec![crate::models::VideoStream { index: 0, details }],
            ..ProbeData::default()
        };
        database
            .upsert_scanned_file(
                Path::new("C:\\Movies\\Movie.2024.2160p.mkv"),
                &parsed,
                &probe,
                42,
            )
            .unwrap();

        assert_eq!(
            database.list_library().unwrap()[0]
                .video
                .as_ref()
                .and_then(|video| video.dolby_vision_profile.as_deref()),
            Some("8")
        );
    }

    #[test]
    fn version_one_database_is_upgraded_through_all_later_migrations() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
                 CREATE TABLE rename_batches(id INTEGER PRIMARY KEY);
                 CREATE TABLE video_streams(id INTEGER PRIMARY KEY);
                 INSERT INTO schema_migrations(version, applied_at) VALUES (1, 'test');
                 PRAGMA user_version = 1;",
            )
            .unwrap();
        let database = Database::configure(connection).unwrap();
        let connection = database.lock().unwrap();
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        let table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'table' AND name = 'rename_recovery_events'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, 3);
        assert_eq!(table_count, 1);
    }

    #[test]
    fn settings_never_serialize_a_token_field() {
        let database = Database::open_in_memory().unwrap();
        let settings = AppSettings::default();
        database.save_settings(&settings).unwrap();
        let json = serde_json::to_string(&database.get_settings().unwrap()).unwrap();
        assert!(!json.to_ascii_lowercase().contains("token"));
        assert!(!json.to_ascii_lowercase().contains("apikey"));
    }

    #[test]
    fn identification_upserts_tmdb_movie_and_persists_media_association() {
        let database = Database::open_in_memory().unwrap();
        let parsed = parse_filename(Path::new("Dune.Part.Two.2024.mkv"));
        let media_file_id = database
            .upsert_scanned_file(
                Path::new("C:\\Movies\\Dune.Part.Two.2024.mkv"),
                &parsed,
                &ProbeData::default(),
                42,
            )
            .unwrap();
        let mut metadata = VerifiedMovieMetadata {
            tmdb_id: 693_134,
            title: "Dune: Parte dos".into(),
            original_title: Some("Dune: Part Two".into()),
            release_date: Some("2024-02-27".into()),
            overview: Some("Arrakis".into()),
            runtime_minutes: Some(166),
            genres: vec![VerifiedGenre {
                id: 878,
                name: "Ciencia ficción".into(),
            }],
            poster_path: Some("/poster.jpg".into()),
            backdrop_path: Some("/backdrop.jpg".into()),
            collection_id: Some(726_871),
            collection_name: Some("Dune".into()),
            original_language: Some("en".into()),
            alternative_titles: vec![VerifiedAlternativeTitle {
                iso_3166_1: Some("ES".into()),
                title: "Dune: Parte Dos".into(),
                title_type: Some("".into()),
            }],
        };

        let identified = database
            .identify_media_file(media_file_id, &metadata)
            .unwrap();
        assert_eq!(identified.tmdb_id, Some(693_134));
        assert_eq!(identified.title, "Dune: Parte dos");
        assert_eq!(identified.release_date.as_deref(), Some("2024-02-27"));
        assert_eq!(identified.runtime_minutes, Some(166));
        assert_eq!(identified.genres, vec!["Ciencia ficción"]);
        assert_eq!(identified.collection_name.as_deref(), Some("Dune"));
        assert_eq!(
            identified.poster_url.as_deref(),
            Some("https://image.tmdb.org/t/p/w500/poster.jpg")
        );
        assert_eq!(
            identified.backdrop_url.as_deref(),
            Some("https://image.tmdb.org/t/p/w1280/backdrop.jpg")
        );
        let movie_id = identified.id;

        metadata.title = "Dune: Part Two".into();
        let updated = database
            .identify_media_file(media_file_id, &metadata)
            .unwrap();
        assert_eq!(updated.id, movie_id);
        assert_eq!(updated.title, "Dune: Part Two");
        assert_eq!(
            database.tmdb_id_for_media(media_file_id).unwrap(),
            Some(693_134)
        );
        let second_parsed = parse_filename(Path::new("Dune.Part.Two.2024.Remux.mkv"));
        let second_media_file_id = database
            .upsert_scanned_file(
                Path::new("D:\\Movies\\Dune.Part.Two.2024.Remux.mkv"),
                &second_parsed,
                &ProbeData::default(),
                84,
            )
            .unwrap();
        let second_identified = database
            .identify_media_file(second_media_file_id, &metadata)
            .unwrap();
        let library = database.list_library().unwrap();
        assert_eq!(library.len(), 2);
        assert_eq!(identified.id, media_file_id);
        assert_eq!(second_identified.id, second_media_file_id);
        assert_ne!(identified.id, second_identified.id);
        assert!(library
            .iter()
            .all(|record| record.id == record.media_file_id));
        let connection = database.lock().unwrap();
        let genre_links: i64 = connection
            .query_row("SELECT COUNT(*) FROM movie_genres", [], |row| row.get(0))
            .unwrap();
        let alternative_titles: i64 = connection
            .query_row("SELECT COUNT(*) FROM movie_alternative_titles", [], |row| {
                row.get(0)
            })
            .unwrap();
        let tmdb_evidence: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM metadata_values WHERE source = 'tmdb'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(genre_links, 1);
        assert_eq!(alternative_titles, 1);
        assert!(tmdb_evidence >= 4);
    }
}
