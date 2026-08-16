import { describe, expect, it } from "vitest";

import type { RawVideoTrack } from "./raw";
import {
  detectDolbyVision,
  detectHdrFormats,
  formatHdrForName,
  normalizeVideoCodec,
  normalizeVideoTrack,
} from "./video";

const track = (fields: Partial<RawVideoTrack>): RawVideoTrack => ({
  "@type": "Video",
  Width: 3840,
  Height: 2160,
  ...fields,
});

describe("códec de vídeo", () => {
  it.each([
    ["HEVC", "HEVC"],
    ["AVC", "AVC"],
    ["AV1", "AV1"],
    ["VP9", "VP9"],
    ["MPEG Video", "MPEG-2"],
    ["VC-1", "VC-1"],
  ])("%s ⇒ %s", (format, expected) => {
    expect(normalizeVideoCodec(format)).toBe(expected);
  });

  it("no inventa un códec desconocido", () => {
    expect(normalizeVideoCodec("Formato raro")).toBeUndefined();
    expect(normalizeVideoTrack(track({ Format: "Formato raro" }), 0).codec.confidence).toBe(
      "UNKNOWN",
    );
  });
});

describe("profundidad de bits", () => {
  it.each([
    ["AVC", 8],
    ["HEVC", 8],
    ["HEVC", 10],
    ["AV1", 10],
  ])("%s %i-bit se lee del stream", (format, bitDepth) => {
    const normalized = normalizeVideoTrack(track({ Format: format, BitDepth: bitDepth }), 0);
    expect(normalized.bitDepth.value).toBe(bitDepth);
    expect(normalized.bitDepth.confidence).toBe("CONFIRMED");
  });

  it("no deduce 10-bit por el hecho de ser HDR", () => {
    const normalized = normalizeVideoTrack(
      track({ Format: "HEVC", HDR_Format: "SMPTE ST 2086, HDR10 compatible" }),
      0,
    );
    expect(normalized.bitDepth.value).toBeUndefined();
    expect(normalized.bitDepth.confidence).toBe("UNKNOWN");
  });
});

describe("detección de HDR", () => {
  it("SDR: sin metadatos HDR no hay formatos", () => {
    expect(detectHdrFormats(track({ transfer_characteristics: "BT.709" }))).toEqual([]);
  });

  it("HDR10 con metadatos estáticos SMPTE ST 2086", () => {
    expect(detectHdrFormats(track({ HDR_Format: "SMPTE ST 2086" }))).toEqual(["HDR10"]);
  });

  it("HDR10+ implica HDR10 como capa base", () => {
    const formats = detectHdrFormats(
      track({ HDR_Format: "SMPTE ST 2094 App 4, Version 1, HDR10+ Profile B" }),
    );
    expect(formats).toContain("HDR10+");
    expect(formats).toContain("HDR10");
  });

  it("Dolby Vision solo cuando el stream lo declara", () => {
    expect(detectHdrFormats(track({ HDR_Format: "Dolby Vision, Version 1.0" }))).toEqual([
      "Dolby Vision",
    ]);
  });

  it("Dolby Vision + HDR10 cuando existe capa compatible", () => {
    const formats = detectHdrFormats(
      track({
        HDR_Format: "Dolby Vision / SMPTE ST 2086",
        HDR_Format_Compatibility: "HDR10",
      }),
    );
    expect(formats).toEqual(["Dolby Vision", "HDR10"]);
    expect(formatHdrForName(formats)).toBe("Dolby Vision + HDR10");
  });

  it("HLG por su característica de transferencia", () => {
    expect(detectHdrFormats(track({ transfer_characteristics: "HLG" }))).toEqual(["HLG"]);
  });

  it("la curva PQ por sí sola no prueba HDR10 (Dolby Vision perfil 5)", () => {
    const formats = detectHdrFormats(
      track({ HDR_Format: "Dolby Vision, Version 1.0, dvhe.05", transfer_characteristics: "PQ" }),
    );
    expect(formats).toEqual(["Dolby Vision"]);
    expect(formats).not.toContain("HDR10");
  });

  it("no deduce HDR del nombre del fichero (aquí no hay nombre en juego)", () => {
    expect(detectHdrFormats(track({ colour_primaries: "BT.2020" }))).toEqual([]);
  });
});

describe("Dolby Vision", () => {
  it("extrae perfil y nivel", () => {
    const info = detectDolbyVision(
      track({
        HDR_Format: "Dolby Vision",
        HDR_Format_Profile: "dvhe.08",
        HDR_Format_Level: "06",
        HDR_Format_Compatibility: "HDR10",
      }),
    );
    expect(info).toEqual({ profile: "8", level: "6", compatibility: "HDR10" });
  });

  it("no devuelve nada sin evidencia", () => {
    expect(detectDolbyVision(track({ HDR_Format: "SMPTE ST 2086" }))).toBeUndefined();
  });
});
