use crate::database::Database;
use crate::error::{BackendError, BackendResult};
use crate::ffprobe;
use crate::models::{
    AppSettings, ProbeData, ScanFolderRequest, ScanFolderResult, ScanItem, ScanProgress,
};
use crate::naming::{generate_filename_with_settings, parse_filename};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const VIDEO_EXTENSIONS: &[&str] = &[
    "mkv", "mp4", "m4v", "avi", "mov", "wmv", "webm", "mpeg", "mpg", "ts", "m2ts", "mts",
];

pub async fn scan_folder<F>(
    database: &Database,
    request: &ScanFolderRequest,
    settings: &AppSettings,
    mut progress: F,
) -> BackendResult<ScanFolderResult>
where
    F: FnMut(ScanProgress),
{
    let root = std::fs::canonicalize(Path::new(request.root_path.trim())).map_err(|error| {
        BackendError::InvalidInput(format!(
            "no se puede abrir la carpeta seleccionada: {error}"
        ))
    })?;
    if !root.is_dir() {
        return Err(BackendError::InvalidInput(
            "la ruta seleccionada no es una carpeta".into(),
        ));
    }
    progress(ScanProgress {
        stage: "discovering".into(),
        completed: 0,
        total: 0,
        current_file: None,
        message: "Buscando archivos de vídeo".into(),
    });

    let mut paths = Vec::<PathBuf>::new();
    let mut warnings = Vec::new();
    for entry in WalkDir::new(&root).follow_links(false) {
        match entry {
            Ok(entry) if entry.file_type().is_file() && is_supported_video(entry.path()) => {
                paths.push(entry.into_path());
            }
            Ok(_) => {}
            Err(error) => warnings.push(format!("No se pudo inspeccionar una ruta: {error}")),
        }
    }
    paths.sort_by(|left, right| {
        left.to_string_lossy()
            .to_lowercase()
            .cmp(&right.to_string_lossy().to_lowercase())
    });

    let requested_probe = request
        .ffprobe_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .or_else(|| {
            (!settings.ffprobe_path.trim().is_empty()).then_some(settings.ffprobe_path.as_str())
        });
    let ffprobe_status = ffprobe::validate(requested_probe).await;
    if !ffprobe_status.valid {
        warnings.push(format!(
            "ffprobe no está disponible; se usará solo el nombre: {}",
            ffprobe_status.message
        ));
    }

    let total = paths.len();
    let mut items = Vec::with_capacity(total);
    for (position, discovered_path) in paths.into_iter().enumerate() {
        let path = match std::fs::canonicalize(&discovered_path) {
            Ok(path) => path,
            Err(error) => {
                warnings.push(format!(
                    "Se omitió {} porque ya no se puede abrir: {error}",
                    discovered_path.display()
                ));
                continue;
            }
        };
        let Some(filename) = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(str::to_owned)
        else {
            warnings.push(format!(
                "Se omitió un archivo con nombre no Unicode: {}",
                path.display()
            ));
            continue;
        };
        progress(ScanProgress {
            stage: "probing".into(),
            completed: position,
            total,
            current_file: Some(filename.clone()),
            message: "Analizando metadatos técnicos".into(),
        });
        let metadata = match std::fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => {
                warnings.push(format!(
                    "Se omitió {} porque no se pudieron leer sus metadatos: {error}",
                    path.display()
                ));
                continue;
            }
        };
        let parsed = parse_filename(&path);
        let mut item_warnings = Vec::new();
        let probe = if let Some(executable) = ffprobe_status.detected_path.as_deref() {
            match ffprobe::probe_file(executable, &path).await {
                Ok(probe) => probe,
                Err(error) => {
                    item_warnings.push(format!("No se pudo analizar con ffprobe: {error}"));
                    ProbeData::default()
                }
            }
        } else {
            item_warnings.push("Análisis técnico omitido porque ffprobe no está disponible".into());
            ProbeData::default()
        };
        let media_file_id =
            match database.upsert_scanned_file(&path, &parsed, &probe, metadata.len()) {
                Ok(media_file_id) => media_file_id,
                Err(error) => {
                    warnings.push(format!(
                        "Se omitió {} porque no se pudo guardar en la biblioteca: {error}",
                        path.display()
                    ));
                    continue;
                }
            };
        progress(ScanProgress {
            stage: "proposing".into(),
            completed: position,
            total,
            current_file: Some(filename.clone()),
            message: "Generando una propuesta segura".into(),
        });
        let tmdb_id = if settings.include_identifier {
            match database.tmdb_id_for_media(media_file_id) {
                Ok(tmdb_id) => tmdb_id,
                Err(error) => {
                    warnings.push(format!(
                        "Se omitió {} porque no se pudo consultar su identificación: {error}",
                        path.display()
                    ));
                    continue;
                }
            }
        } else {
            None
        };
        let proposed_filename =
            generate_filename_with_settings(&parsed, Some(&probe), tmdb_id, settings);
        let resolution = probe
            .video
            .as_ref()
            .and_then(|video| resolution_from_height(video.height))
            .or_else(|| parsed.resolution.clone());
        items.push(ScanItem {
            id: media_file_id.to_string(),
            media_file_id,
            movie_id: None,
            path: path.to_string_lossy().into_owned(),
            original_filename: filename,
            proposed_filename,
            title: parsed.title.clone(),
            original_title: None,
            year: parsed.year,
            extension: parsed.extension.clone(),
            container: probe.container.clone(),
            size_bytes: metadata.len(),
            resolution,
            source: parsed.source.clone(),
            release_type: parsed.release_type.clone(),
            poster_url: None,
            match_score: None,
            match_level: "unmatched".into(),
            score_reasons: Vec::new(),
            status: if item_warnings.is_empty() {
                "ready".into()
            } else {
                "review".into()
            },
            warnings: item_warnings,
            tokens: parsed.tokens,
            video: probe.video,
            audio_tracks: probe.audio_tracks,
            subtitle_tracks: probe.subtitle_tracks,
        });
    }
    progress(ScanProgress {
        stage: "complete".into(),
        completed: total,
        total,
        current_file: None,
        message: format!("Análisis completado: {total} archivos"),
    });
    Ok(ScanFolderResult {
        folder_path: root.to_string_lossy().into_owned(),
        items,
        warnings,
        ffprobe: ffprobe_status,
    })
}

fn is_supported_video(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| {
            VIDEO_EXTENSIONS
                .iter()
                .any(|candidate| extension.eq_ignore_ascii_case(candidate))
        })
}

fn resolution_from_height(height: Option<i64>) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn scans_dummy_files_without_requiring_ffprobe() {
        let directory = TempDir::new().unwrap();
        std::fs::write(
            directory
                .path()
                .join("Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.mkv"),
            b"dummy bytes, not a video",
        )
        .unwrap();
        std::fs::write(directory.path().join("notes.txt"), b"ignored").unwrap();
        let database = Database::open_in_memory().unwrap();
        let result = scan_folder(
            &database,
            &ScanFolderRequest {
                root_path: directory.path().to_string_lossy().into_owned(),
                ffprobe_path: Some(
                    directory
                        .path()
                        .join("missing-ffprobe")
                        .to_string_lossy()
                        .into_owned(),
                ),
            },
            &AppSettings::default(),
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].title, "Dune Part Two");
        assert_eq!(database.list_library().unwrap().len(), 1);
        assert!(!result.ffprobe.valid);
    }

    #[tokio::test]
    async fn one_disappearing_file_does_not_abort_the_rest_of_the_scan() {
        let directory = TempDir::new().unwrap();
        let disappearing = directory.path().join("a-disappears.mkv");
        std::fs::write(&disappearing, b"gone soon").unwrap();
        std::fs::write(directory.path().join("b-remains.mkv"), b"kept").unwrap();
        let missing_probe = directory.path().join("missing-ffprobe");
        let database = Database::open_in_memory().unwrap();
        let result = scan_folder(
            &database,
            &ScanFolderRequest {
                root_path: directory.path().to_string_lossy().into_owned(),
                ffprobe_path: Some(missing_probe.to_string_lossy().into_owned()),
            },
            &AppSettings::default(),
            |progress| {
                if progress.stage == "probing"
                    && progress.current_file.as_deref() == Some("a-disappears.mkv")
                {
                    let _ = std::fs::remove_file(&disappearing);
                }
            },
        )
        .await
        .unwrap();

        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].original_filename, "b-remains.mkv");
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("a-disappears.mkv")));
    }
}
