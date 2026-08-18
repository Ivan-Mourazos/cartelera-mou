import type { CommercialClass, PixelLabel } from "../naming/release-labels";
import type { ResolutionClassification } from "./types";

/**
 * Clasificación de calidad por CLASE de resolución, no por altura.
 *
 * Las películas se recortan verticalmente (2.39:1, 2.20:1, 1.90:1…): un UHD real
 * puede medir 3840×1608. Usar `height === 2160` clasificaría mal la mayor parte
 * del catálogo cinematográfico. Por eso la clase la decide la anchura, que es la
 * dimensión estable del máster, y solo se corrige al alza cuando la altura
 * indica una clase superior (contenido anamórfico o con pillarbox, p. ej.
 * 1440×1080).
 */

interface Band {
  readonly quality: CommercialClass;
  readonly pixelLabel: PixelLabel;
  readonly minWidth: number;
  readonly minHeight: number;
}

const BANDS: readonly Band[] = [
  { quality: "8K", pixelLabel: "4320p", minWidth: 7000, minHeight: 4000 },
  { quality: "4K", pixelLabel: "2160p", minWidth: 3400, minHeight: 1900 },
  { quality: "2K", pixelLabel: "1440p", minWidth: 2000, minHeight: 1300 },
  { quality: "Full HD", pixelLabel: "1080p", minWidth: 1800, minHeight: 1000 },
  { quality: "HD", pixelLabel: "720p", minWidth: 1200, minHeight: 700 },
  { quality: "SD", pixelLabel: "576p", minWidth: 700, minHeight: 500 },
  { quality: "SD", pixelLabel: "480p", minWidth: 1, minHeight: 1 },
];

const RANK: Readonly<Record<CommercialClass, number>> = {
  SD: 1,
  HD: 2,
  "Full HD": 3,
  "2K": 4,
  "4K": 5,
  "8K": 6,
};

const FALLBACK: Band = { quality: "SD", pixelLabel: "480p", minWidth: 1, minHeight: 1 };

const bandForWidth = (width: number): Band =>
  BANDS.find((band) => width >= band.minWidth) ?? FALLBACK;

const bandForHeight = (height: number): Band =>
  BANDS.find((band) => height >= band.minHeight) ?? FALLBACK;

const isPositiveNumber = (value: number): boolean => Number.isFinite(value) && value > 0;

/**
 * Devuelve la clase de calidad, o `undefined` cuando las dimensiones no permiten
 * decidir nada. Nunca adivina a partir del nombre del fichero.
 */
export const classifyResolution = (
  width: number | undefined,
  height: number | undefined,
): ResolutionClassification | undefined => {
  if (width === undefined || height === undefined) return undefined;
  if (!isPositiveNumber(width) || !isPositiveNumber(height)) return undefined;

  // Contenido vertical o pistas con dimensiones intercambiadas: manda el lado mayor.
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);

  const byWidth = bandForWidth(longEdge);
  const byHeight = bandForHeight(shortEdge);
  const useHeight = RANK[byHeight.quality] > RANK[byWidth.quality];
  const band = useHeight ? byHeight : byWidth;

  const reason = useHeight
    ? `${String(width)}×${String(height)}: la altura ${String(shortEdge)} corresponde a ${byHeight.quality} (contenido anamórfico o con bandas laterales)`
    : `${String(width)}×${String(height)}: anchura ${String(longEdge)} ⇒ ${byWidth.quality}`;

  return { quality: band.quality, pixelLabel: band.pixelLabel, width, height, reason };
};

/** Presentación exacta para la ficha técnica. */
export const formatExactResolution = (classification: ResolutionClassification): string =>
  `${String(classification.width)} × ${String(classification.height)}`;
