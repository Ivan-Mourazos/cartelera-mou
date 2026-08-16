import { describe, expect, it } from "vitest";

import { isCastilian, languageNameLabel, normalizeLanguage } from "./language";

describe("normalización de idiomas", () => {
  it.each([
    ["eng", "ENG"],
    ["en", "ENG"],
    ["en-US", "ENG"],
    ["en-GB", "ENG"],
    ["fra", "FRA"],
    ["fre", "FRA"],
    ["fr", "FRA"],
    ["deu", "DEU"],
    ["ger", "DEU"],
    ["de", "DEU"],
    ["ita", "ITA"],
    ["it", "ITA"],
    ["jpn", "JPN"],
    ["ja", "JPN"],
  ])("%s ⇒ %s", (tag, expected) => {
    expect(normalizeLanguage(tag)?.label).toBe(expected);
  });

  it("und y ausencia de etiqueta no producen idioma", () => {
    expect(normalizeLanguage("und")).toBeUndefined();
    expect(normalizeLanguage(undefined)).toBeUndefined();
  });
});

describe("castellano frente a español latino", () => {
  it("«spa» genérico NO es castellano", () => {
    const language = normalizeLanguage("spa");
    expect(language?.base).toBe("es");
    expect(language?.regionAmbiguous).toBe(true);
    expect(language?.label).toBe("SPA");
    expect(isCastilian(language)).toBe(false);
    expect(language?.display).toContain("región desconocida");
  });

  it("«es» genérico tampoco", () => {
    expect(normalizeLanguage("es")?.regionAmbiguous).toBe(true);
  });

  it("es-ES es castellano", () => {
    const language = normalizeLanguage("es-ES");
    expect(language?.label).toBe("ESP");
    expect(language?.regionAmbiguous).toBe(false);
    expect(isCastilian(language)).toBe(true);
  });

  it("es-419 es latino", () => {
    expect(normalizeLanguage("es-419")?.label).toBe("LAT");
  });

  it("es-MX es latino", () => {
    expect(normalizeLanguage("es-MX")?.label).toBe("LAT");
  });

  it.each([
    ["Castellano", "ESP"],
    ["Español Latino", "LAT"],
    ["Español de España", "ESP"],
  ])("el título de pista «%s» aporta evidencia ⇒ %s", (title, expected) => {
    expect(normalizeLanguage("spa", title)?.label).toBe(expected);
  });

  it.each(["Español", "Spanish"])("el título de pista «%s» NO decide la región", (title) => {
    const language = normalizeLanguage("spa", title);
    expect(language?.regionAmbiguous).toBe(true);
    expect(language === undefined ? undefined : languageNameLabel(language)).toBe("SPA");
  });

  it("el título de pista sirve aunque no haya etiqueta de idioma", () => {
    expect(normalizeLanguage(undefined, "Castellano")?.label).toBe("ESP");
    expect(normalizeLanguage("und", "Español Latino")?.label).toBe("LAT");
  });

  it("«Director Commentary» no es un idioma", () => {
    expect(normalizeLanguage(undefined, "Director Commentary")).toBeUndefined();
  });
});
