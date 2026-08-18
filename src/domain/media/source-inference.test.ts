import { describe, expect, it } from "vitest";

import { inferSourceFromStream } from "./source-inference";

describe("inferSourceFromStream", () => {
  it("un 2160p HEVC por encima de 60 Mbps es un REMUX de Blu-ray", () => {
    const result = inferSourceFromStream({
      overallBitrateBps: 82_000_000,
      videoCodec: "HEVC",
      pixelLabel: "2160p",
    });
    expect(result.value).toBe("BluRay");
    expect(result.remux).toBe(true);
    expect(result.traced.confidence).toBe("INFERRED");
  });

  it("un 1080p AVC por encima de 25 Mbps es un REMUX de Blu-ray", () => {
    const result = inferSourceFromStream({
      overallBitrateBps: 31_000_000,
      videoCodec: "AVC",
      pixelLabel: "1080p",
    });
    expect(result.value).toBe("BluRay");
    expect(result.remux).toBe(true);
  });

  it("entre 8 y 25 Mbps en HD alto es un Blu-ray reencodado", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 12_000_000,
        videoCodec: "HEVC",
        pixelLabel: "1080p",
      }),
    ).toMatchObject({ value: "BluRay", remux: false });
  });

  it("entre 3 y 8 Mbps es WEB-DL", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 5_000_000,
        videoCodec: "HEVC",
        pixelLabel: "1080p",
      }),
    ).toMatchObject({ value: "WEB-DL" });
  });

  it("por debajo de 3 Mbps con 720p o más es WEBRip", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 1_800_000,
        videoCodec: "AVC",
        pixelLabel: "720p",
      }),
    ).toMatchObject({ value: "WEBRip" });
  });

  it("MPEG-4 en definición estándar es DVDRip", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 1_100_000,
        videoCodec: "MPEG-4",
        pixelLabel: "576p",
      }),
    ).toMatchObject({ value: "DVDRip" });
  });

  it("sin bitrate no infiere nada", () => {
    const result = inferSourceFromStream({ videoCodec: "HEVC", pixelLabel: "2160p" });
    expect(result.value).toBeUndefined();
    expect(result.traced.confidence).toBe("UNKNOWN");
  });

  it("explica siempre el motivo con el bitrate real", () => {
    const result = inferSourceFromStream({
      overallBitrateBps: 82_000_000,
      videoCodec: "HEVC",
      pixelLabel: "2160p",
    });
    expect(result.traced.note).toContain("82");
  });
});
