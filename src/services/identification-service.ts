import { applyProviderMatch, identificationFromHints } from "../domain/identification/build";
import type {
  ContentIdentification,
  IdentificationHints,
  ProviderCandidateSummary,
} from "../domain/identification/types";
import { resolveWork } from "./identification/resolver";
import { recallCorrection } from "./learned-corrections";
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
  /** Duración real del archivo, en minutos. Señal de desempate. */
  readonly runtimeMinutes?: number;
  /** Idiomas base de las pistas de audio. */
  readonly audioLanguages?: readonly string[];
  readonly parentFolderName?: string;
}

export interface IdentificationOutcome {
  readonly identification: ContentIdentification;
  readonly candidates: readonly ProviderCandidateSummary[];
  /** Consultas lanzadas, en orden. Trazabilidad para la ficha técnica. */
  readonly attempts: readonly string[];
  readonly error: Error | undefined;
}

/**
 * Identificación de la obra: pistas del nombre y del archivo → cascada de
 * consultas → puntuación auditable. Siempre se aplica el mejor candidato, y las
 * alternativas viajan con el resultado para poder cambiarlo en un clic.
 */
export const identifyContent = async (
  hints: IdentificationHints,
  provider: MetadataProvider,
  options: IdentifyOptions = {},
): Promise<IdentificationOutcome> => {
  const base = identificationFromHints(hints);
  const kind = hints.kind === "series" ? "series" : "movie";
  // Una corrección previa sobre la misma obra pesa en la puntuación.
  const learned = recallCorrection(hints.titleGuess, kind);
  const previouslySelectedId = options.previouslySelectedId ?? learned;

  const outcome = await resolveWork(
    {
      hints,
      ...(options.runtimeMinutes === undefined ? {} : { runtimeMinutes: options.runtimeMinutes }),
      ...(options.audioLanguages === undefined ? {} : { audioLanguages: options.audioLanguages }),
      ...(options.parentFolderName === undefined
        ? {}
        : { parentFolderName: options.parentFolderName }),
    },
    provider,
    {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(previouslySelectedId === undefined ? {} : { previouslySelectedId }),
    },
  );

  if (outcome.candidate === undefined) {
    return {
      identification: { ...base, alternatives: outcome.alternatives },
      candidates: outcome.alternatives,
      attempts: outcome.attempts,
      error: outcome.error,
    };
  }

  // El proveedor sabe mejor que el nombre si es película o serie.
  const withKind: ContentIdentification = { ...base, kind: outcome.kind };

  return {
    identification: await applyCandidate(withKind, outcome.candidate, provider, {
      score: outcome.score ?? 0,
      band: outcome.band,
      components: outcome.components,
      alternatives: outcome.alternatives,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }),
    candidates: outcome.alternatives,
    attempts: outcome.attempts,
    error: outcome.error,
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
      // Una llamada por temporada, no una por episodio.
      const episodes = await provider.getSeasonEpisodes(candidate.id, season, context.signal);
      episodeTitle = episodes.get(episode);
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
