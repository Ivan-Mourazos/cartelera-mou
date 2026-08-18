import type { PixelLabel } from "../naming/release-labels";
import { inferred, unknown, type Traced } from "./provenance";
import type { SourceMedia, VideoCodecName } from "./types";

/**
 * Deducción de la fuente cuando el nombre no la declara.
 *
 * No es una prueba: es una heurística sobre bitrate, códec y resolución, y así
 * queda marcada. Una etiqueta del nombre o una corrección manual siempre ganan
 * sobre lo que se decida aquí.
 */

export interface StreamSourceInput {
  readonly overallBitrateBps?: number | undefined;
  readonly videoCodec?: VideoCodecName | undefined;
  readonly pixelLabel?: PixelLabel | undefined;
}

export interface InferredSource {
  readonly value: SourceMedia | undefined;
  readonly remux: boolean;
  readonly traced: Traced<SourceMedia>;
}

const HIGH_DEFINITION: ReadonlySet<PixelLabel> = new Set<PixelLabel>([
  "4320p",
  "2160p",
  "1440p",
  "1080p",
]);

const STANDARD_DEFINITION: ReadonlySet<PixelLabel> = new Set<PixelLabel>(["576p", "480p"]);

const mbps = (bitrate: number): string => (bitrate / 1_000_000).toFixed(1);

const hit = (
  value: SourceMedia,
  remux: boolean,
  bitrate: number,
  reason: string,
): InferredSource => ({
  value,
  remux,
  traced: inferred(
    value,
    "DERIVED",
    `${reason} (${mbps(bitrate)} Mbps). Deducido del stream, no verificable en el fichero.`,
  ),
});

const miss = (note: string): InferredSource => ({
  value: undefined,
  remux: false,
  traced: unknown<SourceMedia>("DERIVED", note),
});

export const inferSourceFromStream = (input: StreamSourceInput): InferredSource => {
  const bitrate = input.overallBitrateBps;
  const codec = input.videoCodec;
  const pixels = input.pixelLabel;

  if (bitrate === undefined || !Number.isFinite(bitrate) || bitrate <= 0) {
    return miss("Sin bitrate legible: no se deduce la fuente");
  }

  if (bitrate > 60_000_000 && codec === "HEVC" && pixels === "2160p") {
    return hit("BluRay", true, bitrate, "Bitrate propio de un REMUX de UHD Blu-ray");
  }
  if (bitrate > 25_000_000 && codec === "AVC" && pixels === "1080p") {
    return hit("BluRay", true, bitrate, "Bitrate propio de un REMUX de Blu-ray");
  }
  if (bitrate >= 8_000_000 && pixels !== undefined && HIGH_DEFINITION.has(pixels)) {
    return hit("BluRay", false, bitrate, "Bitrate propio de un Blu-ray reencodado");
  }
  if (bitrate >= 3_000_000 && (codec === "HEVC" || codec === "AVC" || codec === "AV1")) {
    return hit("WEB-DL", false, bitrate, "Bitrate propio de una descarga WEB-DL");
  }
  if (
    (codec === "MPEG-4" || codec === "MPEG-2" || codec === "VC-1") &&
    pixels !== undefined &&
    STANDARD_DEFINITION.has(pixels)
  ) {
    return hit("DVDRip", false, bitrate, "Códec y resolución propios de un DVDRip");
  }
  if (pixels !== undefined && (HIGH_DEFINITION.has(pixels) || pixels === "720p")) {
    return hit("WEBRip", false, bitrate, "Bitrate bajo para la resolución: recompresión WEB");
  }

  return miss(`Ninguna regla de inferencia encaja (${mbps(bitrate)} Mbps)`);
};
