import {
  parseMediaFilename,
  sanitizeWindowsFilenameComponent,
  validateWindowsFilename,
} from "../domain";
import type { DetectedTag, RenamerItem } from "./renamer-types";

const MINOR_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "but",
  "or",
  "for",
  "nor",
  "on",
  "at",
  "to",
  "from",
  "by",
  "of",
  "in",
  "de",
  "del",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "y",
  "e",
  "o",
  "u",
  "en",
  "con",
  "por",
  "para",
]);

export function toTitleCase(title: string): string {
  if (!title) return "";
  const clean = title.trim().replace(/\s+/gu, " ");

  const words = clean.split(" ");
  const formatted = words.map((word, index) => {
    const lower = word.toLowerCase();

    // Preserve Roman numerals (I, II, III, IV, V, VI, VII, VIII, IX, X, etc.)
    if (/^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/iu.test(word)) {
      return word.toUpperCase();
    }

    // First and last words are always capitalized
    if (index === 0 || index === words.length - 1) {
      return capitalizeWord(word);
    }

    // Minor connector words stay lowercase
    if (MINOR_WORDS.has(lower)) {
      return lower;
    }

    return capitalizeWord(word);
  });

  return formatted.join(" ");
}

function capitalizeWord(word: string): string {
  if (!word) return "";
  // Handle hyphenated words like "Spider-Man"
  if (word.includes("-")) {
    return word
      .split("-")
      .map((part) => capitalizeWord(part))
      .join("-");
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function extractTagsFromParsed(
  parsed: ReturnType<typeof parseMediaFilename>,
): DetectedTag[] {
  const tags: DetectedTag[] = [];
  const seenLabels = new Set<string>();

  const addTag = (id: string, label: string, kind: string, active: boolean) => {
    const trimmed = label.trim();
    if (!trimmed || seenLabels.has(trimmed)) return;
    seenLabels.add(trimmed);
    tags.push({ id, label: trimmed, kind, active });
  };

  const getEvidenceValues = (field: string): string[] => {
    return parsed.evidence.filter((e) => (e.field as string) === field).map((e) => String(e.value));
  };

  // 0. Season / Episode (S01E05, S01E05-E06, 1x05, E05)
  for (const ep of getEvidenceValues("seasonEpisode")) {
    addTag(`ep-${ep}`, ep, "episode", true);
  }

  // 1. Edition (IMAX, Director's Cut, Extended)
  for (const ed of getEvidenceValues("edition")) {
    addTag(`edition-${ed}`, ed, "edition", true);
  }

  // 2. Resolution (2160p, 1080p, 720p)
  for (const res of getEvidenceValues("resolution")) {
    addTag(`res-${res}`, res, "resolution", true);
  }

  // 3. Media Source (UHD Blu-ray, Blu-ray, WEB-DL, WEBRip, HDTV, DVD)
  for (const src of getEvidenceValues("mediaSource")) {
    addTag(`source-${src}`, src, "source", true);
  }

  // 4. Release Type (REMUX)
  for (const rel of getEvidenceValues("releaseType")) {
    addTag(`releaseType-${rel}`, rel, "release-type", true);
  }

  // 5. Video Codec (HEVC, H.264, AV1)
  for (const vc of getEvidenceValues("videoCodec")) {
    addTag(`videoCodec-${vc}`, vc, "video-codec", true);
  }

  // 6. Dolby Vision
  for (const dv of getEvidenceValues("dolbyVision")) {
    if (dv === "true") {
      addTag("dolbyVision", "Dolby Vision", "hdr", true);
    }
  }

  // 7. HDR Format (HDR, HDR10, HDR10+)
  for (const hdr of getEvidenceValues("hdrFormat")) {
    addTag(`hdr-${hdr}`, hdr, "hdr", true);
  }

  // 8. Bit depth (10-bit)
  for (const bit of getEvidenceValues("bitDepth")) {
    addTag(`bitDepth-${bit}`, `${bit}-bit`, "video-codec", false);
  }

  // 9. Audio Codec (TrueHD, DTS-HD MA, DTS, E-AC-3, AC-3, AAC, FLAC)
  for (const ac of getEvidenceValues("audioCodec")) {
    addTag(`audioCodec-${ac}`, ac, "audio-codec", true);
  }

  // 10. Spatial Audio (Atmos, DTS:X)
  for (const sa of getEvidenceValues("spatialAudio")) {
    addTag(`spatialAudio-${sa}`, sa, "spatial-audio", true);
  }

  // 11. Channels (7.1, 5.1)
  for (const ch of getEvidenceValues("channels")) {
    addTag(`channels-${ch}`, ch, "channels", true);
  }

  // 12. Audio Languages (ES, EN, etc.)
  for (const lang of getEvidenceValues("audioLanguage")) {
    const upper = lang.toUpperCase();
    const cleanLang =
      upper.includes("SPA") || upper.includes("CAST")
        ? "ES"
        : upper.includes("ENG")
          ? "EN"
          : upper.includes("GAL")
            ? "GAL"
            : upper.includes("CAT")
              ? "CAT"
              : upper;
    addTag(`audioLang-${cleanLang}`, cleanLang, "language", true);
  }

  // 13. Subtitle Languages (subs ES, subs EN)
  for (const sub of getEvidenceValues("subtitleLanguage")) {
    const upper = sub.toUpperCase();
    const cleanSub =
      upper.includes("SPA") || upper.includes("CAST") ? "ES" : upper.includes("ENG") ? "EN" : upper;
    addTag(`subLang-${cleanSub}`, `subs ${cleanSub}`, "language", false);
  }

  return tags;
}

export function calculateSuggestedName(
  title: string,
  year: number | undefined,
  tags: DetectedTag[],
  extension: string,
): { suggestedName: string; warnings: string[] } {
  const formattedTitle = toTitleCase(title);
  const activeTagLabels = tags.filter((tag) => tag.active).map((tag) => tag.label);
  const renderedTags = activeTagLabels.map((tag) => `[${tag}]`).join(" ");

  const parts = [
    year !== undefined ? `${formattedTitle} (${year})` : formattedTitle,
    renderedTags,
  ].filter((p) => p.length > 0);

  const stem = parts.join(" ").replace(/\s+/gu, " ").trim();

  const cleanExt = extension.replace(/^\./u, "").toLowerCase();
  const rawFilename = cleanExt.length > 0 ? `${stem}.${cleanExt}` : stem;

  const sanitized = sanitizeWindowsFilenameComponent(rawFilename);
  const validation = validateWindowsFilename(sanitized.value);

  return {
    suggestedName: sanitized.value,
    warnings: validation.issues.map((i) => i.message),
  };
}

export function createRenamerItem(
  filenameOrPath: string,
  sizeBytes?: number,
  fileHandle?: FileSystemFileHandle,
  file?: File,
): RenamerItem {
  const normalizedPath = filenameOrPath.replaceAll("\\", "/");
  const originalFilename = normalizedPath.split("/").pop() ?? filenameOrPath;

  const parsed = parseMediaFilename(originalFilename);
  const tags = extractTagsFromParsed(parsed);

  const initialTitle = parsed.probableTitle || parsed.originalStem;
  const initialYear = parsed.year;

  const { suggestedName, warnings } = calculateSuggestedName(
    initialTitle,
    initialYear,
    tags,
    parsed.extension,
  );

  return {
    id: `${originalFilename}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    originalName: originalFilename,
    extension: parsed.extension,
    sizeBytes,
    fileHandle,
    file,
    title: initialTitle,
    year: initialYear,
    tags,
    suggestedName,
    status: warnings.length > 0 ? "error" : "ready",
    warnings,
    selected: true,
    metadataLoading: file !== undefined,
  };
}

/**
 * Merge real metadata tags (from mediainfo.js) with filename-based tags.
 * Real tags take priority: if the same kind of tag is already present
 * from filename parsing, it is replaced by the real one.
 */
export function mergeRealMetadataTags(
  filenameTags: DetectedTag[],
  realTags: DetectedTag[],
): DetectedTag[] {
  if (realTags.length === 0) return filenameTags;

  // Build a set of "kinds" that real metadata provides
  const realKinds = new Set(realTags.map((t) => t.kind));

  // Keep filename-based tags that are NOT in the kinds covered by real metadata
  const keptFromFilename = filenameTags.filter((t) => !realKinds.has(t.kind));

  // Also keep filename-only kinds like "edition", "source", "release-type"
  // that real metadata cannot detect (those are encoded in the filename only)
  const filenameOnlyKinds = new Set(["edition", "source", "release-type"]);
  const keptFilenameOnly = filenameTags.filter(
    (t) => filenameOnlyKinds.has(t.kind) && realKinds.has(t.kind),
  );

  // Combine: filename-only tags + real tags (deduplicated by label)
  const combined = [...keptFromFilename, ...keptFilenameOnly, ...realTags];
  const seen = new Set<string>();
  return combined.filter((tag) => {
    if (seen.has(tag.label)) return false;
    seen.add(tag.label);
    return true;
  });
}

export const SAMPLE_FILENAMES = [
  "Oppenheimer.2023.IMAX.2160p.UHD.BluRay.x265.TrueHD.Atmos.SPA-SPARKS.mkv",
  "the.dark.knight.2008.1080p.bluray.dts.x264-hdtv.mp4",
  "El.Laberinto.del.Fauno.2006.1080p.BluRay.DTS-HD.MA.7.1.ES-HDX.mkv",
  "interstellar.2014.imax.edition.2160p.web-dl.hevc.atmos.mkv",
  "Blade.Runner.2049.2017.PROPER.1080p.BluRay.x264.DTS.subs.es.mkv",
  "dune.part.two.2024.2160p.webrip.hdr.hevc.eac3.atmos-flac.mkv",
];
