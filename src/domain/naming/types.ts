import type { MetadataEvidence } from "../metadata";

export type FilenameTokenCategory =
  | "title"
  | "year"
  | "resolution"
  | "source"
  | "release-type"
  | "video-codec"
  | "bit-depth"
  | "dolby-vision"
  | "dolby-vision-profile"
  | "hdr"
  | "audio-codec"
  | "spatial-audio"
  | "channels"
  | "audio-language"
  | "subtitle-language"
  | "language-marker"
  | "edition"
  | "release-group"
  | "unknown";

export interface FilenameToken {
  readonly raw: string;
  readonly normalized: string;
  readonly start: number;
  readonly end: number;
  readonly categories: readonly FilenameTokenCategory[];
}

export interface ParsedFilename {
  readonly originalFilename: string;
  readonly originalStem: string;
  readonly extension: string;
  readonly probableTitle: string;
  readonly year?: number;
  readonly releaseGroup?: string;
  readonly tokens: readonly FilenameToken[];
  readonly unclassifiedTokens: readonly string[];
  readonly evidence: readonly MetadataEvidence[];
}

export interface MutableFilenameToken {
  readonly raw: string;
  readonly normalized: string;
  readonly start: number;
  readonly end: number;
  readonly categories: Set<FilenameTokenCategory>;
}

export interface TokenizedFilename {
  readonly originalFilename: string;
  readonly stem: string;
  readonly extension: string;
  readonly tokens: MutableFilenameToken[];
}
