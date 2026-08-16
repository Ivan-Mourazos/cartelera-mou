/**
 * Abstracción del proveedor de metadata.
 *
 * La aplicación no debe acoplarse a TMDb: la identificación depende de este
 * contrato y cualquier otro proveedor puede implementarlo. El modo sin clave
 * usa `nullMetadataProvider`, que devuelve listas vacías sin romper el flujo.
 */

export type WorkKind = "movie" | "series";

export interface WorkSearchQuery {
  readonly title: string;
  readonly year?: number | undefined;
  readonly kind: WorkKind;
}

export interface ProviderCandidate {
  readonly id: number;
  /** Título oficial usado en España (consulta localizada), nunca traducido. */
  readonly spanishTitle: string;
  readonly originalTitle: string | undefined;
  readonly originalLanguage: string | undefined;
  readonly year: number | undefined;
  readonly posterUrl: string | undefined;
  readonly overview: string | undefined;
}

export interface EpisodeDetails {
  readonly title: string | undefined;
  readonly airYear: number | undefined;
}

export interface ProviderAttribution {
  readonly name: string;
  readonly notice: string;
  readonly logoUrl: string | undefined;
  readonly homepage: string;
}

export interface MetadataProvider {
  readonly id: string;
  readonly available: boolean;
  readonly attribution: ProviderAttribution;
  search: (query: WorkSearchQuery, signal?: AbortSignal) => Promise<readonly ProviderCandidate[]>;
  getEpisode: (
    seriesId: number,
    season: number,
    episode: number,
    signal?: AbortSignal,
  ) => Promise<EpisodeDetails | undefined>;
}

export class MetadataProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "no-credentials"
      | "network"
      | "timeout"
      | "rate-limited"
      | "unauthorized"
      | "invalid-response"
      | "not-found",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "MetadataProviderError";
  }
}

export const nullMetadataProvider: MetadataProvider = {
  id: "none",
  available: false,
  attribution: {
    name: "Sin proveedor",
    notice:
      "Sin proveedor de metadata configurado: los títulos proceden del nombre del fichero y quedan marcados como inferidos.",
    logoUrl: undefined,
    homepage: "",
  },
  search: () => Promise.resolve([]),
  getEpisode: () => Promise.resolve(undefined),
};
