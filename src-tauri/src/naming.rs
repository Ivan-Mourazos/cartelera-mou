use crate::models::{AppSettings, NamingToken, ParsedMediaName, ProbeData};
use std::collections::{HashMap, HashSet};
use std::path::Path;

pub const NAMING_TAG_IDS: &[&str] = &[
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
];

#[derive(Debug, Clone)]
struct RawToken {
    raw: String,
    normalized: String,
}

fn normalize_token(value: &str) -> String {
    value
        .trim_matches(|character: char| matches!(character, '[' | ']' | '(' | ')'))
        .to_uppercase()
        .replace('_', "-")
}

fn tokenize(stem: &str) -> Vec<RawToken> {
    let characters: Vec<char> = stem.chars().collect();
    let mut tokens = Vec::new();
    let mut current = String::new();

    for (index, character) in characters.iter().copied().enumerate() {
        let numeric_run_before_dot = current
            .chars()
            .rev()
            .take_while(|value| value.is_ascii_digit())
            .count();
        let decimal_context = current.chars().all(|value| value.is_ascii_digit())
            || matches!(
                current.to_ascii_uppercase().as_str(),
                value if value.starts_with("DDP")
                    || value.starts_with("EAC3")
                    || value.starts_with("AC3")
            );
        let numeric_run_after_dot = characters
            .iter()
            .skip(index + 1)
            .take_while(|value| value.is_ascii_digit())
            .count();
        let decimal_point = character == '.'
            && index + 1 < characters.len()
            && numeric_run_before_dot == 1
            && numeric_run_after_dot == 1
            && decimal_context
            && characters[index + 1].is_ascii_digit();
        let separator = !decimal_point
            && (character == '.'
                || character == '_'
                || character.is_whitespace()
                || matches!(character, '[' | ']' | '(' | ')'));

        if separator {
            if !current.is_empty() {
                tokens.push(RawToken {
                    normalized: normalize_token(&current),
                    raw: std::mem::take(&mut current),
                });
            }
        } else {
            current.push(character);
        }
    }

    if !current.is_empty() {
        tokens.push(RawToken {
            normalized: normalize_token(&current),
            raw: current,
        });
    }

    tokens
}

fn is_year(token: &str) -> Option<i32> {
    if token.len() != 4 || !token.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }
    token
        .parse::<i32>()
        .ok()
        .filter(|year| (1888..=2100).contains(year))
}

fn mark(consumed: &mut HashSet<usize>, indexes: &[usize]) {
    consumed.extend(indexes.iter().copied());
}

fn matches_any(value: &str, candidates: &[&str]) -> bool {
    candidates.contains(&value)
}

fn channel_from_token(token: &str) -> Option<String> {
    let value = token
        .strip_prefix("DDP")
        .or_else(|| token.strip_prefix("EAC3"))
        .or_else(|| token.strip_prefix("AC3"))
        .unwrap_or(token);
    matches_any(value, &["1.0", "2.0", "2.1", "5.1", "6.1", "7.1"]).then(|| value.to_owned())
}

fn known_language(token: &str) -> Option<String> {
    let uppercase = token.trim().to_ascii_uppercase();
    let normalized = match uppercase.as_str() {
        "SPA" | "ESP" | "CAST" | "ES" => "ES",
        "ENG" | "EN" => "EN",
        "GLG" | "GAL" => "GAL",
        "CAT" | "CA" => "CAT",
        "FRA" | "FRE" | "FR" => "FR",
        "DEU" | "GER" | "DE" => "DE",
        "ITA" | "IT" => "IT",
        "POR" | "PT" => "PT",
        "JPN" | "JA" => "JA",
        _ => return None,
    };
    Some(normalized.to_owned())
}

pub fn parse_filename(path: &Path) -> ParsedMediaName {
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(filename);
    let raw_tokens = tokenize(stem);
    let mut parsed = ParsedMediaName {
        extension,
        ..ParsedMediaName::default()
    };
    let mut consumed = HashSet::new();
    let mut kinds = vec!["unknown"; raw_tokens.len()];
    let has_explicit_dolby_vision = raw_tokens.iter().enumerate().any(|(index, token)| {
        matches_any(
            token.normalized.as_str(),
            &["DV", "DOVI", "DOLBYVISION", "DOLBY-VISION"],
        ) || (token.normalized == "DOLBY"
            && raw_tokens
                .get(index + 1)
                .is_some_and(|next| next.normalized == "VISION"))
    });

    for (index, token) in raw_tokens.iter().enumerate() {
        if let Some(year) = is_year(&token.normalized) {
            parsed.year.get_or_insert(year);
            consumed.insert(index);
            kinds[index] = "year";
        }
    }

    let mut index = 0;
    while index < raw_tokens.len() {
        let current = raw_tokens[index].normalized.as_str();
        let next = raw_tokens
            .get(index + 1)
            .map(|token| token.normalized.as_str());

        if matches_any(current, &["DIRECTORS", "DIRECTOR'S", "DIRECTOR´S"]) && next == Some("CUT")
        {
            parsed.edition = Some("Director's Cut".into());
            mark(&mut consumed, &[index, index + 1]);
            kinds[index] = "tag";
            kinds[index + 1] = "tag";
            index += 2;
            continue;
        }
        if current == "EXTENDED" && next == Some("EDITION") {
            parsed.edition = Some("Extended".into());
            mark(&mut consumed, &[index, index + 1]);
            kinds[index] = "tag";
            kinds[index + 1] = "tag";
            index += 2;
            continue;
        } else if current == "EXTENDED" {
            parsed.edition = Some("Extended".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "IMAX" {
            parsed.edition = Some("IMAX".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "UHD" && matches!(next, Some("BLURAY" | "BLU-RAY")) {
            parsed.source = Some("UHD Blu-ray".into());
            mark(&mut consumed, &[index, index + 1]);
            kinds[index] = "tag";
            kinds[index + 1] = "tag";
            index += 2;
            continue;
        } else if matches_any(current, &["BLURAY", "BLU-RAY", "BDRIP"]) && parsed.source.is_none() {
            parsed.source = Some("Blu-ray".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["WEB-DL", "WEBDL"]) {
            parsed.source = Some("WEB-DL".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "WEB" && next == Some("DL") {
            parsed.source = Some("WEB-DL".into());
            mark(&mut consumed, &[index, index + 1]);
            kinds[index] = "tag";
            kinds[index + 1] = "tag";
            index += 2;
            continue;
        } else if current == "WEBRIP" {
            parsed.source = Some("WEBRip".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["HDTV", "DVD"]) {
            parsed.source = Some(if current == "HDTV" { "HDTV" } else { "DVD" }.into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "REMUX" {
            parsed.release_type = Some("REMUX".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(
            current,
            &["4320P", "2160P", "1440P", "1080P", "720P", "576P", "480P"],
        ) {
            parsed.resolution = Some(current.to_ascii_lowercase());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["HEVC", "H265", "H.265", "X265"]) {
            parsed.video_codec = Some("HEVC".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "AV1" {
            parsed.video_codec = Some("AV1".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["H264", "H.264", "X264", "AVC"]) {
            parsed.video_codec = Some("H.264".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["MPEG2", "MPEG-2"]) {
            parsed.video_codec = Some("MPEG-2".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["VC1", "VC-1"]) {
            parsed.video_codec = Some("VC-1".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["10BIT", "10-BIT"]) {
            parsed.bit_depth = Some("10-bit".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["DV", "DOVI", "DOLBYVISION", "DOLBY-VISION"]) {
            parsed.dolby_vision = true;
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "DOLBY" && next == Some("VISION") {
            parsed.dolby_vision = true;
            mark(&mut consumed, &[index, index + 1]);
            kinds[index] = "tag";
            kinds[index + 1] = "tag";
            index += 2;
            continue;
        } else if current == "PROFILE" && has_explicit_dolby_vision {
            if let Some(profile) =
                next.filter(|value| value.chars().all(|character| character.is_ascii_digit()))
            {
                parsed.dolby_vision_profile = Some(format!("Profile {profile}"));
                mark(&mut consumed, &[index, index + 1]);
                kinds[index] = "tag";
                kinds[index + 1] = "tag";
                index += 2;
                continue;
            }
        } else if matches_any(current, &["HDR10+", "HDR10PLUS"]) {
            parsed.hdr = Some("HDR10+".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "HDR10" {
            parsed.hdr = Some("HDR10".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "HDR" {
            parsed.hdr = Some("HDR".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "TRUEHD" {
            parsed.audio_codec = Some("TrueHD".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["DTS-HD", "DTSHD"]) && next == Some("MA") {
            parsed.audio_codec = Some("DTS-HD MA".into());
            mark(&mut consumed, &[index, index + 1]);
            kinds[index] = "tag";
            kinds[index + 1] = "tag";
            index += 2;
            continue;
        } else if current == "DTS" {
            parsed.audio_codec = Some("DTS".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current.starts_with("DDP") || matches_any(current, &["EAC3", "E-AC-3"]) {
            parsed.audio_codec = Some("E-AC-3".into());
            if parsed.channels.is_none() {
                parsed.channels = channel_from_token(current);
            }
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current.starts_with("AC3") || current == "AC-3" {
            parsed.audio_codec = Some("AC-3".into());
            if parsed.channels.is_none() {
                parsed.channels = channel_from_token(current);
            }
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["AAC", "FLAC"]) {
            parsed.audio_codec = Some(current.into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "ATMOS" {
            parsed.spatial_audio = Some("Atmos".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["DTS:X", "DTSX"]) {
            parsed.spatial_audio = Some("DTS:X".into());
            consumed.insert(index);
            kinds[index] = "tag";
        } else if let Some(channels) = channel_from_token(current) {
            parsed.channels = Some(channels);
            consumed.insert(index);
            kinds[index] = "tag";
        } else if current == "SUB" {
            if let Some(language) = next.and_then(known_language) {
                parsed.subtitles.push(language);
                mark(&mut consumed, &[index, index + 1]);
                kinds[index] = "tag";
                kinds[index + 1] = "tag";
                index += 2;
                continue;
            }
        } else if let Some(language) = current.strip_prefix("SUB").and_then(known_language) {
            parsed.subtitles.push(language);
            consumed.insert(index);
            kinds[index] = "tag";
        } else if let Some(language) = known_language(current) {
            parsed.audio_languages.push(language);
            consumed.insert(index);
            kinds[index] = "tag";
        } else if matches_any(current, &["MULTI", "MULTI-AUDIO"]) {
            // "MULTI" is preserved as evidence but cannot name any language reliably.
            consumed.insert(index);
            kinds[index] = "tag";
        }

        index += 1;
    }

    parsed.audio_languages.sort();
    parsed.audio_languages.dedup();
    parsed.subtitles.sort();
    parsed.subtitles.dedup();

    let year_index = raw_tokens
        .iter()
        .position(|token| is_year(&token.normalized).is_some())
        .unwrap_or(raw_tokens.len());
    let mut title_parts = Vec::new();
    for (token_index, token) in raw_tokens.iter().enumerate().take(year_index) {
        if !consumed.contains(&token_index) {
            title_parts.push(token.raw.as_str());
            kinds[token_index] = "title";
        }
    }
    if title_parts.is_empty() {
        for (token_index, token) in raw_tokens.iter().enumerate() {
            if !consumed.contains(&token_index) {
                title_parts.push(token.raw.as_str());
                kinds[token_index] = "title";
            } else if !title_parts.is_empty() {
                break;
            }
        }
    }
    parsed.title = sanitize_windows_title_component(&title_parts.join(" "));
    if parsed.title.is_empty() {
        parsed.title = "Sin título".into();
    }

    if let Some(last_unknown) = raw_tokens
        .iter()
        .enumerate()
        .rev()
        .find(|(token_index, _)| *token_index > year_index && !consumed.contains(token_index))
    {
        parsed.release_group = Some(last_unknown.1.raw.clone());
    }

    parsed.tokens = raw_tokens
        .into_iter()
        .enumerate()
        .map(|(token_index, token)| NamingToken {
            id: format!("filename-{token_index}"),
            label: token.raw,
            source: "filename".into(),
            kind: kinds[token_index].into(),
            edited: false,
        })
        .collect();

    parsed
}

pub fn sanitize_windows_component(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut previous_was_space = false;
    for character in value.chars() {
        let invalid = character.is_control()
            || matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            );
        let replacement = if invalid { ' ' } else { character };
        if replacement.is_whitespace() {
            if !previous_was_space {
                output.push(' ');
            }
            previous_was_space = true;
        } else {
            output.push(replacement);
            previous_was_space = false;
        }
    }
    output.trim().trim_end_matches(['.', ' ']).to_owned()
}

fn sanitize_windows_title_component(value: &str) -> String {
    sanitize_windows_component(&value.replace(':', " - "))
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

pub fn codec_label(codec: &str) -> String {
    match codec.to_ascii_lowercase().as_str() {
        "hevc" | "h265" => "HEVC".into(),
        "h264" | "avc" => "H.264".into(),
        "av1" => "AV1".into(),
        "mpeg2video" => "MPEG-2".into(),
        "vc1" => "VC-1".into(),
        "truehd" => "TrueHD".into(),
        "eac3" => "E-AC-3".into(),
        "ac3" => "AC-3".into(),
        "dts" => "DTS".into(),
        "aac" => "AAC".into(),
        "flac" => "FLAC".into(),
        other => other.to_ascii_uppercase(),
    }
}

#[cfg(test)]
pub fn generate_filename(
    parsed: &ParsedMediaName,
    probe: Option<&ProbeData>,
    include_identifier: Option<i64>,
) -> String {
    let settings = AppSettings {
        include_identifier: include_identifier.is_some(),
        ..AppSettings::default()
    };
    generate_filename_with_settings(parsed, probe, include_identifier, &settings)
}

pub fn generate_filename_with_settings(
    parsed: &ParsedMediaName,
    probe: Option<&ProbeData>,
    tmdb_id: Option<i64>,
    settings: &AppSettings,
) -> String {
    let video = probe.and_then(|data| data.video.as_ref());
    let primary_audio = probe.and_then(|data| {
        data.audio_tracks
            .iter()
            .find(|track| track.is_default && !track.is_commentary)
            .or_else(|| data.audio_tracks.iter().find(|track| !track.is_commentary))
            .or_else(|| data.audio_tracks.iter().find(|track| track.is_default))
            .or_else(|| data.audio_tracks.first())
    });
    let mut grouped = HashMap::<&'static str, Vec<String>>::new();

    let resolution = video
        .and_then(|details| normalized_resolution(details.height))
        .or_else(|| parsed.resolution.clone());
    push_segment(grouped.entry("resolution").or_default(), resolution);
    push_segment(grouped.entry("source").or_default(), parsed.source.clone());
    push_segment(
        grouped.entry("releaseType").or_default(),
        parsed.release_type.clone(),
    );
    push_segment(
        grouped.entry("videoCodec").or_default(),
        video
            .map(|details| codec_label(&details.codec))
            .or_else(|| parsed.video_codec.clone()),
    );
    push_segment(
        grouped.entry("bitDepth").or_default(),
        video
            .and_then(|details| details.bit_depth)
            .filter(|depth| *depth > 8)
            .map(|depth| format!("{depth}-bit"))
            .or_else(|| parsed.bit_depth.clone()),
    );

    let detected_hdr = video.and_then(|details| details.hdr_format.clone());
    let has_dolby_vision = detected_hdr
        .as_deref()
        .is_some_and(|value| value.contains("Dolby Vision"))
        || parsed.dolby_vision;
    if has_dolby_vision {
        grouped
            .entry("dolbyVision")
            .or_default()
            .push("Dolby Vision".into());
        push_segment(
            grouped.entry("dolbyVisionProfile").or_default(),
            video
                .and_then(|details| details.dolby_vision_profile.clone())
                .map(dolby_vision_profile_label)
                .or_else(|| parsed.dolby_vision_profile.clone()),
        );
    }
    let hdr = detected_hdr
        .as_deref()
        .and_then(|value| {
            if value.contains("HDR10+") {
                Some("HDR10+".to_owned())
            } else if value.contains("HDR10") {
                Some("HDR10".to_owned())
            } else if value == "HDR" {
                Some("HDR".to_owned())
            } else {
                None
            }
        })
        .or_else(|| parsed.hdr.clone());
    push_segment(grouped.entry("hdr").or_default(), hdr);

    push_segment(
        grouped.entry("audioCodec").or_default(),
        primary_audio
            .map(|track| codec_label(&track.codec))
            .or_else(|| parsed.audio_codec.clone()),
    );
    let spatial_audio = primary_audio
        .and_then(|track| {
            if track.has_atmos {
                Some("Atmos".to_owned())
            } else if track.has_dts_x {
                Some("DTS:X".to_owned())
            } else {
                None
            }
        })
        .or_else(|| parsed.spatial_audio.clone());
    push_segment(grouped.entry("spatialAudio").or_default(), spatial_audio);
    push_segment(
        grouped.entry("channels").or_default(),
        primary_audio
            .and_then(|track| channels_label(track.channels, track.channel_layout.as_deref()))
            .or_else(|| parsed.channels.clone()),
    );

    let mut audio_languages = probe
        .map(|data| {
            data.audio_tracks
                .iter()
                .filter_map(|track| track.language.as_deref().and_then(known_language))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    audio_languages.extend(parsed.audio_languages.clone());
    audio_languages.sort();
    audio_languages.dedup();
    grouped.insert("audioLanguages", audio_languages);

    let mut subtitles = probe
        .map(|data| {
            data.subtitle_tracks
                .iter()
                .filter_map(|track| track.language.as_deref().and_then(known_language))
                .map(|language| format!("SUB {language}"))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    subtitles.extend(
        parsed
            .subtitles
            .iter()
            .map(|language| format!("SUB {language}")),
    );
    subtitles.sort();
    subtitles.dedup();
    grouped.insert("subtitles", subtitles);
    push_segment(
        grouped.entry("edition").or_default(),
        parsed.edition.clone(),
    );
    if settings.include_identifier {
        if let Some(identifier) = tmdb_id {
            grouped
                .entry("identifier")
                .or_default()
                .push(format!("ID-{identifier}"));
        }
    }

    let title = sanitize_windows_title_component(&parsed.title);
    let enabled = settings
        .enabled_tags
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut ordered_tags = Vec::new();
    let mut seen_kinds = HashSet::new();
    let mut seen_values = HashSet::new();
    for kind in settings
        .tag_order
        .iter()
        .map(String::as_str)
        .chain(NAMING_TAG_IDS.iter().copied())
    {
        if !seen_kinds.insert(kind) || !enabled.contains(kind) {
            continue;
        }
        for value in grouped.get(kind).into_iter().flatten() {
            let value = sanitize_windows_component(value);
            if !value.is_empty() && seen_values.insert(value.clone()) {
                ordered_tags.push(value);
            }
        }
    }
    let tags = ordered_tags
        .iter()
        .map(|tag| format!("[{tag}]"))
        .collect::<Vec<_>>()
        .join(" ");
    let template = if settings.naming_template.trim().is_empty() {
        "{title} ({year}) {tags}"
    } else {
        settings.naming_template.trim()
    };
    let year = parsed
        .year
        .map(|value| value.to_string())
        .unwrap_or_default();
    let rendered = template
        .replace("{title}", &title)
        .replace("{year}", &year)
        .replace("{tags}", &tags)
        .replace("()", "")
        .replace("( )", "");
    let mut filename = sanitize_windows_component(&rendered);
    if filename.is_empty() {
        filename = title;
    }
    if !parsed.extension.is_empty() {
        filename.push('.');
        filename.push_str(&parsed.extension.to_ascii_lowercase());
    }
    filename
}

fn push_segment(segments: &mut Vec<String>, value: Option<String>) {
    if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
        if !segments.contains(&value) {
            segments.push(value);
        }
    }
}

fn channels_label(channels: Option<i64>, layout: Option<&str>) -> Option<String> {
    let layout = layout.unwrap_or_default().to_ascii_lowercase();
    if layout.contains("7.1") || channels == Some(8) {
        Some("7.1".into())
    } else if layout.contains("5.1") || channels == Some(6) {
        Some("5.1".into())
    } else if channels == Some(2) {
        Some("2.0".into())
    } else if channels == Some(1) {
        Some("1.0".into())
    } else {
        None
    }
}

fn dolby_vision_profile_label(profile: String) -> String {
    if profile.to_ascii_lowercase().starts_with("profile ") {
        profile
    } else {
        format!("Profile {profile}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_dune_without_inventing_languages() {
        let parsed = parse_filename(Path::new(
            "Dune.Part.Two.2024.MULTi.2160p.UHD.BluRay.REMUX.DV.HDR10.TrueHD.Atmos.7.1.mkv",
        ));
        assert_eq!(parsed.title, "Dune Part Two");
        assert_eq!(parsed.year, Some(2024));
        assert_eq!(parsed.source.as_deref(), Some("UHD Blu-ray"));
        assert!(parsed.dolby_vision);
        assert_eq!(parsed.spatial_audio.as_deref(), Some("Atmos"));
        assert!(parsed.audio_languages.is_empty());
        assert_eq!(
            generate_filename(&parsed, None, None),
            "Dune Part Two (2024) [2160p] [UHD Blu-ray] [REMUX] [Dolby Vision] [HDR10] [TrueHD] [Atmos] [7.1].mkv"
        );
    }

    #[test]
    fn replaces_title_colons_with_a_readable_windows_safe_separator() {
        assert_eq!(
            sanitize_windows_title_component("Dune: Parte dos"),
            "Dune - Parte dos"
        );
        assert_eq!(sanitize_windows_component("DTS:X"), "DTS X");
    }

    #[test]
    fn generation_honors_template_enabled_tags_order_and_identifier_setting() {
        let parsed = parse_filename(Path::new(
            "Dune.Part.Two.2024.2160p.UHD.BluRay.TrueHD.HDR10.mkv",
        ));
        let settings = AppSettings {
            naming_template: "{title} - {tags} ({year})".into(),
            include_identifier: true,
            tag_order: vec!["audioCodec".into(), "resolution".into()],
            enabled_tags: vec![
                "audioCodec".into(),
                "resolution".into(),
                "identifier".into(),
            ],
            ..AppSettings::default()
        };

        assert_eq!(
            generate_filename_with_settings(&parsed, None, Some(693_134), &settings),
            "Dune Part Two - [TrueHD] [2160p] [ID-693134] (2024).mkv"
        );
    }

    #[test]
    fn generation_prefers_the_default_non_commentary_audio_track() {
        let parsed = parse_filename(Path::new("Movie.2024.1080p.mkv"));
        let probe = ProbeData {
            audio_tracks: vec![
                crate::models::AudioTrack {
                    index: 1,
                    language: Some("eng".into()),
                    title: None,
                    codec: "aac".into(),
                    profile: None,
                    channels: Some(2),
                    channel_layout: Some("stereo".into()),
                    bitrate: None,
                    has_atmos: false,
                    has_dts_x: false,
                    is_default: false,
                    is_commentary: false,
                },
                crate::models::AudioTrack {
                    index: 2,
                    language: Some("spa".into()),
                    title: None,
                    codec: "truehd".into(),
                    profile: None,
                    channels: Some(8),
                    channel_layout: Some("7.1".into()),
                    bitrate: None,
                    has_atmos: true,
                    has_dts_x: false,
                    is_default: true,
                    is_commentary: false,
                },
            ],
            ..ProbeData::default()
        };

        let generated = generate_filename(&parsed, Some(&probe), None);
        assert!(generated.contains("[TrueHD] [Atmos] [7.1]"));
        assert!(!generated.contains("[AAC]"));
        assert!(!generated.contains("[2.0]"));
    }

    #[test]
    fn generation_uses_dolby_vision_profile_detected_by_ffprobe() {
        let parsed = parse_filename(Path::new("Movie.2024.2160p.mkv"));
        let probe = ProbeData {
            video: Some(crate::models::VideoDetails {
                codec: "hevc".into(),
                height: Some(2160),
                hdr_format: Some("Dolby Vision".into()),
                dolby_vision_profile: Some("8".into()),
                ..crate::models::VideoDetails::default()
            }),
            ..ProbeData::default()
        };
        let generated = generate_filename(&parsed, Some(&probe), None);
        assert!(generated.contains("[Dolby Vision] [Profile 8]"));
    }

    #[test]
    fn parses_oppenheimer_and_does_not_upgrade_hdr() {
        let parsed = parse_filename(Path::new(
            "Oppenheimer.2023.IMAX.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.HEVC.mkv",
        ));
        assert_eq!(parsed.title, "Oppenheimer");
        assert_eq!(parsed.edition.as_deref(), Some("IMAX"));
        assert_eq!(parsed.audio_codec.as_deref(), Some("E-AC-3"));
        assert_eq!(parsed.channels.as_deref(), Some("5.1"));
        assert_eq!(parsed.hdr.as_deref(), Some("HDR"));
    }

    #[test]
    fn parses_dts_hd_ma_as_one_feature() {
        let parsed = parse_filename(Path::new(
            "The.Killer.2023.1080p.BluRay.x264.DTS-HD.MA.5.1.mkv",
        ));
        assert_eq!(parsed.title, "The Killer");
        assert_eq!(parsed.video_codec.as_deref(), Some("H.264"));
        assert_eq!(parsed.audio_codec.as_deref(), Some("DTS-HD MA"));
        assert!(!parsed.dolby_vision);
        assert!(parsed.spatial_audio.is_none());
    }

    #[test]
    fn preserves_directors_cut_before_year() {
        let parsed = parse_filename(Path::new(
            "Alien.Directors.Cut.1979.2160p.UHD.BluRay.REMUX.HDR10.HEVC.TrueHD.7.1.mkv",
        ));
        assert_eq!(parsed.title, "Alien");
        assert_eq!(parsed.edition.as_deref(), Some("Director's Cut"));
        let generated = generate_filename(&parsed, None, None);
        assert!(generated.contains("[Director's Cut]"));
        assert!(!generated.contains("[]"));
        assert!(!generated.chars().any(|character| matches!(
            character,
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
        )));
    }

    #[test]
    fn profile_without_dolby_vision_remains_title_evidence() {
        let project = parse_filename(Path::new("Project.P8.2024.1080p.mkv"));
        assert_eq!(project.title, "Project P8");
        assert!(project.dolby_vision_profile.is_none());
        assert!(!project.dolby_vision);

        let movie = parse_filename(Path::new("Movie.Profile.8.2024.1080p.mkv"));
        assert_eq!(movie.title, "Movie Profile 8");
        assert!(movie.dolby_vision_profile.is_none());
    }

    #[test]
    fn consumes_extended_edition_as_one_edition() {
        let parsed = parse_filename(Path::new("Blade.Runner.Extended.Edition.1982.1080p.mkv"));
        assert_eq!(parsed.title, "Blade Runner");
        assert_eq!(parsed.edition.as_deref(), Some("Extended"));
    }
}
