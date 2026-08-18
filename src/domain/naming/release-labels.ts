import type { AudioCodecName, HdrFormatName, VideoCodecName } from "../media/types";

/**
 * Vocabulario único de presentación.
 *
 * Cualquier etiqueta que acabe escrita en el nombre de un archivo se decide
 * aquí, de modo que el formato no quede repartido por media docena de módulos.
 * El criterio es el de las publicaciones: lo que la gente espera leer.
 */

/** Clase comercial tal y como se anuncia. */
export type CommercialClass = "8K" | "4K" | "2K" | "Full HD" | "HD" | "SD";

/** Resolución en píxeles verticales del máster. */
export type PixelLabel = "4320p" | "2160p" | "1440p" | "1080p" | "720p" | "576p" | "480p";

/**
 * Fuente del material. Nunca es verificable leyendo el archivo: procede de la
 * etiqueta del nombre, de una heurística sobre el stream o de una corrección
 * manual, y siempre viaja con esa procedencia.
 */
export type ReleaseSource =
  | "BluRay REMUX"
  | "BluRay"
  | "UHDRip"
  | "BDRip"
  | "BRRip"
  | "WEB-DL"
  | "WEBRip"
  | "HDTV"
  | "HDTVRip"
  | "microHD"
  | "HDRip"
  | "DVDRip"
  | "DVDScr"
  | "SCR"
  | "TC"
  | "TS"
  | "CamRip";

export const ALL_RELEASE_SOURCES: readonly ReleaseSource[] = [
  "BluRay REMUX",
  "BluRay",
  "UHDRip",
  "BDRip",
  "BRRip",
  "WEB-DL",
  "WEBRip",
  "HDTV",
  "HDTVRip",
  "microHD",
  "HDRip",
  "DVDRip",
  "DVDScr",
  "SCR",
  "TC",
  "TS",
  "CamRip",
];

/** El nombre del stream, no el del codificador: `x265` no es verificable. */
export const videoCodecLabel = (codec: VideoCodecName | undefined): string | undefined => codec;

const AUDIO_CODEC_LABELS: Readonly<Partial<Record<AudioCodecName, string>>> = {
  "Dolby Digital Plus": "DD+",
  "Dolby Digital": "DD",
};

export const audioCodecLabel = (
  codec: AudioCodecName | undefined,
  options: { readonly atmos: boolean; readonly dtsX: boolean },
): string | undefined => {
  if (codec === undefined) return undefined;
  // `:` es un carácter prohibido en nombres de archivo de Windows: DTS-X, no DTS:X.
  if (options.dtsX) return "DTS-X";
  const base = AUDIO_CODEC_LABELS[codec] ?? codec;
  return options.atmos ? `${base} Atmos` : base;
};

/** Solo se escribe la profundidad cuando aporta: 8 bits es lo corriente. */
export const bitDepthLabel = (bits: number | undefined): string | undefined =>
  bits === undefined || bits <= 8 ? undefined : `${String(bits)}bit`;

export const hdrLabel = (formats: readonly HdrFormatName[]): string | undefined => {
  if (formats.includes("Dolby Vision")) return "DV";
  if (formats.includes("HDR10+")) return "HDR10+";
  if (formats.includes("HDR10")) return "HDR10";
  if (formats.includes("HLG")) return "HLG";
  return undefined;
};
