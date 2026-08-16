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

let instancePromise: Promise<MediaInfoInstance> | null = null;

const loadMediaInfo = async (): Promise<MediaInfoInstance> => {
  instancePromise ??= (async () => {
    const factory = MediaInfoFactory as unknown as (
      options: Record<string, unknown>,
    ) => Promise<MediaInfoInstance>;
    return factory({ format: "object", locateFile: () => wasmUrl });
  })();
  return instancePromise;
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

  const mediaInfo = await loadMediaInfo();

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

  return {
    ...(general === undefined ? {} : { general }),
    video,
    audio,
    text,
  };
};

/** Libera la instancia del WASM (útil en pruebas o al vaciar la sesión). */
export const releaseMediaInfo = async (): Promise<void> => {
  if (instancePromise === null) return;
  const instance = await instancePromise;
  instance.close?.();
  instancePromise = null;
};
