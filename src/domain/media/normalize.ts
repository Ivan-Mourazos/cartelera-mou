import { normalizeAudioTrack } from "./audio";
import { resolveSpanishVariant, spanishVariantFromTitle } from "./language";
import { confirmed, inferred, unknown } from "./provenance";
import { toInteger, toNumber, toText, type RawMediaInfo } from "./raw";
import { detectSourceFromFilename } from "./source";
import { normalizeSubtitleTrack } from "./subtitles";
import type { GeneralInfo, NormalizedMedia } from "./types";
import { normalizeVideoTrack } from "./video";

const CONTAINER = "CONTAINER_METADATA" as const;

const splitExtension = (filename: string): string => {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
};

const buildGeneral = (
  raw: RawMediaInfo,
  filename: string,
  fileSizeBytes: number | undefined,
): GeneralInfo => {
  const general = raw.general;
  const container = toText(general?.Format);
  const size = toInteger(general?.FileSize) ?? fileSizeBytes;

  return {
    originalFilename: filename,
    extension: splitExtension(filename),
    container:
      container === undefined ? unknown<string>(CONTAINER) : confirmed(container, CONTAINER),
    fileSizeBytes: size === undefined ? unknown<number>(CONTAINER) : confirmed(size, CONTAINER),
    durationSeconds: (() => {
      const duration = toNumber(general?.Duration);
      return duration === undefined ? unknown<number>(CONTAINER) : confirmed(duration, CONTAINER);
    })(),
    overallBitrate: (() => {
      const bitrate = toInteger(general?.OverallBitRate);
      return bitrate === undefined ? unknown<number>(CONTAINER) : confirmed(bitrate, CONTAINER);
    })(),
    titleMetadata: (() => {
      const title = toText(general?.Title ?? general?.Movie);
      return title === undefined ? unknown<string>(CONTAINER) : confirmed(title, CONTAINER);
    })(),
    creationDate: (() => {
      const date = toText(general?.Encoded_Date ?? general?.File_Modified_Date);
      return date === undefined ? unknown<string>(CONTAINER) : confirmed(date, CONTAINER);
    })(),
    muxingApplication: (() => {
      const app = toText(general?.Encoded_Application);
      return app === undefined ? unknown<string>(CONTAINER) : confirmed(app, CONTAINER);
    })(),
    writingApplication: (() => {
      const library = toText(general?.Encoded_Library);
      return library === undefined ? unknown<string>(CONTAINER) : confirmed(library, CONTAINER);
    })(),
  };
};

/**
 * Convierte la salida cruda de MediaInfo en el modelo del dominio.
 *
 * El nombre original solo se usa para la fuente/REMUX, que quedan marcados como
 * inferidos. Ningún dato técnico procede del nombre.
 */
export const normalizeMediaInfo = (
  raw: RawMediaInfo,
  filename: string,
  fileSizeBytes?: number,
): NormalizedMedia => {
  const video = raw.video.map((track, index) => normalizeVideoTrack(track, index));
  const subtitles = raw.text.map((track, index) => normalizeSubtitleTrack(track, index));

  // El contenedor suele traer `spa` a secas. Si el nombre original dice
  // «Castellano» o «Latino», eso es evidencia suficiente para la variante, pero
  // solo inferida: la marca queda registrada como tal.
  const filenameVariant = spanishVariantFromTitle(filename);
  const audio = raw.audio.map((track, index) => {
    const normalized = normalizeAudioTrack(track, index);
    const language = normalized.language.value;
    if (filenameVariant === "none" || language?.regionAmbiguous !== true) return normalized;
    const resolved = resolveSpanishVariant(language, filenameVariant);
    if (resolved === language) return normalized;
    return {
      ...normalized,
      language: inferred(
        resolved,
        "ORIGINAL_FILENAME",
        `Variante del español deducida del nombre original (${resolved.display})`,
      ),
    };
  });

  const warnings: string[] = [];
  if (video.length === 0)
    warnings.push("El fichero no contiene ninguna pista de vídeo analizable.");
  if (audio.length === 0)
    warnings.push("El fichero no contiene ninguna pista de audio analizable.");
  if (audio.some((track) => track.language.value === undefined)) {
    warnings.push("Hay pistas de audio sin etiqueta de idioma.");
  }
  if (audio.some((track) => track.language.value?.regionAmbiguous === true)) {
    warnings.push(
      "Hay audio en español sin región determinable: confírmalo manualmente como castellano o latino.",
    );
  }

  return {
    general: buildGeneral(raw, filename, fileSizeBytes),
    video,
    audio,
    subtitles,
    source: detectSourceFromFilename(filename),
    warnings,
  };
};

/** Modelo vacío para ficheros que no pueden analizarse (p. ej. nombres pegados). */
export const emptyNormalizedMedia = (filename: string, reason: string): NormalizedMedia => ({
  general: buildGeneral({ video: [], audio: [], text: [] }, filename, undefined),
  video: [],
  audio: [],
  subtitles: [],
  source: detectSourceFromFilename(filename),
  warnings: [reason],
});

export const primaryVideoTrack = (media: NormalizedMedia) => media.video[0];
