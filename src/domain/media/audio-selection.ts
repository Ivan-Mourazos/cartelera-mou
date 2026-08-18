import { formatAudioCodecForName } from "./audio";
import { languageFilenameLabel, otherLanguageLabel } from "./language";
import type { AudioTrackInfo, NormalizedMedia } from "./types";

/**
 * Selección de la pista de audio principal y resumen de los demás idiomas.
 *
 * Prioridad del producto: el castellano. Los comentarios y la audiodescripción
 * nunca son pista principal y no cuentan como idioma presente si son las únicas
 * pistas de ese idioma.
 */

export interface AudioSelection {
  readonly primary: AudioTrackInfo | undefined;
  /** Etiquetas cortas del resto de idiomas, sin repetir y sin el principal. */
  readonly otherLanguages: readonly string[];
  readonly hasCastilian: boolean;
  readonly hasSpanishOfUnknownRegion: boolean;
  readonly reason: string;
}

const isSelectable = (track: AudioTrackInfo): boolean =>
  track.isCommentary.value !== true && track.isDescriptiveAudio.value !== true;

export const selectAudio = (
  media: NormalizedMedia,
  options: { readonly originalLanguageBase?: string } = {},
): AudioSelection => {
  const selectable = media.audio.filter(isSelectable);
  const castilian = selectable.find((track) => track.language.value?.label === "ESP");
  // Cualquier español cuenta por delante del idioma original: identificar la
  // obra en TMDb no debe cambiar la pista elegida a inglés solo porque la
  // película sea estadounidense.
  const anySpanish = selectable.find((track) => track.language.value?.base === "es");
  const spanishAmbiguous = selectable.find(
    (track) => track.language.value?.base === "es" && track.language.value.regionAmbiguous,
  );
  const originalLanguage =
    options.originalLanguageBase === undefined
      ? undefined
      : selectable.find((track) => track.language.value?.base === options.originalLanguageBase);
  const defaultTrack = selectable.find((track) => track.isDefault.value === true);

  const primary = castilian ?? anySpanish ?? originalLanguage ?? defaultTrack ?? selectable[0];
  const reason =
    castilian !== undefined
      ? "Pista en castellano (es-ES)"
      : anySpanish !== undefined
        ? "Pista en español (la región no consta o es latinoamericana)"
        : originalLanguage !== undefined
          ? "Pista en el idioma original de la obra"
          : defaultTrack !== undefined
            ? "Pista marcada como predeterminada en el contenedor"
            : primary === undefined
              ? "Sin pistas de audio utilizables"
              : "Primera pista de audio no comentario";

  const primaryLabel =
    primary?.language.value === undefined ? undefined : otherLanguageLabel(primary.language.value);

  const otherLanguages: string[] = [];
  for (const track of selectable) {
    const language = track.language.value;
    if (language === undefined) continue;
    const label = otherLanguageLabel(language);
    if (label === primaryLabel) continue;
    if (!otherLanguages.includes(label)) otherLanguages.push(label);
  }

  return {
    primary,
    otherLanguages,
    hasCastilian: castilian !== undefined,
    hasSpanishOfUnknownRegion: spanishAmbiguous !== undefined,
    reason,
  };
};

/** `Castellano TrueHD Atmos 7.1`. Devuelve `undefined` si falta el dato esencial. */
export const formatPrimaryAudio = (
  track: AudioTrackInfo | undefined,
  options: { readonly compact?: boolean } = {},
): string | undefined => {
  if (track === undefined) return undefined;

  const language = track.language.value;
  // La pista principal se escribe con el nombre del idioma («Castellano»); el
  // resumen de los demás idiomas usa códigos cortos para no alargar el nombre.
  const languageLabel =
    language === undefined
      ? undefined
      : options.compact === true
        ? otherLanguageLabel(language)
        : languageFilenameLabel(language);
  const atmos = track.atmos.value === true;
  const dtsX = track.dtsX.value === true;
  const codec = formatAudioCodecForName(track.codec.value, { atmos, dtsX });
  const channels = track.channelLayout.value;

  const parts = [languageLabel, codec, channels].filter(
    (part): part is string => part !== undefined && part.length > 0,
  );
  return parts.length === 0 ? undefined : parts.join(" ");
};

/**
 * Separador de idiomas.
 *
 * La especificación funcional pedía `/`, pero la barra es el separador de rutas
 * en Windows, macOS y Linux: no puede formar parte de un nombre de archivo. Se
 * usa `+`, legal en todos los sistemas, y el separador es configurable.
 */
export const DEFAULT_LANGUAGE_SEPARATOR = "+";

/** `ENG+FRA`. Sin la palabra «Otros»: el bloque ya se lee como tal. */
export const formatOtherLanguages = (
  languages: readonly string[],
  options: { readonly separator?: string } = {},
): string | undefined =>
  languages.length === 0
    ? undefined
    : languages.join(options.separator ?? DEFAULT_LANGUAGE_SEPARATOR);
