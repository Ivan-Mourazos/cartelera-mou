import {
  generateMediaFilename,
  parseMediaFilename,
  type AudioCodec,
  type HdrFormat,
  type MediaNamingInput,
  type MediaSource,
  type MetadataField,
  type NamingTagKind,
  type ParsedFilename,
  type ReleaseType,
  type Resolution,
  type SpatialAudio,
  type SpecialEdition,
  type VideoCodec,
} from "../domain";

import type { AppSettings, NamingTag, NamingToken, ScanItem, TmdbCandidate } from "./types";

const RESOLUTIONS: readonly Resolution[] = [
  "4320p",
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "576p",
  "480p",
];
const SOURCES: readonly MediaSource[] = [
  "UHD Blu-ray",
  "Blu-ray",
  "WEB-DL",
  "WEBRip",
  "HDTV",
  "DVD",
];
const RELEASE_TYPES: readonly ReleaseType[] = ["REMUX"];
const VIDEO_CODECS: readonly VideoCodec[] = ["HEVC", "AV1", "H.264", "MPEG-2", "VC-1"];
const HDR_FORMATS: readonly HdrFormat[] = ["HDR", "HDR10", "HDR10+"];
const AUDIO_CODECS: readonly AudioCodec[] = [
  "TrueHD",
  "DTS-HD MA",
  "DTS",
  "E-AC-3",
  "AC-3",
  "AAC",
  "FLAC",
];
const SPATIAL_AUDIO: readonly SpatialAudio[] = ["Atmos", "DTS:X"];
const EDITIONS: readonly SpecialEdition[] = ["IMAX", "Extended", "Director's Cut"];

const DOMAIN_TAG_BY_SETTING: Record<NamingTag, NamingTagKind> = {
  resolution: "resolution",
  source: "source",
  releaseType: "releaseType",
  videoCodec: "videoCodec",
  bitDepth: "bitDepth",
  dolbyVision: "dolbyVision",
  dolbyVisionProfile: "dolbyVisionProfile",
  hdr: "hdr",
  audioCodec: "audioCodec",
  spatialAudio: "spatialAudio",
  channels: "channels",
  audioLanguages: "audioLanguage",
  subtitles: "subtitleLanguage",
  edition: "edition",
  identifier: "identifier",
};

function isMember<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}

function normalizedResolution(value: string | null | undefined): Resolution | undefined {
  return RESOLUTIONS.find((resolution) => resolution.toLowerCase() === value?.toLowerCase());
}

function normalizedSource(value: string | null | undefined): MediaSource | undefined {
  if (!value) return undefined;
  const compact = value.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
  if (compact.includes("uhdbluray")) return "UHD Blu-ray";
  if (compact.includes("bluray")) return "Blu-ray";
  if (compact.includes("webdl")) return "WEB-DL";
  if (compact.includes("webrip")) return "WEBRip";
  if (compact.includes("hdtv")) return "HDTV";
  if (compact.includes("dvd")) return "DVD";
  return undefined;
}

function normalizedReleaseType(value: string | null | undefined): ReleaseType | undefined {
  return value?.toUpperCase().includes("REMUX") ? "REMUX" : undefined;
}

function normalizedVideoCodec(value: string | null | undefined): VideoCodec | undefined {
  if (!value) return undefined;
  const compact = value.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
  if (["hevc", "h265", "x265"].includes(compact)) return "HEVC";
  if (["h264", "avc", "x264"].includes(compact)) return "H.264";
  if (compact === "av1") return "AV1";
  if (compact === "mpeg2" || compact === "mpeg2video") return "MPEG-2";
  if (compact === "vc1") return "VC-1";
  return undefined;
}

function normalizedAudioCodec(value: string | null | undefined): AudioCodec | undefined {
  if (!value) return undefined;
  const compact = value.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
  if (compact.includes("truehd")) return "TrueHD";
  if (compact.includes("dtshdma") || compact.includes("dtshdmasteraudio")) return "DTS-HD MA";
  if (compact === "dts") return "DTS";
  if (compact === "eac3" || compact.includes("dolbydigitalplus")) return "E-AC-3";
  if (compact === "ac3" || compact.includes("dolbydigital")) return "AC-3";
  if (compact === "aac") return "AAC";
  if (compact === "flac") return "FLAC";
  return undefined;
}

function hdrFormatsFromScan(value: string | null | undefined): HdrFormat[] {
  if (!value) return [];
  const normalized = value.toUpperCase();
  if (normalized.includes("HDR10+")) return ["HDR10+"];
  if (normalized.includes("HDR10")) return ["HDR10"];
  if (normalized.includes("HDR")) return ["HDR"];
  return [];
}

function channelsFromScan(item: ScanItem): string | undefined {
  const primary =
    item.audioTracks.find((track) => track.isDefault && !track.isCommentary) ??
    item.audioTracks.find((track) => !track.isCommentary) ??
    item.audioTracks[0];
  if (!primary) return undefined;
  if (primary.channelLayout?.trim()) return primary.channelLayout.trim();
  if (primary.channels === 8) return "7.1";
  if (primary.channels === 6) return "5.1";
  if (primary.channels === 2) return "2.0";
  return primary.channels === null ? undefined : String(primary.channels);
}

const ISO_639_TO_NAMING_LANGUAGE: Readonly<Record<string, string>> = {
  cat: "CA",
  chi: "ZH",
  deu: "DE",
  eng: "EN",
  fre: "FR",
  fra: "FR",
  ger: "DE",
  ita: "IT",
  jpn: "JA",
  kor: "KO",
  por: "PT",
  rus: "RU",
  spa: "ES",
  zho: "ZH",
};

function normalizedLanguage(value: string | null | undefined): string | undefined {
  const compact = value?.trim().toLowerCase();
  if (!compact) return undefined;
  return ISO_639_TO_NAMING_LANGUAGE[compact] ?? compact.toUpperCase();
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return [
    ...new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)),
    ),
  ];
}

function valuesFor(parsed: ParsedFilename, field: MetadataField): unknown[] {
  return parsed.evidence
    .filter((evidence) => evidence.field === field)
    .map((evidence) => evidence.value);
}

function firstString(parsed: ParsedFilename, field: MetadataField): string | undefined {
  return valuesFor(parsed, field).find((value): value is string => typeof value === "string");
}

function firstNumber(parsed: ParsedFilename, field: MetadataField): number | undefined {
  return valuesFor(parsed, field).find((value): value is number => typeof value === "number");
}

function tokenSourceForTag(tag: string): NamingToken["source"] {
  if (/UHD|Blu-ray|WEB|REMUX|IMAX|Extended|Director/iu.test(tag)) return "filename";
  return "ffprobe";
}

function uiTokens(
  title: string,
  year: number | undefined,
  tags: readonly string[],
  extension: string,
  localizedTitle: boolean,
): NamingToken[] {
  const tokens: NamingToken[] = [
    {
      id: "title",
      label: title,
      source: localizedTitle ? "tmdb" : "filename",
      kind: "title",
      edited: false,
    },
  ];
  if (year !== undefined) {
    tokens.push({
      id: "year",
      label: `(${year})`,
      source: "filename",
      kind: "year",
      edited: false,
    });
  }
  tags.forEach((tag, index) => {
    const label = tag.startsWith("[") ? tag : `[${tag}]`;
    tokens.push({
      id: `tag-${index}`,
      label,
      source: tokenSourceForTag(tag),
      kind: "tag",
      edited: false,
    });
  });
  tokens.push({
    id: "extension",
    label: extension.startsWith(".") ? extension : `.${extension}`,
    source: "filename",
    kind: "extension",
    edited: false,
  });
  return tokens;
}

interface NamingOverrides {
  localizedTitle?: string;
  year?: number;
  tmdbId?: number;
  includeIdentifier?: boolean;
  tagOrder?: readonly NamingTag[];
  enabledTags?: readonly NamingTag[];
  namingTemplate?: string;
  scanItem?: ScanItem;
}

export function analyzeAndGenerateFilename(filename: string, overrides: NamingOverrides = {}) {
  const parsed = parseMediaFilename(filename);
  const scanItem = overrides.scanItem;
  const resolutionValue =
    normalizedResolution(scanItem?.resolution) ?? firstString(parsed, "resolution");
  const sourceValue = normalizedSource(scanItem?.source) ?? firstString(parsed, "mediaSource");
  const releaseTypeValue =
    normalizedReleaseType(scanItem?.releaseType) ?? firstString(parsed, "releaseType");
  const videoCodecValue =
    normalizedVideoCodec(scanItem?.video?.codec) ?? firstString(parsed, "videoCodec");
  const primaryAudio =
    scanItem?.audioTracks.find((track) => track.isDefault && !track.isCommentary) ??
    scanItem?.audioTracks.find((track) => !track.isCommentary) ??
    scanItem?.audioTracks[0];
  const audioCodecValue =
    normalizedAudioCodec(primaryAudio?.codec) ?? firstString(parsed, "audioCodec");
  const spatialAudioValue = primaryAudio?.hasAtmos
    ? "Atmos"
    : primaryAudio?.hasDtsX
      ? "DTS:X"
      : firstString(parsed, "spatialAudio");
  const parsedHdrFormats = valuesFor(parsed, "hdrFormat").filter((value): value is HdrFormat =>
    isMember(value, HDR_FORMATS),
  );
  const hdrFormats = [
    ...new Set([...hdrFormatsFromScan(scanItem?.video?.hdrFormat), ...parsedHdrFormats]),
  ];
  const audioLanguages = uniqueStrings([
    ...(scanItem?.audioTracks.map((track) => normalizedLanguage(track.language)) ?? []),
    ...valuesFor(parsed, "audioLanguage").filter(
      (value): value is string => typeof value === "string",
    ),
  ]);
  const subtitleLanguages = uniqueStrings([
    ...(scanItem?.subtitleTracks.map((track) => normalizedLanguage(track.language)) ?? []),
    ...valuesFor(parsed, "subtitleLanguage").filter(
      (value): value is string => typeof value === "string",
    ),
  ]);
  const editions = valuesFor(parsed, "edition").filter((value): value is SpecialEdition =>
    isMember(value, EDITIONS),
  );
  const parsedDolbyVision = valuesFor(parsed, "dolbyVision").find(
    (value): value is boolean => typeof value === "boolean",
  );
  const dolbyVisionValue =
    scanItem?.video?.hdrFormat?.toLowerCase().includes("dolby vision") === true ||
    parsedDolbyVision === true;
  const bitDepth = scanItem?.video?.bitDepth ?? firstNumber(parsed, "bitDepth");
  const detectedDolbyVisionProfile = scanItem?.video?.dolbyVisionProfile?.trim();
  const dolbyVisionProfile = detectedDolbyVisionProfile
    ? detectedDolbyVisionProfile.toLocaleLowerCase("en-US").startsWith("profile ")
      ? detectedDolbyVisionProfile
      : `Profile ${detectedDolbyVisionProfile}`
    : firstString(parsed, "dolbyVisionProfile");
  const channels =
    (scanItem ? channelsFromScan(scanItem) : undefined) ?? firstString(parsed, "channels");

  const input: MediaNamingInput = {
    title: overrides.localizedTitle ?? parsed.probableTitle,
    extension: parsed.extension,
    ...((overrides.year ?? parsed.year) === undefined
      ? {}
      : { year: overrides.year ?? parsed.year }),
    ...(isMember(resolutionValue, RESOLUTIONS) ? { resolution: resolutionValue } : {}),
    ...(isMember(sourceValue, SOURCES) ? { source: sourceValue } : {}),
    ...(isMember(releaseTypeValue, RELEASE_TYPES) ? { releaseType: releaseTypeValue } : {}),
    ...(isMember(videoCodecValue, VIDEO_CODECS) ? { videoCodec: videoCodecValue } : {}),
    ...(bitDepth === undefined ? {} : { bitDepth }),
    dolbyVision: dolbyVisionValue,
    ...(dolbyVisionProfile === undefined ? {} : { dolbyVisionProfile }),
    ...(hdrFormats.length === 0 ? {} : { hdrFormats }),
    ...(isMember(audioCodecValue, AUDIO_CODECS) ? { audioCodec: audioCodecValue } : {}),
    ...(isMember(spatialAudioValue, SPATIAL_AUDIO) ? { spatialAudio: spatialAudioValue } : {}),
    ...(channels === undefined ? {} : { channels }),
    ...(audioLanguages.length === 0 ? {} : { audioLanguages }),
    ...(subtitleLanguages.length === 0 ? {} : { subtitleLanguages }),
    ...(editions.length === 0 ? {} : { editions }),
    ...(overrides.tmdbId === undefined ? {} : { tmdbId: overrides.tmdbId }),
  };
  const generated = generateMediaFilename(input, {
    includeIdentifier: overrides.includeIdentifier ?? false,
    ...(overrides.tagOrder === undefined
      ? {}
      : { tagOrder: overrides.tagOrder.map((tag) => DOMAIN_TAG_BY_SETTING[tag]) }),
    ...(overrides.enabledTags === undefined
      ? {}
      : { enabledTags: overrides.enabledTags.map((tag) => DOMAIN_TAG_BY_SETTING[tag]) }),
    ...(overrides.namingTemplate === undefined ? {} : { template: overrides.namingTemplate }),
  });
  const title = overrides.localizedTitle ?? parsed.probableTitle;
  const year = overrides.year ?? parsed.year;
  return {
    parsed,
    generated,
    tokens: uiTokens(
      title,
      year,
      generated.tags,
      parsed.extension,
      overrides.localizedTitle !== undefined,
    ),
  };
}

export function generateCandidateFilename(
  item: ScanItem,
  candidate: TmdbCandidate,
  settings: AppSettings,
) {
  return analyzeAndGenerateFilename(item.originalFilename, {
    localizedTitle: candidate.title,
    ...(candidate.year === null ? {} : { year: candidate.year }),
    tmdbId: candidate.tmdbId,
    includeIdentifier: settings.includeIdentifier,
    tagOrder: settings.tagOrder,
    enabledTags: settings.enabledTags,
    namingTemplate: settings.namingTemplate,
    scanItem: item,
  });
}
