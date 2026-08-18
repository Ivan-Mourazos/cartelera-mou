import { parseMediaFilename } from "../naming/parser";
import { extractEmbeddedId } from "./embedded-ids";
import type { IdentificationHints } from "./types";

/**
 * Pistas de identificación extraídas del nombre del fichero y de la carpeta.
 *
 * Estas pistas sirven exclusivamente para CONSULTAR al proveedor de metadata.
 * No se usan como datos técnicos ni se escriben en el nombre sin confirmación.
 */

interface EpisodeMatch {
  /** Puede faltar: `cap03.mkv` indica episodio pero no temporada. */
  readonly season: number | undefined;
  readonly episode: number;
  readonly episodeEnd: number | undefined;
  readonly start: number;
}

/** `cap03`, `capitulo 3`, `ep05`, `episodio 5` y el formato español `Cap.202`. */
const EPISODE_ONLY_PATTERN = /\b(?:cap(?:[ií]tulo)?|ep(?:isodio|isode)?)[\s._-]*(\d{1,4})\b/iu;

const EPISODE_PATTERNS: readonly RegExp[] = [
  // S01E03, S01E03E04, S01E03-E04, s01.e03
  /\bS(\d{1,2})[\s._-]*E(\d{1,3})(?:[\s._-]*(?:E|-)\s*(\d{1,3}))?\b/giu,
  // T01E03 (convención española)
  /\bT(\d{1,2})[\s._-]*E(\d{1,3})(?:[\s._-]*(?:E|-)\s*(\d{1,3}))?\b/giu,
  // 1x03, 01x03, 1x03-04
  /\b(\d{1,2})x(\d{1,3})(?:-(?:\d{1,2}x)?(\d{1,3}))?\b/giu,
  // Temporada 1 Capítulo 3 / Season 1 Episode 3
  /\b(?:temporada|temp|season)[\s._-]*(\d{1,2})[\s._-]*(?:cap(?:[ií]tulo)?|ep(?:isodio|isode)?)[\s._-]*(\d{1,3})()\b/giu,
];

const findEpisode = (stem: string): EpisodeMatch | undefined => {
  for (const pattern of EPISODE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(stem);
    if (match === null) continue;

    const season = Number(match[1]);
    const episode = Number(match[2]);
    const endRaw = match[3];
    if (!Number.isFinite(season) || !Number.isFinite(episode)) continue;

    const episodeEnd =
      endRaw === undefined || endRaw === "" || Number(endRaw) <= episode
        ? undefined
        : Number(endRaw);

    return { season, episode, episodeEnd, start: match.index };
  }

  const episodeOnly = EPISODE_ONLY_PATTERN.exec(stem);
  if (episodeOnly !== null) {
    const onlyNumber = episodeOnly[1];
    if (onlyNumber !== undefined) {
      return { ...splitSpanishChapterNumber(onlyNumber), start: episodeOnly.index };
    }
  }

  return undefined;
};

/**
 * Convención española de capítulos: `Cap.202` es la temporada 2, capítulo 2, y
 * `Cap.308` la temporada 3, capítulo 8. Con una o dos cifras solo se conoce el
 * capítulo, y la temporada queda sin determinar en vez de inventarse.
 */
const splitSpanishChapterNumber = (
  raw: string,
): { season: number | undefined; episode: number; episodeEnd: undefined } => {
  const value = Number(raw);
  if (raw.length >= 3) {
    const season = Math.floor(value / 100);
    const episode = value % 100;
    if (season >= 1 && episode >= 1) return { season, episode, episodeEnd: undefined };
  }
  return { season: undefined, episode: value, episodeEnd: undefined };
};

const EDITION_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bdirector'?s?[\s._-]*cut\b/iu, "Director's Cut"],
  [/\bextended(?:[\s._-]*(?:cut|edition))?\b/iu, "Extended"],
  [/\bimax\b/iu, "IMAX"],
  [/\bunrated\b/iu, "Unrated"],
  [/\bremaster(?:ed)?\b/iu, "Remastered"],
  [/\btheatrical(?:[\s._-]*cut)?\b/iu, "Theatrical"],
  [/\bfinal[\s._-]*cut\b/iu, "Final Cut"],
];

const findEdition = (stem: string): string | undefined => {
  for (const [pattern, label] of EDITION_PATTERNS) {
    if (pattern.test(stem)) return label;
  }
  return undefined;
};

/**
 * Deja el título legible: fuera los bloques entre corchetes o paréntesis que
 * usan los grupos de publicación (`[4k 2160p]`, `(wolfmax4k.com)`), los
 * delimitadores sueltos y los separadores por puntos o guiones bajos.
 */
const cleanTitle = (value: string): string =>
  value
    .replace(/[[(][^\])]*[\])]/gu, " ")
    .replace(/[[\]()]+/gu, " ")
    .replace(/[._]+/gu, " ")
    .replace(/\s*[-–]\s*$/u, "")
    .replace(/\s+/gu, " ")
    .trim();

/**
 * Extrae pistas de un nombre de fichero y, opcionalmente, del nombre de la
 * carpeta que lo contiene (útil en `Serie/Temporada 1/cap03.mkv`).
 */
export const extractIdentificationHints = (
  filename: string,
  folderName?: string,
): IdentificationHints => {
  const parsed = parseMediaFilename(filename);
  const stem = parsed.originalStem;

  const episodeMatch =
    findEpisode(stem) ?? (folderName === undefined ? undefined : findEpisode(folderName));
  const isSeries = episodeMatch !== undefined;

  // Cuando el marcador de episodio aparece antes que la metadata técnica, el
  // título termina justo ahí; si no, se usa el título calculado por el parser.
  const titleFromEpisode =
    episodeMatch !== undefined && episodeMatch.start > 0
      ? cleanTitle(stem.slice(0, episodeMatch.start))
      : "";

  const parsedTitle = cleanTitle(parsed.probableTitle);
  const folderTitle = folderName === undefined ? "" : cleanTitle(folderName);
  // Si el marcador de episodio ocupa todo el nombre (`cap03.mkv`), el título
  // solo puede venir de la carpeta.
  const titleGuess =
    titleFromEpisode.length > 0
      ? titleFromEpisode
      : episodeMatch?.start === 0 && folderTitle.length > 0
        ? folderTitle
        : parsedTitle.length > 0
          ? parsedTitle
          : folderTitle.length > 0
            ? folderTitle
            : cleanTitle(stem);

  // El año solo se acepta si el parser lo reconoció como año, no cualquier
  // número de cuatro cifras suelto.
  const year = parsed.year;
  const edition = findEdition(stem);

  return {
    kind: isSeries ? "series" : "movie",
    titleGuess,
    year,
    season: episodeMatch?.season,
    episode: episodeMatch?.episode,
    episodeEnd: episodeMatch?.episodeEnd,
    edition,
    releaseGroup: parsed.releaseGroup,
    embeddedId: extractEmbeddedId(filename),
  };
};

/** `S01E03` o `S01E03-E04`. Los especiales usan temporada 0 (`S00E01`). */
export const formatEpisodeCode = (
  season: number | undefined,
  episode: number | undefined,
  episodeEnd?: number,
): string | undefined => {
  if (season === undefined || episode === undefined) return undefined;
  const base = `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
  if (episodeEnd === undefined || episodeEnd <= episode) return base;
  return `${base}-E${String(episodeEnd).padStart(2, "0")}`;
};
