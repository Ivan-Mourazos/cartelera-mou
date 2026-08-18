import {
  evidenceFor,
  type MediaSource,
  type MetadataEvidence,
  type Resolution,
  type VideoCodec,
} from "../metadata";
import type { FilenameTokenCategory, MutableFilenameToken, TokenizedFilename } from "./types";

export interface ClassifiedFilename {
  readonly evidence: readonly MetadataEvidence[];
  readonly year?: number;
  readonly releaseGroup?: string;
}

const sequenceAt = (
  tokens: readonly MutableFilenameToken[],
  index: number,
  sequence: readonly string[],
): boolean => sequence.every((part, offset) => tokens[index + offset]?.normalized === part);

const classify = (
  tokens: MutableFilenameToken[],
  indexes: readonly number[],
  category: FilenameTokenCategory,
): void => {
  for (const index of indexes) tokens[index]?.categories.add(category);
};

const indexesFrom = (start: number, length: number): number[] =>
  Array.from({ length }, (_, offset) => start + offset);

const rawFor = (tokens: readonly MutableFilenameToken[], indexes: readonly number[]): string =>
  indexes.map((index) => tokens[index]?.raw ?? "").join(" ");

const add = <K extends Parameters<typeof evidenceFor>[0]>(
  output: MetadataEvidence[],
  tokens: MutableFilenameToken[],
  indexes: readonly number[],
  category: FilenameTokenCategory,
  field: K,
  value: Parameters<typeof evidenceFor<K>>[1],
  reason: string,
  confidence = 100,
): void => {
  classify(tokens, indexes, category);
  output.push(
    evidenceFor(
      field,
      value,
      {
        reason,
        raw: rawFor(tokens, indexes),
        tokenIndexes: indexes,
      },
      { confidence },
    ) as MetadataEvidence,
  );
};

const classifyYearsAndResolutions = (
  tokens: MutableFilenameToken[],
  evidence: MetadataEvidence[],
): number | undefined => {
  let year: number | undefined;
  const currentMaxYear = new Date().getFullYear() + 2;
  const otherResolutions = new Set(["4320P", "1440P", "576P", "480P"]);

  // Collect candidate 4-digit years
  const yearCandidates: { index: number; year: number }[] = [];
  for (const [index, token] of tokens.entries()) {
    if (/^(?:18|19|20|21)\d{2}$/u.test(token.normalized)) {
      const candidate = Number(token.normalized);
      if (candidate >= 1878 && candidate <= 2100) {
        yearCandidates.push({ index, year: candidate });
      }
    }
  }

  // If there are multiple candidates, prefer the realistic release year
  let selectedCandidate: { index: number; year: number } | undefined;
  if (yearCandidates.length > 0) {
    const realisticCandidates = yearCandidates.filter((c) => c.year <= currentMaxYear);
    selectedCandidate =
      realisticCandidates.length > 0
        ? realisticCandidates[realisticCandidates.length - 1]
        : yearCandidates[0];
  }

  for (const [index, token] of tokens.entries()) {
    if (index === selectedCandidate?.index && year === undefined) {
      year = selectedCandidate.year;
      add(
        evidence,
        tokens,
        [index],
        "year",
        "year",
        selectedCandidate.year,
        "Año explícito en el nombre",
      );
      continue;
    }

    if (
      token.normalized === "4K" ||
      token.normalized === "2160P" ||
      token.normalized === "4KUHD" ||
      token.normalized === "4K-UHD" ||
      token.normalized === "UHD4K"
    ) {
      add(evidence, tokens, [index], "resolution", "resolution", "4K", "Resolución 4K / Ultra HD");
      continue;
    }

    if (
      token.normalized === "1080P" ||
      token.normalized === "1080I" ||
      token.normalized === "FHD" ||
      token.normalized === "FULLHD" ||
      token.normalized === "FULL-HD"
    ) {
      add(
        evidence,
        tokens,
        [index],
        "resolution",
        "resolution",
        "1080p",
        "Resolución 1080p Full HD",
      );
      continue;
    }

    if (token.normalized === "720P" || token.normalized === "720I") {
      add(evidence, tokens, [index], "resolution", "resolution", "720p", "Resolución 720p HD");
      continue;
    }

    if (otherResolutions.has(token.normalized)) {
      add(
        evidence,
        tokens,
        [index],
        "resolution",
        "resolution",
        token.raw.toLowerCase() as Resolution,
        "Resolución estándar en píxeles verticales",
      );
    }
  }

  return year;
};

const formatEpisodeNumber = (sNum: number, eNum: number, secondENum?: number): string => {
  const base = `${sNum}${String(eNum).padStart(2, "0")}`;
  if (secondENum !== undefined) {
    return `${base}-${sNum}${String(secondENum).padStart(2, "0")}`;
  }
  return base;
};

const classifyEpisodes = (tokens: MutableFilenameToken[], evidence: MetadataEvidence[]): void => {
  for (let index = 0; index < tokens.length; index += 1) {
    const norm = tokens[index]?.normalized ?? "";

    // 1. Single-token S01E05 or S01E05-E06 or S01E05E06
    const sxxExx = /^S(\d{1,2})E(\d{1,3})(?:[-_.]?E(\d{1,3}))?$/iu.exec(norm);
    if (sxxExx) {
      const sNum = parseInt(sxxExx[1] ?? "1", 10);
      const eNum = parseInt(sxxExx[2] ?? "1", 10);
      const secondE = sxxExx[3] ? parseInt(sxxExx[3], 10) : undefined;
      const canonical = formatEpisodeNumber(sNum, eNum, secondE);

      add(
        evidence,
        tokens,
        [index],
        "season-episode",
        "seasonEpisode",
        canonical,
        "Episodio de serie explícito (formato SxxExx)",
      );
      continue;
    }

    // 2. Spanish T01E05 (Temporada 1 Episodio 5)
    const txxExx = /^T(\d{1,2})E(\d{1,3})(?:[-_.]?E(\d{1,3}))?$/iu.exec(norm);
    if (txxExx) {
      const sNum = parseInt(txxExx[1] ?? "1", 10);
      const eNum = parseInt(txxExx[2] ?? "1", 10);
      const secondE = txxExx[3] ? parseInt(txxExx[3], 10) : undefined;
      const canonical = formatEpisodeNumber(sNum, eNum, secondE);

      add(
        evidence,
        tokens,
        [index],
        "season-episode",
        "seasonEpisode",
        canonical,
        "Episodio de serie explícito (formato TxxExx)",
      );
      continue;
    }

    // 3. 1x05 or 01x05 or 1x05-1x06
    const nxN = /^(\d{1,2})X(\d{1,3})(?:[-_.]?(\d{1,2})X(\d{1,3}))?$/iu.exec(norm);
    if (nxN) {
      const sNum = parseInt(nxN[1] ?? "1", 10);
      const eNum = parseInt(nxN[2] ?? "1", 10);
      const secondE = nxN[4] ? parseInt(nxN[4], 10) : undefined;
      const canonical = formatEpisodeNumber(sNum, eNum, secondE);

      add(
        evidence,
        tokens,
        [index],
        "season-episode",
        "seasonEpisode",
        canonical,
        "Episodio de serie explícito (formato NxN)",
      );
      continue;
    }

    // 4. Multi-token: TEMPORADA 1 [CAPITULO 5] / TEMP 1 / SEASON 1
    const isSeasonWord =
      norm === "TEMPORADA" || norm === "TEMPORADAS" || norm === "TEMP" || norm === "SEASON";
    const nextTokenNorm = tokens[index + 1]?.normalized ?? "";
    const isSeasonNum = /^\d{1,2}$/u.test(nextTokenNorm);

    if (isSeasonWord && isSeasonNum) {
      const sNum = parseInt(nextTokenNorm, 10);
      const thirdTokenNorm = tokens[index + 2]?.normalized ?? "";
      const isEpWord =
        thirdTokenNorm === "CAPITULO" ||
        thirdTokenNorm === "CAPITULOS" ||
        thirdTokenNorm === "CAP" ||
        thirdTokenNorm === "EPISODE" ||
        thirdTokenNorm === "EPISODIO" ||
        thirdTokenNorm === "EP";
      const fourthTokenNorm = tokens[index + 3]?.normalized ?? "";
      const isEpNum = /^\d{1,3}$/u.test(fourthTokenNorm);

      if (isEpWord && isEpNum) {
        const eNum = parseInt(fourthTokenNorm, 10);
        const canonical = formatEpisodeNumber(sNum, eNum);

        add(
          evidence,
          tokens,
          indexesFrom(index, 4),
          "season-episode",
          "seasonEpisode",
          canonical,
          "Temporada y capítulo explícitos",
        );
        index += 3;
        continue;
      } else {
        // Season only e.g. "Temporada 1" -> S01
        const canonical = `T${String(sNum).padStart(2, "0")}`;
        add(
          evidence,
          tokens,
          indexesFrom(index, 2),
          "season-episode",
          "seasonEpisode",
          canonical,
          "Temporada explícita",
        );
        index += 1;
        continue;
      }
    }

    // 5. Multi-token: CAP 05 / CAPITULO 5 / EPISODIO 5 / EPISODE 5
    const isSingleEpWord =
      norm === "CAP" ||
      norm === "CAPITULO" ||
      norm === "CAPITULOS" ||
      norm === "EPISODIO" ||
      norm === "EPISODIOS" ||
      norm === "EPISODE" ||
      norm === "EP";
    if (isSingleEpWord && /^\d{1,3}$/u.test(nextTokenNorm)) {
      const numVal = parseInt(nextTokenNorm, 10);
      let canonical: string;
      if (numVal >= 100 && numVal <= 999) {
        canonical = String(numVal);
      } else {
        canonical = `1${String(numVal).padStart(2, "0")}`;
      }

      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "season-episode",
        "seasonEpisode",
        canonical,
        "Capítulo explícito",
      );
      index += 1;
      continue;
    }

    // 6. Single-token: CAP05 / CAP105 / EP05 / E05
    const singleEpMatch = /^(?:CAP|EP|E)(\d{2,3})$/iu.exec(norm);
    if (singleEpMatch) {
      const numVal = parseInt(singleEpMatch[1] ?? "1", 10);
      let canonical: string;
      if (numVal >= 100 && numVal <= 999) {
        canonical = String(numVal);
      } else {
        canonical = `1${String(numVal).padStart(2, "0")}`;
      }

      add(
        evidence,
        tokens,
        [index],
        "season-episode",
        "seasonEpisode",
        canonical,
        "Capítulo explícito",
      );
      continue;
    }

    // 7. Standalone 3-digit episode number e.g. 308, 201, 105 (Season 3 Ep 08, Season 2 Ep 01)
    if (/^[1-9]\d{2}(?:-[1-9]\d{2})?$/u.test(norm)) {
      const parts = norm.split("-");
      const firstNum = parseInt(parts[0] ?? "0", 10);
      const epNum = firstNum % 100;
      // Filter out resolution tokens (480, 576, 720) and common audio bitrates
      const isKnownNonEpisode =
        firstNum === 480 ||
        firstNum === 576 ||
        firstNum === 720 ||
        firstNum === 128 ||
        firstNum === 192 ||
        firstNum === 256 ||
        firstNum === 320 ||
        firstNum === 384 ||
        firstNum === 448 ||
        firstNum === 640;

      if (!isKnownNonEpisode && epNum >= 1 && epNum <= 50) {
        add(
          evidence,
          tokens,
          [index],
          "season-episode",
          "seasonEpisode",
          norm,
          "Número de capítulo (formato 3 dígitos)",
        );
      }
    }
  }
};

const classifyEditions = (tokens: MutableFilenameToken[], evidence: MetadataEvidence[]): void => {
  for (let index = 0; index < tokens.length; index += 1) {
    if (sequenceAt(tokens, index, ["DIRECTORS", "CUT"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "edition",
        "edition",
        "Director's Cut",
        "Director's Cut explícito",
      );
      index += 1;
    } else if (
      sequenceAt(tokens, index, ["EXTENDED", "CUT"]) ||
      sequenceAt(tokens, index, ["EXTENDED", "EDITION"])
    ) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "edition",
        "edition",
        "Extended",
        "Extended Cut/Edition explícito",
      );
      index += 1;
    } else if (tokens[index]?.normalized === "EXTENDED") {
      add(evidence, tokens, [index], "edition", "edition", "Extended", "Extended explícito");
    } else if (tokens[index]?.normalized === "IMAX") {
      add(evidence, tokens, [index], "edition", "edition", "IMAX", "IMAX explícito");
    } else if (tokens[index]?.normalized === "REMASTERED") {
      classify(tokens, [index], "edition");
    } else if (tokens[index]?.normalized === "UNRATED") {
      classify(tokens, [index], "edition");
    }
  }
};

/**
 * Vocabulario de fuente tal y como aparece en las publicaciones.
 *
 * Una etiqueta de un solo token se resuelve por tabla; las que se parten en
 * varios tokens (`BLU RAY`, `WEB DL`) se comprueban por secuencia antes.
 */
const SINGLE_TOKEN_SOURCES: Readonly<Record<string, MediaSource>> = {
  BLURAY: "BluRay",
  BD: "BluRay",
  BDRIP: "BDRip",
  BLURAYRIP: "BDRip",
  BRRIP: "BRRip",
  UHDRIP: "UHDRip",
  WEBDL: "WEB-DL",
  WEB: "WEB-DL",
  WEBRIP: "WEBRip",
  HDTV: "HDTV",
  HDTVRIP: "HDTVRip",
  MICROHD: "microHD",
  HDRIP: "HDRip",
  DVD: "DVDRip",
  DVDRIP: "DVDRip",
  DVDSCR: "DVDScr",
  DVDSCREENER: "DVDScr",
  SCREENER: "SCR",
  SCR: "SCR",
  HDTC: "TC",
  TC: "TC",
  HDTS: "TS",
  TS: "TS",
  TELESYNC: "TS",
  HDCAM: "CamRip",
  CAMRIP: "CamRip",
  CAM: "CamRip",
};

/** Plataformas: prueban que el origen es WEB, pero no se escriben en el nombre. */
const WEB_PLATFORMS = new Set([
  "AMZN",
  "NF",
  "NETFLIX",
  "DSNP",
  "MAX",
  "HMAX",
  "ATVP",
  "HULU",
  "SKST",
  "MOVISTAR",
]);

/** Etiquetas que declaran REMUX y además el soporte de origen. */
const REMUX_TOKENS = new Set(["REMUX", "BDREMUX", "BD-REMUX", "UHDREMUX", "4KREMUX"]);

const classifySources = (tokens: MutableFilenameToken[], evidence: MetadataEvidence[]): void => {
  for (let index = 0; index < tokens.length; index += 1) {
    const normalized = tokens[index]?.normalized ?? "";

    if (REMUX_TOKENS.has(normalized)) {
      add(evidence, tokens, [index], "release-type", "releaseType", "REMUX", "REMUX explícito");
      if (normalized !== "REMUX") {
        add(
          evidence,
          tokens,
          [index],
          "source",
          "mediaSource",
          "BluRay",
          `Soporte Blu-ray declarado en «${tokens[index]?.raw ?? normalized}»`,
        );
      }
      continue;
    }

    // `Blu Ray` y `Blu-Ray` se parten en dos tokens.
    if (sequenceAt(tokens, index, ["BLU", "RAY"])) {
      const hasRip = tokens[index + 2]?.normalized === "RIP";
      add(
        evidence,
        tokens,
        indexesFrom(index, hasRip ? 3 : 2),
        "source",
        "mediaSource",
        hasRip ? "BDRip" : "BluRay",
        hasRip ? "Fuente BluRay Rip explícita" : "Fuente Blu-ray explícita",
      );
      index += hasRip ? 2 : 1;
      continue;
    }

    if (sequenceAt(tokens, index, ["WEB", "DL"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "source",
        "mediaSource",
        "WEB-DL",
        "Fuente WEB-DL explícita",
      );
      index += 1;
      continue;
    }

    if (sequenceAt(tokens, index, ["WEB", "RIP"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "source",
        "mediaSource",
        "WEBRip",
        "Fuente WEBRip explícita",
      );
      index += 1;
      continue;
    }

    if (WEB_PLATFORMS.has(normalized)) {
      add(
        evidence,
        tokens,
        [index],
        "source",
        "mediaSource",
        "WEB-DL",
        `Plataforma «${tokens[index]?.raw ?? normalized}»: el origen es WEB`,
        80,
      );
      continue;
    }

    const mapped = SINGLE_TOKEN_SOURCES[normalized];
    if (mapped !== undefined) {
      add(
        evidence,
        tokens,
        [index],
        "source",
        "mediaSource",
        mapped,
        `Fuente ${mapped} explícita en el nombre`,
      );
    }
  }
};

const classifyVideo = (tokens: MutableFilenameToken[], evidence: MetadataEvidence[]): void => {
  const codecMap: ReadonlyMap<string, VideoCodec> = new Map([
    ["HEVC", "HEVC"],
    ["H265", "HEVC"],
    ["H.265", "HEVC"],
    ["X265", "HEVC"],
    ["AV1", "AV1"],
    ["H264", "H.264"],
    ["H.264", "H.264"],
    ["X264", "H.264"],
    ["AVC", "H.264"],
    ["MPEG2", "MPEG-2"],
    ["VC1", "VC-1"],
  ]);

  for (let index = 0; index < tokens.length; index += 1) {
    const normalized = tokens[index]?.normalized ?? "";
    const codec = codecMap.get(normalized);
    if (codec !== undefined) {
      add(
        evidence,
        tokens,
        [index],
        "video-codec",
        "videoCodec",
        codec,
        "Códec de vídeo explícito",
      );
    } else if (normalized === "DIVX" || normalized === "XVID") {
      classify(tokens, [index], "video-codec");
    }

    const compactBitDepth = /^(8|10|12)BIT$/u.exec(normalized);
    if (compactBitDepth?.[1] !== undefined) {
      add(
        evidence,
        tokens,
        [index],
        "bit-depth",
        "bitDepth",
        Number(compactBitDepth[1]),
        "Profundidad de color explícita",
      );
    } else if (/^(8|10|12)$/u.test(normalized) && tokens[index + 1]?.normalized === "BIT") {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "bit-depth",
        "bitDepth",
        Number(normalized),
        "Profundidad de color explícita",
      );
      index += 1;
    }
  }
};

const classifyHdr = (tokens: MutableFilenameToken[], evidence: MetadataEvidence[]): void => {
  let hasDv = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const normalized = tokens[index]?.normalized ?? "";
    if (sequenceAt(tokens, index, ["DOLBY", "VISION"]) || normalized === "DV") {
      hasDv = true;
      const indexes = normalized === "DV" ? [index] : indexesFrom(index, 2);
      add(evidence, tokens, indexes, "dolby-vision", "dolbyVision", true, "Dolby Vision explícito");
      index += indexes.length - 1;
      continue;
    }

    if (normalized === "HDR10PLUS" || normalized === "HDR10+") {
      add(evidence, tokens, [index], "hdr", "hdrFormat", "HDR10+", "HDR10+ explícito");
      continue;
    }

    if (normalized === "HDR10") {
      add(evidence, tokens, [index], "hdr", "hdrFormat", "HDR10", "HDR10 explícito");
      continue;
    }

    if (normalized === "HDR") {
      add(evidence, tokens, [index], "hdr", "hdrFormat", "HDR", "HDR genérico");
    }
  }

  // Profile classification only if Dolby Vision is present
  if (hasDv) {
    for (let index = 0; index < tokens.length; index += 1) {
      const normalized = tokens[index]?.normalized ?? "";
      const compactProfile = /^(?:PROFILE|P)(\d+(?:\.\d+)?)$/u.exec(normalized);
      if (compactProfile?.[1] !== undefined) {
        add(
          evidence,
          tokens,
          [index],
          "dolby-vision-profile",
          "dolbyVisionProfile",
          compactProfile[1],
          "Perfil Dolby Vision explícito",
        );
      }
    }
  }
};

const classifyAudio = (tokens: MutableFilenameToken[], evidence: MetadataEvidence[]): void => {
  for (let index = 0; index < tokens.length; index += 1) {
    const normalized = tokens[index]?.normalized ?? "";
    if (normalized === "TRUEHD") {
      add(
        evidence,
        tokens,
        [index],
        "audio-codec",
        "audioCodec",
        "TrueHD",
        "Códec TrueHD explícito",
      );
    } else if (sequenceAt(tokens, index, ["DTS", "HD", "MA"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 3),
        "audio-codec",
        "audioCodec",
        "DTS-HD MA",
        "Códec DTS-HD MA explícito",
      );
      index += 2;
    } else if (
      normalized === "DTSHDMA" ||
      (normalized === "DTSHD" && tokens[index + 1]?.normalized === "MA")
    ) {
      const indexes = normalized === "DTSHDMA" ? [index] : indexesFrom(index, 2);
      add(
        evidence,
        tokens,
        indexes,
        "audio-codec",
        "audioCodec",
        "DTS-HD MA",
        "Códec DTS-HD MA explícito",
      );
      index += indexes.length - 1;
    } else if (sequenceAt(tokens, index, ["DTS", "X"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "audio-codec",
        "audioCodec",
        "DTS",
        "Núcleo DTS explícito",
      );
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "spatial-audio",
        "spatialAudio",
        "DTS:X",
        "DTS:X explícito",
      );
      index += 1;
    } else if (normalized === "DTS") {
      add(evidence, tokens, [index], "audio-codec", "audioCodec", "DTS", "Códec DTS explícito");
    } else if (normalized === "EAC3" || normalized === "E-AC-3" || normalized === "DDP") {
      add(
        evidence,
        tokens,
        [index],
        "audio-codec",
        "audioCodec",
        "E-AC-3",
        "Códec E-AC-3 explícito",
      );
    } else if (normalized === "AC3" || normalized === "AC-3") {
      add(evidence, tokens, [index], "audio-codec", "audioCodec", "AC-3", "Códec AC-3 explícito");
    } else if (normalized === "AAC") {
      add(evidence, tokens, [index], "audio-codec", "audioCodec", "AAC", "Códec AAC explícito");
    } else if (normalized === "FLAC") {
      add(evidence, tokens, [index], "audio-codec", "audioCodec", "FLAC", "Códec FLAC explícito");
    } else if (normalized === "MP3") {
      classify(tokens, [index], "audio-codec");
    }

    const ddpChannels = /^DDP(\d\.\d)$/u.exec(normalized);
    if (ddpChannels?.[1] !== undefined) {
      add(
        evidence,
        tokens,
        [index],
        "audio-codec",
        "audioCodec",
        "E-AC-3",
        "Etiqueta DDP explícita",
      );
      add(
        evidence,
        tokens,
        [index],
        "channels",
        "channels",
        ddpChannels[1],
        "Canales incluidos en la etiqueta DDP",
      );
    }

    if (normalized === "ATMOS") {
      add(evidence, tokens, [index], "spatial-audio", "spatialAudio", "Atmos", "Atmos explícito");
    }

    if (/^\d\.\d$/u.test(normalized)) {
      add(
        evidence,
        tokens,
        [index],
        "channels",
        "channels",
        tokenValue(tokens, index),
        "Canales explícitos",
      );
    }
  }
};

const tokenValue = (tokens: readonly MutableFilenameToken[], index: number): string =>
  tokens[index]?.raw ?? "";

const classifyLanguages = (
  tokens: MutableFilenameToken[],
  evidence: MetadataEvidence[],
  metadataZoneStart: number,
): void => {
  const unambiguousLanguages: ReadonlyMap<string, string> = new Map([
    ["CASTELLANO", "ES"],
    ["SPANISH", "ES"],
    ["ESPANOL", "ES"],
    ["LATINO", "LAT"],
    ["ENGLISH", "EN"],
    ["INGLES", "EN"],
    ["GALLEGO", "GAL"],
    ["CATALAN", "CAT"],
    ["EUSKERA", "EUS"],
    ["FRENCH", "FR"],
    ["FRANCES", "FR"],
    ["GERMAN", "DE"],
    ["ALEMAN", "DE"],
    ["ITALIAN", "IT"],
    ["ITALIANO", "IT"],
    ["JAPANESE", "JA"],
    ["JAPONES", "JA"],
  ]);

  const shortLanguages: ReadonlyMap<string, string> = new Map([
    ["ES", "ES"],
    ["SPA", "ES"],
    ["ESP", "ES"],
    ["LAT", "LAT"],
    ["EN", "EN"],
    ["ENG", "EN"],
    ["GAL", "GAL"],
    ["GLG", "GAL"],
    ["CAT", "CAT"],
    ["EUS", "EUS"],
    ["FR", "FR"],
    ["FRA", "FR"],
    ["FRE", "FR"],
    ["DEU", "DE"],
    ["GER", "DE"],
    ["ITA", "IT"],
    ["JPN", "JA"],
  ]);

  for (let index = 0; index < tokens.length; index += 1) {
    const normalized = tokens[index]?.normalized ?? "";

    if (
      normalized === "MULTI" ||
      normalized === "DUAL" ||
      normalized === "VOSE" ||
      normalized === "VOS" ||
      normalized === "TRIPAUDIO"
    ) {
      add(
        evidence,
        tokens,
        [index],
        "language-marker",
        "multipleAudioLanguages",
        true,
        "Indicador de idiomas múltiple",
      );
      continue;
    }

    if (normalized === "SUB" || normalized === "SUBS") {
      const targetLang =
        unambiguousLanguages.get(tokens[index + 1]?.normalized ?? "") ??
        shortLanguages.get(tokens[index + 1]?.normalized ?? "");
      if (targetLang !== undefined) {
        add(
          evidence,
          tokens,
          indexesFrom(index, 2),
          "subtitle-language",
          "subtitleLanguage",
          targetLang,
          "Idioma de subtítulo explícito",
        );
        index += 1;
      }
      continue;
    }

    const compactSub = /^SUB(ES|SPA|ESP|EN|ENG|GAL|CAT|FR|DE|IT|JA)$/u.exec(normalized);
    if (compactSub?.[1] !== undefined) {
      const targetLang = shortLanguages.get(compactSub[1]);
      if (targetLang !== undefined) {
        add(
          evidence,
          tokens,
          [index],
          "subtitle-language",
          "subtitleLanguage",
          targetLang,
          "Idioma de subtítulo explícito",
        );
      }
      continue;
    }

    // Unambiguous language names (like "Castellano", "Spanish") can match anywhere if not part of title
    const fullLang = unambiguousLanguages.get(normalized);
    if (fullLang !== undefined && (tokens[index]?.categories.size ?? 0) === 0) {
      add(
        evidence,
        tokens,
        [index],
        "audio-language",
        "audioLanguage",
        fullLang,
        "Idioma de audio explícito",
      );
      continue;
    }

    // Short 2-3 letter language codes (like "ES", "EN", "ESP", "DEU") ONLY match in the metadata zone
    // to avoid colliding with title words like "de", "la", "el", "en"
    if (index >= metadataZoneStart) {
      const shortLang = shortLanguages.get(normalized);
      if (shortLang !== undefined && (tokens[index]?.categories.size ?? 0) === 0) {
        add(
          evidence,
          tokens,
          [index],
          "audio-language",
          "audioLanguage",
          shortLang,
          "Idioma de audio explícito",
        );
      }
    }
  }
};

const classifyContainersAndNoise = (tokens: MutableFilenameToken[]): void => {
  const containerNames = new Set([
    "MKV",
    "AVI",
    "MP4",
    "M4V",
    "MOV",
    "WMV",
    "FLV",
    "WEBM",
    "TS",
    "M2TS",
    "ISO",
    "VOB",
    "RIP",
  ]);

  for (const [index, token] of tokens.entries()) {
    const norm = token.normalized;
    if (containerNames.has(norm)) {
      classify(tokens, [index], "container");
    }

    // Website domains & release site tokens: www, com, net, org, es, descargas2020, nucleohd, etc.
    if (
      norm === "WWW" ||
      norm === "COM" ||
      norm === "NET" ||
      norm === "ORG" ||
      norm === "INFO" ||
      norm === "DESCARGAS2020" ||
      norm === "NUCLEOHD" ||
      norm === "MEJORTORRENT" ||
      norm === "ELITETORRENT" ||
      norm === "DIVXATOPE" ||
      norm === "DONTORRENT" ||
      norm === "ESTRENOSDIVX" ||
      norm === "GRANSTORRENT" ||
      norm === "PROPER" ||
      norm === "REPACK" ||
      norm.includes(".COM") ||
      norm.includes(".ES") ||
      norm.includes(".NET")
    ) {
      classify(tokens, [index], "website-noise");
    }
  }
};

const classifyReleaseGroup = (
  tokenized: TokenizedFilename,
  evidence: MetadataEvidence[],
): string | undefined => {
  const match = /-([\p{L}\p{N}][\p{L}\p{N}_-]{1,31})$/u.exec(tokenized.stem);
  const group = match?.[1];
  if (group === undefined) return undefined;

  const groupStart = tokenized.stem.length - group.length;
  const index = tokenized.tokens.findIndex((token) => token.start === groupStart);
  const token = tokenized.tokens[index];
  if (index < 0 || token === undefined || token.categories.size > 0) return undefined;
  const hasClassifiedPrefix = tokenized.tokens
    .slice(0, index)
    .some((prefixToken) => prefixToken.categories.size > 0);
  if (!hasClassifiedPrefix) return undefined;

  add(
    evidence,
    tokenized.tokens,
    [index],
    "release-group",
    "releaseGroup",
    group,
    "Grupo tras guion final",
  );
  return group;
};

const firstMetadataIndex = (tokens: readonly MutableFilenameToken[]): number => {
  const index = tokens.findIndex((token) =>
    [...token.categories].some(
      (category) => category !== "edition" && category !== "title" && category !== "website-noise",
    ),
  );
  return index < 0 ? tokens.length : index;
};

export const applyFilenameRules = (tokenized: TokenizedFilename): ClassifiedFilename => {
  const evidence: MetadataEvidence[] = [];
  const year = classifyYearsAndResolutions(tokenized.tokens, evidence);
  classifyEpisodes(tokenized.tokens, evidence);
  classifyEditions(tokenized.tokens, evidence);
  classifySources(tokenized.tokens, evidence);
  classifyVideo(tokenized.tokens, evidence);
  classifyHdr(tokenized.tokens, evidence);
  classifyAudio(tokenized.tokens, evidence);
  classifyLanguages(tokenized.tokens, evidence, firstMetadataIndex(tokenized.tokens));
  classifyContainersAndNoise(tokenized.tokens);
  const releaseGroup = classifyReleaseGroup(tokenized, evidence);

  return {
    evidence,
    ...(year === undefined ? {} : { year }),
    ...(releaseGroup === undefined ? {} : { releaseGroup }),
  };
};
