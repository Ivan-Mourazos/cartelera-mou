/**
 * Real metadata extraction from media files using mediainfo.js (WebAssembly).
 *
 * Reads actual binary headers of the file to determine resolution,
 * codecs, audio tracks, HDR info, languages, etc.
 */

import MediaInfoFactory from "mediainfo.js";
import wasmUrl from "mediainfo.js/MediaInfoModule.wasm?url";

import type { DetectedTag } from "./renamer-types";

// ── MediaInfo types ─────────────────────────────────────────────────────

interface MediaInfoInstance {
  analyzeData: (
    fileSize: number,
    readChunk: (chunkSize: number, offset: number) => Promise<Uint8Array>,
  ) => Promise<MediaInfoResult>;
  close?: () => void;
}

interface MediaInfoResult {
  media?: {
    track: MediaInfoTrack[];
  };
}

interface MediaInfoTrack {
  "@type": string;
  Format?: string;
  Format_Commercial?: string;
  Format_Profile?: string;
  Width?: number | string;
  Height?: number | string;
  BitDepth?: number | string;
  HDR_Format?: string;
  HDR_Format_Compatibility?: string;
  colour_primaries?: string;
  transfer_characteristics?: string;
  Channels?: string;
  ChannelLayout?: string;
  Language?: string;
  Title?: string;
  ScanType?: string;
}

let miInstancePromise: Promise<MediaInfoInstance> | null = null;

export async function getMediaInfoInstance(): Promise<MediaInfoInstance> {
  miInstancePromise ??= (async () => {
    return (await MediaInfoFactory({
      format: "object",
      locateFile: () => wasmUrl,
    })) as unknown as MediaInfoInstance;
  })();
  return miInstancePromise;
}

// ── Resolution helpers ──────────────────────────────────────────────────

function heightToLabel(h: number): string {
  if (h >= 2100) return "2160p";
  if (h >= 1400) return "1440p";
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 560) return "576p";
  if (h >= 460) return "480p";
  return `${h}p`;
}

// ── Codec normalisation ─────────────────────────────────────────────────

function normalizeVideoCodec(format: string | undefined): string | undefined {
  if (!format) return undefined;
  const f = format.toUpperCase();
  if (f === "HEVC" || f === "H.265" || f.includes("265")) return "HEVC";
  if (f === "AVC" || f === "H.264" || f.includes("264")) return "H.264";
  if (f === "AV1") return "AV1";
  if (f === "VP9") return "VP9";
  if (f.includes("MPEG-2") || f === "MPEG VIDEO") return "MPEG-2";
  if (f === "VC-1") return "VC-1";
  return format;
}

function normalizeAudioCodec(format: string | undefined): string | undefined {
  if (!format) return undefined;
  const f = format.toUpperCase();
  if (f === "MLP FBA" || f.includes("TRUEHD")) return "TrueHD";
  if (f === "DTS" && format.includes("XLL")) return "DTS-HD MA";
  if (f === "DTS") return "DTS";
  if (f === "AC-3" || f === "AC3") return "AC-3";
  if (f === "E-AC-3" || f === "EAC3") return "E-AC-3";
  if (f === "AAC" || f.includes("AAC")) return "AAC";
  if (f === "FLAC") return "FLAC";
  if (f === "OPUS") return "Opus";
  if (f === "PCM" || f.includes("PCM")) return "PCM";
  if (f === "VORBIS") return "Vorbis";
  if (f === "MPEG AUDIO" || f === "MP3") return "MP3";
  return format;
}

function channelsToLabel(channels: string | undefined): string | undefined {
  if (!channels) return undefined;
  const n = parseInt(channels, 10);
  if (Number.isNaN(n)) return channels;
  if (n >= 8) return "7.1";
  if (n >= 6) return "5.1";
  if (n >= 2) return "2.0";
  if (n === 1) return "1.0";
  return channels;
}

function languageToLabel(lang: string | undefined): string | undefined {
  if (!lang) return undefined;
  const l = lang.toLowerCase().trim();
  if (
    l.startsWith("es") ||
    l.startsWith("spa") ||
    l.includes("castellano") ||
    l.includes("español")
  )
    return "ES";
  if (
    l.startsWith("en") ||
    l.startsWith("eng") ||
    l.includes("english") ||
    l.includes("inglés") ||
    l.includes("ingles")
  )
    return "EN";
  if (
    l.startsWith("fr") ||
    l.startsWith("fre") ||
    l.includes("french") ||
    l.includes("francés") ||
    l.includes("frances")
  )
    return "FR";
  if (
    l.startsWith("de") ||
    l.startsWith("ger") ||
    l.startsWith("deu") ||
    l.includes("german") ||
    l.includes("alemán") ||
    l.includes("aleman")
  )
    return "DE";
  if (l.startsWith("it") || l.startsWith("ita") || l.includes("italian") || l.includes("italiano"))
    return "IT";
  if (
    l.startsWith("pt") ||
    l.startsWith("por") ||
    l.includes("portuguese") ||
    l.includes("portugués") ||
    l.includes("portugues")
  )
    return "PT";
  if (
    l.startsWith("ja") ||
    l.startsWith("jpn") ||
    l.includes("japanese") ||
    l.includes("japonés") ||
    l.includes("japones")
  )
    return "JA";
  if (l.startsWith("ko") || l.startsWith("kor") || l.includes("korean") || l.includes("coreano"))
    return "KO";
  if (
    l.startsWith("zh") ||
    l.startsWith("chi") ||
    l.startsWith("zho") ||
    l.includes("chinese") ||
    l.includes("chino")
  )
    return "ZH";
  if (l.startsWith("gl") || l.startsWith("glg") || l.includes("galician") || l.includes("gallego"))
    return "GAL";
  if (l.startsWith("ca") || l.startsWith("cat") || l.includes("catalan") || l.includes("catalán"))
    return "CAT";
  if (
    l.startsWith("eu") ||
    l.startsWith("eus") ||
    l.startsWith("baq") ||
    l.includes("basque") ||
    l.includes("euskera")
  )
    return "EUS";
  return lang
    .toUpperCase()
    .replace(/[^A-Z]/gu, "")
    .slice(0, 3);
}

// ── Main extraction function ────────────────────────────────────────────

export async function extractRealMetadata(file: File): Promise<DetectedTag[]> {
  const mi = await getMediaInfoInstance();
  const tags: DetectedTag[] = [];
  const seenLabels = new Set<string>();

  const addTag = (id: string, label: string, kind: string, active: boolean) => {
    const trimmed = label.trim();
    if (!trimmed || seenLabels.has(trimmed)) return;
    seenLabels.add(trimmed);
    tags.push({ id, label: trimmed, kind, active });
  };

  try {
    const result = await mi.analyzeData(file.size, async (chunkSize, offset) => {
      const blob = file.slice(offset, offset + chunkSize);
      return new Uint8Array(await blob.arrayBuffer());
    });

    if (!result.media?.track) return tags;

    const tracks = result.media.track;

    // ── Video tracks ──────────────────────────────────────────────

    const videoTracks = tracks.filter((t) => t["@type"] === "Video");
    for (const vt of videoTracks) {
      // Resolution
      const height = typeof vt.Height === "string" ? parseInt(vt.Height, 10) : vt.Height;
      if (height && !Number.isNaN(height)) {
        addTag(`real-res-${height}`, heightToLabel(height), "resolution", true);
      }

      // Video Codec
      const codec = normalizeVideoCodec(vt.Format);
      if (codec) {
        addTag(`real-videoCodec-${codec}`, codec, "video-codec", true);
      }

      // Bit Depth
      const bitDepth = typeof vt.BitDepth === "string" ? parseInt(vt.BitDepth, 10) : vt.BitDepth;
      if (bitDepth && !Number.isNaN(bitDepth) && bitDepth >= 10) {
        addTag(`real-bitDepth-${bitDepth}`, `${bitDepth}-bit`, "video-codec", false);
      }

      // HDR / Dolby Vision
      const hdrFormat = vt.HDR_Format ?? "";
      const hdrCompat = vt.HDR_Format_Compatibility ?? "";
      const transfer = vt.transfer_characteristics ?? "";

      if (hdrFormat.includes("Dolby Vision")) {
        addTag("real-dolbyVision", "Dolby Vision", "hdr", true);
      }
      if (hdrFormat.includes("SMPTE ST 2094") || hdrCompat.includes("HDR10+")) {
        addTag("real-hdr10plus", "HDR10+", "hdr", true);
      }
      if (
        hdrFormat.includes("SMPTE ST 2086") ||
        hdrCompat.includes("HDR10") ||
        transfer.includes("PQ")
      ) {
        addTag("real-hdr10", "HDR10", "hdr", true);
      }
      if (transfer.includes("HLG")) {
        addTag("real-hlg", "HLG", "hdr", true);
      }
    }

    // ── Audio tracks ──────────────────────────────────────────────

    const audioTracks = tracks.filter((t) => t["@type"] === "Audio");
    const seenAudioCodecs = new Set<string>();
    const seenAudioLangs = new Set<string>();

    for (const at of audioTracks) {
      // Audio Codec
      const audioCodec = normalizeAudioCodec(at.Format);
      if (audioCodec && !seenAudioCodecs.has(audioCodec)) {
        seenAudioCodecs.add(audioCodec);
        addTag(`real-audioCodec-${audioCodec}`, audioCodec, "audio-codec", true);
      }

      // Spatial Audio
      const commercial = at.Format_Commercial ?? "";
      if (commercial.includes("Atmos")) {
        addTag("real-atmos", "Atmos", "spatial-audio", true);
      }
      if (commercial.includes("DTS:X")) {
        addTag("real-dtsx", "DTS:X", "spatial-audio", true);
      }

      // Channels (from the primary audio track)
      if (at.Channels && tags.every((t) => t.kind !== "channels")) {
        const chLabel = channelsToLabel(at.Channels);
        if (chLabel) {
          addTag(`real-channels-${chLabel}`, chLabel, "channels", true);
        }
      }

      // Audio Language
      const lang = languageToLabel(at.Language);
      if (lang && !seenAudioLangs.has(lang)) {
        seenAudioLangs.add(lang);
        addTag(`real-audioLang-${lang}`, lang, "language", true);
      }
    }

    // ── Subtitle tracks ───────────────────────────────────────────

    const textTracks = tracks.filter((t) => t["@type"] === "Text");
    const seenSubLangs = new Set<string>();

    for (const tt of textTracks) {
      const lang = languageToLabel(tt.Language);
      if (lang && !seenSubLangs.has(lang)) {
        seenSubLangs.add(lang);
        addTag(`real-subLang-${lang}`, `subs ${lang}`, "language", false);
      }
    }
  } catch (err) {
    console.warn("MediaInfo analysis failed for", file.name, err);
  }

  return tags;
}
