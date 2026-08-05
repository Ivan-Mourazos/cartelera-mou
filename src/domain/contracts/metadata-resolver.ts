import type { MetadataEvidence } from "../metadata";
import type { ParsedFilename } from "../naming/types";

export interface MetadataResolutionRequest {
  readonly filename: ParsedFilename;
  readonly technicalEvidence: readonly MetadataEvidence[];
  readonly locale: string;
  readonly region?: string;
}

export interface MetadataResolutionCandidate {
  readonly resolverId: string;
  readonly externalId?: string;
  readonly evidence: readonly MetadataEvidence[];
  readonly matchScore: number;
  readonly explanation: readonly string[];
}

/** Port for deterministic, remote, or future optional AI resolvers. */
export interface MetadataResolver {
  readonly id: string;
  resolve(
    request: MetadataResolutionRequest,
    signal?: AbortSignal,
  ): Promise<readonly MetadataResolutionCandidate[]>;
}
