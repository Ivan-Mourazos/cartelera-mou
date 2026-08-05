export interface PlaybackProfile {
  readonly containers: readonly string[];
  readonly videoCodecs: readonly string[];
  readonly audioCodecs: readonly string[];
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly hdrFormats?: readonly string[];
}

export interface MediaPlaybackProfile {
  readonly container: string;
  readonly videoCodec: string;
  readonly audioCodecs: readonly string[];
  readonly width?: number;
  readonly height?: number;
  readonly hdrFormats: readonly string[];
}

export type PlaybackCapability =
  | { readonly kind: "direct-play"; readonly reasons: readonly string[] }
  | {
      readonly kind: "remux";
      readonly targetContainer: string;
      readonly reasons: readonly string[];
    }
  | {
      readonly kind: "transcode";
      readonly reasons: readonly string[];
      readonly requiredChanges: readonly string[];
    }
  | { readonly kind: "unsupported"; readonly reasons: readonly string[] };

export interface PlaybackCapabilityEvaluator {
  evaluate(media: MediaPlaybackProfile, client: PlaybackProfile): PlaybackCapability;
}
