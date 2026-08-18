import { describe, expect, it } from "vitest";

import {
  detectAtmos,
  detectDtsX,
  formatAudioCodecForName,
  formatChannels,
  normalizeAudioCodec,
  normalizeAudioTrack,
} from "./audio";
import type { RawAudioTrack } from "./raw";

const track = (fields: Partial<RawAudioTrack>): RawAudioTrack => ({ "@type": "Audio", ...fields });

describe("códecs de audio", () => {
  it.each<[Partial<RawAudioTrack>, string]>([
    [{ Format: "AC-3" }, "Dolby Digital"],
    [{ Format: "E-AC-3" }, "Dolby Digital Plus"],
    [{ Format: "MLP FBA" }, "TrueHD"],
    [{ Format: "DTS" }, "DTS"],
    [{ Format: "DTS", Format_Profile: "MA / Core" }, "DTS-HD MA"],
    [{ Format: "DTS", Format_Profile: "High Resolution Audio / Core" }, "DTS-HD HRA"],
    [{ Format: "AAC" }, "AAC"],
    [{ Format: "FLAC" }, "FLAC"],
    [{ Format: "PCM" }, "PCM"],
    [{ Format: "Opus" }, "Opus"],
  ])("%o ⇒ %s", (fields, expected) => {
    expect(normalizeAudioCodec(track(fields))).toBe(expected);
  });

  it("reconoce DTS-HD MA por el nombre comercial", () => {
    expect(
      normalizeAudioCodec(track({ Format: "DTS", Format_Commercial_IfAny: "DTS-HD Master Audio" })),
    ).toBe("DTS-HD MA");
  });
});

describe("Atmos", () => {
  it("TrueHD sin Atmos no lo declara", () => {
    expect(detectAtmos(track({ Format: "MLP FBA", Format_Profile: "TrueHD" }))).toBe(false);
  });

  it("TrueHD con Atmos por características adicionales (16-ch)", () => {
    expect(detectAtmos(track({ Format: "MLP FBA", Format_AdditionalFeatures: "16-ch" }))).toBe(
      true,
    );
  });

  it("E-AC-3 con JOC es Atmos", () => {
    expect(detectAtmos(track({ Format: "E-AC-3", Format_AdditionalFeatures: "JOC" }))).toBe(true);
  });

  it("E-AC-3 sin JOC no es Atmos", () => {
    expect(detectAtmos(track({ Format: "E-AC-3" }))).toBe(false);
  });

  it("nombre comercial con Atmos", () => {
    expect(
      detectAtmos(
        track({ Format: "E-AC-3", Format_Commercial_IfAny: "Dolby Digital Plus with Dolby Atmos" }),
      ),
    ).toBe(true);
  });
});

describe("DTS-X", () => {
  it("DTS-HD MA no es DTS:X", () => {
    expect(detectDtsX(track({ Format: "DTS", Format_Profile: "MA / Core" }))).toBe(false);
  });

  it("DTS:X requiere XLL X o nombre comercial", () => {
    expect(detectDtsX(track({ Format: "DTS", Format_AdditionalFeatures: "XLL X" }))).toBe(true);
    expect(detectDtsX(track({ Format: "DTS", Format_Commercial_IfAny: "DTS-X" }))).toBe(true);
  });
});

describe("canales", () => {
  it("usa el layout cuando existe", () => {
    expect(formatChannels(6, "L R C LFE Ls Rs")).toBe("5.1");
    expect(formatChannels(8, "L R C LFE Ls Rs Lb Rb")).toBe("7.1");
    expect(formatChannels(6, "L R C Ls Rs Cs")).toBe("6.0");
    expect(formatChannels(2, "L R")).toBe("2.0");
    expect(formatChannels(1, "C")).toBe("1.0");
  });

  it("cae al recuento solo si no hay layout", () => {
    expect(formatChannels(6, undefined)).toBe("5.1");
    expect(formatChannels(8, undefined)).toBe("7.1");
    expect(formatChannels(undefined, undefined)).toBeUndefined();
  });
});

describe("presentación del audio principal", () => {
  it.each([
    [{ codec: "Dolby Digital", atmos: false, dtsX: false }, "DD"],
    [{ codec: "Dolby Digital Plus", atmos: true, dtsX: false }, "DD+ Atmos"],
    [{ codec: "TrueHD", atmos: true, dtsX: false }, "TrueHD Atmos"],
    [{ codec: "DTS-HD MA", atmos: false, dtsX: true }, "DTS-X"],
  ] as const)("%o ⇒ %s", (input, expected) => {
    expect(formatAudioCodecForName(input.codec, { atmos: input.atmos, dtsX: input.dtsX })).toBe(
      expected,
    );
  });
});

describe("banderas de pista", () => {
  it("detecta comentarios y audiodescripción por el título", () => {
    const commentary = normalizeAudioTrack(
      track({ Format: "AC-3", Title: "Director Commentary", Language: "en" }),
      0,
    );
    expect(commentary.isCommentary.value).toBe(true);

    const described = normalizeAudioTrack(
      track({ Format: "AC-3", Title: "Audio Description", Language: "es-ES" }),
      1,
    );
    expect(described.isDescriptiveAudio.value).toBe(true);
  });

  it("lee default y forced del contenedor", () => {
    const normalized = normalizeAudioTrack(
      track({ Format: "AC-3", Default: "Yes", Forced: "No" }),
      0,
    );
    expect(normalized.isDefault.value).toBe(true);
    expect(normalized.isForced.value).toBe(false);
  });
});
