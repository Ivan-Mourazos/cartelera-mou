use crate::error::ApiError;
use crate::ffprobe;
use crate::models::{
    AppSettings, FfprobeValidation, HistoryEntry, IdentifyMediaFileRequest, MovieRecord,
    PreflightResult, RenameBatchRequest, RenameBatchResult, SaveSettingsRequest, ScanFolderRequest,
    ScanFolderResult, TmdbCandidate, TmdbSearchRequest, UndoResult,
};
use crate::naming::NAMING_TAG_IDS;
use crate::rename;
use crate::scanner;
use crate::AppState;
use std::collections::HashSet;
use tauri::{AppHandle, Emitter, State};

type CommandResult<T> = Result<T, ApiError>;

#[tauri::command(rename_all = "camelCase")]
#[tracing::instrument(skip_all, fields(operation = "scan_folder"))]
pub async fn scan_folder(
    request: ScanFolderRequest,
    state: State<'_, AppState>,
    app: AppHandle,
) -> CommandResult<ScanFolderResult> {
    let settings = state.database.get_settings().map_err(ApiError::from)?;
    let result = scanner::scan_folder(&state.database, &request, &settings, |progress| {
        if app.emit("scan-progress", progress).is_err() {
            tracing::warn!(
                operation = "scan_progress",
                error_code = "eventEmit",
                "no se pudo emitir el progreso"
            );
        }
    })
    .await
    .map_err(ApiError::from)?;
    tracing::info!(
        operation = "scan_folder",
        item_count = result.items.len(),
        warning_count = result.warnings.len(),
        "escaneo completado"
    );
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
#[tracing::instrument(skip_all, fields(operation = "validate_ffprobe"))]
pub async fn validate_ffprobe(
    path: Option<String>,
    state: State<'_, AppState>,
) -> CommandResult<FfprobeValidation> {
    let configured_path = if path.as_deref().is_some_and(|path| !path.trim().is_empty()) {
        path
    } else {
        let settings = state.database.get_settings().map_err(ApiError::from)?;
        (!settings.ffprobe_path.trim().is_empty()).then_some(settings.ffprobe_path)
    };
    Ok(ffprobe::validate(configured_path.as_deref()).await)
}

#[tauri::command]
#[tracing::instrument(skip_all, fields(operation = "list_library"))]
pub fn list_library(state: State<'_, AppState>) -> CommandResult<Vec<MovieRecord>> {
    state.database.list_library().map_err(ApiError::from)
}

#[tauri::command(rename_all = "camelCase")]
#[tracing::instrument(skip_all, fields(operation = "identify_media_file"))]
pub async fn identify_media_file(
    request: IdentifyMediaFileRequest,
    state: State<'_, AppState>,
) -> CommandResult<MovieRecord> {
    let settings = state.database.get_settings().map_err(ApiError::from)?;
    let verified = state
        .tmdb
        .movie_details(request.candidate.tmdb_id, &settings.title_language)
        .await
        .map_err(ApiError::from)?;
    state
        .database
        .identify_media_file(request.media_file_id, &verified)
        .map_err(ApiError::from)
}

#[tauri::command]
#[tracing::instrument(skip_all, fields(operation = "list_history"))]
pub fn list_history(state: State<'_, AppState>) -> CommandResult<Vec<HistoryEntry>> {
    state.database.list_history().map_err(ApiError::from)
}

#[tauri::command]
#[tracing::instrument(skip_all, fields(operation = "get_settings"))]
pub fn get_settings(state: State<'_, AppState>) -> CommandResult<AppSettings> {
    let mut settings = state.database.get_settings().map_err(ApiError::from)?;
    let (configured, source) = state.tmdb.credential_status().map_err(ApiError::from)?;
    settings.tmdb_configured = configured;
    settings.credential_source = source.into();
    settings.credential_persistence = "processMemoryOnly".into();
    Ok(settings)
}

#[tauri::command(rename_all = "camelCase")]
#[tracing::instrument(skip_all, fields(operation = "save_settings"))]
pub fn save_settings(
    request: SaveSettingsRequest,
    state: State<'_, AppState>,
) -> CommandResult<AppSettings> {
    validate_settings_request(&request)?;
    let token_update = request.tmdb_token.clone();
    let mut settings = request.into_public_settings();
    if let Some(token) = token_update.as_deref() {
        state
            .tmdb
            .set_session_token(Some(token))
            .map_err(ApiError::from)?;
    }
    let (configured, source) = state.tmdb.credential_status().map_err(ApiError::from)?;
    settings.tmdb_configured = configured;
    settings.credential_source = source.into();
    settings.credential_persistence = "processMemoryOnly".into();
    state
        .database
        .save_settings(&settings)
        .map_err(ApiError::from)?;
    tracing::info!(
        operation = "save_settings",
        tmdb_configured = configured,
        credential_source = source,
        "ajustes guardados; la credencial no se ha persistido"
    );
    Ok(settings)
}

fn validate_settings_request(request: &SaveSettingsRequest) -> CommandResult<()> {
    if request.title_language.trim().is_empty()
        || request.region.len() != 2
        || !request
            .region
            .bytes()
            .all(|byte| byte.is_ascii_alphabetic())
    {
        return Err(ApiError {
            code: "invalidInput",
            message: "el idioma es obligatorio y la región debe ser ISO 3166-1 alfa-2".into(),
        });
    }
    if !(0..=100).contains(&request.match_threshold) {
        return Err(ApiError {
            code: "invalidInput",
            message: "el umbral debe estar entre 0 y 100".into(),
        });
    }
    if !matches!(request.theme.as_str(), "dark" | "light" | "system") {
        return Err(ApiError {
            code: "invalidInput",
            message: "el tema debe ser dark, light o system".into(),
        });
    }
    let template = request.naming_template.trim();
    if template.is_empty() || template.len() > 500 || !template.contains("{title}") {
        return Err(ApiError {
            code: "invalidInput",
            message: "la plantilla debe incluir {title} y no superar 500 caracteres".into(),
        });
    }
    let unknown_template = template
        .replace("{title}", "")
        .replace("{year}", "")
        .replace("{tags}", "");
    if unknown_template.contains('{') || unknown_template.contains('}') {
        return Err(ApiError {
            code: "invalidInput",
            message: "la plantilla solo admite {title}, {year} y {tags}".into(),
        });
    }
    validate_tag_list("tagOrder", &request.tag_order)?;
    validate_tag_list("enabledTags", &request.enabled_tags)?;
    Ok(())
}

fn validate_tag_list(field: &str, tags: &[String]) -> CommandResult<()> {
    let mut seen = HashSet::new();
    for tag in tags {
        if !NAMING_TAG_IDS.contains(&tag.as_str()) {
            return Err(ApiError {
                code: "invalidInput",
                message: format!("{field} contiene una etiqueta desconocida: {tag}"),
            });
        }
        if !seen.insert(tag) {
            return Err(ApiError {
                code: "invalidInput",
                message: format!("{field} contiene una etiqueta duplicada: {tag}"),
            });
        }
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
#[tracing::instrument(skip_all, fields(operation = "preflight_rename_batch"))]
pub fn preflight_rename_batch(
    request: RenameBatchRequest,
    state: State<'_, AppState>,
) -> CommandResult<PreflightResult> {
    rename::preflight(&state.database, &request).map_err(ApiError::from)
}

#[tauri::command(rename_all = "camelCase")]
#[tracing::instrument(skip_all, fields(operation = "execute_rename_batch"))]
pub fn execute_rename_batch(
    request: RenameBatchRequest,
    state: State<'_, AppState>,
) -> CommandResult<RenameBatchResult> {
    state
        .rename_coordinator
        .execute_batch(&state.database, &request, &state.journal_directory)
        .map_err(ApiError::from)
}

#[tauri::command(rename_all = "camelCase")]
#[tracing::instrument(skip_all, fields(operation = "undo_rename", history_id))]
pub fn undo_rename(history_id: i64, state: State<'_, AppState>) -> CommandResult<UndoResult> {
    state
        .rename_coordinator
        .undo(&state.database, history_id)
        .map_err(ApiError::from)
}

#[tauri::command(rename_all = "camelCase")]
#[tracing::instrument(skip_all, fields(operation = "search_tmdb"))]
pub async fn search_tmdb(
    request: TmdbSearchRequest,
    state: State<'_, AppState>,
) -> CommandResult<Vec<TmdbCandidate>> {
    let settings = state.database.get_settings().map_err(ApiError::from)?;
    state
        .tmdb
        .search(&request, settings.match_threshold)
        .await
        .map_err(ApiError::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_request() -> SaveSettingsRequest {
        SaveSettingsRequest {
            title_language: "es-ES".into(),
            region: "ES".into(),
            ffprobe_path: String::new(),
            tmdb_token: None,
            naming_template: "{title} ({year}) {tags}".into(),
            match_threshold: 80,
            include_identifier: false,
            tag_order: NAMING_TAG_IDS.iter().map(|tag| (*tag).into()).collect(),
            enabled_tags: NAMING_TAG_IDS.iter().map(|tag| (*tag).into()).collect(),
            theme: "dark".into(),
        }
    }

    #[test]
    fn rejects_unknown_duplicate_tags_and_unknown_template_tokens() {
        let mut duplicate = valid_request();
        duplicate.tag_order.push("resolution".into());
        assert!(validate_settings_request(&duplicate).is_err());

        let mut unknown = valid_request();
        unknown.enabled_tags.push("surprise".into());
        assert!(validate_settings_request(&unknown).is_err());

        let mut template = valid_request();
        template.naming_template = "{title} {unknown}".into();
        assert!(validate_settings_request(&template).is_err());
    }
}
