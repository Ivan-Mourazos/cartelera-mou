import { describe, expect, it } from "vitest";
import { generateMediaFilename } from "./generator";

describe("generateMediaFilename", () => {
  it("uses the canonical order and one bracket for each characteristic", () => {
    const generated = generateMediaFilename({
      title: "Dune - Parte dos",
      year: 2024,
      resolution: "2160p",
      source: "UHD Blu-ray",
      releaseType: "REMUX",
      videoCodec: "HEVC",
      bitDepth: 10,
      dolbyVision: true,
      dolbyVisionProfile: "8",
      hdrFormats: ["HDR10"],
      audioCodec: "TrueHD",
      spatialAudio: "Atmos",
      channels: "7.1",
      audioLanguages: ["es", "en"],
      subtitleLanguages: ["es"],
      editions: [],
      tmdbId: 693134,
      extension: "mkv",
    });

    expect(generated.filename).toBe(
      "Dune - Parte dos (2024) [2160p] [UHD Blu-ray] [REMUX] [HEVC] [10-bit] " +
        "[Dolby Vision] [Profile 8] [HDR10] [TrueHD] [Atmos] [7.1] [ES] [EN] [subs ES].mkv",
    );
    expect(generated.filename).not.toContain("[]");
    expect(generated.filename).not.toContain("ID-693134");
    expect(generated.validation.valid).toBe(true);
  });

  it("adds the internal identifier only through the disabled-by-default option", () => {
    const input = { title: "Dune", year: 2024, tmdbId: 693134, extension: "mkv" } as const;

    expect(generateMediaFilename(input).filename).toBe("Dune (2024).mkv");
    expect(generateMediaFilename(input, { includeIdentifier: true }).filename).toBe(
      "Dune (2024) [ID-693134].mkv",
    );
  });

  it("renders generic HDR honestly without upgrading it to HDR10", () => {
    const generated = generateMediaFilename({
      title: "Oppenheimer",
      year: 2023,
      hdrFormats: ["HDR"],
      extension: "mkv",
    });

    expect(generated.tags).toContain("HDR");
    expect(generated.tags).not.toContain("HDR10");
  });

  it("reports title sanitization instead of hiding it", () => {
    const generated = generateMediaFilename({ title: "Alien: Resurrection", extension: "mkv" });

    expect(generated.filename).toBe("Alien - Resurrection.mkv");
    expect(generated.sanitizationChanges).toContain("invalid-characters-replaced");
    expect(generated.warnings.length).toBeGreaterThan(0);
  });

  it("supports a user-defined tag order and disabled labels", () => {
    const generated = generateMediaFilename(
      {
        title: "Arrival",
        year: 2016,
        resolution: "2160p",
        source: "UHD Blu-ray",
        videoCodec: "HEVC",
        extension: "mkv",
      },
      {
        tagOrder: ["videoCodec", "resolution", "source"],
        enabledTags: ["videoCodec", "resolution"],
      },
    );

    expect(generated.filename).toBe("Arrival (2016) [HEVC] [2160p].mkv");
  });

  it("renders the configured naming template without losing normalized tags", () => {
    const generated = generateMediaFilename(
      {
        title: "Arrival",
        year: 2016,
        resolution: "2160p",
        videoCodec: "HEVC",
        extension: "mkv",
      },
      {
        template: "{title} - {year} - {tags}",
        tagOrder: ["videoCodec", "resolution"],
      },
    );

    expect(generated.filename).toBe("Arrival - 2016 - [HEVC] [2160p].mkv");
  });

  it("omits blank subtitles and contains untrusted tag delimiters", () => {
    const generated = generateMediaFilename({
      title: "Arrival",
      subtitleLanguages: ["", "ES] [EN"],
      extension: "mkv",
    });

    expect(generated.tags).toEqual(["subs ES EN"]);
    expect(generated.filename).toBe("Arrival [subs ES EN].mkv");
    expect(generated.filename).not.toContain("[subs]");
  });

  it("sanitizes a canonical label that Windows cannot represent literally", () => {
    const generated = generateMediaFilename({
      title: "Film",
      spatialAudio: "DTS:X",
      extension: "mkv",
    });

    expect(generated.filename).toBe("Film [DTS X].mkv");
    expect(generated.validation.valid).toBe(true);
    expect(generated.sanitizationChanges).toContain("invalid-characters-replaced");
  });
});
