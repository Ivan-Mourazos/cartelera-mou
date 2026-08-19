import { describe, expect, it } from "vitest";

import { parseCompositeReleaseToken, websiteSpans } from "./composite-tokens";
import { extractIdentificationHints } from "../identification/hints";

describe("parseCompositeReleaseToken", () => {
  it("descompone las etiquetas pegadas de las webs españolas", () => {
    expect(parseCompositeReleaseToken("4Kremux2160")).toMatchObject({
      resolution: "2160p",
      remux: true,
    });
    expect(parseCompositeReleaseToken("BDR1080")).toMatchObject({
      resolution: "1080p",
      source: "BDRip",
    });
    expect(parseCompositeReleaseToken("HD4K")).toMatchObject({ resolution: "4K" });
    expect(parseCompositeReleaseToken("4K2160")).toMatchObject({ resolution: "2160p" });
    expect(parseCompositeReleaseToken("MicroHD1080")).toMatchObject({
      resolution: "1080p",
      source: "microHD",
    });
  });

  it("la resolución en píxeles gana a la clase comercial", () => {
    expect(parseCompositeReleaseToken("UHD2160")?.resolution).toBe("2160p");
  });

  it("no toca las palabras que no son etiquetas", () => {
    for (const word of ["Eternals", "Capitan", "America", "Ragnarok", "Venom", "Interstellar"]) {
      expect(parseCompositeReleaseToken(word)).toBeUndefined();
    }
  });

  it("exige que TODO el token sea etiqueta: si sobra algo, no vale", () => {
    expect(parseCompositeReleaseToken("4Kilos")).toBeUndefined();
    expect(parseCompositeReleaseToken("HDalgo")).toBeUndefined();
  });

  it("una sola pieza no cuenta: de eso ya se encargan las reglas normales", () => {
    expect(parseCompositeReleaseToken("2160p")).toBeUndefined();
    expect(parseCompositeReleaseToken("remux")).toBeUndefined();
  });
});

describe("websiteSpans", () => {
  it("localiza los dominios dentro del nombre", () => {
    expect(websiteSpans("Peli 4K.www.pctnew.com")).toHaveLength(1);
    expect(websiteSpans("Shang-Chi BDR1080.atomixhq.one")).toHaveLength(1);
    expect(websiteSpans("Venom 2.atomixhq.net")).toHaveLength(1);
  });

  it("no confunde un nombre con puntos con un dominio", () => {
    expect(websiteSpans("Dune.Part.Two.2024.2160p")).toHaveLength(0);
  });
});

describe("títulos de archivos reales", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["Capitan America 4Kremux2160.www.pctnew.com.mkv", "Capitan America"],
    ["Eternals HD4K.mkv", "Eternals"],
    ["Shang-Chi BDR1080.atomixhq.one.mkv", "Shang Chi"],
    ["Venom 2 4Kremux2160.atomixhq.net.mkv", "Venom 2"],
    ["Thor Ragnarok 4K2160.mkv", "Thor Ragnarok"],
    ["The Batman 2022 MicroHD1080.mkv", "The Batman"],
    ["Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.HEVC-GRP.mkv", "Dune Part Two"],
  ];

  for (const [filename, expected] of cases) {
    it(`«${filename}» ⇒ «${expected}»`, () => {
      expect(extractIdentificationHints(filename).titleGuess).toBe(expected);
    });
  }
});
