/**
 * Abstracción del proveedor de metadata.
 *
 * La aplicación no debe acoplarse a TMDb: la identificación depende de este
 * contrato y cualquier otro proveedor puede implementarlo. El modo sin clave
 * usa `nullMetadataProvider`, que devuelve listas vacías sin romper el flujo.
 */

import type { EmbeddedId } from "../../domain/identification/embedded-ids";

export type WorkKind = "movie" | "series";

export interface WorkSearchQuery {
  readonly title: string;
  readonly year?: number | undefined;
  readonly kind: WorkKind;
}

export interface ProviderCandidate {
  readonly id: number;
  /** Película o serie según el propio proveedor, no según el nombre del archivo. */
  readonly kind: WorkKind;
  /** Título oficial usado en España (consulta localizada), nunca traducido. */
  readonly spanishTitle: string;
  readonly originalTitle: string | undefined;
  readonly originalLanguage: string | undefined;
  readonly year: number | undefined;
  /** Duración oficial. Es la señal de desempate más fuerte que hay. */
  readonly runtimeMinutes: number | undefined;
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
  /** Búsqueda sin declarar el tipo: el proveedor decide si es película o serie. */
  searchMulti: (title: string, signal?: AbortSignal) => Promise<readonly ProviderCandidate[]>;
  /** Consulta directa por identificador incrustado en el nombre. */
  findByExternalId: (
    id: EmbeddedId,
    signal?: AbortSignal,
  ) => Promise<ProviderCandidate | undefined>;
  /** Títulos de toda una temporada en una sola llamada. */
  getSeasonEpisodes: (
    seriesId: number,
    season: number,
    signal?: AbortSignal,
  ) => Promise<ReadonlyMap<number, string>>;
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
  searchMulti: () => Promise.resolve([]),
  findByExternalId: () => Promise.resolve(undefined),
  getSeasonEpisodes: () => Promise.resolve(new Map<number, string>()),
  getEpisode: () => Promise.resolve(undefined),
};
