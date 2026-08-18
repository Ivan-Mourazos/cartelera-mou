/**
 * Identificadores del catálogo incrustados en el nombre por otras herramientas
 * (Radarr, Sonarr, Plex, Jellyfin).
 *
 * Es la evidencia más fuerte que puede traer un nombre de archivo: no se
 * puntúa, se consulta directamente. Ignorarla, como se hacía hasta ahora, es
 * tirar un acierto seguro.
 */

export type EmbeddedId =
  | { readonly provider: "imdb"; readonly imdbId: string }
  | { readonly provider: "tmdb"; readonly tmdbId: number };

/** `{tmdb-438631}`, `[tmdbid-438631]`, `tmdb-438631`. */
const TMDB_PATTERN = /(?:\{|\[|\b)tmdb(?:id)?[-_ :]?(\d{1,8})(?:\}|\]|\b)/iu;

/** Los identificadores de IMDb tienen entre 7 y 9 cifras tras `tt`. */
const IMDB_PATTERN = /\btt(\d{7,9})\b/iu;

export const extractEmbeddedId = (text: string): EmbeddedId | undefined => {
  const tmdb = TMDB_PATTERN.exec(text);
  const tmdbDigits = tmdb?.[1];
  if (tmdbDigits !== undefined) {
    const parsed = Number.parseInt(tmdbDigits, 10);
    if (Number.isFinite(parsed) && parsed > 0) return { provider: "tmdb", tmdbId: parsed };
  }

  const imdb = IMDB_PATTERN.exec(text);
  const imdbDigits = imdb?.[1];
  if (imdbDigits !== undefined) return { provider: "imdb", imdbId: `tt${imdbDigits}` };

  return undefined;
};
