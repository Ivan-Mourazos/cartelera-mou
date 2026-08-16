import { normalizeMediaInfo } from "./normalize";
import type { RawAudioTrack, RawMediaInfo, RawTextTrack, RawVideoTrack } from "./raw";
import type { NormalizedMedia } from "./types";

/** Fixtures compartidos por las pruebas. No se usan en producción. */

export const videoTrack = (fields: Partial<RawVideoTrack> = {}): RawVideoTrack => ({
  "@type": "Video",
  Format: "HEVC",
  Width: 3840,
  Height: 1608,
  BitDepth: 10,
  FrameRate: 23.976,
  ...fields,
});

export const audioTrack = (fields: Partial<RawAudioTrack> = {}): RawAudioTrack => ({
  "@type": "Audio",
  Format: "MLP FBA",
  Channels: 8,
  ChannelLayout: "L R C LFE Ls Rs Lb Rb",
  ...fields,
});

export const textTrack = (fields: Partial<RawTextTrack> = {}): RawTextTrack => ({
  "@type": "Text",
  Format: "UTF-8",
  ...fields,
});

export const rawMedia = (parts: Partial<RawMediaInfo> = {}): RawMediaInfo => ({
  general: { "@type": "General", Format: "Matroska" },
  video: [videoTrack()],
  audio: [audioTrack()],
  text: [],
  ...parts,
});

export const mediaFor = (filename: string, parts: Partial<RawMediaInfo> = {}): NormalizedMedia =>
  normalizeMediaInfo(rawMedia(parts), filename, 42_000_000_000);
