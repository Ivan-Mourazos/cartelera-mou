export type MetadataOrigin = "filename" | "ffprobe" | "tmdb" | "user";

export type EvidenceStrength = "explicit" | "derived" | "inferred";

export type Resolution = "4K" | "4320p" | "2160p" | "1440p" | "1080p" | "720p" | "576p" | "480p";

export type MediaSource =
  | "BluRay"
  | "UHDRip"
  | "BDRip"
  | "BRRip"
  | "WEB-DL"
  | "WEBRip"
  | "HDTV"
  | "HDTVRip"
  | "microHD"
  | "HDRip"
  | "DVDRip"
  | "DVDScr"
  | "SCR"
  | "TC"
  | "TS"
  | "CamRip";

export type ReleaseType = "REMUX";

export type VideoCodec = "HEVC" | "AV1" | "H.264" | "MPEG-2" | "VC-1";

export type HdrFormat = "HDR" | "HDR10" | "HDR10+";

export type AudioCodec = "TrueHD" | "DTS-HD MA" | "DTS" | "E-AC-3" | "AC-3" | "AAC" | "FLAC";

export type SpatialAudio = "Atmos" | "DTS:X";

export type SpecialEdition = "IMAX" | "Extended" | "Director's Cut";

export interface MetadataFieldValues {
  title: string;
  originalTitle: string;
  year: number;
  resolution: Resolution;
  mediaSource: MediaSource;
  releaseType: ReleaseType;
  videoCodec: VideoCodec;
  bitDepth: number;
  dolbyVision: boolean;
  dolbyVisionProfile: string;
  hdrFormat: HdrFormat;
  audioCodec: AudioCodec;
  spatialAudio: SpatialAudio;
  channels: string;
  audioLanguage: string;
  subtitleLanguage: string;
  multipleAudioLanguages: boolean;
  edition: SpecialEdition;
  seasonEpisode: string;
  releaseGroup: string;
  tmdbId: number;
}

export type MetadataField = keyof MetadataFieldValues;

export interface EvidenceTrace {
  readonly reason: string;
  readonly raw?: string;
  readonly tokenIndexes?: readonly number[];
  readonly sourceId?: string;
}

interface EvidenceForField<K extends MetadataField> {
  readonly field: K;
  readonly value: MetadataFieldValues[K];
  readonly origin: MetadataOrigin;
  readonly strength: EvidenceStrength;
  /** Reliability of this observation, not a statistical probability. */
  readonly confidence: number;
  readonly trace: EvidenceTrace;
}

export type MetadataEvidence<K extends MetadataField = MetadataField> = {
  [P in K]: EvidenceForField<P>;
}[K];

export const evidenceFor = <K extends MetadataField>(
  field: K,
  value: MetadataFieldValues[K],
  trace: EvidenceTrace,
  options: {
    readonly origin?: MetadataOrigin;
    readonly strength?: EvidenceStrength;
    readonly confidence?: number;
  } = {},
): MetadataEvidence<K> => ({
  field,
  value,
  origin: options.origin ?? "filename",
  strength: options.strength ?? "explicit",
  confidence: options.confidence ?? 100,
  trace,
});
