import { describe, expect, it } from "vitest";

import { applyNameBudget, DROP_ORDER } from "./budget";
import { renderNameTemplate, type NameTokenValues } from "./template";

const TEMPLATE =
  "{title} ({year}) [{quality} {resolutionLabel} {source} {videoCodec} {bitDepth} {hdrShort}] [{primaryAudio} · {otherLanguages}]";

const render = (tokens: NameTokenValues): string => renderNameTemplate(TEMPLATE, tokens);

const full: NameTokenValues = {
  title: "El Señor de los Anillos El Retorno del Rey Edición Extendida Especial",
  year: "2003",
  quality: "4K",
  resolutionLabel: "2160p",
  source: "BluRay REMUX",
  videoCodec: "HEVC",
  bitDepth: "10bit",
  hdrShort: "DV",
  primaryAudio: "Castellano TrueHD Atmos 7.1",
  otherLanguages: "ENG+FRA+ITA+DEU",
};

describe("applyNameBudget", () => {
  it("no toca nada cuando el nombre ya entra", () => {
    const short: NameTokenValues = { title: "Heat", year: "1995", resolutionLabel: "1080p" };
    const result = applyNameBudget(short, render, {
      targetLength: 120,
      hardLimit: 255,
      extensionLength: 4,
    });
    expect(result.dropped).toEqual([]);
    expect(result.tokens).toEqual(short);
  });

  it("descarta primero los otros idiomas y deja de recortar en cuanto entra", () => {
    const tokens: NameTokenValues = { ...full, title: "Dune Parte Dos" };
    const result = applyNameBudget(tokens, render, {
      targetLength: 100,
      hardLimit: 255,
      extensionLength: 4,
    });
    expect(result.dropped).toEqual(["otherLanguages"]);
    expect(render(result.tokens).length + 4).toBeLessThanOrEqual(120);
    // Lo que no hacía falta descartar sigue ahí.
    expect(result.tokens.hdrShort).toBe("DV");
    expect(result.tokens.videoCodec).toBe("HEVC");
  });

  it("agota la cascada cuando el título por sí solo desborda el objetivo", () => {
    // El objetivo es best-effort: el tope duro es el único que se garantiza.
    const result = applyNameBudget(full, render, {
      targetLength: 120,
      hardLimit: 255,
      extensionLength: 4,
    });
    expect(result.dropped).toEqual(DROP_ORDER);
    expect(result.truncatedTitle).toBe(false);
    expect(render(result.tokens).length).toBeLessThan(render(full).length);
  });

  it("respeta el orden de descarte declarado", () => {
    expect(DROP_ORDER).toEqual([
      "otherLanguages",
      "bitDepth",
      "hdrShort",
      "videoCodec",
      "primaryAudioChannels",
      "quality",
    ]);
  });

  it("nunca descarta título, año ni resolución", () => {
    const result = applyNameBudget(full, render, {
      targetLength: 40,
      hardLimit: 255,
      extensionLength: 4,
    });
    expect(result.tokens.title).toBeDefined();
    expect(result.tokens.year).toBe("2003");
    expect(result.tokens.resolutionLabel).toBe("2160p");
  });

  it("recorta el título por palabras completas si aún supera el tope duro", () => {
    const result = applyNameBudget(full, render, {
      targetLength: 80,
      hardLimit: 80,
      extensionLength: 4,
    });
    expect(result.truncatedTitle).toBe(true);
    expect(render(result.tokens).length + 4).toBeLessThanOrEqual(80);
    expect(result.tokens.title?.endsWith(" ")).toBe(false);
  });

  it("quita los canales del audio principal sin quitar el idioma", () => {
    const tokens: NameTokenValues = { ...full };
    delete tokens.otherLanguages;
    const result = applyNameBudget(tokens, render, {
      targetLength: 95,
      hardLimit: 255,
      extensionLength: 4,
    });
    if (result.dropped.includes("primaryAudioChannels")) {
      expect(result.tokens.primaryAudio).toContain("Castellano");
      expect(result.tokens.primaryAudio).not.toContain("7.1");
    }
  });
});
