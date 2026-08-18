import { describe, expect, it } from "vitest";

import { applyProviderMatch, identificationFromHints } from "../identification/build";
import { userConfirmed } from "../media/provenance";
import { extractIdentificationHints } from "../identification/hints";
import type { ContentIdentification } from "../identification/types";
import { audioTrack, mediaFor, textTrack, videoTrack } from "../media/test-fixtures";
import type { NormalizedMedia } from "../media/types";
import { buildMediaName } from "./build";

const identified = (
  filename: string,
  overrides: {
    readonly spanishTitle: string;
    readonly year?: number;
    readonly episodeTitle?: string;
  },
): ContentIdentification => {
  const base = identificationFromHints(extractIdentificationHints(filename));
  return applyProviderMatch(
    base,
    {
      provider: "tmdb",
      id: 693134,
      spanishTitle: overrides.spanishTitle,
      originalTitle: overrides.spanishTitle,
      originalLanguage: "en",
      year: overrides.year,
      posterUrl: undefined,
      ...(overrides.episodeTitle === undefined ? {} : { episodeTitle: overrides.episodeTitle }),
    },
    { score: 90, band: "high", components: [], alternatives: [] },
  );
};

const nameOf = (
  filename: string,
  media: NormalizedMedia,
  title: string,
  year?: number,
  options = {},
): string =>
  buildMediaName(
    identified(filename, { spanishTitle: title, ...(year === undefined ? {} : { year }) }),
    media,
    options,
  ).filename;

describe("generación del nombre — películas", () => {
  it("película 4K REMUX con Dolby Vision, Atmos y varios idiomas", () => {
    const media = mediaFor("Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.DV.HDR.TrueHD.Atmos.mkv", {
      video: [
        videoTrack({
          HDR_Format: "Dolby Vision / SMPTE ST 2086",
          HDR_Format_Compatibility: "HDR10",
        }),
      ],
      audio: [
        audioTrack({ Language: "es-ES", Format_AdditionalFeatures: "16-ch" }),
        audioTrack({
          Language: "en",
          Format: "E-AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
        audioTrack({
          Language: "fr",
          Format: "AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

    expect(
      nameOf(
        "Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.DV.HDR.TrueHD.Atmos.mkv",
        media,
        "Dune Parte Dos",
        2024,
      ),
    ).toBe(
      "Dune Parte Dos (2024) [4K UHD REMUX · HEVC 10-bit · Dolby Vision + HDR10] [Castellano TrueHD Atmos 7.1 · Otros ENG+FRA].mkv",
    );
  });

  it("película Full HD REMUX sin HDR: no deja separadores vacíos", () => {
    const media = mediaFor("Heat.1995.1080p.BluRay.REMUX.AVC.mkv", {
      video: [videoTrack({ Format: "AVC", Width: 1920, Height: 1040, BitDepth: 8 })],
      audio: [
        audioTrack({
          Language: "es-ES",
          Format: "DTS",
          Format_Profile: "MA / Core",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
        audioTrack({
          Language: "en",
          Format: "DTS",
          Format_Profile: "MA / Core",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

    const name = nameOf("Heat.1995.1080p.BluRay.REMUX.AVC.mkv", media, "Heat", 1995);
    expect(name).toBe(
      "Heat (1995) [Full HD REMUX · AVC 8-bit] [Castellano DTS-HD MA 5.1 · Otros ENG].mkv",
    );
    expect(name).not.toContain("··");
    expect(name).not.toContain("[]");
    expect(name).not.toContain(" ]");
  });

  it("película WEB-DL 4K con Dolby Vision", () => {
    const media = mediaFor("The.Batman.2022.2160p.WEB-DL.DDP5.1.Atmos.DV.mkv", {
      video: [videoTrack({ Height: 2160, HDR_Format: "Dolby Vision" })],
      audio: [
        audioTrack({
          Language: "es-ES",
          Format: "E-AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
        audioTrack({
          Language: "en",
          Format: "E-AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

    expect(
      nameOf("The.Batman.2022.2160p.WEB-DL.DDP5.1.Atmos.DV.mkv", media, "The Batman", 2022),
    ).toBe(
      "The Batman (2022) [4K UHD WEB-DL · HEVC 10-bit · Dolby Vision] [Castellano Dolby Digital Plus 5.1 · Otros ENG].mkv",
    );
  });

  it("sin fuente conocida el bloque solo lleva la calidad", () => {
    const media = mediaFor("Alien.1979.2160p.HEVC.mkv", {
      video: [videoTrack({ Height: 2160, HDR_Format: "SMPTE ST 2086" })],
      audio: [
        audioTrack({
          Language: "es-ES",
          Format: "DTS",
          Format_Profile: "MA / Core",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
        audioTrack({
          Language: "en",
          Format: "DTS",
          Format_Profile: "MA / Core",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

    expect(nameOf("Alien.1979.2160p.HEVC.mkv", media, "Alien", 1979)).toBe(
      "Alien (1979) [4K UHD · HEVC 10-bit · HDR10] [Castellano DTS-HD MA 5.1 · Otros ENG].mkv",
    );
  });

  it("solo audio castellano: no aparece el bloque «Otros»", () => {
    const media = mediaFor("Pelicula.2020.1080p.BluRay.mkv", {
      video: [videoTrack({ Format: "AVC", Width: 1920, Height: 1080, BitDepth: 8 })],
      audio: [
        audioTrack({
          Language: "es-ES",
          Format: "DTS",
          Format_Profile: "MA / Core",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

    expect(nameOf("Pelicula.2020.1080p.BluRay.mkv", media, "Película", 2020)).toBe(
      "Película (2020) [Full HD Blu-ray · AVC 8-bit] [Castellano DTS-HD MA 5.1].mkv",
    );
  });

  it("sin castellano usa el idioma original y avisa", () => {
    const media = mediaFor("Film.2020.1080p.WEB-DL.mkv", {
      video: [videoTrack({ Format: "AVC", Width: 1920, Height: 1080, BitDepth: 8 })],
      audio: [
        audioTrack({ Language: "en", Format_AdditionalFeatures: "16-ch" }),
        audioTrack({
          Language: "fr",
          Format: "AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
        audioTrack({
          Language: "it",
          Format: "AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

    const result = buildMediaName(
      identified("Film.2020.1080p.WEB-DL.mkv", { spanishTitle: "Film", year: 2020 }),
      media,
    );
    expect(result.filename).toBe(
      "Film (2020) [Full HD WEB-DL · AVC 8-bit] [Inglés TrueHD Atmos 7.1 · Otros FRA+ITA].mkv",
    );
    expect(result.alerts).toContain("No se ha detectado audio en castellano.");
  });

  it("no repite un idioma con varias pistas y excluye comentarios y audiodescripción", () => {
    const media = mediaFor("Film.2020.1080p.BluRay.mkv", {
      video: [videoTrack({ Format: "AVC", Width: 1920, Height: 1080, BitDepth: 8 })],
      audio: [
        audioTrack({
          Language: "es-ES",
          Format: "AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
        audioTrack({ Language: "en", Format_AdditionalFeatures: "16-ch" }),
        audioTrack({
          Language: "en",
          Format: "AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
        audioTrack({
          Language: "en",
          Format: "AC-3",
          Title: "Director Commentary",
          Channels: 2,
          ChannelLayout: "L R",
        }),
        audioTrack({
          Language: "de",
          Format: "AC-3",
          Title: "Audio Description",
          Channels: 2,
          ChannelLayout: "L R",
        }),
      ],
    });

    const name = nameOf("Film.2020.1080p.BluRay.mkv", media, "Film", 2020);
    expect(name).toContain("Otros ENG]");
    expect(name).not.toContain("ENG/ENG");
    expect(name).not.toContain("DEU");
  });

  it("el español sin región no se convierte en ESP", () => {
    const media = mediaFor("Film.2020.1080p.BluRay.mkv", {
      video: [videoTrack({ Format: "AVC", Width: 1920, Height: 1080, BitDepth: 8 })],
      audio: [
        audioTrack({
          Language: "spa",
          Format: "AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

    const result = buildMediaName(
      identified("Film.2020.1080p.BluRay.mkv", { spanishTitle: "Film", year: 2020 }),
      media,
    );
    expect(result.filename).toContain("[Español Dolby Digital 5.1]");
    expect(result.filename).not.toContain("ESP");
    expect(result.alerts.some((alert) => alert.includes("región determinable"))).toBe(true);
  });

  it("sanea los dos puntos del título para Windows", () => {
    const media = mediaFor("MI.2023.1080p.BluRay.mkv", {
      video: [videoTrack({ Format: "AVC", Width: 1920, Height: 1080, BitDepth: 8 })],
      audio: [
        audioTrack({
          Language: "es-ES",
          Format: "AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

    const name = nameOf("MI.2023.1080p.BluRay.mkv", media, "Misión: Imposible", 2023);
    expect(name).toContain("Misión - Imposible (2023)");
    expect(name).not.toContain(":");
  });

  it("un título con separadores de ruta no puede escapar de la carpeta", () => {
    const media = mediaFor("X.2020.1080p.mkv", {
      video: [videoTrack({ Format: "AVC", Width: 1920, Height: 1080, BitDepth: 8 })],
      audio: [
        audioTrack({
          Language: "es-ES",
          Format: "AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

    const name = nameOf("X.2020.1080p.mkv", media, "../../Windows/System32/evil", 2020);
    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
  });

  it("conserva la extensión original", () => {
    for (const extension of ["mkv", "mp4", "m4v", "avi"]) {
      const media = mediaFor(`X.2020.1080p.${extension}`, {
        video: [videoTrack({ Format: "AVC", Width: 1920, Height: 1080, BitDepth: 8 })],
        audio: [
          audioTrack({
            Language: "es-ES",
            Format: "AC-3",
            Channels: 6,
            ChannelLayout: "L R C LFE Ls Rs",
          }),
        ],
      });
      expect(nameOf(`X.2020.1080p.${extension}`, media, "X", 2020).endsWith(`.${extension}`)).toBe(
        true,
      );
    }
  });

  it("el identificador del proveedor está oculto por defecto y va al final si se activa", () => {
    const media = mediaFor("X.2024.2160p.mkv");
    const identification = identified("X.2024.2160p.mkv", { spanishTitle: "X", year: 2024 });

    expect(buildMediaName(identification, media).filename).not.toContain("693134");

    const withId = buildMediaName(identification, media, {
      presetId: "technical",
      includeProviderId: true,
    }).filename;
    expect(withId).toContain("[ID-693134]");
    expect(withId.indexOf("ID-693134")).toBeGreaterThan(withId.indexOf("["));
  });

  it("los subtítulos no entran en el nombre salvo que se pidan", () => {
    const media = mediaFor("X.2024.2160p.mkv", {
      text: [textTrack({ Language: "es-ES" }), textTrack({ Language: "en" })],
    });
    const identification = identified("X.2024.2160p.mkv", { spanishTitle: "X", year: 2024 });

    expect(buildMediaName(identification, media).filename).not.toContain("Subs");
    expect(
      buildMediaName(identification, media, {
        presetId: "technical",
        includeSubtitleLanguages: true,
      }).filename,
    ).toContain("Subs ESP+ENG");
  });

  it("sin datos técnicos el nombre no inventa bloques", () => {
    const media = mediaFor("X.2024.mkv", { video: [], audio: [] });
    const name = nameOf("X.2024.mkv", media, "X", 2024);
    expect(name).toBe("X (2024).mkv");
  });
});

describe("generación del nombre — series", () => {
  const seriesMedia = (filename: string) =>
    mediaFor(filename, {
      video: [videoTrack({ Height: 2160, HDR_Format: "Dolby Vision" })],
      audio: [
        audioTrack({
          Language: "es-ES",
          Format: "E-AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
        audioTrack({
          Language: "en",
          Format: "E-AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

  it("episodio con título en español", () => {
    const filename = "The.Last.of.Us.S01E03.2160p.WEB-DL.DDP5.1.DV.mkv";
    const identification = identified(filename, {
      spanishTitle: "The Last of Us",
      year: 2023,
      episodeTitle: "Mucho mucho tiempo",
    });

    expect(buildMediaName(identification, seriesMedia(filename)).filename).toBe(
      "The Last of Us (2023) - S01E03 - Mucho mucho tiempo [4K UHD WEB-DL · HEVC 10-bit · Dolby Vision] [Castellano Dolby Digital Plus 5.1 · Otros ENG].mkv",
    );
  });

  it.each([
    ["Serie.S01E01.1080p.mkv", "S01E01"],
    ["Serie.S01E10.1080p.mkv", "S01E10"],
    ["Serie.S10E01.1080p.mkv", "S10E01"],
    ["Serie.S00E01.1080p.mkv", "S00E01"],
    ["Serie.S01E01-E02.1080p.mkv", "S01E01-E02"],
    ["Serie.1x05.1080p.mkv", "S01E05"],
    ["Serie.T02E07.1080p.mkv", "S02E07"],
  ])("%s ⇒ %s", (filename, expected) => {
    const identification = identified(filename, { spanishTitle: "Serie", year: 2020 });
    expect(buildMediaName(identification, seriesMedia(filename)).filename).toContain(
      `Serie (2020) - ${expected} [`,
    );
  });

  it("con título de episodio aparecen los dos separadores", () => {
    const filename = "Serie.S02E07.1080p.mkv";
    const identification = identified(filename, {
      spanishTitle: "Serie",
      year: 2020,
      episodeTitle: "El regreso",
    });
    expect(buildMediaName(identification, seriesMedia(filename)).filename).toContain(
      "Serie (2020) - S02E07 - El regreso [",
    );
  });

  it("sin título de episodio no deja un guion suelto", () => {
    const filename = "Serie.S01E04.1080p.mkv";
    const identification = identified(filename, { spanishTitle: "Serie", year: 2020 });
    const name = buildMediaName(identification, seriesMedia(filename)).filename;
    expect(name).toContain("Serie (2020) - S01E04 [");
    expect(name).not.toContain("- -");
  });

  it("una serie con título oficial en inglés se conserva en inglés", () => {
    const filename = "Better.Call.Saul.S03E05.1080p.mkv";
    const identification = identified(filename, { spanishTitle: "Better Call Saul", year: 2015 });
    expect(buildMediaName(identification, seriesMedia(filename)).filename).toContain(
      "Better Call Saul (2015) - S03E05",
    );
  });
});

describe("presets", () => {
  const filename = "Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.DV.mkv";
  const media = mediaFor(filename, {
    video: [
      videoTrack({ HDR_Format: "Dolby Vision / SMPTE ST 2086", HDR_Format_Compatibility: "HDR10" }),
    ],
    audio: [
      audioTrack({ Language: "es-ES", Format_AdditionalFeatures: "16-ch" }),
      audioTrack({
        Language: "en",
        Format: "E-AC-3",
        Channels: 6,
        ChannelLayout: "L R C LFE Ls Rs",
      }),
      audioTrack({ Language: "fr", Format: "AC-3", Channels: 6, ChannelLayout: "L R C LFE Ls Rs" }),
    ],
  });
  const identification = identified(filename, { spanishTitle: "Dune Parte Dos", year: 2024 });

  it("compacto abrevia HDR, audio e idiomas", () => {
    expect(buildMediaName(identification, media, { presetId: "compact" }).filename).toBe(
      // El preset compacto es el único que usa códigos cortos en la pista principal.
      "Dune Parte Dos (2024) [4K UHD REMUX · DV] [ESP Atmos 7.1 · ENG+FRA].mkv",
    );
  });

  it("media server incluye el identificador entre llaves", () => {
    const name = buildMediaName(identification, media, {
      presetId: "media-server",
      includeProviderId: true,
    }).filename;
    expect(name).toContain("{tmdb-693134}");
  });

  it("técnico añade resolución exacta y fps", () => {
    const name = buildMediaName(identification, media, { presetId: "technical" }).filename;
    expect(name).toContain("3840×1608");
    expect(name).toContain("23.976 fps");
  });

  it("una plantilla personalizada respeta los tokens", () => {
    const name = buildMediaName(identification, media, {
      movieTemplate: "{title} [{year}] [{quality}]",
    }).filename;
    expect(name).toBe("Dune Parte Dos [2024] [4K UHD].mkv");
  });
});

describe("nombres que vienen con corchetes y datos incompletos", () => {
  const media = (filename: string) =>
    mediaFor(filename, {
      video: [videoTrack({ Height: 2160, HDR_Format: "Dolby Vision" })],
      audio: [
        audioTrack({
          Language: "spa",
          Format: "E-AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
      ],
    });

  const fromFilename = (filename: string) =>
    identificationFromHints(extractIdentificationHints(filename));

  it("un capítulo español produce el episodio y no deja restos de plantilla", () => {
    const filename = "La Casa Del Dragon [4k 2160p][Cap.202](wolfmax4k.com).mkv";
    const name = buildMediaName(fromFilename(filename), media(filename)).filename;

    expect(name).toBe(
      "La Casa Del Dragon - S02E02 [4K UHD · HEVC 10-bit · Dolby Vision] [Español Dolby Digital Plus 5.1].mkv",
    );
    expect(name).not.toContain("()");
    expect(name).not.toContain("- -");
    expect(name).not.toContain("[4k 2160p]");
  });

  it("sin año ni episodio tampoco quedan separadores sueltos", () => {
    const filename = "Serie [Cap.12].mkv";
    const name = buildMediaName(fromFilename(filename), media(filename)).filename;

    expect(name).toBe(
      "Serie [4K UHD · HEVC 10-bit · Dolby Vision] [Español Dolby Digital Plus 5.1].mkv",
    );
  });

  it("la fuente indicada a mano aparece junto a la calidad", () => {
    const filename = "La Casa Del Dragon [Cap.202].mkv";
    const base = media(filename);
    const forced = {
      ...base,
      source: {
        media: userConfirmed("BluRay" as const, "a mano"),
        type: userConfirmed("REMUX" as const, "a mano"),
      },
    };

    expect(buildMediaName(fromFilename(filename), forced).filename).toContain("[4K UHD REMUX ·");
  });
});

describe("el idioma principal se escribe como en las publicaciones en español", () => {
  const withAudio = (filename: string, language: string, extraEnglish = false) =>
    mediaFor(filename, {
      video: [videoTrack({ Format: "AVC", Width: 1920, Height: 1080, BitDepth: 8 })],
      audio: [
        audioTrack({
          Language: language,
          Format: "E-AC-3",
          Channels: 6,
          ChannelLayout: "L R C LFE Ls Rs",
        }),
        ...(extraEnglish
          ? [
              audioTrack({
                Language: "en",
                Format: "AC-3",
                Channels: 6,
                ChannelLayout: "L R C LFE Ls Rs",
              }),
            ]
          : []),
      ],
    });

  it.each([
    ["es-ES", "Castellano"],
    ["es-419", "Latino"],
    ["spa", "Español"],
  ])("%s ⇒ %s", (tag, expected) => {
    const filename = "Peli.2020.1080p.mkv";
    const identification = identified(filename, { spanishTitle: "Peli", year: 2020 });
    expect(buildMediaName(identification, withAudio(filename, tag)).filename).toContain(
      `[${expected} Dolby Digital Plus 5.1`,
    );
  });

  it("los demás idiomas siguen resumidos en códigos", () => {
    const filename = "Peli.2020.1080p.mkv";
    const identification = identified(filename, { spanishTitle: "Peli", year: 2020 });
    expect(buildMediaName(identification, withAudio(filename, "es-ES", true)).filename).toContain(
      "· Otros ENG]",
    );
  });
});
