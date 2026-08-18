import { describe, expect, it } from "vitest";

import { formatOtherLanguages, formatPrimaryAudio, selectAudio } from "./audio-selection";
import { audioTrack, mediaFor } from "./test-fixtures";

const dd51 = (language: string, extra: Record<string, unknown> = {}) =>
  audioTrack({
    Language: language,
    Format: "AC-3",
    Channels: 6,
    ChannelLayout: "L R C LFE Ls Rs",
    ...extra,
  });

describe("selección de la pista principal", () => {
  it("el español gana al idioma original aunque la película sea inglesa", () => {
    // Regresión: al identificar la obra en TMDb, `originalLanguage` pasaba a ser
    // «en» y la pista elegida cambiaba a inglés.
    const media = mediaFor("peli.mkv", { audio: [dd51("en"), dd51("spa")] });

    expect(selectAudio(media).primary?.language.value?.base).toBe("es");
    expect(selectAudio(media, { originalLanguageBase: "en" }).primary?.language.value?.base).toBe(
      "es",
    );
  });

  it("el castellano gana a cualquier otro español", () => {
    const media = mediaFor("peli.mkv", { audio: [dd51("es-419"), dd51("es-ES")] });
    const selection = selectAudio(media, { originalLanguageBase: "en" });

    expect(selection.primary?.language.value?.label).toBe("ESP");
    expect(selection.hasCastilian).toBe(true);
  });

  it("el latino se elige si no hay castellano", () => {
    const media = mediaFor("peli.mkv", { audio: [dd51("en"), dd51("es-419")] });
    const selection = selectAudio(media, { originalLanguageBase: "en" });

    expect(selection.primary?.language.value?.label).toBe("LAT");
    expect(selection.hasCastilian).toBe(false);
  });

  it("sin ningún español se usa el idioma original", () => {
    const media = mediaFor("peli.mkv", { audio: [dd51("fr"), dd51("en")] });
    const selection = selectAudio(media, { originalLanguageBase: "en" });

    expect(selection.primary?.language.value?.base).toBe("en");
    expect(selection.reason).toContain("idioma original");
  });

  it("un comentario en español no se elige como pista principal", () => {
    const media = mediaFor("peli.mkv", {
      audio: [dd51("spa", { Title: "Comentario del director" }), dd51("en")],
    });
    const selection = selectAudio(media, { originalLanguageBase: "en" });

    expect(selection.primary?.language.value?.base).toBe("en");
  });
});

describe("formato del bloque de audio", () => {
  const primaryFor = (fields: Record<string, unknown>) =>
    formatPrimaryAudio(selectAudio(mediaFor("peli.mkv", { audio: [audioTrack(fields)] })).primary);

  it("escribe Castellano con el códec y los canales", () => {
    expect(
      primaryFor({
        Language: "es-ES",
        Format: "MLP FBA",
        Format_Commercial_IfAny: "Dolby TrueHD with Dolby Atmos",
        Format_AdditionalFeatures: "16-ch",
      }),
    ).toBe("Castellano TrueHD Atmos 7.1");
  });

  it("usa DD+ para Dolby Digital Plus", () => {
    expect(
      primaryFor({
        Language: "es-ES",
        Format: "E-AC-3",
        Channels: 6,
        ChannelLayout: "L R C LFE Ls Rs",
      }),
    ).toBe("Castellano DD+ 5.1");
  });

  it("usa DD para Dolby Digital", () => {
    expect(
      primaryFor({
        Language: "es-ES",
        Format: "AC-3",
        Channels: 6,
        ChannelLayout: "L R C LFE Ls Rs",
      }),
    ).toBe("Castellano DD 5.1");
  });

  it("escribe Español cuando la región no consta", () => {
    expect(primaryFor({ Language: "spa", Format: "AC-3", ChannelLayout: "L R" })).toBe(
      "Español DD 2.0",
    );
  });

  it("escribe DTS-X con guion: los dos puntos están prohibidos en Windows", () => {
    const value = primaryFor({
      Language: "es-ES",
      Format: "DTS",
      Format_Commercial_IfAny: "DTS-HD Master Audio",
      Format_AdditionalFeatures: "XLL X",
    });
    expect(value).toContain("DTS-X");
    expect(value).not.toContain(":");
  });
});

describe("formatOtherLanguages", () => {
  it("une abreviaturas de tres letras con +", () => {
    expect(formatOtherLanguages(["ENG", "FRA"])).toBe("ENG+FRA");
  });

  it("no antepone la palabra «Otros»: el bloque ya se lee como tal", () => {
    expect(formatOtherLanguages(["ENG"])).toBe("ENG");
  });

  it("devuelve undefined sin otros idiomas", () => {
    expect(formatOtherLanguages([])).toBeUndefined();
  });
});
