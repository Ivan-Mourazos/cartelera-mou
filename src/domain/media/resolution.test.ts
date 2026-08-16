import { describe, expect, it } from "vitest";

import { classifyResolution } from "./resolution";
import type { QualityClass } from "./types";

const quality = (width: number, height: number): QualityClass | undefined =>
  classifyResolution(width, height)?.quality;

describe("clasificación de resolución por clases", () => {
  it.each<[number, number, QualityClass]>([
    [7680, 4320, "8K UHD"],
    [4096, 2160, "DCI 4K"],
    [3840, 2160, "4K UHD"],
    [3840, 1608, "4K UHD"],
    [3840, 1634, "4K UHD"],
    [3840, 1716, "4K UHD"],
    [2560, 1440, "QHD"],
    [2048, 1080, "Full HD"],
    [1920, 1080, "Full HD"],
    [1920, 800, "Full HD"],
    [1920, 816, "Full HD"],
    [1280, 720, "HD"],
    [1280, 536, "HD"],
    [720, 576, "SD"],
    [720, 480, "SD"],
  ])("%i×%i ⇒ %s", (width, height, expected) => {
    expect(quality(width, height)).toBe(expected);
  });

  it("no clasifica un UHD recortado como 1440p por su altura", () => {
    expect(quality(3840, 1608)).not.toBe("QHD");
  });

  it("distingue DCI 4K de UHD", () => {
    expect(quality(4096, 2160)).toBe("DCI 4K");
    expect(quality(3840, 2160)).toBe("4K UHD");
  });

  it("corrige al alza el contenido anamórfico 1440×1080", () => {
    expect(quality(1440, 1080)).toBe("Full HD");
  });

  it("conserva las dimensiones exactas y explica la decisión", () => {
    const classification = classifyResolution(3840, 1608);
    expect(classification?.width).toBe(3840);
    expect(classification?.height).toBe(1608);
    expect(classification?.reason).toContain("3840");
  });

  it("devuelve undefined sin dimensiones utilizables", () => {
    expect(classifyResolution(undefined, 2160)).toBeUndefined();
    expect(classifyResolution(0, 0)).toBeUndefined();
    expect(classifyResolution(Number.NaN, 1080)).toBeUndefined();
  });
});
