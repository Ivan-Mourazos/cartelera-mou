import { confirmed, inferred, unknown, userConfirmed } from "../media/provenance";
import type { ContentIdentification, IdentificationHints, ProviderCandidateSummary } from "./types";

/**
 * Identificación derivada únicamente del nombre del fichero.
 *
 * Todo queda marcado como `INFERRED`: el nombre no demuestra ni el título
 * oficial en España ni el año de estreno. Es el punto de partida para consultar
 * al proveedor de metadata.
 */
export const identificationFromHints = (hints: IdentificationHints): ContentIdentification => ({
  kind: hints.kind,
  spanishTitle:
    hints.titleGuess.length === 0
      ? unknown<string>("ORIGINAL_FILENAME", "No se pudo extraer un título del nombre")
      : inferred(hints.titleGuess, "ORIGINAL_FILENAME", "Título deducido del nombre del fichero"),
  originalTitle: unknown<string>("ORIGINAL_FILENAME"),
  originalLanguage: unknown<string>("ORIGINAL_FILENAME"),
  year:
    hints.year === undefined
      ? unknown<number>("ORIGINAL_FILENAME", "El nombre no contiene un año reconocible")
      : inferred(hints.year, "ORIGINAL_FILENAME", "Año presente en el nombre del fichero"),
  season:
    hints.season === undefined
      ? unknown<number>("ORIGINAL_FILENAME")
      : inferred(hints.season, "ORIGINAL_FILENAME", "Temporada marcada en el nombre"),
  episode:
    hints.episode === undefined
      ? unknown<number>("ORIGINAL_FILENAME")
      : inferred(hints.episode, "ORIGINAL_FILENAME", "Episodio marcado en el nombre"),
  episodeEnd:
    hints.episodeEnd === undefined
      ? unknown<number>("ORIGINAL_FILENAME")
      : inferred(hints.episodeEnd, "ORIGINAL_FILENAME", "Rango de episodios marcado en el nombre"),
  episodeTitle: unknown<string>("METADATA_PROVIDER"),
  edition:
    hints.edition === undefined
      ? unknown<string>("ORIGINAL_FILENAME")
      : inferred(hints.edition, "ORIGINAL_FILENAME", "Edición especial marcada en el nombre"),
  reference: undefined,
  posterUrl: undefined,
  matchBand: undefined,
  matchScore: undefined,
  matchComponents: [],
  alternatives: [],
});

export interface ProviderWorkDetails {
  readonly provider: string;
  readonly id: number;
  readonly spanishTitle: string;
  readonly originalTitle: string | undefined;
  readonly originalLanguage: string | undefined;
  readonly year: number | undefined;
  readonly posterUrl: string | undefined;
  readonly episodeTitle?: string | undefined;
}

/**
 * Aplica el resultado del proveedor. Solo el título, el título original, el año
 * y el título del episodio pasan a `CONFIRMED`: el resto de la identificación
 * (temporada, episodio) sigue procediendo del nombre.
 */
export const applyProviderMatch = (
  base: ContentIdentification,
  details: ProviderWorkDetails,
  match: {
    readonly score: number;
    readonly band: ContentIdentification["matchBand"];
    readonly components: ContentIdentification["matchComponents"];
    readonly alternatives: readonly ProviderCandidateSummary[];
  },
): ContentIdentification => ({
  ...base,
  spanishTitle: confirmed(
    details.spanishTitle,
    "METADATA_PROVIDER",
    `Título oficial en España según ${details.provider} (es-ES)`,
  ),
  originalTitle:
    details.originalTitle === undefined
      ? base.originalTitle
      : confirmed(details.originalTitle, "METADATA_PROVIDER", "Título original del proveedor"),
  originalLanguage:
    details.originalLanguage === undefined
      ? base.originalLanguage
      : confirmed(details.originalLanguage, "METADATA_PROVIDER", "Idioma original de la obra"),
  year:
    details.year === undefined
      ? base.year
      : confirmed(details.year, "METADATA_PROVIDER", "Año de estreno según el proveedor"),
  episodeTitle:
    details.episodeTitle === undefined
      ? base.episodeTitle
      : confirmed(details.episodeTitle, "METADATA_PROVIDER", "Título del episodio en español"),
  reference: { provider: details.provider, id: details.id },
  posterUrl: details.posterUrl,
  matchBand: match.band,
  matchScore: match.score,
  matchComponents: match.components,
  alternatives: match.alternatives,
});

export type EditableIdentificationField =
  "spanishTitle" | "year" | "season" | "episode" | "episodeTitle";

/** Una corrección manual gana sobre el proveedor y sobre el nombre del archivo. */
export const applyUserCorrection = (
  identification: ContentIdentification,
  field: EditableIdentificationField,
  value: string | number | undefined,
): ContentIdentification => {
  if (value === undefined || value === "") {
    return { ...identification, [field]: unknown("USER_INPUT", "Vaciado manualmente") };
  }
  return { ...identification, [field]: userConfirmed(value, "Corrección manual") };
};

/** Marca la obra como película o serie a mano. */
export const setContentKind = (
  identification: ContentIdentification,
  kind: ContentIdentification["kind"],
): ContentIdentification => ({ ...identification, kind });
