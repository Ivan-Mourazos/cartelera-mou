import { describe, expect, it } from "vitest";

import { composeSourceLabel, describeSourceDetail, detectSourceFromFilename } from "./source";

describe("detectSourceFromFilename — vocabulario ampliado", () => {
  const cases: readonly (readonly [string, string | undefined, boolean])[] = [
    ["Peli.2024.2160p.UHD.BluRay.REMUX.HEVC-GRP.mkv", "BluRay", true],
    ["Peli.2024.1080p.BluRay.x264-GRP.mkv", "BluRay", false],
    ["Peli.2024.1080p.BDRip.x264-GRP.mkv", "BDRip", false],
    ["Peli.2024.1080p.BRRip.XviD-GRP.avi", "BRRip", false],
    ["Peli.2024.2160p.UHDRip.HEVC-GRP.mkv", "UHDRip", false],
    ["Peli.2024.1080p.WEB-DL.DDP5.1-GRP.mkv", "WEB-DL", false],
    ["Peli.2024.1080p.AMZN.WEB.DDP5.1-GRP.mkv", "WEB-DL", false],
    ["Peli.2024.1080p.WEBRip.x264-GRP.mkv", "WEBRip", false],
    ["Serie.S01E01.720p.HDTV.x264-GRP.mkv", "HDTV", false],
    ["Serie.S01E01.720p.HDTVRip.x264-GRP.mkv", "HDTVRip", false],
    ["Peli.2024.MicroHD.1080p.AC3-GRP.mkv", "microHD", false],
    ["Peli.2024.HDRip.XviD-GRP.avi", "HDRip", false],
    ["Peli.2024.DVDRip.XviD-GRP.avi", "DVDRip", false],
    ["Peli.2024.DVDScr.XviD-GRP.avi", "DVDScr", false],
    ["Peli.2024.HDTS.XviD-GRP.avi", "TS", false],
    ["Peli.2024.HDCAM.XviD-GRP.avi", "CamRip", false],
    ["Peli.2024.CAM.XviD-GRP.avi", "CamRip", false],
    ["Peli.2024.HDTC.XviD-GRP.avi", "TC", false],
  ];

  for (const [filename, media, isRemux] of cases) {
    it(`reconoce ${String(media)} en ${filename}`, () => {
      const source = detectSourceFromFilename(filename);
      expect(source.media.value).toBe(media);
      expect(source.type.value === "REMUX").toBe(isRemux);
    });
  }

  it("nunca marca la fuente como confirmada: el archivo no la demuestra", () => {
    expect(detectSourceFromFilename("Peli.2024.1080p.BluRay.mkv").media.confidence).toBe(
      "INFERRED",
    );
  });

  it("no inventa fuente cuando el nombre no la declara", () => {
    expect(detectSourceFromFilename("Peli.2024.1080p.mkv").media.value).toBeUndefined();
  });
});

describe("composeSourceLabel", () => {
  it("une Blu-ray y REMUX en la etiqueta que se usa en las publicaciones", () => {
    const source = detectSourceFromFilename("Peli.2024.2160p.BluRay.REMUX.mkv");
    expect(composeSourceLabel(source)).toBe("BluRay REMUX");
  });

  it("devuelve la fuente a secas cuando no es un REMUX", () => {
    expect(composeSourceLabel(detectSourceFromFilename("Peli.2024.1080p.WEB-DL.mkv"))).toBe(
      "WEB-DL",
    );
  });

  it("no escribe nada cuando no hay evidencia de fuente", () => {
    expect(composeSourceLabel(detectSourceFromFilename("Peli.2024.1080p.mkv"))).toBeUndefined();
  });

  it("omite la fuente inferida cuando se le pide no usarla", () => {
    const source = detectSourceFromFilename("Peli.2024.1080p.BluRay.mkv");
    expect(composeSourceLabel(source, { allowInferred: false })).toBeUndefined();
  });
});

describe("describeSourceDetail", () => {
  it("describe la fuente completa para la ficha técnica", () => {
    expect(describeSourceDetail(detectSourceFromFilename("Peli.2024.BluRay.REMUX.mkv"))).toBe(
      "BluRay REMUX",
    );
  });
});
