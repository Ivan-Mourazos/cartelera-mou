import type { QualityClass, ResolutionClassification } from "./types";

/**
 * Clasificación de calidad por CLASE de resolución, no por altura.
 *
 * Las películas se recortan verticalmente (2.39:1, 2.20:1, 1.90:1…): un UHD real
 * puede medir 3840×1608. Usar `height === 2160` clasificaría mal la mayor parte
 * del catálogo cinematográfico. Por eso la clase se decide por la anchura, que
 * es la dimensión estable del master, y solo se corrige al alza cuando la altura
 * indica una clase superior (contenido anamórfico o con pillarbox, p. ej.
 * 1440×1080).
 */

interface WidthBand {
  readonly quality: QualityClass;
  readonly minWidth: number;
  readonly label: string;
}

const WIDTH_BANDS: readonly WidthBand[] = [
  { quality: "8K UHD", minWidth: 7000, label: "clase 7680 de anchura" },
  { quality: "DCI 4K", minWidth: 4000, label: "clase DCI 4096 de anchura" },
  { quality: "4K UHD", minWidth: 3400, label: "clase 3840 de anchura" },
  { quality: "QHD", minWidth: 2400, label: "clase 2560 de anchura" },
  { quality: "Full HD", minWidth: 1800, label: "clase 1920 de anchura" },
  { quality: "HD", minWidth: 1200, label: "clase 1280 de anchura" },
  { quality: "SD", minWidth: 1, label: "clase SD" },
];

const HEIGHT_BANDS: readonly { quality: QualityClass; minHeight: number }[] = [
  { quality: "8K UHD", minHeight: 4000 },
  { quality: "4K UHD", minHeight: 1900 },
  { quality: "QHD", minHeight: 1300 },
  { quality: "Full HD", minHeight: 1000 },
  { quality: "HD", minHeight: 700 },
  { quality: "SD", minHeight: 1 },
];

const RANK: Readonly<Record<QualityClass, number>> = {
  SD: 1,
  HD: 2,
  "Full HD": 3,
  QHD: 4,
  "4K UHD": 5,
  "DCI 4K": 5,
  "8K UHD": 6,
};

const bandForWidth = (width: number): WidthBand =>
  WIDTH_BANDS.find((band) => width >= band.minWidth) ??
  ({ quality: "SD", minWidth: 1, label: "clase SD" } satisfies WidthBand);

const qualityForHeight = (height: number): QualityClass =>
  HEIGHT_BANDS.find((band) => height >= band.minHeight)?.quality ?? "SD";

const isPositiveInteger = (value: number): boolean => Number.isFinite(value) && value > 0;

/**
 * Devuelve la clase de calidad, o `undefined` cuando las dimensiones no permiten
 * decidir nada. Nunca adivina a partir del nombre del fichero.
 */
export const classifyResolution = (
  width: number | undefined,
  height: number | undefined,
): ResolutionClassification | undefined => {
  if (width === undefined || height === undefined) return undefined;
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) return undefined;

  // Contenido vertical o pistas con dimensiones intercambiadas: la clase la marca
  // la dimensión mayor.
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);

  const widthBand = bandForWidth(longEdge);
  const heightQuality = qualityForHeight(shortEdge);

  const useHeight = RANK[heightQuality] > RANK[widthBand.quality];
  const quality = useHeight ? heightQuality : widthBand.quality;

  const reason = useHeight
    ? `${width}×${height}: la altura ${String(shortEdge)} corresponde a ${heightQuality} (contenido anamórfico o con bandas laterales)`
    : `${width}×${height}: ${widthBand.label} ⇒ ${widthBand.quality}`;

  const dciNote =
    quality === "Full HD" && longEdge >= 2000 && longEdge < 2400
      ? `${reason}. Variante DCI 2K`
      : reason;

  return { quality, width, height, reason: dciNote };
};

/** Presentación exacta para la ficha técnica. */
export const formatExactResolution = (classification: ResolutionClassification): string =>
  `${classification.width} × ${classification.height}`;
