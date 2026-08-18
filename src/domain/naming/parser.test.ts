import { describe, expect, it } from "vitest";
import type { MetadataField, MetadataFieldValues } from "../metadata";
import { parseMediaFilename } from "./parser";

const valuesFor = <K extends MetadataField>(
  filename: ReturnType<typeof parseMediaFilename>,
  field: K,
): MetadataFieldValues[K][] =>
  filename.evidence
    .filter((evidence) => evidence.field === field)
    .map((evidence) => evidence.value as MetadataFieldValues[K]);

describe("parseMediaFilename", () => {
  it("parses Dune without inventing concrete languages from MULTi", () => {
    const original =
      "Dune.Part.Two.2024.MULTi.2160p.UHD.BluRay.REMUX.DV.HDR10.TrueHD.Atmos.7.1.mkv";
    const parsed = parseMediaFilename(original);

    expect(parsed.originalFilename).toBe(original);
    expect(parsed.originalStem).toBe(original.slice(0, -4));
    expect(parsed.probableTitle).toBe("Dune Part Two");
    expect(parsed.year).toBe(2024);
    expect(valuesFor(parsed, "resolution")).toEqual(["4K"]);
    expect(valuesFor(parsed, "mediaSource")).toEqual(["BluRay"]);
    expect(valuesFor(parsed, "releaseType")).toEqual(["REMUX"]);
    expect(valuesFor(parsed, "dolbyVision")).toEqual([true]);
    expect(valuesFor(parsed, "hdrFormat")).toEqual(["HDR10"]);
    expect(valuesFor(parsed, "audioCodec")).toEqual(["TrueHD"]);
    expect(valuesFor(parsed, "spatialAudio")).toEqual(["Atmos"]);
    expect(valuesFor(parsed, "channels")).toEqual(["7.1"]);
    expect(valuesFor(parsed, "multipleAudioLanguages")).toEqual([true]);
    expect(valuesFor(parsed, "audioLanguage")).toEqual([]);
  });

  it("keeps generic HDR distinct from HDR10 and derives DDP channels", () => {
    const parsed = parseMediaFilename(
      "Oppenheimer.2023.IMAX.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.HEVC.mkv",
    );

    expect(parsed.probableTitle).toBe("Oppenheimer");
    expect(parsed.year).toBe(2023);
    expect(valuesFor(parsed, "edition")).toEqual(["IMAX"]);
    expect(valuesFor(parsed, "mediaSource")).toEqual(["WEB-DL"]);
    expect(valuesFor(parsed, "audioCodec")).toEqual(["E-AC-3"]);
    expect(valuesFor(parsed, "channels")).toEqual(["5.1"]);
    expect(valuesFor(parsed, "spatialAudio")).toEqual(["Atmos"]);
    expect(valuesFor(parsed, "dolbyVision")).toEqual([true]);
    expect(valuesFor(parsed, "hdrFormat")).toEqual(["HDR"]);
    expect(valuesFor(parsed, "hdrFormat")).not.toContain("HDR10");
    expect(valuesFor(parsed, "videoCodec")).toEqual(["HEVC"]);
  });

  it("recognizes x264 and the multi-token DTS-HD MA label", () => {
    const parsed = parseMediaFilename("The.Killer.2023.1080p.BluRay.x264.DTS-HD.MA.5.1.mkv");

    expect(parsed.probableTitle).toBe("The Killer");
    expect(parsed.year).toBe(2023);
    expect(valuesFor(parsed, "resolution")).toEqual(["1080p"]);
    expect(valuesFor(parsed, "mediaSource")).toEqual(["BluRay"]);
    expect(valuesFor(parsed, "videoCodec")).toEqual(["H.264"]);
    expect(valuesFor(parsed, "audioCodec")).toEqual(["DTS-HD MA"]);
    expect(valuesFor(parsed, "channels")).toEqual(["5.1"]);
    expect(valuesFor(parsed, "spatialAudio")).toEqual([]);
    expect(valuesFor(parsed, "dolbyVision")).toEqual([]);
  });

  it("extracts an edition placed before the year instead of polluting the title", () => {
    const parsed = parseMediaFilename(
      "Alien.Directors.Cut.1979.2160p.UHD.BluRay.REMUX.HDR10.HEVC.TrueHD.7.1.mkv",
    );

    expect(parsed.probableTitle).toBe("Alien");
    expect(parsed.year).toBe(1979);
    expect(valuesFor(parsed, "edition")).toEqual(["Director's Cut"]);
    expect(valuesFor(parsed, "hdrFormat")).toEqual(["HDR10"]);
    expect(valuesFor(parsed, "spatialAudio")).toEqual([]);
    expect(valuesFor(parsed, "dolbyVision")).toEqual([]);
  });

  it("preserves unknown tokens and an explicit trailing release group", () => {
    const parsed = parseMediaFilename("Example.Movie.2020.1080p.MYSTERY-GROUP.mkv");

    expect(parsed.probableTitle).toBe("Example Movie");
    expect(parsed.releaseGroup).toBe("GROUP");
    expect(parsed.unclassifiedTokens).toContain("MYSTERY");
    expect(parsed.tokens.find((token) => token.raw === "GROUP")?.categories).toContain(
      "release-group",
    );
  });

  it("does not infer Atmos, Dolby Vision, HDR10, or a language from adjacent concepts", () => {
    const parsed = parseMediaFilename("Film.2024.2160p.HEVC.HDR.MULTi.TrueHD.mkv");

    expect(valuesFor(parsed, "spatialAudio")).toEqual([]);
    expect(valuesFor(parsed, "dolbyVision")).toEqual([]);
    expect(valuesFor(parsed, "hdrFormat")).toEqual(["HDR"]);
    expect(valuesFor(parsed, "audioLanguage")).toEqual([]);
  });

  it("does not mistake a hyphenated title for a release group", () => {
    const parsed = parseMediaFilename("Spider-Man.mkv");

    expect(parsed.probableTitle).toBe("Spider Man");
    expect(parsed.releaseGroup).toBeUndefined();
  });

  it("requires Dolby Vision evidence before classifying a profile", () => {
    const unrelated = parseMediaFilename("Project.P8.mkv");
    const dolbyVision = parseMediaFilename("Movie.2024.DV.P8.mkv");

    expect(unrelated.probableTitle).toBe("Project P8");
    expect(valuesFor(unrelated, "dolbyVisionProfile")).toEqual([]);
    expect(valuesFor(dolbyVision, "dolbyVisionProfile")).toEqual(["8"]);
  });

  it("classifies the complete Extended Edition phrase", () => {
    const parsed = parseMediaFilename("Movie.Extended.Edition.2020.1080p.mkv");

    expect(parsed.probableTitle).toBe("Movie");
    expect(valuesFor(parsed, "edition")).toEqual(["Extended"]);
    expect(parsed.unclassifiedTokens).not.toContain("Edition");
  });

  it("recognizes 4K, FHD and BDREMUX correctly", () => {
    const parsed = parseMediaFilename("Gladiator.2000.4K.HDR.BDREMUX.Atmos.mkv");

    expect(parsed.probableTitle).toBe("Gladiator");
    expect(parsed.year).toBe(2000);
    expect(valuesFor(parsed, "resolution")).toEqual(["4K"]);
    expect(valuesFor(parsed, "hdrFormat")).toEqual(["HDR"]);
    expect(valuesFor(parsed, "mediaSource")).toEqual(["BluRay"]);
    expect(valuesFor(parsed, "releaseType")).toEqual(["REMUX"]);
    expect(valuesFor(parsed, "spatialAudio")).toEqual(["Atmos"]);

    const parsedFHD = parseMediaFilename("Avatar.2009.FHD.Blu-ray.mkv");
    expect(valuesFor(parsedFHD, "resolution")).toEqual(["1080p"]);
    expect(valuesFor(parsedFHD, "mediaSource")).toEqual(["BluRay"]);
  });
});
