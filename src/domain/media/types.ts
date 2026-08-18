import type { CommercialClass, PixelLabel, ReleaseSource } from "../naming/release-labels";
import type { Traced } from "./provenance";

// ── Vídeo ───────────────────────────────────────────────────────────────

/** Clase de calidad presentable. Se calcula por dimensiones, nunca por el nombre. */
export type QualityClass = CommercialClass;

export interface ResolutionClassification {
  readonly quality: CommercialClass;
  /** Resolución en píxeles verticales del máster: `2160p`, `1080p`… */
  readonly pixelLabel: PixelLabel;
  readonly width: number;
  readonly height: number;
  /** Explicación auditable de por qué se eligió esa clase. */
  readonly reason: string;
}

/** Nombre corto usado en el nombre de fichero. */
export type VideoCodecName = "HEVC" | "AVC" | "AV1" | "VP9" | "VVC" | "MPEG-2" | "VC-1" | "MPEG-4";

export type HdrFormatName = "HDR10" | "HDR10+" | "Dolby Vision" | "HLG";

export interface DolbyVisionInfo {
  readonly profile?: string;
  readonly level?: string;
  /** p. ej. `HDR10`, `SDR`, `Blu-ray`. Determina el fallback del contenido. */
  readonly compatibility?: string;
}

export interface VideoTrackInfo {
  readonly index: number;
  readonly codec: Traced<VideoCodecName>;
  readonly commercialCodecName: Traced<string>;
  readonly codecProfile: Traced<string>;
  readonly level: Traced<string>;
  readonly resolution: Traced<ResolutionClassification>;
  readonly displayAspectRatio: Traced<string>;
  readonly frameRate: Traced<number>;
  readonly variableFrameRate: Traced<boolean>;
  readonly bitrate: Traced<number>;
  readonly bitDepth: Traced<number>;
  readonly chromaSubsampling: Traced<string>;
  readonly scanType: Traced<string>;
  readonly colorPrimaries: Traced<string>;
  readonly transferCharacteristics: Traced<string>;
  readonly matrixCoefficients: Traced<string>;
  readonly hdrFormats: Traced<readonly HdrFormatName[]>;
  readonly dolbyVision: Traced<DolbyVisionInfo>;
}

// ── Audio ───────────────────────────────────────────────────────────────

export type AudioCodecName =
  | "Dolby Digital"
  | "Dolby Digital Plus"
  | "TrueHD"
  | "DTS"
  | "DTS-HD MA"
  | "DTS-HD HRA"
  | "DTS-ES"
  | "AAC"
  | "FLAC"
  | "PCM"
  | "Opus"
  | "Vorbis"
  | "MP3"
  | "MP2";

/** Etiqueta de idioma normalizada del producto. */
export interface NormalizedLanguage {
  /** Código BCP-47 tal como pudo determinarse: `es`, `es-ES`, `es-419`, `en`… */
  readonly tag: string;
  /** Idioma base ISO 639-1 en minúsculas. */
  readonly base: string;
  /** Región cuando existe evidencia (`ES`, `419`, `US`…). */
  readonly region?: string;
  /** Etiqueta corta para el nombre de fichero: `ESP`, `LAT`, `ENG`, `FRA`… */
  readonly label: string;
  /** Nombre legible en español para la interfaz. */
  readonly display: string;
  /** `true` cuando es español sin región determinable: no se puede escribir `ESP`. */
  readonly regionAmbiguous: boolean;
}

export interface AudioTrackInfo {
  readonly index: number;
  readonly codec: Traced<AudioCodecName>;
  readonly commercialCodecName: Traced<string>;
  readonly codecProfile: Traced<string>;
  readonly bitrate: Traced<number>;
  readonly sampleRate: Traced<number>;
  readonly bitDepth: Traced<number>;
  readonly channels: Traced<number>;
  /** Presentación `5.1`, `7.1`, `2.0`… derivada del layout cuando existe. */
  readonly channelLayout: Traced<string>;
  readonly rawChannelLayout: Traced<string>;
  readonly language: Traced<NormalizedLanguage>;
  readonly title: Traced<string>;
  readonly isDefault: Traced<boolean>;
  readonly isForced: Traced<boolean>;
  readonly isCommentary: Traced<boolean>;
  readonly isDescriptiveAudio: Traced<boolean>;
  readonly atmos: Traced<boolean>;
  readonly dtsX: Traced<boolean>;
}

// ── Subtítulos ──────────────────────────────────────────────────────────

export interface SubtitleTrackInfo {
  readonly index: number;
  readonly language: Traced<NormalizedLanguage>;
  readonly format: Traced<string>;
  readonly title: Traced<string>;
  readonly isDefault: Traced<boolean>;
  readonly isForced: Traced<boolean>;
  readonly isHearingImpaired: Traced<boolean>;
}

// ── General ─────────────────────────────────────────────────────────────

export interface GeneralInfo {
  readonly originalFilename: string;
  readonly extension: string;
  readonly container: Traced<string>;
  readonly fileSizeBytes: Traced<number>;
  readonly durationSeconds: Traced<number>;
  readonly overallBitrate: Traced<number>;
  readonly titleMetadata: Traced<string>;
  readonly creationDate: Traced<string>;
  readonly muxingApplication: Traced<string>;
  readonly writingApplication: Traced<string>;
}

// ── Fuente ──────────────────────────────────────────────────────────────

export type SourceMedia = Exclude<ReleaseSource, "BluRay REMUX">;
export type SourceType = "REMUX" | "ENCODE";

export interface SourceInfo {
  /** Soporte de origen. Casi siempre `INFERRED`: el fichero no lo demuestra. */
  readonly media: Traced<SourceMedia>;
  readonly type: Traced<SourceType>;
}

/**
 * Resultado del análisis técnico del fichero. No contiene identificación de la
 * obra: eso vive en `ContentIdentification`.
 */
export interface NormalizedMedia {
  readonly general: GeneralInfo;
  readonly video: readonly VideoTrackInfo[];
  readonly audio: readonly AudioTrackInfo[];
  readonly subtitles: readonly SubtitleTrackInfo[];
  readonly source: SourceInfo;
  /** Avisos del análisis (fichero ilegible, pista sin idioma, etc.). */
  readonly warnings: readonly string[];
}
