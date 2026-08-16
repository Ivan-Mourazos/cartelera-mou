import { z } from "zod";

import {
  MetadataProviderError,
  type EpisodeDetails,
  type MetadataProvider,
  type ProviderCandidate,
  type WorkSearchQuery,
} from "./types";

/**
 * Proveedor TMDb.
 *
 * Consulta siempre localizado a España (`language=es-ES`, `region=ES`) para
 * obtener el título oficial comercializado aquí. Si TMDb no tiene título en
 * español devuelve el original, y así se conserva: la aplicación nunca traduce.
 *
 * Toda respuesta se valida con Zod antes de usarse; los datos de un servicio
 * externo no se consideran confiables.
 */

const TMDB_API = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Rutas de imagen admitidas: TMDb devuelve `/xxxxx.jpg`. */
const POSTER_PATH = /^\/[A-Za-z0-9._-]+$/u;

const movieResultSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().optional(),
  original_title: z.string().optional(),
  original_language: z.string().optional(),
  release_date: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  overview: z.string().optional(),
});

const seriesResultSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().optional(),
  original_name: z.string().optional(),
  original_language: z.string().optional(),
  first_air_date: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  overview: z.string().optional(),
});

const searchSchema = z.object({
  results: z.array(z.unknown()).default([]),
  total_results: z.number().optional(),
});

const episodeSchema = z.object({
  name: z.string().optional(),
  air_date: z.string().optional(),
});

const yearOf = (date: string | undefined): number | undefined => {
  if (date === undefined) return undefined;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) && year > 1800 ? year : undefined;
};

const posterUrl = (path: string | null | undefined, size = "w185"): string | undefined => {
  if (path === null || path === undefined) return undefined;
  if (!POSTER_PATH.test(path)) return undefined;
  return `${IMAGE_BASE}/${size}${path}`;
};

const emptyToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

export interface TmdbCredentials {
  /** Clave v3 o token de lectura v4. Se detecta automáticamente. */
  readonly key: string;
}

const authHeaders = (key: string): Record<string, string> =>
  key.split(".").length === 3 ? { Authorization: `Bearer ${key}` } : {};

const withAuthQuery = (url: URL, key: string): URL => {
  if (key.split(".").length !== 3) url.searchParams.set("api_key", key);
  return url;
};

const combineSignals = (signal: AbortSignal | undefined, timeoutMs: number): AbortSignal => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
};

const requestJson = async (
  path: string,
  params: Record<string, string>,
  key: string,
  signal: AbortSignal | undefined,
): Promise<unknown> => {
  const url = withAuthQuery(new URL(`${TMDB_API}${path}`), key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json", ...authHeaders(key) },
      signal: combineSignals(signal, DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "TimeoutError";
    throw new MetadataProviderError(
      aborted ? "TMDb no respondió a tiempo." : "No se pudo contactar con TMDb.",
      aborted ? "timeout" : "network",
      true,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new MetadataProviderError("La clave de TMDb no es válida.", "unauthorized", false);
  }
  if (response.status === 429) {
    throw new MetadataProviderError(
      "TMDb ha limitado las peticiones. Inténtalo de nuevo en unos segundos.",
      "rate-limited",
      true,
    );
  }
  if (response.status === 404) {
    throw new MetadataProviderError("TMDb no encontró el recurso.", "not-found", false);
  }
  if (!response.ok) {
    throw new MetadataProviderError(
      `TMDb devolvió un error ${String(response.status)}.`,
      "network",
      true,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new MetadataProviderError(
      "TMDb devolvió una respuesta ilegible.",
      "invalid-response",
      true,
    );
  }
};

const cacheKey = (query: WorkSearchQuery): string =>
  `${query.kind}|${query.title.toLowerCase()}|${String(query.year ?? "")}`;

export const createTmdbProvider = (credentials: TmdbCredentials): MetadataProvider => {
  const key = credentials.key.trim();
  const cache = new Map<string, readonly ProviderCandidate[]>();
  const episodeCache = new Map<string, EpisodeDetails>();

  const ensureKey = (): void => {
    if (key.length === 0) {
      throw new MetadataProviderError("No hay clave de TMDb configurada.", "no-credentials", false);
    }
  };

  const search = async (
    query: WorkSearchQuery,
    signal?: AbortSignal,
  ): Promise<readonly ProviderCandidate[]> => {
    ensureKey();
    const cached = cache.get(cacheKey(query));
    if (cached !== undefined) return cached;

    const isMovie = query.kind === "movie";
    const params: Record<string, string> = {
      query: query.title,
      language: "es-ES",
      include_adult: "false",
    };
    if (isMovie) params.region = "ES";
    if (query.year !== undefined) {
      params[isMovie ? "year" : "first_air_date_year"] = String(query.year);
    }

    const payload = searchSchema.safeParse(
      await requestJson(isMovie ? "/search/movie" : "/search/tv", params, key, signal),
    );
    if (!payload.success) {
      throw new MetadataProviderError(
        "La respuesta de TMDb no tiene el formato esperado.",
        "invalid-response",
        false,
      );
    }

    const candidates: ProviderCandidate[] = [];
    for (const raw of payload.data.results.slice(0, 10)) {
      if (isMovie) {
        const parsed = movieResultSchema.safeParse(raw);
        if (!parsed.success) continue;
        const item = parsed.data;
        const title = emptyToUndefined(item.title) ?? emptyToUndefined(item.original_title);
        if (title === undefined) continue;
        candidates.push({
          id: item.id,
          spanishTitle: title,
          originalTitle: emptyToUndefined(item.original_title),
          originalLanguage: emptyToUndefined(item.original_language),
          year: yearOf(item.release_date),
          posterUrl: posterUrl(item.poster_path),
          overview: emptyToUndefined(item.overview),
        });
      } else {
        const parsed = seriesResultSchema.safeParse(raw);
        if (!parsed.success) continue;
        const item = parsed.data;
        const title = emptyToUndefined(item.name) ?? emptyToUndefined(item.original_name);
        if (title === undefined) continue;
        candidates.push({
          id: item.id,
          spanishTitle: title,
          originalTitle: emptyToUndefined(item.original_name),
          originalLanguage: emptyToUndefined(item.original_language),
          year: yearOf(item.first_air_date),
          posterUrl: posterUrl(item.poster_path),
          overview: emptyToUndefined(item.overview),
        });
      }
    }

    cache.set(cacheKey(query), candidates);
    return candidates;
  };

  const getEpisode = async (
    seriesId: number,
    season: number,
    episode: number,
    signal?: AbortSignal,
  ): Promise<EpisodeDetails | undefined> => {
    ensureKey();
    const id = `${String(seriesId)}|${String(season)}|${String(episode)}`;
    const cached = episodeCache.get(id);
    if (cached !== undefined) return cached;

    let payload: unknown;
    try {
      payload = await requestJson(
        `/tv/${String(seriesId)}/season/${String(season)}/episode/${String(episode)}`,
        { language: "es-ES" },
        key,
        signal,
      );
    } catch (error) {
      if (error instanceof MetadataProviderError && error.code === "not-found") return undefined;
      throw error;
    }

    const parsed = episodeSchema.safeParse(payload);
    if (!parsed.success) return undefined;

    const details: EpisodeDetails = {
      title: emptyToUndefined(parsed.data.name),
      airYear: yearOf(parsed.data.air_date),
    };
    episodeCache.set(id, details);
    return details;
  };

  return {
    id: "tmdb",
    available: key.length > 0,
    attribution: {
      name: "The Movie Database (TMDb)",
      notice: "Este producto usa la API de TMDb, pero no está avalado ni certificado por TMDb.",
      logoUrl: "/tmdb-logo.svg",
      homepage: "https://www.themoviedb.org/",
    },
    search,
    getEpisode,
  };
};
