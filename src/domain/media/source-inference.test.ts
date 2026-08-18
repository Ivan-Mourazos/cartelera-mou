import { describe, expect, it } from "vitest";

import { effectiveBitrate, inferSourceFromStream } from "./source-inference";

describe("effectiveBitrate", () => {
  it("prefiere el bitrate declarado por el contenedor", () => {
    expect(
      effectiveBitrate({
        overallBitrateBps: 50_000_000,
        fileSizeBytes: 1_000_000_000,
        durationSeconds: 3600,
      }),
    ).toBe(50_000_000);
  });

  it("lo calcula del peso y la duración cuando el contenedor calla", () => {
    // 24 GB en 2 horas y media ≈ 21,3 Mbps.
    const bitrate = effectiveBitrate({
      fileSizeBytes: 24_000_000_000,
      durationSeconds: 9000,
    });
    expect(bitrate).toBeCloseTo(21_333_333, -4);
  });

  it("no inventa nada sin duración", () => {
    expect(effectiveBitrate({ fileSizeBytes: 24_000_000_000 })).toBeUndefined();
  });
});

describe("inferSourceFromStream", () => {
  it("un UHD de 60 GB en 2 h es un REMUX de Blu-ray", () => {
    const result = inferSourceFromStream({
      fileSizeBytes: 60_000_000_000,
      durationSeconds: 7200,
      videoCodec: "HEVC",
      pixelLabel: "2160p",
    });
    expect(result.value).toBe("BluRay");
    expect(result.remux).toBe(true);
    expect(result.traced.confidence).toBe("INFERRED");
  });

  it("un UHD de 15 GB en 2 h es un reencode: UHDRip", () => {
    expect(
      inferSourceFromStream({
        fileSizeBytes: 15_000_000_000,
        durationSeconds: 7200,
        videoCodec: "HEVC",
        pixelLabel: "2160p",
      }),
    ).toMatchObject({ value: "UHDRip", remux: false });
  });

  it("un 4K de streaming ronda los 12 Mbps: WEB-DL", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 12_000_000,
        videoCodec: "HEVC",
        pixelLabel: "2160p",
      }),
    ).toMatchObject({ value: "WEB-DL" });
  });

  it("un 1080p AVC por encima de 22 Mbps es un REMUX de Blu-ray", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 31_000_000,
        videoCodec: "AVC",
        pixelLabel: "1080p",
      }),
    ).toMatchObject({ value: "BluRay", remux: true });
  });

  it("un 1080p AVC de 5 Mbps es WEB-DL", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 5_000_000,
        videoCodec: "AVC",
        pixelLabel: "1080p",
      }),
    ).toMatchObject({ value: "WEB-DL", remux: false });
  });

  it("corrige por la eficiencia del códec: 8 Mbps en HEVC no son 8 en AVC", () => {
    const hevc = inferSourceFromStream({
      overallBitrateBps: 8_000_000,
      videoCodec: "HEVC",
      pixelLabel: "1080p",
    });
    const avc = inferSourceFromStream({
      overallBitrateBps: 8_000_000,
      videoCodec: "AVC",
      pixelLabel: "1080p",
    });
    // El mismo bitrate: el HEVC sube de categoría porque rinde más.
    expect(hevc.value).toBe("BluRay");
    expect(avc.value).toBe("WEB-DL");
  });

  it("XviD en definición estándar es DVDRip", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 1_100_000,
        videoCodec: "MPEG-4",
        pixelLabel: "480p",
      }),
    ).toMatchObject({ value: "DVDRip" });
  });

  it("sin bitrate ni peso no infiere nada", () => {
    const result = inferSourceFromStream({ videoCodec: "HEVC", pixelLabel: "2160p" });
    expect(result.value).toBeUndefined();
    expect(result.traced.confidence).toBe("UNKNOWN");
  });

  it("sin resolución no juzga el bitrate", () => {
    expect(inferSourceFromStream({ overallBitrateBps: 80_000_000 }).value).toBeUndefined();
  });

  it("explica el motivo con el bitrate y el peso reales", () => {
    const note = inferSourceFromStream({
      fileSizeBytes: 60_000_000_000,
      durationSeconds: 7200,
      videoCodec: "HEVC",
      pixelLabel: "2160p",
    }).traced.note;
    expect(note).toContain("Mbps");
    expect(note).toContain("60.0 GB");
  });
});
