import { parseMediaFilename } from "../naming/parser";
import { inferred, unknown, type Traced } from "./provenance";
import type { QualityClass, SourceInfo, SourceMedia, SourceType } from "./types";

/**
 * Fuente y tipo de lanzamiento.
 *
 * No existe ninguna forma fiable de confirmar desde el fichero que un contenido
 * proceda de un UHD Blu-ray o de un WEB-DL, ni de que sea un REMUX: un bitrate
 * alto, un tamaño grande o un códec concreto no lo demuestran. Por eso la fuente
 * se extrae del nombre original y NUNCA se marca como `CONFIRMED`.
 */

const MEDIA_BY_EVIDENCE: ReadonlyMap<string, SourceMedia> = new Map([
  ["UHD Blu-ray", "UHD Blu-ray"],
  ["Blu-ray", "Blu-ray"],
  ["WEB-DL", "WEB-DL"],
  ["WEBRip", "WEBRip"],
  ["HDTV", "HDTV"],
  ["DVD", "DVD"],
]);

export const detectSourceFromFilename = (filename: string): SourceInfo => {
  const parsed = parseMediaFilename(filename);

  const mediaEvidence = parsed.evidence.find((entry) => entry.field === "mediaSource");
  const remuxEvidence = parsed.evidence.find((entry) => entry.field === "releaseType");

  const media =
    mediaEvidence === undefined ? undefined : MEDIA_BY_EVIDENCE.get(mediaEvidence.value);
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
 * Campo de presentación `qualitySource`: une la clase de calidad (dato real del
 * stream) con la fuente (dato inferido). Si la fuente es desconocida, solo se
 * muestra la calidad; nunca se escribe `UNKNOWN` en el nombre.
 */
export const composeQualitySource = (
  quality: QualityClass | undefined,
  source: SourceInfo,
  options: { readonly allowInferred?: boolean } = {},
): string | undefined => {
  if (quality === undefined) return undefined;

  const allowInferred = options.allowInferred ?? true;
  const usable = <T>(traced: Traced<T>): T | undefined =>
    traced.value !== undefined && (allowInferred || traced.confidence !== "INFERRED")
      ? traced.value
      : undefined;

  if (usable(source.type) === "REMUX") return `${quality} REMUX`;

  const media = usable(source.media);
  if (media === undefined) return quality;

  // La clase de calidad ya dice que es UHD: repetirlo sería ruido.
  const mediaLabel = media === "UHD Blu-ray" ? "Blu-ray" : media;
  return `${quality} ${mediaLabel}`;
};

/** Presentación completa para la ficha técnica: `UHD Blu-ray REMUX`. */
export const describeSourceDetail = (source: SourceInfo): string | undefined => {
  const media = source.media.value;
  const type = source.type.value;
  if (media === undefined && type === undefined) return undefined;
  if (media === undefined) return type;
  if (type === undefined) return media;
  return `${media} ${type}`;
};

export const sourceConfidenceNote = (source: SourceInfo): string => {
  const traced: Traced<unknown> = source.type.value !== undefined ? source.type : source.media;
  return traced.note ?? "Sin evidencia de fuente";
};
