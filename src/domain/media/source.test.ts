import { describe, expect, it } from "vitest";

import { composeQualitySource, detectSourceFromFilename } from "./source";
import type { QualityClass } from "./types";

describe("detección de fuente desde el nombre", () => {
  it.each([
    ["Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.HEVC.mkv", "UHD Blu-ray", "REMUX"],
    ["Heat.1995.1080p.BluRay.REMUX.AVC.mkv", "Blu-ray", "REMUX"],
    ["The.Batman.2022.2160p.WEB-DL.DDP5.1.mkv", "WEB-DL", undefined],
    ["Serie.S01E01.1080p.WEBRip.x264.mkv", "WEBRip", undefined],
    ["Programa.2019.720p.HDTV.x264.mkv", "HDTV", undefined],
    ["Pelicula.2001.DVDRip.XviD.avi", "DVD", undefined],
  ])("%s", (filename, media, type) => {
    const source = detectSourceFromFilename(filename);
    expect(source.media.value).toBe(media);
    expect(source.type.value).toBe(type);
  });

  it("sin etiquetas de fuente el dato queda desconocido", () => {
    const source = detectSourceFromFilename("Alien.1979.2160p.HEVC.mkv");
    expect(source.media.value).toBeUndefined();
    expect(source.media.confidence).toBe("UNKNOWN");
    expect(source.type.value).toBeUndefined();
  });

  it("la fuente extraída del nombre es INFERRED, nunca CONFIRMED", () => {
    const source = detectSourceFromFilename("Dune.2021.2160p.UHD.BluRay.REMUX.mkv");
    expect(source.media.confidence).toBe("INFERRED");
    expect(source.type.confidence).toBe("INFERRED");
    expect(source.media.source).toBe("ORIGINAL_FILENAME");
    expect(source.type.note).toContain("No verificable");
  });
});

describe("qualitySource", () => {
  const source = (media?: string, type?: string) =>
    detectSourceFromFilename(
      `X.2020.${media === undefined ? "" : `${media}.`}${type === undefined ? "" : `${type}.`}mkv`,
    );

  it.each<[QualityClass, string | undefined, string | undefined, string]>([
    ["4K UHD", "UHD.BluRay", "REMUX", "4K UHD REMUX"],
    ["Full HD", "BluRay", "REMUX", "Full HD REMUX"],
    ["4K UHD", "WEB-DL", undefined, "4K UHD WEB-DL"],
    ["Full HD", "WEB-DL", undefined, "Full HD WEB-DL"],
    ["Full HD", "BluRay", undefined, "Full HD Blu-ray"],
    ["HD", "WEB-DL", undefined, "HD WEB-DL"],
  ])("%s + %s/%s ⇒ %s", (quality, media, type, expected) => {
    expect(composeQualitySource(quality, source(media, type))).toBe(expected);
  });

  it("sin fuente conocida solo se muestra la calidad, nunca «UNKNOWN»", () => {
    const result = composeQualitySource("4K UHD", detectSourceFromFilename("X.2020.mkv"));
    expect(result).toBe("4K UHD");
    expect(result).not.toContain("UNKNOWN");
  });

  it("no repite «UHD» cuando la calidad ya lo dice", () => {
    expect(composeQualitySource("4K UHD", source("UHD.BluRay", undefined))).toBe("4K UHD Blu-ray");
  });

  it("puede excluirse la fuente inferida", () => {
    expect(
      composeQualitySource("4K UHD", source("UHD.BluRay", "REMUX"), { allowInferred: false }),
    ).toBe("4K UHD");
  });

  it("sin calidad no hay campo", () => {
    expect(composeQualitySource(undefined, source("BluRay", "REMUX"))).toBeUndefined();
  });
});
