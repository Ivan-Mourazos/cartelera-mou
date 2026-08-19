import MediaInfoFactory from "mediainfo.js";
import wasmUrl from "mediainfo.js/MediaInfoModule.wasm?url";

import type {
  RawAudioTrack,
  RawGeneralTrack,
  RawMediaInfo,
  RawTextTrack,
  RawVideoTrack,
} from "../../domain/media/raw";

/**
 * Cliente de MediaInfo (WebAssembly).
 *
 * Es la única pieza que habla con la librería: devuelve la forma cruda del
 * dominio (`RawMediaInfo`) y no interpreta ni normaliza nada. Así los
 * normalizadores pueden probarse con fixtures sin cargar el WASM.
 */

interface MediaInfoInstance {
  analyzeData: (
    fileSize: number,
    readChunk: (chunkSize: number, offset: number) => Promise<Uint8Array>,
  ) => Promise<unknown>;
  close?: () => void;
}

type AnyTrack = Record<string, unknown> & { "@type"?: string };

/**
 * Reserva de instancias.
 *
 * Una instancia de MediaInfo tiene estado: mantiene el búfer del fichero que
 * está parseando. Compartir una sola entre análisis simultáneos hacía que dos
 * archivos se pisaran, y el resultado era aleatorio —unos fallaban y otros
 * devolvían solo parte de las pistas—. Cada análisis toma una instancia para él
 * y la devuelve al terminar.
 */
const MAX_INSTANCES = 4;

const idle: MediaInfoInstance[] = [];
const waiting: ((instance: MediaInfoInstance) => void)[] = [];
const all: MediaInfoInstance[] = [];
let created = 0;

const createInstance = async (): Promise<MediaInfoInstance> => {
  const factory = MediaInfoFactory as unknown as (
    options: Record<string, unknown>,
  ) => Promise<MediaInfoInstance>;
  return factory({ format: "object", locateFile: () => wasmUrl });
};

const acquire = async (): Promise<MediaInfoInstance> => {
  const free = idle.pop();
  if (free !== undefined) return free;

  if (created < MAX_INSTANCES) {
    created += 1;
    try {
      const instance = await createInstance();
      all.push(instance);
      return instance;
    } catch (error) {
      created -= 1;
      throw error;
    }
  }

  // Todas ocupadas: se espera a que alguna quede libre.
  return new Promise<MediaInfoInstance>((resolve) => {
    waiting.push(resolve);
  });
};

const release = (instance: MediaInfoInstance): void => {
  const next = waiting.shift();
  if (next === undefined) idle.push(instance);
  else next(instance);
};

const tracksOf = (result: unknown): readonly AnyTrack[] => {
  if (typeof result !== "object" || result === null) return [];
  const media = (result as { media?: { track?: unknown } }).media;
  const track = media?.track;
  return Array.isArray(track) ? (track as AnyTrack[]) : [];
};

const trackType = (track: AnyTrack): string => {
  const value = track["@type"];
  return typeof value === "string" ? value.toLowerCase() : "";
};

const byType = (tracks: readonly AnyTrack[], type: string): readonly AnyTrack[] =>
  tracks.filter((track) => trackType(track) === type);

export class MediaAnalysisError extends Error {
  readonly detail: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = "MediaAnalysisError";
    this.detail = detail;
  }
}

/** Lee las cabeceras del fichero y devuelve las pistas crudas. */
export const readRawMediaInfo = async (file: File, signal?: AbortSignal): Promise<RawMediaInfo> => {
  if (signal?.aborted === true) throw new MediaAnalysisError("Análisis cancelado");

  const mediaInfo = await acquire();

  let result: unknown;
  try {
    result = await mediaInfo.analyzeData(file.size, async (chunkSize, offset) => {
      if (signal?.aborted === true) throw new MediaAnalysisError("Análisis cancelado");
      const blob = file.slice(offset, offset + chunkSize);
      return new Uint8Array(await blob.arrayBuffer());
    });
  } catch (error) {
    if (error instanceof MediaAnalysisError) throw error;
    throw new MediaAnalysisError(`No se pudo analizar «${file.name}»`, error);
  } finally {
    release(mediaInfo);
  }

  const tracks = tracksOf(result);
  if (tracks.length === 0) {
    throw new MediaAnalysisError(
      `«${file.name}» no contiene pistas reconocibles (fichero corrupto o formato no soportado)`,
    );
  }

  const general: RawGeneralTrack | undefined = byType(tracks, "general")[0];
  const video: readonly RawVideoTrack[] = byType(tracks, "video");
  const audio: readonly RawAudioTrack[] = byType(tracks, "audio");
  const text: readonly RawTextTrack[] = byType(tracks, "text");

  if (video.length === 0 && audio.length === 0) {
    throw new MediaAnalysisError(
      `«${file.name}» no declara ninguna pista de vídeo ni de audio legible`,
    );
  }

  return {
    ...(general === undefined ? {} : { general }),
    video,
    audio,
    text,
  };
};

/** Libera las instancias del WASM (al vaciar la sesión o en pruebas). */
export const releaseMediaInfo = (): void => {
  for (const instance of all) instance.close?.();
  all.length = 0;
  idle.length = 0;
  waiting.length = 0;
  created = 0;
};
