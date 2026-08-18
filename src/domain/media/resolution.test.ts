import { describe, expect, it } from "vitest";

import { classifyResolution } from "./resolution";

describe("classifyResolution", () => {
  it("clasifica por anchura del máster, no por altura", () => {
    // UHD recortado a 2.39:1: sigue siendo 4K / 2160p.
    expect(classifyResolution(3840, 1608)).toMatchObject({ quality: "4K", pixelLabel: "2160p" });
    expect(classifyResolution(3840, 2160)).toMatchObject({ quality: "4K", pixelLabel: "2160p" });
  });

  it("clasifica las bandas restantes", () => {
    expect(classifyResolution(7680, 4320)).toMatchObject({ quality: "8K", pixelLabel: "4320p" });
    expect(classifyResolution(2560, 1440)).toMatchObject({ quality: "2K", pixelLabel: "1440p" });
    expect(classifyResolution(2048, 858)).toMatchObject({ quality: "2K", pixelLabel: "1440p" });
    expect(classifyResolution(1920, 1080)).toMatchObject({
      quality: "Full HD",
      pixelLabel: "1080p",
    });
    expect(classifyResolution(1280, 720)).toMatchObject({ quality: "HD", pixelLabel: "720p" });
    expect(classifyResolution(720, 576)).toMatchObject({ quality: "SD", pixelLabel: "576p" });
    expect(classifyResolution(640, 480)).toMatchObject({ quality: "SD", pixelLabel: "480p" });
  });

  it("corrige al alza el contenido anamórfico", () => {
    // 1440×1080 es 4:3 anamórfico: la altura manda.
    expect(classifyResolution(1440, 1080)).toMatchObject({
      quality: "Full HD",
      pixelLabel: "1080p",
    });
  });

  it("trata el contenido vertical por su lado largo", () => {
    expect(classifyResolution(1080, 1920)).toMatchObject({
      quality: "Full HD",
      pixelLabel: "1080p",
    });
  });

  it("no decide nada sin dimensiones utilizables", () => {
    expect(classifyResolution(undefined, 1080)).toBeUndefined();
    expect(classifyResolution(0, 0)).toBeUndefined();
    expect(classifyResolution(Number.NaN, 1080)).toBeUndefined();
  });

  it("explica siempre por qué eligió esa clase", () => {
    expect(classifyResolution(3840, 1608)?.reason).toContain("3840");
  });
});
