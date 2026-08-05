use crate::error::{BackendError, BackendResult};
use crate::models::{
    AudioTrack, Chapter, FfprobeValidation, ProbeData, SubtitleTrack, VideoDetails, VideoStream,
};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::time::timeout;

const VALIDATION_TIMEOUT: Duration = Duration::from_secs(5);
const PROBE_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_STDOUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 256 * 1024;

fn executable_candidate(path: Option<&str>) -> BackendResult<PathBuf> {
    let trimmed = path.map(str::trim).filter(|value| !value.is_empty());
    if let Some(value) = trimmed {
        if value.eq_ignore_ascii_case("ffprobe") {
            return Ok(PathBuf::from("ffprobe"));
        }
        let candidate = PathBuf::from(value);
        if !candidate.is_file() {
            return Err(BackendError::InvalidInput(format!(
                "la ruta de ffprobe no es un archivo: {}",
                candidate.display()
            )));
        }
        #[cfg(target_os = "windows")]
        if !candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        {
            return Err(BackendError::InvalidInput(
                "en Windows ffprobe debe ser un ejecutable .exe, no un script".into(),
            ));
        }
        return Ok(candidate);
    }
    Ok(PathBuf::from("ffprobe"))
}

async fn direct_output(
    executable: &Path,
    arguments: &[&str],
    operation_timeout: Duration,
) -> BackendResult<std::process::Output> {
    let mut command = Command::new(executable);
    command
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command.spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| BackendError::State("no se pudo capturar stdout de ffprobe".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| BackendError::State("no se pudo capturar stderr de ffprobe".into()))?;

    let completed = timeout(operation_timeout, async {
        tokio::try_join!(
            async { child.wait().await.map_err(BackendError::Io) },
            read_limited(stdout, MAX_STDOUT_BYTES, "stdout"),
            read_limited(stderr, MAX_STDERR_BYTES, "stderr"),
        )
    })
    .await;
    match completed {
        Ok(Ok((status, stdout, stderr))) => Ok(std::process::Output {
            status,
            stdout,
            stderr,
        }),
        Ok(Err(error)) => {
            terminate_child(&mut child).await;
            Err(error)
        }
        Err(_) => {
            terminate_child(&mut child).await;
            Err(BackendError::Ffprobe(format!(
                "ffprobe superó el límite de {} segundos",
                operation_timeout.as_secs()
            )))
        }
    }
}

async fn read_limited<R>(mut reader: R, limit: usize, stream: &str) -> BackendResult<Vec<u8>>
where
    R: AsyncRead + Unpin,
{
    let mut collected = Vec::with_capacity(limit.min(64 * 1024));
    let mut chunk = [0_u8; 16 * 1024];
    loop {
        let read = reader.read(&mut chunk).await?;
        if read == 0 {
            return Ok(collected);
        }
        if collected.len().saturating_add(read) > limit {
            return Err(BackendError::Ffprobe(format!(
                "ffprobe excedió el límite de {limit} bytes en {stream}"
            )));
        }
        collected.extend_from_slice(&chunk[..read]);
    }
}

async fn terminate_child(child: &mut tokio::process::Child) {
    if child.try_wait().ok().flatten().is_none() {
        let _ = child.kill().await;
    }
    let _ = child.wait().await;
}

pub async fn validate(path: Option<&str>) -> FfprobeValidation {
    let candidate = match executable_candidate(path) {
        Ok(candidate) => candidate,
        Err(error) => {
            return FfprobeValidation {
                valid: false,
                detected_path: None,
                version: None,
                message: error.to_string(),
            };
        }
    };

    match direct_output(&candidate, &["-version"], VALIDATION_TIMEOUT).await {
        Ok(output) if output.status.success() => {
            if let Some(version) = ffprobe_version_line(&output.stdout) {
                FfprobeValidation {
                    valid: true,
                    detected_path: Some(candidate.to_string_lossy().into_owned()),
                    version: Some(version),
                    message: "ffprobe está disponible".into(),
                }
            } else {
                FfprobeValidation {
                    valid: false,
                    detected_path: None,
                    version: None,
                    message: "el ejecutable no se identifica como ffprobe version".into(),
                }
            }
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
            FfprobeValidation {
                valid: false,
                detected_path: None,
                version: None,
                message: if stderr.is_empty() {
                    format!("ffprobe terminó con {}", output.status)
                } else {
                    format!("ffprobe no es válido: {stderr}")
                },
            }
        }
        Err(error) => FfprobeValidation {
            valid: false,
            detected_path: None,
            version: None,
            message: error.to_string(),
        },
    }
}

fn ffprobe_version_line(stdout: &[u8]) -> Option<String> {
    let first_line = std::str::from_utf8(stdout).ok()?.lines().next()?.trim();
    first_line
        .strip_prefix("ffprobe version ")
        .filter(|version| !version.trim().is_empty())
        .map(|_| first_line.to_owned())
}

pub async fn probe_file(executable: &str, media_path: &Path) -> BackendResult<ProbeData> {
    let executable = executable_candidate(Some(executable))?;
    let media_path = media_path.to_str().ok_or_else(|| {
        BackendError::InvalidInput("la ruta del archivo no es Unicode válido".into())
    })?;
    let output = direct_output(
        &executable,
        &[
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            "-show_chapters",
            "-i",
            media_path,
        ],
        PROBE_TIMEOUT,
    )
    .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(BackendError::Ffprobe(if stderr.is_empty() {
            format!("ffprobe terminó con {}", output.status)
        } else {
            stderr
        }));
    }
    let value: Value = serde_json::from_slice(&output.stdout)?;
    parse_output(&value)
}

fn value_string(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(value) if !value.trim().is_empty() => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn value_i64(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(value) => value.as_i64(),
        Value::String(value) => value.parse().ok(),
        _ => None,
    }
}

fn value_f64(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::Number(value) => value.as_f64(),
        Value::String(value) => value.parse().ok(),
        _ => None,
    }
}

fn disposition(stream: &Value, name: &str) -> bool {
    value_i64(stream.get("disposition").and_then(|value| value.get(name))) == Some(1)
}

fn tag(stream: &Value, name: &str) -> Option<String> {
    let tags = stream.get("tags")?;
    tags.get(name)
        .or_else(|| tags.get(name.to_ascii_uppercase()))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn detect_bit_depth(stream: &Value) -> Option<i64> {
    value_i64(stream.get("bits_per_raw_sample"))
        .filter(|depth| *depth > 0)
        .or_else(|| value_i64(stream.get("bits_per_sample")).filter(|depth| *depth > 0))
        .or_else(|| {
            let pixel_format = value_string(stream.get("pix_fmt"))?.to_ascii_lowercase();
            if pixel_format.contains("12") {
                Some(12)
            } else if pixel_format.contains("10") || pixel_format.contains("p010") {
                Some(10)
            } else {
                None
            }
        })
}

fn detect_hdr(stream: &Value) -> Option<String> {
    let side_data = stream
        .get("side_data_list")
        .map(Value::to_string)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let transfer = value_string(stream.get("color_transfer"))
        .unwrap_or_default()
        .to_ascii_lowercase();
    let dolby_vision = side_data.contains("dovi configuration record")
        || side_data.contains("dv_profile")
        || side_data.contains("dolby vision");
    let hdr10_plus = side_data.contains("smpte2094-40") || side_data.contains("hdr10+");
    let hdr10 = transfer == "smpte2084"
        && (side_data.contains("mastering display metadata")
            || side_data.contains("content light level metadata"));

    match (dolby_vision, hdr10_plus, hdr10, transfer.as_str()) {
        (true, _, true, _) => Some("Dolby Vision + HDR10".into()),
        (true, _, false, _) => Some("Dolby Vision".into()),
        (false, true, _, _) => Some("HDR10+".into()),
        (false, false, true, _) => Some("HDR10".into()),
        (false, false, false, "arib-std-b67") => Some("HDR".into()),
        _ => None,
    }
}

fn detect_dolby_vision_profile(stream: &Value) -> Option<String> {
    value_i64(stream.get("dv_profile"))
        .or_else(|| {
            stream
                .get("side_data_list")?
                .as_array()?
                .iter()
                .find_map(|entry| value_i64(entry.get("dv_profile")))
        })
        .filter(|profile| *profile > 0)
        .map(|profile| profile.to_string())
}

fn detect_spatial_audio(stream: &Value) -> (bool, bool) {
    let evidence = format!(
        "{} {} {}",
        tag(stream, "title").unwrap_or_default(),
        value_string(stream.get("profile")).unwrap_or_default(),
        stream
            .get("side_data_list")
            .map(Value::to_string)
            .unwrap_or_default()
    )
    .to_ascii_lowercase();
    (
        evidence.contains("atmos") || evidence.contains("dolby atmos"),
        evidence.contains("dts:x") || evidence.contains("dts-x"),
    )
}

pub fn parse_output(root: &Value) -> BackendResult<ProbeData> {
    if !root.is_object() {
        return Err(BackendError::Ffprobe(
            "ffprobe no devolvió un objeto JSON".into(),
        ));
    }
    let format = root.get("format");
    let container = value_string(format.and_then(|format| format.get("format_name")))
        .and_then(|value| value.split(',').next().map(str::to_owned));
    let duration_seconds = value_f64(format.and_then(|format| format.get("duration")));
    let bitrate = value_i64(format.and_then(|format| format.get("bit_rate")));
    let mut data = ProbeData {
        container,
        duration_seconds,
        bitrate,
        ..ProbeData::default()
    };

    for stream in root
        .get("streams")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let index = value_i64(stream.get("index")).unwrap_or(0);
        let codec = value_string(stream.get("codec_name")).unwrap_or_else(|| "unknown".into());
        match value_string(stream.get("codec_type")).as_deref() {
            Some("video") => {
                let details = VideoDetails {
                    codec,
                    profile: value_string(stream.get("profile")),
                    dolby_vision_profile: detect_dolby_vision_profile(stream),
                    level: value_string(stream.get("level")),
                    width: value_i64(stream.get("width")),
                    height: value_i64(stream.get("height")),
                    bit_depth: detect_bit_depth(stream),
                    frame_rate: value_string(stream.get("avg_frame_rate"))
                        .or_else(|| value_string(stream.get("r_frame_rate"))),
                    display_aspect_ratio: value_string(stream.get("display_aspect_ratio")),
                    bitrate: value_i64(stream.get("bit_rate")),
                    hdr_format: detect_hdr(stream),
                    color_space: value_string(stream.get("color_space")),
                    color_transfer: value_string(stream.get("color_transfer")),
                    is_default: disposition(stream, "default"),
                };
                if data.video.is_none() || details.is_default {
                    data.video = Some(details.clone());
                }
                data.video_streams.push(VideoStream { index, details });
            }
            Some("audio") => {
                let title = tag(stream, "title");
                let commentary_evidence = title.as_deref().unwrap_or_default().to_ascii_lowercase();
                let (has_atmos, has_dts_x) = detect_spatial_audio(stream);
                data.audio_tracks.push(AudioTrack {
                    index,
                    language: tag(stream, "language"),
                    title,
                    codec,
                    profile: value_string(stream.get("profile")),
                    channels: value_i64(stream.get("channels")),
                    channel_layout: value_string(stream.get("channel_layout")),
                    bitrate: value_i64(stream.get("bit_rate")),
                    has_atmos,
                    has_dts_x,
                    is_default: disposition(stream, "default"),
                    is_commentary: commentary_evidence.contains("commentary")
                        || commentary_evidence.contains("comentario"),
                });
            }
            Some("subtitle") => data.subtitle_tracks.push(SubtitleTrack {
                index,
                language: tag(stream, "language"),
                title: tag(stream, "title"),
                codec,
                is_default: disposition(stream, "default"),
                is_forced: disposition(stream, "forced"),
                is_hearing_impaired: disposition(stream, "hearing_impaired"),
            }),
            _ => {}
        }
    }

    for (position, chapter) in root
        .get("chapters")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
    {
        data.chapters.push(Chapter {
            index: value_i64(chapter.get("id")).unwrap_or(position as i64),
            start_seconds: value_f64(chapter.get("start_time")),
            end_seconds: value_f64(chapter.get("end_time")),
            title: tag(chapter, "title"),
        });
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tokio::io::AsyncWriteExt;

    #[tokio::test]
    async fn limited_reader_accepts_exact_limit_and_rejects_the_next_byte() {
        let (mut exact_writer, exact_reader) = tokio::io::duplex(16);
        let exact_write = tokio::spawn(async move {
            exact_writer.write_all(b"1234").await.unwrap();
        });
        assert_eq!(
            read_limited(exact_reader, 4, "test").await.unwrap(),
            b"1234"
        );
        exact_write.await.unwrap();

        let (mut oversized_writer, oversized_reader) = tokio::io::duplex(16);
        let oversized_write = tokio::spawn(async move {
            oversized_writer.write_all(b"12345").await.unwrap();
        });
        let error = read_limited(oversized_reader, 4, "stdout")
            .await
            .unwrap_err();
        assert!(error.to_string().contains("límite de 4 bytes en stdout"));
        oversized_write.await.unwrap();
    }

    #[test]
    fn version_identity_requires_the_ffprobe_banner() {
        assert_eq!(
            ffprobe_version_line(b"ffprobe version 7.1.1 Copyright\nconfiguration"),
            Some("ffprobe version 7.1.1 Copyright".into())
        );
        assert!(ffprobe_version_line(b"something version 7.1.1\n").is_none());
        assert!(ffprobe_version_line(b"ffprobe version \n").is_none());
        assert!(ffprobe_version_line(&[0xff, 0xfe]).is_none());
    }

    #[test]
    fn only_marks_hdr_and_atmos_with_explicit_evidence() {
        let fixture = json!({
            "format": {"format_name": "matroska,webm", "duration": "60.5"},
            "streams": [
                {
                    "index": 0,
                    "codec_type": "video",
                    "codec_name": "hevc",
                    "height": 2160,
                    "color_transfer": "smpte2084",
                    "side_data_list": []
                },
                {
                    "index": 1,
                    "codec_type": "audio",
                    "codec_name": "truehd",
                    "tags": {"language": "eng"}
                }
            ]
        });
        let parsed = parse_output(&fixture).unwrap();
        assert_eq!(parsed.video.unwrap().hdr_format, None);
        assert!(!parsed.audio_tracks[0].has_atmos);
    }

    #[test]
    fn parses_streams_and_chapters_from_fixture() {
        let fixture = json!({
            "format": {"format_name": "matroska,webm", "bit_rate": "9000"},
            "streams": [
                {
                    "index": 0,
                    "codec_type": "video",
                    "codec_name": "hevc",
                    "height": 2160,
                    "bits_per_raw_sample": "10",
                    "color_transfer": "smpte2084",
                    "side_data_list": [{"side_data_type": "Mastering display metadata"}]
                },
                {
                    "index": 2,
                    "codec_type": "subtitle",
                    "codec_name": "subrip",
                    "tags": {"language": "spa"},
                    "disposition": {"forced": 1, "hearing_impaired": 0}
                }
            ],
            "chapters": [{"id": 4, "start_time": "0.0", "end_time": "60.0", "tags": {"title": "Inicio"}}]
        });
        let parsed = parse_output(&fixture).unwrap();
        assert_eq!(parsed.container.as_deref(), Some("matroska"));
        assert_eq!(parsed.video.unwrap().hdr_format.as_deref(), Some("HDR10"));
        assert!(parsed.subtitle_tracks[0].is_forced);
        assert_eq!(parsed.chapters[0].title.as_deref(), Some("Inicio"));
    }

    #[test]
    fn extracts_dolby_vision_profile_from_side_data() {
        let fixture = json!({
            "streams": [{
                "index": 0,
                "codec_type": "video",
                "codec_name": "hevc",
                "side_data_list": [{
                    "side_data_type": "DOVI configuration record",
                    "dv_profile": 8
                }]
            }]
        });
        let video = parse_output(&fixture).unwrap().video.unwrap();
        assert_eq!(video.hdr_format.as_deref(), Some("Dolby Vision"));
        assert_eq!(video.dolby_vision_profile.as_deref(), Some("8"));
    }
}
