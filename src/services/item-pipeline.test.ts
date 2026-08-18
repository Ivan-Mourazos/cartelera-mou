import { describe, expect, it } from "vitest";

import { applyUserCorrection } from "../domain/identification/build";
import { normalizeMediaInfo } from "../domain/media/normalize";
import {
  createMediaItem,
  effectiveName,
  hasAmbiguousSpanish,
  identifyMediaItem,
  preserveUserEdits,
  withIdentification,
  withSource,
  withSpanishVariant,
  type MediaItem,
} from "./item-pipeline";
import { nullMetadataProvider, type MetadataProvider } from "./providers/types";
import { DEFAULT_SETTINGS } from "./settings";

const file = (name: string) => ({ name, size: 1, handle: undefined, file: undefined });

describe("ediciones manuales", () => {
  it("el título y el año escritos a mano entran en el nombre propuesto", () => {
    let item = createMediaItem(file("Spider-Man3BDR1080.www.newpct1.com.mkv"), DEFAULT_SETTINGS);
    expect(effectiveName(item)).not.toContain("2007");

    item = withIdentification(
      item,
      applyUserCorrection(item.identification, "spanishTitle", "Spider-Man 3"),
      DEFAULT_SETTINGS,
    );
    item = withIdentification(
      item,
      applyUserCorrection(item.identification, "year", 2007),
      DEFAULT_SETTINGS,
    );

    expect(effectiveName(item)).toBe("Spider-Man 3 (2007).mkv");
  });

  it("la fuente elegida a mano queda confirmada", () => {
    const item = withSource(
      createMediaItem(file("peli.mkv"), DEFAULT_SETTINGS),
      { media: "BluRay", type: "REMUX" },
      DEFAULT_SETTINGS,
    );
    expect(item.media.source.type.value).toBe("REMUX");
    expect(item.media.source.type.confidence).toBe("USER_CONFIRMED");
  });
});

describe("una respuesta tardía no borra lo escrito a mano", () => {
  it("conserva título, año, fuente y nombre manual al llegar el análisis", () => {
    const original = createMediaItem(file("Spider-Man3BDR1080.mkv"), DEFAULT_SETTINGS);

    // La persona usuaria corrige mientras el análisis sigue en curso.
    let edited = withIdentification(
      original,
      applyUserCorrection(original.identification, "spanishTitle", "Spider-Man 3"),
      DEFAULT_SETTINGS,
    );
    edited = withIdentification(
      edited,
      applyUserCorrection(edited.identification, "year", 2007),
      DEFAULT_SETTINGS,
    );
    edited = withSource(edited, { media: "BluRay", type: "REMUX" }, DEFAULT_SETTINGS);
    edited = { ...edited, nameOverride: "Mi nombre.mkv" };

    // Llega el resultado del análisis, calculado sobre la versión anterior.
    const late = { ...original, status: "ready" as const, analysisPending: false };
    const merged = preserveUserEdits(edited, late, DEFAULT_SETTINGS);

    expect(merged.identification.spanishTitle.value).toBe("Spider-Man 3");
    expect(merged.identification.year.value).toBe(2007);
    expect(merged.media.source.type.value).toBe("REMUX");
    expect(merged.nameOverride).toBe("Mi nombre.mkv");
    expect(merged.status).toBe("ready");
  });

  it("sí acepta los datos nuevos donde no hubo corrección manual", () => {
    const original = createMediaItem(file("peli.2001.mkv"), DEFAULT_SETTINGS);
    const edited = withIdentification(
      original,
      applyUserCorrection(original.identification, "spanishTitle", "Mi título"),
      DEFAULT_SETTINGS,
    );

    const late = withIdentification(
      original,
      applyUserCorrection(original.identification, "episodeTitle", "Episodio del proveedor"),
      DEFAULT_SETTINGS,
    );

    const merged = preserveUserEdits(edited, late, DEFAULT_SETTINGS);
    expect(merged.identification.spanishTitle.value).toBe("Mi título");
    expect(merged.identification.episodeTitle.value).toBe("Episodio del proveedor");
  });
});

describe("señales del archivo en la identificación", () => {
  const providerSpy = () => {
    const queries: { title: string; year?: number | undefined }[] = [];
    const provider: MetadataProvider = {
      ...nullMetadataProvider,
      id: "tmdb",
      available: true,
      search: (query) => {
        queries.push({ title: query.title, year: query.year });
        return Promise.resolve([]);
      },
      searchMulti: (title) => {
        queries.push({ title });
        return Promise.resolve([]);
      },
    };
    return { provider, queries };
  };

  const withGeneral = (item: MediaItem, general: Partial<MediaItem["media"]["general"]>) => ({
    ...item,
    media: { ...item.media, general: { ...item.media.general, ...general } },
  });

  it("usa el título del contenedor cuando el nombre del archivo es inservible", async () => {
    const { provider, queries } = providerSpy();
    const item = withGeneral(createMediaItem(file("01.mkv"), DEFAULT_SETTINGS), {
      titleMetadata: {
        value: "Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX",
        confidence: "CONFIRMED",
        source: "CONTAINER_METADATA",
      },
    });

    await identifyMediaItem(item, provider, DEFAULT_SETTINGS);

    expect(queries.some((query) => query.title.toLowerCase().includes("dune"))).toBe(true);
  });

  it("registra las consultas lanzadas para poder explicarlas", async () => {
    const { provider } = providerSpy();
    const item = createMediaItem(file("Heat.1995.1080p.BluRay.mkv"), DEFAULT_SETTINGS);

    const identified = await identifyMediaItem(item, provider, DEFAULT_SETTINGS);

    expect(identified.attempts).toContain("title-year");
    expect(identified.attempts).toContain("multi");
  });

  it("reintenta con el año adyacente: el del nombre suele ser el del lanzamiento", async () => {
    const { provider, queries } = providerSpy();
    const item = createMediaItem(file("Heat.1996.1080p.BluRay.mkv"), DEFAULT_SETTINGS);

    await identifyMediaItem(item, provider, DEFAULT_SETTINGS);

    expect(queries.map((query) => query.year)).toContain(1995);
  });
});

describe("variante del español a mano", () => {
  const spanishFile = (): MediaItem => {
    const item = createMediaItem(file("Peli.2020.1080p.mkv"), DEFAULT_SETTINGS);
    return {
      ...item,
      media: normalizeMediaInfo(
        {
          general: { "@type": "General", Format: "Matroska" },
          video: [{ "@type": "Video", Format: "AVC", Width: 1920, Height: 1080, BitDepth: 8 }],
          audio: [
            {
              "@type": "Audio",
              Format: "AC-3",
              Language: "spa",
              Channels: 6,
              ChannelLayout: "L R C LFE Ls Rs",
            },
          ],
          text: [],
        },
        "Peli.2020.1080p.mkv",
        1_000_000_000,
      ),
    };
  };

  it("detecta el español de región desconocida", () => {
    expect(hasAmbiguousSpanish(spanishFile())).toBe(true);
  });

  it("marcarlo como castellano lo escribe en el nombre y queda confirmado", () => {
    const marked = withSpanishVariant(spanishFile(), "castilian", DEFAULT_SETTINGS);

    expect(effectiveName(marked)).toContain("Castellano");
    expect(marked.media.audio[0]?.language.confidence).toBe("USER_CONFIRMED");
    expect(hasAmbiguousSpanish(marked)).toBe(false);
  });

  it("marcarlo como latino también", () => {
    const marked = withSpanishVariant(spanishFile(), "latin", DEFAULT_SETTINGS);
    expect(effectiveName(marked)).toContain("Latino");
  });

  it("no toca las pistas cuya región ya consta", () => {
    const item = createMediaItem(file("Peli.mkv"), DEFAULT_SETTINGS);
    expect(withSpanishVariant(item, "castilian", DEFAULT_SETTINGS).media.audio).toEqual(
      item.media.audio,
    );
  });
});
