import type { PixelLabel } from "../naming/release-labels";
import { inferred, unknown, type Traced } from "./provenance";
import type { SourceMedia, VideoCodecName } from "./types";

/**
 * Deducción de la fuente a partir de lo que pesa el archivo.
 *
 * No es una prueba: es una heurística, y así queda marcada. Pero es una
 * heurística buena, porque el bitrate es justo lo que distingue un REMUX de un
 * reencode y un WEB-DL de un WEBRip: nadie mete 80 Mbps en una descarga de
 * streaming ni 4 Mbps en un disco Blu-ray.
 *
 * El bitrate se toma del contenedor y, si no lo declara, se calcula del tamaño
 * del archivo y su duración, que es lo que siempre hay.
 */

export interface StreamSourceInput {
  readonly overallBitrateBps?: number | undefined;
  readonly fileSizeBytes?: number | undefined;
  readonly durationSeconds?: number | undefined;
  readonly videoCodec?: VideoCodecName | undefined;
  readonly pixelLabel?: PixelLabel | undefined;
}

export interface InferredSource {
  readonly value: SourceMedia | undefined;
  readonly remux: boolean;
  readonly traced: Traced<SourceMedia>;
  /** Bitrate usado para decidir, en bits por segundo. */
  readonly bitrateBps: number | undefined;
}

/**
 * HEVC y AV1 obtienen la misma calidad con menos bitrate, así que sus umbrales
 * bajan. Sin este factor, todo el material moderno en HEVC se clasificaría un
 * escalón por debajo de lo que es.
 */
const CODEC_EFFICIENCY: Readonly<Partial<Record<VideoCodecName, number>>> = {
  HEVC: 0.62,
  AV1: 0.55,
  VP9: 0.7,
  "MPEG-2": 1.6,
  "MPEG-4": 1.4,
  "VC-1": 1.1,
};

interface Band {
  /** Mbps mínimos, para AVC. Otros códecs se escalan por su eficiencia. */
  readonly minMbps: number;
  readonly source: SourceMedia;
  readonly remux: boolean;
  readonly reason: string;
}

/**
 * Umbrales por resolución, en Mbps de referencia AVC. Salen de lo que pesan de
 * verdad las publicaciones: un REMUX de UHD ronda 50-100 Mbps, un encode de UHD
 * 15-40, un 4K de streaming 8-18, un REMUX de Blu-ray 20-40 y un WEB-DL 1080p
 * 4-8.
 */
const BANDS: Readonly<Record<PixelLabel, readonly Band[]>> = {
  "4320p": [
    { minMbps: 80, source: "BluRay", remux: true, reason: "Bitrate de REMUX en 8K" },
    { minMbps: 30, source: "UHDRip", remux: false, reason: "Bitrate de reencode en 8K" },
    { minMbps: 0, source: "WEB-DL", remux: false, reason: "Bitrate de descarga en 8K" },
  ],
  "2160p": [
    {
      minMbps: 55,
      source: "BluRay",
      remux: true,
      reason: "Bitrate propio de un REMUX de UHD Blu-ray",
    },
    { minMbps: 22, source: "UHDRip", remux: false, reason: "Bitrate propio de un UHD reencodado" },
    { minMbps: 8, source: "WEB-DL", remux: false, reason: "Bitrate propio de un 4K de streaming" },
    { minMbps: 0, source: "WEBRip", remux: false, reason: "Bitrate bajo para 4K: recompresión" },
  ],
  "1440p": [
    { minMbps: 30, source: "BluRay", remux: true, reason: "Bitrate de REMUX" },
    { minMbps: 12, source: "BluRay", remux: false, reason: "Bitrate de Blu-ray reencodado" },
    { minMbps: 4, source: "WEB-DL", remux: false, reason: "Bitrate de descarga WEB-DL" },
    { minMbps: 0, source: "WEBRip", remux: false, reason: "Bitrate bajo: recompresión WEB" },
  ],
  "1080p": [
    { minMbps: 22, source: "BluRay", remux: true, reason: "Bitrate propio de un REMUX de Blu-ray" },
    {
      minMbps: 9,
      source: "BluRay",
      remux: false,
      reason: "Bitrate propio de un Blu-ray reencodado",
    },
    {
      minMbps: 3.5,
      source: "WEB-DL",
      remux: false,
      reason: "Bitrate propio de una descarga WEB-DL",
    },
    { minMbps: 0, source: "WEBRip", remux: false, reason: "Bitrate bajo para 1080p: recompresión" },
  ],
  "720p": [
    {
      minMbps: 8,
      source: "BluRay",
      remux: false,
      reason: "Bitrate alto para 720p: origen en disco",
    },
    {
      minMbps: 2.5,
      source: "WEB-DL",
      remux: false,
      reason: "Bitrate propio de una descarga WEB-DL",
    },
    { minMbps: 0, source: "WEBRip", remux: false, reason: "Bitrate bajo para 720p: recompresión" },
  ],
  "576p": [
    { minMbps: 4, source: "DVDRip", remux: false, reason: "Bitrate propio de un DVD" },
    { minMbps: 0.8, source: "DVDRip", remux: false, reason: "Bitrate y resolución de DVDRip" },
    {
      minMbps: 0,
      source: "WEBRip",
      remux: false,
      reason: "Bitrate muy bajo en definición estándar",
    },
  ],
  "480p": [
    { minMbps: 4, source: "DVDRip", remux: false, reason: "Bitrate propio de un DVD" },
    { minMbps: 0.8, source: "DVDRip", remux: false, reason: "Bitrate y resolución de DVDRip" },
    {
      minMbps: 0,
      source: "WEBRip",
      remux: false,
      reason: "Bitrate muy bajo en definición estándar",
    },
  ],
};

const isUsableNumber = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0;

/**
 * Bitrate real del archivo. Se prefiere el que declara el contenedor; si falta,
 * se calcula del tamaño y la duración, que es lo que el usuario ve como «pesa
 * 24 GB».
 */
export const effectiveBitrate = (input: StreamSourceInput): number | undefined => {
  if (isUsableNumber(input.overallBitrateBps)) return input.overallBitrateBps;
  if (isUsableNumber(input.fileSizeBytes) && isUsableNumber(input.durationSeconds)) {
    return (input.fileSizeBytes * 8) / input.durationSeconds;
  }
  return undefined;
};

const formatSize = (bytes: number): string =>
  bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(1)} GB`
    : `${String(Math.round(bytes / 1_000_000))} MB`;

export const inferSourceFromStream = (input: StreamSourceInput): InferredSource => {
  const bitrate = effectiveBitrate(input);
  const pixels = input.pixelLabel;

  if (bitrate === undefined) {
    return {
      value: undefined,
      remux: false,
      bitrateBps: undefined,
      traced: unknown<SourceMedia>(
        "DERIVED",
        "Sin bitrate ni tamaño y duración legibles: no se deduce la fuente",
      ),
    };
  }

  if (pixels === undefined) {
    return {
      value: undefined,
      remux: false,
      bitrateBps: bitrate,
      traced: unknown<SourceMedia>(
        "DERIVED",
        "Sin resolución no se puede juzgar si el bitrate es alto o bajo",
      ),
    };
  }

  const efficiency = CODEC_EFFICIENCY[input.videoCodec ?? "AVC"] ?? 1;
  const mbps = bitrate / 1_000_000;
  const codec = input.videoCodec;

  // En definición estándar manda el códec, no el bitrate: XviD, DivX o MPEG-2 a
  // 480p/576p es un DVD, pese a cualquier bitrate.
  if (
    (pixels === "480p" || pixels === "576p") &&
    (codec === "MPEG-4" || codec === "MPEG-2" || codec === "VC-1")
  ) {
    return {
      value: "DVDRip",
      remux: false,
      bitrateBps: bitrate,
      traced: inferred(
        "DVDRip",
        "DERIVED",
        `Códec ${codec} en ${pixels} a ${mbps.toFixed(1)} Mbps: material de DVD. Deducido, no verificable.`,
      ),
    };
  }

  // Para el resto se compara en «Mbps equivalentes AVC», para que un HEVC de
  // 30 Mbps no se confunda con un AVC de 30 Mbps, que es bastante peor.
  const equivalentMbps = mbps / efficiency;

  const band = BANDS[pixels].find((entry) => equivalentMbps >= entry.minMbps);
  if (band === undefined) {
    return {
      value: undefined,
      remux: false,
      bitrateBps: bitrate,
      traced: unknown<SourceMedia>("DERIVED", `Ninguna regla encaja (${mbps.toFixed(1)} Mbps)`),
    };
  }

  const sizeNote = isUsableNumber(input.fileSizeBytes)
    ? `, ${formatSize(input.fileSizeBytes)}`
    : "";
  const codecNote =
    efficiency === 1
      ? ""
      : ` — equivalen a ${equivalentMbps.toFixed(1)} Mbps en AVC por la eficiencia de ${input.videoCodec ?? "el códec"}`;

  return {
    value: band.source,
    remux: band.remux,
    bitrateBps: bitrate,
    traced: inferred(
      band.source,
      "DERIVED",
      `${band.reason}: ${mbps.toFixed(1)} Mbps en ${pixels}${sizeNote}${codecNote}. Deducido del peso del archivo, no verificable.`,
    ),
  };
};
