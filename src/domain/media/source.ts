import { ALL_RELEASE_SOURCES } from "../naming/release-labels";
import { parseMediaFilename } from "../naming/parser";
import { inferred, unknown, type Traced } from "./provenance";
import type { SourceInfo, SourceMedia, SourceType } from "./types";

/**
 * Fuente y tipo de lanzamiento.
 *
 * No existe ninguna forma fiable de confirmar desde el fichero que un contenido
 * proceda de un Blu-ray o de un WEB-DL, ni de que sea un REMUX: un bitrate alto,
 * un tamaño grande o un códec concreto no lo demuestran. Por eso la fuente se
 * extrae del nombre original (o se deduce del stream) y NUNCA se marca como
 * `CONFIRMED`. Se escribe igualmente en el nombre, porque es lo que se espera
 * leer, pero la ficha técnica declara siempre de dónde salió.
 */

const KNOWN_MEDIA = new Set<string>(
  ALL_RELEASE_SOURCES.filter((value) => value !== "BluRay REMUX"),
);

const mediaFromEvidence = (value: string | undefined): SourceMedia | undefined =>
  value !== undefined && KNOWN_MEDIA.has(value) ? (value as SourceMedia) : undefined;

export const detectSourceFromFilename = (filename: string): SourceInfo => {
  const parsed = parseMediaFilename(filename);

  const mediaEvidence = parsed.evidence.find((entry) => entry.field === "mediaSource");
  const remuxEvidence = parsed.evidence.find((entry) => entry.field === "releaseType");

  const media = mediaFromEvidence(
    typeof mediaEvidence?.value === "string" ? mediaEvidence.value : undefined,
  );
  const isRemux = remuxEvidence?.value === "REMUX";

  return {
    media:
      media === undefined
        ? unknown<SourceMedia>("ORIGINAL_FILENAME", "El nombre no declara una fuente reconocible")
        : inferred(
            media,
            "ORIGINAL_FILENAME",
            `Etiqueta «${mediaEvidence?.trace.raw ?? media}» en el nombre original. No verificable en el fichero.`,
          ),
    type: isRemux
      ? inferred<SourceType>(
          "REMUX",
          "ORIGINAL_FILENAME",
          "Etiqueta «REMUX» en el nombre original. No verificable en el fichero.",
        )
      : unknown<SourceType>("ORIGINAL_FILENAME", "El nombre no declara REMUX"),
  };
};

/**
 * Etiqueta de fuente que se escribe en el nombre.
 *
 * La clase comercial (`4K`, `Full HD`) y la resolución (`2160p`) viajan aparte:
 * aquí solo se decide `BluRay REMUX`, `WEB-DL`, `DVDRip`… Si no hay evidencia,
 * no se escribe nada: nunca aparece `UNKNOWN` en un nombre de archivo.
 */
export const composeSourceLabel = (
  source: SourceInfo,
  options: { readonly allowInferred?: boolean } = {},
): string | undefined => {
  const allowInferred = options.allowInferred ?? true;
  const usable = <T>(traced: Traced<T>): T | undefined =>
    traced.value !== undefined && (allowInferred || traced.confidence !== "INFERRED")
      ? traced.value
      : undefined;

  const media = usable(source.media);
  const isRemux = usable(source.type) === "REMUX";

  // REMUX sin soporte no significa nada: no se escribe suelto.
  if (media === undefined) return undefined;
  return isRemux && media === "BluRay" ? "BluRay REMUX" : media;
};

/** Presentación completa para la ficha técnica: `BluRay REMUX`. */
export const describeSourceDetail = (source: SourceInfo): string | undefined => {
  const media = source.media.value;
  const type = source.type.value;
  if (media === undefined && type === undefined) return undefined;
  if (media === undefined) return type;
  if (type === undefined) return media;
  return `${media} ${type}`;
};
