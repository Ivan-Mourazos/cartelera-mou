import { describe, expect, it } from "vitest";

import { audioCodecLabel, bitDepthLabel, hdrLabel, videoCodecLabel } from "./release-labels";

describe("videoCodecLabel", () => {
  it("usa el nombre técnico del stream, nunca el del codificador", () => {
    expect(videoCodecLabel("HEVC")).toBe("HEVC");
    expect(videoCodecLabel("AVC")).toBe("AVC");
    expect(videoCodecLabel(undefined)).toBeUndefined();
  });
});

describe("audioCodecLabel", () => {
  it("abrevia Dolby Digital como en las publicaciones", () => {
    expect(audioCodecLabel("Dolby Digital Plus", { atmos: false, dtsX: false })).toBe("DD+");
    expect(audioCodecLabel("Dolby Digital", { atmos: false, dtsX: false })).toBe("DD");
  });

  it("añade el audio espacial tras el códec", () => {
    expect(audioCodecLabel("TrueHD", { atmos: true, dtsX: false })).toBe("TrueHD Atmos");
    expect(audioCodecLabel("Dolby Digital Plus", { atmos: true, dtsX: false })).toBe("DD+ Atmos");
  });

  it("escribe DTS-X con guion: los dos puntos están prohibidos en Windows", () => {
    expect(audioCodecLabel("DTS-HD MA", { atmos: false, dtsX: true })).toBe("DTS-X");
    expect(audioCodecLabel("DTS-HD MA", { atmos: false, dtsX: true })).not.toContain(":");
  });

  it("sin códec no escribe nada", () => {
    expect(audioCodecLabel(undefined, { atmos: true, dtsX: false })).toBeUndefined();
  });
});

describe("bitDepthLabel", () => {
  it("solo escribe la profundidad cuando supera 8 bits", () => {
    expect(bitDepthLabel(8)).toBeUndefined();
    expect(bitDepthLabel(10)).toBe("10bit");
    expect(bitDepthLabel(12)).toBe("12bit");
    expect(bitDepthLabel(undefined)).toBeUndefined();
  });
});

describe("hdrLabel", () => {
  it("Dolby Vision gana sobre su capa base", () => {
    expect(hdrLabel(["Dolby Vision", "HDR10"])).toBe("DV");
    expect(hdrLabel(["HDR10+"])).toBe("HDR10+");
    expect(hdrLabel(["HDR10"])).toBe("HDR10");
    expect(hdrLabel(["HLG"])).toBe("HLG");
    expect(hdrLabel([])).toBeUndefined();
  });
});
