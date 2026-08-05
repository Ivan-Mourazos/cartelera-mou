export type MetadataOrigin = "filename" | "ffprobe" | "tmdb" | "user";

export type EvidenceStrength = "explicit" | "derived" | "inferred";

export type Resolution = "4320p" | "2160p" | "1440p" | "1080p" | "720p" | "576p" | "480p";

export type MediaSource = "UHD Blu-ray" | "Blu-ray" | "WEB-DL" | "WEBRip" | "HDTV" | "DVD";

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

export const REPEATABLE_METADATA_FIELDS = new Set<MetadataField>([
  "audioLanguage",
  "subtitleLanguage",
  "edition",
  "hdrFormat",
]);

export interface MergedMetadataEvidence {
  readonly selected: readonly MetadataEvidence[];
  readonly rejected: readonly MetadataEvidence[];
}

const CATALOG_FIELDS = new Set<MetadataField>(["title", "originalTitle", "year", "tmdbId"]);

const RELEASE_FIELDS = new Set<MetadataField>([
  "mediaSource",
  "releaseType",
  "edition",
  "releaseGroup",
]);

const originWeight = (field: MetadataField, origin: MetadataOrigin): number => {
  if (origin === "user") return 400;
  if (CATALOG_FIELDS.has(field)) {
    return { tmdb: 300, filename: 200, ffprobe: 100, user: 400 }[origin];
  }
  if (RELEASE_FIELDS.has(field)) {
    return { filename: 300, tmdb: 200, ffprobe: 100, user: 400 }[origin];
  }
  return { ffprobe: 300, filename: 200, tmdb: 100, user: 400 }[origin];
};

const strengthWeight: Readonly<Record<EvidenceStrength, number>> = {
  explicit: 30,
  derived: 20,
  inferred: 10,
};

const rankEvidence = (evidence: MetadataEvidence): number =>
  originWeight(evidence.field, evidence.origin) +
  strengthWeight[evidence.strength] +
  evidence.confidence / 100;

const valueKey = (evidence: MetadataEvidence): string =>
  `${evidence.field}:${JSON.stringify(evidence.value)}`;

/**
 * Selects canonical observations without destroying rejected evidence. Repeated
 * fields retain distinct values, while singleton fields follow field-specific
 * source precedence. A manual correction always wins.
 */
export const mergeMetadataEvidence = (
  observations: readonly MetadataEvidence[],
): MergedMetadataEvidence => {
  const byField = new Map<MetadataField, MetadataEvidence[]>();
  for (const observation of observations) {
    const values = byField.get(observation.field) ?? [];
    values.push(observation);
    byField.set(observation.field, values);
  }

  const selected: MetadataEvidence[] = [];
  const rejected: MetadataEvidence[] = [];

  for (const [field, values] of byField) {
    const ranked = [...values].sort((left, right) => rankEvidence(right) - rankEvidence(left));
    const manualValues = ranked.filter((value) => value.origin === "user");
    const candidates = manualValues.length > 0 ? manualValues : ranked;

    if (REPEATABLE_METADATA_FIELDS.has(field)) {
      const seen = new Set<string>();
      for (const value of candidates) {
        const key = valueKey(value);
        if (!seen.has(key)) {
          selected.push(value);
          seen.add(key);
        } else {
          rejected.push(value);
        }
      }
      for (const value of ranked) {
        if (!candidates.includes(value)) rejected.push(value);
      }
      continue;
    }

    const winner = candidates[0];
    if (winner !== undefined) selected.push(winner);
    for (const value of ranked) {
      if (value !== winner) rejected.push(value);
    }
  }

  return { selected, rejected };
};

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
