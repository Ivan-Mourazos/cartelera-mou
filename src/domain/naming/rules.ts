import { evidenceFor, type MetadataEvidence, type VideoCodec } from "../metadata";
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
  const resolutions = new Set(["4320P", "2160P", "1440P", "1080P", "720P", "576P", "480P"]);

  for (const [index, token] of tokens.entries()) {
    if (/^(?:18|19|20|21)\d{2}$/u.test(token.normalized)) {
      const candidate = Number(token.normalized);
      if (year === undefined && candidate >= 1878 && candidate <= 2100) {
        year = candidate;
        add(evidence, tokens, [index], "year", "year", candidate, "Año explícito en el nombre");
        continue;
      }
    }

    if (resolutions.has(token.normalized)) {
      add(
        evidence,
        tokens,
        [index],
        "resolution",
        "resolution",
        token.normalized.toLowerCase() as Parameters<typeof evidenceFor<"resolution">>[1],
        "Resolución explícita en el nombre",
      );
    }
  }

  return year;
};

const classifyEditions = (tokens: MutableFilenameToken[], evidence: MetadataEvidence[]): void => {
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.normalized === "IMAX") {
      add(evidence, tokens, [index], "edition", "edition", "IMAX", "Edición IMAX explícita");
    } else if (tokens[index]?.normalized === "EXTENDED") {
      const indexes = tokens[index + 1]?.normalized === "EDITION" ? indexesFrom(index, 2) : [index];
      add(
        evidence,
        tokens,
        indexes,
        "edition",
        "edition",
        "Extended",
        "Edición extendida explícita",
      );
      if (indexes.length === 2) index += 1;
    } else if (
      sequenceAt(tokens, index, ["DIRECTORS", "CUT"]) ||
      sequenceAt(tokens, index, ["DIRECTOR", "CUT"])
    ) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "edition",
        "edition",
        "Director's Cut",
        "Edición del director explícita",
      );
      index += 1;
    }
  }
};

const classifySources = (tokens: MutableFilenameToken[], evidence: MetadataEvidence[]): void => {
  for (let index = 0; index < tokens.length; index += 1) {
    if (sequenceAt(tokens, index, ["UHD", "BLURAY"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "source",
        "mediaSource",
        "UHD Blu-ray",
        "Fuente UHD Blu-ray explícita",
      );
      index += 1;
    } else if (sequenceAt(tokens, index, ["UHD", "BLU", "RAY"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 3),
        "source",
        "mediaSource",
        "UHD Blu-ray",
        "Fuente UHD Blu-ray explícita",
      );
      index += 2;
    } else if (tokens[index]?.normalized === "BLURAY") {
      add(
        evidence,
        tokens,
        [index],
        "source",
        "mediaSource",
        "Blu-ray",
        "Fuente Blu-ray explícita",
      );
    } else if (sequenceAt(tokens, index, ["BLU", "RAY"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "source",
        "mediaSource",
        "Blu-ray",
        "Fuente Blu-ray explícita",
      );
      index += 1;
    } else if (tokens[index]?.normalized === "WEBDL" || sequenceAt(tokens, index, ["WEB", "DL"])) {
      const indexes = tokens[index]?.normalized === "WEBDL" ? [index] : indexesFrom(index, 2);
      add(evidence, tokens, indexes, "source", "mediaSource", "WEB-DL", "Fuente WEB-DL explícita");
      index += indexes.length - 1;
    } else if (tokens[index]?.normalized === "WEBRIP") {
      add(evidence, tokens, [index], "source", "mediaSource", "WEBRip", "Fuente WEBRip explícita");
    } else if (tokens[index]?.normalized === "HDTV") {
      add(evidence, tokens, [index], "source", "mediaSource", "HDTV", "Fuente HDTV explícita");
    } else if (tokens[index]?.normalized === "DVD") {
      add(evidence, tokens, [index], "source", "mediaSource", "DVD", "Fuente DVD explícita");
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
    if (normalized === "REMUX") {
      add(evidence, tokens, [index], "release-type", "releaseType", "REMUX", "REMUX explícito");
    }

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
  const hasDolbyVisionEvidence = tokens.some(
    (token, index) =>
      token.normalized === "DV" ||
      token.normalized === "DOVI" ||
      sequenceAt(tokens, index, ["DOLBY", "VISION"]),
  );

  for (let index = 0; index < tokens.length; index += 1) {
    const normalized = tokens[index]?.normalized ?? "";
    if (normalized === "DV" || normalized === "DOVI") {
      add(evidence, tokens, [index], "dolby-vision", "dolbyVision", true, "Dolby Vision explícito");
    } else if (sequenceAt(tokens, index, ["DOLBY", "VISION"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "dolby-vision",
        "dolbyVision",
        true,
        "Dolby Vision explícito",
      );
      index += 1;
    }

    if (normalized === "HDR10+" || normalized === "HDR10PLUS") {
      add(evidence, tokens, [index], "hdr", "hdrFormat", "HDR10+", "HDR10+ explícito");
    } else if (normalized === "HDR10") {
      add(evidence, tokens, [index], "hdr", "hdrFormat", "HDR10", "HDR10 explícito");
    } else if (normalized === "HDR") {
      add(evidence, tokens, [index], "hdr", "hdrFormat", "HDR", "HDR genérico: no implica HDR10");
    }

    const compactProfile = /^(?:PROFILE|P)(\d+(?:\.\d+)?)$/u.exec(normalized);
    if (hasDolbyVisionEvidence && compactProfile?.[1] !== undefined) {
      add(
        evidence,
        tokens,
        [index],
        "dolby-vision-profile",
        "dolbyVisionProfile",
        compactProfile[1],
        "Perfil Dolby Vision explícito",
      );
    } else if (
      hasDolbyVisionEvidence &&
      normalized === "PROFILE" &&
      /^\d+(?:\.\d+)?$/u.test(tokens[index + 1]?.normalized ?? "")
    ) {
      const profile = tokens[index + 1]?.raw;
      if (profile !== undefined) {
        add(
          evidence,
          tokens,
          indexesFrom(index, 2),
          "dolby-vision-profile",
          "dolbyVisionProfile",
          profile,
          "Perfil Dolby Vision explícito",
        );
        index += 1;
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
  const languages: ReadonlyMap<string, string> = new Map([
    ["ES", "ES"],
    ["SPA", "ES"],
    ["EN", "EN"],
    ["ENG", "EN"],
    ["GAL", "GAL"],
    ["GLG", "GAL"],
  ]);

  for (let index = Math.max(metadataZoneStart, 0); index < tokens.length; index += 1) {
    const normalized = tokens[index]?.normalized ?? "";
    if (normalized === "MULTI") {
      add(
        evidence,
        tokens,
        [index],
        "language-marker",
        "multipleAudioLanguages",
        true,
        "MULTi indica pluralidad, no idiomas concretos",
      );
      continue;
    }

    if (normalized === "SUB") {
      const language = languages.get(tokens[index + 1]?.normalized ?? "");
      if (language !== undefined) {
        add(
          evidence,
          tokens,
          indexesFrom(index, 2),
          "subtitle-language",
          "subtitleLanguage",
          language,
          "Idioma de subtítulo explícito",
        );
        index += 1;
      }
      continue;
    }

    const compactSubtitle = /^SUB(ES|SPA|EN|ENG|GAL|GLG)$/u.exec(normalized);
    if (compactSubtitle?.[1] !== undefined) {
      const language = languages.get(compactSubtitle[1]);
      if (language !== undefined) {
        add(
          evidence,
          tokens,
          [index],
          "subtitle-language",
          "subtitleLanguage",
          language,
          "Idioma de subtítulo explícito",
        );
      }
      continue;
    }

    const language = languages.get(normalized);
    if (language !== undefined && tokens[index]?.categories.size === 0) {
      add(
        evidence,
        tokens,
        [index],
        "audio-language",
        "audioLanguage",
        language,
        "Idioma de audio explícito",
      );
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
    [...token.categories].some((category) => category !== "edition"),
  );
  return index < 0 ? tokens.length : index;
};

export const applyFilenameRules = (tokenized: TokenizedFilename): ClassifiedFilename => {
  const evidence: MetadataEvidence[] = [];
  const year = classifyYearsAndResolutions(tokenized.tokens, evidence);
  classifyEditions(tokenized.tokens, evidence);
  classifySources(tokenized.tokens, evidence);
  classifyVideo(tokenized.tokens, evidence);
  classifyHdr(tokenized.tokens, evidence);
  classifyAudio(tokenized.tokens, evidence);
  classifyLanguages(tokenized.tokens, evidence, firstMetadataIndex(tokenized.tokens));
  const releaseGroup = classifyReleaseGroup(tokenized, evidence);

  return {
    evidence,
    ...(year === undefined ? {} : { year }),
    ...(releaseGroup === undefined ? {} : { releaseGroup }),
  };
};
