import { describe, expect, it } from "vitest";

import { selectAudio } from "./audio-selection";
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
