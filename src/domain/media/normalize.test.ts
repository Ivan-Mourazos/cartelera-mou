import { describe, expect, it } from "vitest";

import { normalizeMediaInfo } from "./normalize";
import { audioTrack, rawMedia, videoTrack } from "./test-fixtures";

describe("normalización completa", () => {
  it("ningún dato técnico procede del nombre del fichero", () => {
    // El nombre promete 4K, Dolby Vision, Atmos y 7.1; el fichero dice otra cosa.
    const media = normalizeMediaInfo(
      rawMedia({
        video: [videoTrack({ Format: "AVC", Width: 1920, Height: 1080, BitDepth: 8 })],
        audio: [
          audioTrack({
            Format: "AC-3",
            Channels: 6,
            ChannelLayout: "L R C LFE Ls Rs",
            Language: "en",
          }),
        ],
      }),
      "Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.DV.HDR10.TrueHD.Atmos.7.1.mkv",
      1000,
    );

    const video = media.video[0];
    expect(video?.resolution.value?.quality).toBe("Full HD");
    expect(video?.codec.value).toBe("AVC");
    expect(video?.bitDepth.value).toBe(8);
    expect(video?.hdrFormats.value).toEqual([]);
    expect(media.audio[0]?.codec.value).toBe("Dolby Digital");
    expect(media.audio[0]?.atmos.value).toBe(false);
    expect(media.audio[0]?.channelLayout.value).toBe("5.1");
  });

  it("la fuente sí procede del nombre, marcada como inferida", () => {
    const media = normalizeMediaInfo(rawMedia(), "Dune.2024.2160p.UHD.BluRay.REMUX.mkv", 1000);
    expect(media.source.media.value).toBe("UHD Blu-ray");
    expect(media.source.media.confidence).toBe("INFERRED");
    expect(media.source.type.value).toBe("REMUX");
  });

  it("avisa de pistas sin idioma y de español sin región", () => {
    const media = normalizeMediaInfo(
      rawMedia({
        audio: [audioTrack(), audioTrack({ Language: "spa" })],
      }),
      "X.mkv",
      1000,
    );
    expect(media.warnings.some((warning) => warning.includes("sin etiqueta de idioma"))).toBe(true);
    expect(media.warnings.some((warning) => warning.includes("región determinable"))).toBe(true);
  });

  it("un fichero sin pistas de vídeo se reporta, no se inventa", () => {
    const media = normalizeMediaInfo(rawMedia({ video: [] }), "X.mkv", 1000);
    expect(media.video).toEqual([]);
    expect(media.warnings[0]).toContain("ninguna pista de vídeo");
  });

  it("conserva la extensión y el contenedor", () => {
    const media = normalizeMediaInfo(rawMedia(), "Película (2024).MKV", 5);
    expect(media.general.extension).toBe("mkv");
    expect(media.general.container.value).toBe("Matroska");
    expect(media.general.originalFilename).toBe("Película (2024).MKV");
  });
});

describe("variante del español deducida del nombre", () => {
  const spanishTrack = { "@type": "Audio", Format: "AC-3", Channels: 6, Language: "spa" } as const;

  it("«Castellano» en el nombre resuelve el `spa` genérico como ESP", () => {
    const media = normalizeMediaInfo(
      rawMedia({ audio: [spanishTrack] }),
      "American.Pie.El.Reencuentro.[BluRay 1080px][AC3 5.1-DTS Castellano-Ingles][2012].mkv",
      1000,
    );
    const language = media.audio[0]?.language;
    expect(language?.value?.label).toBe("ESP");
    // Es una pista del nombre, no del contenedor: queda como inferida.
    expect(language?.confidence).toBe("INFERRED");
    expect(language?.source).toBe("ORIGINAL_FILENAME");
  });

  it("«Latino» resuelve como LAT", () => {
    const media = normalizeMediaInfo(
      rawMedia({ audio: [spanishTrack] }),
      "Pelicula.2012.1080p.Latino.mkv",
      1000,
    );
    expect(media.audio[0]?.language.value?.label).toBe("LAT");
  });

  it("si el nombre menciona las dos variantes no se decide ninguna", () => {
    const media = normalizeMediaInfo(
      rawMedia({ audio: [spanishTrack] }),
      "Pelicula.2012.Castellano.Latino.mkv",
      1000,
    );
    expect(media.audio[0]?.language.value?.regionAmbiguous).toBe(true);
    expect(media.audio[0]?.language.value?.label).toBe("SPA");
  });

  it("no reetiqueta una pista que ya declara su región", () => {
    const media = normalizeMediaInfo(
      rawMedia({ audio: [{ ...spanishTrack, Language: "es-419" }] }),
      "Pelicula.2012.Castellano.mkv",
      1000,
    );
    expect(media.audio[0]?.language.value?.label).toBe("LAT");
    expect(media.audio[0]?.language.confidence).toBe("CONFIRMED");
  });

  it("no toca los idiomas que no son español", () => {
    const media = normalizeMediaInfo(
      rawMedia({ audio: [{ ...spanishTrack, Language: "eng" }] }),
      "Pelicula.2012.Castellano.mkv",
      1000,
    );
    expect(media.audio[0]?.language.value?.label).toBe("ENG");
  });
});
