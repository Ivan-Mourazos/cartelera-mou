import { applyProviderMatch, identificationFromHints } from "../domain/identification/build";
import type {
  ContentIdentification,
  IdentificationHints,
  ProviderCandidateSummary,
} from "../domain/identification/types";
import { rankTmdbCandidates, type TmdbMovieCandidate } from "../domain/matching/tmdb-score";
import type { MetadataProvider, ProviderCandidate } from "./providers/types";

/**
 * Identificación de la obra: pistas del nombre → proveedor → puntuación
 * auditable. Una coincidencia dudosa nunca se aplica en silencio; se devuelven
 * los candidatos para que la persona usuaria elija.
 */

export interface IdentifyOptions {
  readonly signal?: AbortSignal;
  /** Puntuación mínima con margen suficiente para aplicar automáticamente. */
  readonly autoApplyBand?: "high" | "medium";
  readonly previouslySelectedId?: number;
}

const toScoringCandidate = (candidate: ProviderCandidate): TmdbMovieCandidate => ({
  id: candidate.id,
  title: candidate.spanishTitle,
  ...(candidate.originalTitle === undefined ? {} : { originalTitle: candidate.originalTitle }),
  ...(candidate.year === undefined ? {} : { releaseYear: candidate.year }),
});

const summarize = (
  candidate: ProviderCandidate,
  score: number,
  band: ProviderCandidateSummary["band"],
  components: ProviderCandidateSummary["components"],
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

export interface IdentificationOutcome {
  readonly identification: ContentIdentification;
  readonly candidates: readonly ProviderCandidateSummary[];
  readonly error: Error | undefined;
}

export const identifyContent = async (
  hints: IdentificationHints,
  provider: MetadataProvider,
  options: IdentifyOptions = {},
): Promise<IdentificationOutcome> => {
  const base = identificationFromHints(hints);
  if (!provider.available || hints.titleGuess.length === 0) {
    return { identification: base, candidates: [], error: undefined };
  }

  let found: readonly ProviderCandidate[];
  try {
    found = await provider.search(
      {
        title: hints.titleGuess,
        year: hints.year,
        kind: hints.kind === "series" ? "series" : "movie",
      },
      options.signal,
    );
  } catch (error) {
    return {
      identification: base,
      candidates: [],
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  if (found.length === 0) return { identification: base, candidates: [], error: undefined };

  const ranked = rankTmdbCandidates(
    {
      title: hints.titleGuess,
      ...(hints.year === undefined ? {} : { year: hints.year }),
      ...(options.previouslySelectedId === undefined
        ? {}
        : { previouslySelectedTmdbId: options.previouslySelectedId }),
    },
    found.map(toScoringCandidate),
  );

  const byId = new Map(found.map((candidate) => [candidate.id, candidate]));
  const summaries = ranked.candidates.flatMap((scored) => {
    const candidate = byId.get(scored.candidate.id);
    return candidate === undefined
      ? []
      : [summarize(candidate, scored.score, scored.band, scored.components)];
  });

  const best = ranked.candidates[0];
  const autoBand = options.autoApplyBand ?? "high";
  const canAutoApply =
    best !== undefined &&
    (best.band === "high" || (autoBand === "medium" && best.band === "medium")) &&
    (ranked.autoSelectedId !== undefined || autoBand === "medium");

  if (best === undefined || !canAutoApply) {
    return { identification: base, candidates: summaries, error: undefined };
  }

  const chosen = byId.get(best.candidate.id);
  if (chosen === undefined)
    return { identification: base, candidates: summaries, error: undefined };

  return {
    identification: await applyCandidate(base, chosen, provider, {
      score: best.score,
      band: best.band,
      components: best.components,
      alternatives: summaries,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }),
    candidates: summaries,
    error: undefined,
  };
};

/** Aplica un candidato concreto (automático o elegido manualmente). */
export const applyCandidate = async (
  base: ContentIdentification,
  candidate: ProviderCandidate,
  provider: MetadataProvider,
  context: {
    readonly score: number;
    readonly band: ContentIdentification["matchBand"];
    readonly components: ContentIdentification["matchComponents"];
    readonly alternatives: readonly ProviderCandidateSummary[];
    readonly signal?: AbortSignal;
  },
): Promise<ContentIdentification> => {
  let episodeTitle: string | undefined;

  const season = base.season.value;
  const episode = base.episode.value;
  if (base.kind === "series" && season !== undefined && episode !== undefined) {
    try {
      const details = await provider.getEpisode(candidate.id, season, episode, context.signal);
      episodeTitle = details?.title;
    } catch {
      episodeTitle = undefined;
    }
  }

  return applyProviderMatch(
    base,
    {
      provider: provider.id,
      id: candidate.id,
      spanishTitle: candidate.spanishTitle,
      originalTitle: candidate.originalTitle,
      originalLanguage: candidate.originalLanguage,
      year: candidate.year,
      posterUrl: candidate.posterUrl,
      ...(episodeTitle === undefined ? {} : { episodeTitle }),
    },
    {
      score: context.score,
      band: context.band,
      components: context.components,
      alternatives: context.alternatives,
    },
  );
};
