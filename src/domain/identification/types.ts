import type { MatchBand, MatchScoreComponent } from "../matching/tmdb-score";
import type { Traced } from "../media/provenance";

export type ContentKind = "movie" | "series";

/** Pistas extraídas del nombre y de la carpeta. Nunca son datos definitivos. */
export interface IdentificationHints {
  readonly kind: ContentKind;
  readonly titleGuess: string;
  readonly year: number | undefined;
  readonly season: number | undefined;
  readonly episode: number | undefined;
  /** Último episodio cuando el fichero agrupa varios (`S01E01-E02`). */
  readonly episodeEnd: number | undefined;
  readonly edition: string | undefined;
  readonly releaseGroup: string | undefined;
}

export interface ProviderReference {
  readonly provider: string;
  readonly id: number;
}

/**
 * Identificación de la obra. Separada por completo del análisis técnico.
 */
export interface ContentIdentification {
  readonly kind: ContentKind;
  /** Título oficial usado en España. Nunca una traducción automática. */
  readonly spanishTitle: Traced<string>;
  readonly originalTitle: Traced<string>;
  readonly originalLanguage: Traced<string>;
  readonly year: Traced<number>;
  readonly season: Traced<number>;
  readonly episode: Traced<number>;
  readonly episodeEnd: Traced<number>;
  readonly episodeTitle: Traced<string>;
  readonly edition: Traced<string>;
  readonly reference: ProviderReference | undefined;
  readonly posterUrl: string | undefined;
  readonly matchBand: MatchBand | undefined;
  readonly matchScore: number | undefined;
  readonly matchComponents: readonly MatchScoreComponent[];
  /** Candidatos alternativos para que la persona usuaria pueda corregir. */
  readonly alternatives: readonly ProviderCandidateSummary[];
}

export interface ProviderCandidateSummary {
  readonly id: number;
  readonly spanishTitle: string;
  readonly originalTitle: string;
  readonly year: number | undefined;
  readonly posterUrl: string | undefined;
  readonly score: number;
  readonly band: MatchBand;
  readonly components: readonly MatchScoreComponent[];
}
