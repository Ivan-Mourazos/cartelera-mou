import { describe, expect, it } from "vitest";

import { applyUserCorrection } from "../domain/identification/build";
import {
  createMediaItem,
  effectiveName,
  preserveUserEdits,
  withIdentification,
  withSource,
} from "./item-pipeline";
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
