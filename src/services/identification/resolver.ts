import type {
  IdentificationHints,
  ProviderCandidateSummary,
} from "../../domain/identification/types";
import {
  rankTmdbCandidates,
  type MatchBand,
  type MatchScoreComponent,
  type TmdbMovieCandidate,
} from "../../domain/matching/tmdb-score";
import type { MetadataProvider, ProviderCandidate, WorkKind } from "../providers/types";

/**
 * Cascada de identificación.
 *
 * Cada paso es un intento independiente y queda registrado en `attempts`, para
 * que la ficha técnica pueda explicar cómo se llegó al resultado. La cascada se
 * detiene en cuanto un candidato alcanza banda alta; si ninguno la alcanza, se
 * devuelve el mejor de todos los intentos junto con sus alternativas.
 */

export interface ResolveInput {
  readonly hints: IdentificationHints;
  /** Duración real del archivo, en minutos. */
  readonly runtimeMinutes?: number | undefined;
  /** Idiomas base de las pistas de audio (`es`, `en`…). */
  readonly audioLanguages?: readonly string[] | undefined;
  readonly parentFolderName?: string | undefined;
}

export interface ResolveOutcome {
  readonly candidate: ProviderCandidate | undefined;
  readonly kind: WorkKind;
  readonly band: MatchBand | undefined;
  readonly score: number | undefined;
  readonly components: readonly MatchScoreComponent[];
  readonly alternatives: readonly ProviderCandidateSummary[];
  /** Consultas lanzadas, en orden. Trazabilidad para la ficha técnica. */
  readonly attempts: readonly string[];
  readonly error: Error | undefined;
}

export interface ResolveOptions {
  readonly signal?: AbortSignal | undefined;
  readonly previouslySelectedId?: number | undefined;
}

/** Cuántos candidatos se hidratan con su ficha completa antes de puntuar. */
const HYDRATE_LIMIT = 4;

const LEADING_ARTICLE = /^(?:el|la|los|las|un|una|the|a|an)\s+/iu;
const DOMAIN = /\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|es|tv|to|cc|io|me)\b/giu;
const DOWNLOAD_NOISE = /\b(?:descargar|gratis|torrent|castellano|latino|vose|dual|multi)\b/giu;

/** Limpia el título para el intento normalizado de la cascada. */
export const normalizeTitleForSearch = (title: string): string =>
  title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(DOMAIN, " ")
    .replace(DOWNLOAD_NOISE, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(LEADING_ARTICLE, "")
    .trim();

const toScoring = (candidate: ProviderCandidate, order?: number): TmdbMovieCandidate => ({
  id: candidate.id,
  ...(order === undefined ? {} : { providerOrder: order }),
  title: candidate.spanishTitle,
  ...(candidate.originalTitle === undefined ? {} : { originalTitle: candidate.originalTitle }),
  ...(candidate.originalLanguage === undefined
    ? {}
    : { originalLanguage: candidate.originalLanguage }),
  ...(candidate.year === undefined ? {} : { releaseYear: candidate.year }),
  ...(candidate.runtimeMinutes === undefined ? {} : { runtimeMinutes: candidate.runtimeMinutes }),
  ...(candidate.popularity === undefined ? {} : { popularity: candidate.popularity }),
});

const summarize = (
  candidate: ProviderCandidate,
  score: number,
  band: MatchBand,
  components: readonly MatchScoreComponent[],
): ProviderCandidateSummary => ({
  id: candidate.id,
  spanishTitle: candidate.spanishTitle,
  originalTitle: candidate.originalTitle ?? candidate.spanishTitle,
  year: candidate.year,
  posterUrl: candidate.posterUrl,
  score,
  band,
  components,
});

interface Attempt {
  readonly name: string;
  readonly run: () => Promise<readonly ProviderCandidate[]>;
}

const buildPlan = (
  input: ResolveInput,
  provider: MetadataProvider,
  kind: WorkKind,
  signal: AbortSignal | undefined,
): readonly Attempt[] => {
  const { hints } = input;
  const title = hints.titleGuess;
  const plan: Attempt[] = [];

  if (title.length > 0) {
    const year = hints.year;
    if (year !== undefined) {
      plan.push({ name: "title-year", run: () => provider.search({ title, year, kind }, signal) });
      // El año del nombre suele ser el del lanzamiento en vídeo, no el del estreno.
      plan.push({
        name: "title-year-nearby",
        run: () => provider.search({ title, year: year - 1, kind }, signal),
      });
    }
    plan.push({ name: "title-only", run: () => provider.search({ title, kind }, signal) });
    plan.push({ name: "multi", run: () => provider.searchMulti(title, signal) });

    const normalized = normalizeTitleForSearch(title);
    if (normalized.length > 0 && normalized.toLowerCase() !== title.toLowerCase()) {
      plan.push({
        name: "normalized-title",
        run: () => provider.search({ title: normalized, kind }, signal),
      });
    }
  }

  const folder = input.parentFolderName;
  if (folder !== undefined && folder.length > 0) {
    const folderTitle = normalizeTitleForSearch(folder);
    if (folderTitle.length > 0) {
      plan.push({
        name: "parent-folder",
        run: () => provider.search({ title: folderTitle, kind }, signal),
      });
    }
  }

  return plan;
};

export const resolveWork = async (
  input: ResolveInput,
  provider: MetadataProvider,
  options: ResolveOptions = {},
): Promise<ResolveOutcome> => {
  const { hints } = input;
  const kindFromHints: WorkKind = hints.kind === "series" ? "series" : "movie";
  /** `S01E03`, `1x03`, `Cap.202`: no hay señal más clara de que es una serie. */
  const hasEpisodeMarker = hints.episode !== undefined;
  const empty: ResolveOutcome = {
    candidate: undefined,
    kind: kindFromHints,
    band: undefined,
    score: undefined,
    components: [],
    alternatives: [],
    attempts: [],
    error: undefined,
  };

  if (!provider.available) return empty;

  const attempts: string[] = [];
  const signal = options.signal;

  // 1. Identificador incrustado: evidencia exacta, no se puntúa.
  if (hints.embeddedId !== undefined) {
    attempts.push("embedded-id");
    try {
      const found = await provider.findByExternalId(hints.embeddedId, signal);
      if (found !== undefined) {
        return {
          candidate: found,
          kind: found.kind,
          band: "high",
          score: 100,
          components: [
            {
              code: "previous-correction",
              points: 100,
              explanation: "Identificador incrustado en el nombre: coincidencia exacta",
            },
          ],
          alternatives: [],
          attempts: [...attempts],
          error: undefined,
        };
      }
    } catch (error) {
      return {
        ...empty,
        attempts: [...attempts],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  let best: ResolveOutcome = { ...empty, attempts: [...attempts] };

  for (const attempt of buildPlan(input, provider, kindFromHints, signal)) {
    attempts.push(attempt.name);

    let found: readonly ProviderCandidate[];
    try {
      found = await attempt.run();
    } catch (error) {
      return {
        ...best,
        attempts: [...attempts],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    if (found.length === 0) continue;

    // La búsqueda de TMDb no trae la duración, que es lo único que distingue de
    // verdad un remake de su original. Se pide la ficha de los primeros
    // candidatos —cacheada— solo cuando el archivo tiene duración legible.
    const hydrated =
      input.runtimeMinutes === undefined || found.length < 2
        ? found
        : await Promise.all(
            found.map(async (candidate, order) => {
              if (order >= HYDRATE_LIMIT || candidate.runtimeMinutes !== undefined) {
                return candidate;
              }
              try {
                const details = await provider.getDetails(candidate.id, candidate.kind, signal);
                return details?.runtimeMinutes === undefined
                  ? candidate
                  : { ...candidate, runtimeMinutes: details.runtimeMinutes };
              } catch {
                return candidate;
              }
            }),
          );

    const ranked = rankTmdbCandidates(
      {
        title: hints.titleGuess,
        ...(hints.year === undefined ? {} : { year: hints.year }),
        ...(input.runtimeMinutes === undefined ? {} : { runtimeMinutes: input.runtimeMinutes }),
        ...(input.audioLanguages === undefined ? {} : { audioLanguages: input.audioLanguages }),
        ...(options.previouslySelectedId === undefined
          ? {}
          : { previouslySelectedTmdbId: options.previouslySelectedId }),
      },
      hydrated.map((candidate, order) => toScoring(candidate, order)),
    );

    const byId = new Map(hydrated.map((entry) => [entry.id, entry]));
    const summaries = ranked.candidates.flatMap((scored) => {
      const entry = byId.get(scored.candidate.id);
      return entry === undefined
        ? []
        : [summarize(entry, scored.score, scored.band, scored.components)];
    });

    const top = ranked.candidates[0];
    const chosen = top === undefined ? undefined : byId.get(top.candidate.id);
    if (top === undefined || chosen === undefined) continue;

    const outcome: ResolveOutcome = {
      candidate: chosen,
      // El proveedor decide el tipo solo cuando el nombre no lo declara: un
      // `S01E03` explícito es evidencia más fuerte que el resultado de una
      // búsqueda, y sin él se perdería el título del episodio.
      kind: hasEpisodeMarker ? kindFromHints : chosen.kind,
      band: top.band,
      score: top.score,
      components: top.components,
      alternatives: summaries,
      attempts: [...attempts],
      error: undefined,
    };

    if (top.band === "high") return outcome;
    if (best.candidate === undefined || (best.score ?? Number.NEGATIVE_INFINITY) < top.score) {
      best = outcome;
    }
  }

  return { ...best, attempts: [...attempts] };
};
