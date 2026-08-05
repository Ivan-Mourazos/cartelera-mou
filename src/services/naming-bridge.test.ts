import { describe, expect, it } from "vitest";

import { generateCandidateFilename } from "./naming-bridge";
import { parseSettings } from "./schemas";
import type { AppSettings, ScanItem, TmdbCandidate } from "./types";

describe("generateCandidateFilename", () => {
  it("applies naming settings while preserving probed technical metadata", () => {
    const item: ScanItem = {
      id: "scan-1",
      mediaFileId: 1,
      movieId: null,
      path: "C:\\Movies\\Arrival.2016.1080p.x264.mkv",
      originalFilename: "Arrival.2016.1080p.x264.mkv",
      proposedFilename: "Arrival (2016).mkv",
      title: "Arrival",
      originalTitle: null,
      year: 2016,
      extension: "mkv",
      container: "matroska",
      sizeBytes: 1,
      resolution: "2160p",
      source: "UHD Blu-ray",
      releaseType: "REMUX",
      posterUrl: null,
      matchScore: 92,
      matchLevel: "high",
      scoreReasons: [],
      status: "ready",
      warnings: [],
      tokens: [],
      video: {
        codec: "hevc",
        profile: "Main 10",
        dolbyVisionProfile: "8",
        level: null,
        width: 3840,
        height: 2160,
        bitDepth: 10,
        frameRate: "23.976",
        bitrate: null,
        hdrFormat: "Dolby Vision + HDR10",
        colorSpace: "BT.2020",
      },
      audioTracks: [
        {
          index: 1,
          language: "eng",
          title: "English Atmos",
          codec: "truehd",
          channels: 8,
          channelLayout: null,
          bitrate: null,
          hasAtmos: true,
          hasDtsX: false,
          isDefault: true,
          isCommentary: false,
        },
      ],
      subtitleTracks: [
        {
          index: 2,
          language: "spa",
          title: "Castellano",
          codec: "pgs",
          isDefault: false,
          isForced: false,
          isHearingImpaired: false,
        },
      ],
    };
    const candidate: TmdbCandidate = {
      tmdbId: 329865,
      title: "La llegada",
      originalTitle: "Arrival",
      year: 2016,
      overview: null,
      posterUrl: null,
      matchScore: 99,
      matchLevel: "high",
      scoreReasons: [],
    };
    const settings: AppSettings = {
      titleLanguage: "es-ES",
      region: "ES",
      ffprobePath: "",
      tmdbConfigured: true,
      tmdbCredentialSource: "session",
      tmdbCredentialPersistence: "processMemoryOnly",
      namingTemplate: "{title} - {year} {tags}",
      matchThreshold: 80,
      includeIdentifier: true,
      tagOrder: [
        "audioLanguages",
        "resolution",
        "videoCodec",
        "audioCodec",
        "spatialAudio",
        "channels",
        "subtitles",
        "identifier",
      ],
      enabledTags: [
        "audioLanguages",
        "resolution",
        "videoCodec",
        "audioCodec",
        "spatialAudio",
        "channels",
        "subtitles",
        "identifier",
      ],
      theme: "dark",
    };

    const result = generateCandidateFilename(item, candidate, settings);

    expect(result.generated.filename).toBe(
      "La llegada - 2016 [EN] [2160p] [HEVC] [TrueHD] [Atmos] [7.1] [SUB ES] [ID-329865].mkv",
    );
  });
});

describe("settings contract", () => {
  it("preserves the backend credential persistence field under the frontend name", () => {
    const settings = parseSettings({
      titleLanguage: "es-ES",
      region: "ES",
      ffprobePath: "",
      tmdbConfigured: true,
      credentialSource: "session",
      credentialPersistence: "processMemoryOnly",
      namingTemplate: "{title} ({year}) {tags}",
      matchThreshold: 80,
      includeIdentifier: false,
      tagOrder: [],
      enabledTags: [],
      theme: "dark",
    });

    expect(settings.tmdbCredentialSource).toBe("session");
    expect(settings.tmdbCredentialPersistence).toBe("processMemoryOnly");
  });
});
