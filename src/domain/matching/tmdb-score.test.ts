import { describe, expect, it } from "vitest";
import { rankTmdbCandidates, scoreTmdbCandidate } from "./tmdb-score";

describe("TMDb auditable matching", () => {
  it("explains an exact, compatible match and can auto-select it", () => {
    const result = scoreTmdbCandidate(
      { title: "Dune: Part Two", year: 2024, runtimeMinutes: 166 },
      { id: 693134, title: "Dune: Part Two", releaseYear: 2024, runtimeMinutes: 166 },
    );

    expect(result.band).toBe("high");
    expect(result.score).toBe(115);
    expect(result.components.map((component) => component.code)).toEqual([
      "title-exact",
      "year-exact",
      "runtime-compatible",
    ]);
  });

  it("requires review when similarly scored results are ambiguous", () => {
    const ranked = rankTmdbCandidates({ title: "The Killer", year: 2023 }, [
      { id: 1, title: "The Killer", releaseYear: 2023 },
      { id: 2, title: "The Killer", releaseYear: 2023 },
    ]);

    expect(ranked.autoSelectedId).toBeUndefined();
    expect(ranked.candidates[0]?.band).toBe("medium");
    expect(ranked.candidates[0]?.components.at(-1)?.code).toBe("ambiguous-results");
  });

  it("records year penalties and prior user corrections as separate components", () => {
    const result = scoreTmdbCandidate(
      { title: "Alien", year: 1979, previouslySelectedTmdbId: 99 },
      { id: 99, title: "Alien", releaseYear: 1992 },
    );

    expect(result.components.map((component) => component.code)).toContain("year-different");
    expect(result.components.map((component) => component.code)).toContain("previous-correction");
    expect(result.components.find((component) => component.code === "year-different")?.points).toBe(
      -30,
    );
  });

  it("uses configurable score thresholds without calling the result a probability", () => {
    const ranked = rankTmdbCandidates(
      { title: "Dune", year: 2021 },
      [{ id: 1, title: "Dune", releaseYear: 2021 }],
      { thresholds: { high: 90 } },
    );

    expect(ranked.candidates[0]?.band).toBe("medium");
    expect(ranked.autoSelectedId).toBeUndefined();
  });
});

describe("señales duras de desempate", () => {
  it("la duración separa dos obras con el mismo título y año", () => {
    const ranked = rankTmdbCandidates({ title: "Dune", year: 2021, runtimeMinutes: 155 }, [
      { id: 1, title: "Dune", releaseYear: 2021, runtimeMinutes: 155 },
      { id: 2, title: "Dune", releaseYear: 2021, runtimeMinutes: 60 },
    ]);
    expect(ranked.candidates[0]?.candidate.id).toBe(1);
    expect(ranked.candidates[0]?.score).toBeGreaterThan(ranked.candidates[1]?.score ?? 0);
  });

  it("penaliza con fuerza una duración muy distinta", () => {
    const ranked = rankTmdbCandidates({ title: "Heat", runtimeMinutes: 170 }, [
      { id: 1, title: "Heat", runtimeMinutes: 45 },
    ]);
    expect(ranked.candidates[0]?.components.some((component) => component.points <= -40)).toBe(
      true,
    );
  });

  it("suma cuando el idioma original de la obra está entre las pistas", () => {
    const withLanguage = rankTmdbCandidates({ title: "Heat", audioLanguages: ["es", "en"] }, [
      { id: 1, title: "Heat", originalLanguage: "en" },
    ]);
    const withoutLanguage = rankTmdbCandidates({ title: "Heat" }, [
      { id: 1, title: "Heat", originalLanguage: "en" },
    ]);
    expect(withLanguage.candidates[0]?.score).toBeGreaterThan(
      withoutLanguage.candidates[0]?.score ?? 0,
    );
  });

  it("una duración ausente no penaliza", () => {
    const ranked = rankTmdbCandidates({ title: "Heat", runtimeMinutes: 170 }, [
      { id: 1, title: "Heat" },
    ]);
    expect(
      ranked.candidates[0]?.components.every((component) => component.code !== "runtime-different"),
    ).toBe(true);
  });
});

describe("popularidad como desempate", () => {
  it("una obra conocida gana a una homónima oscura con títulos igual de parecidos", () => {
    // Caso real: «Venom 2» puntuaba más alto contra «Mordida Mortal» (1989) que
    // contra la secuela que buscaba de verdad.
    const ranked = rankTmdbCandidates({ title: "Venom 2" }, [
      { id: 1, title: "Mordida Mortal", releaseYear: 1989, popularity: 0.6 },
      { id: 2, title: "Venom: Habrá matanza", releaseYear: 2021, popularity: 180 },
    ]);
    expect(ranked.candidates[0]?.candidate.id).toBe(2);
  });

  it("no puede con un título exacto: 12 puntos como techo", () => {
    const ranked = rankTmdbCandidates({ title: "Dune" }, [
      { id: 1, title: "Dune", popularity: 1 },
      { id: 2, title: "Otra película distinta", popularity: 900 },
    ]);
    expect(ranked.candidates[0]?.candidate.id).toBe(1);
  });

  it("sin popularidad no penaliza", () => {
    const ranked = rankTmdbCandidates({ title: "Dune" }, [{ id: 1, title: "Dune" }]);
    expect(
      ranked.candidates[0]?.components.every((component) => component.code !== "popularity"),
    ).toBe(true);
  });
});

describe("entregas de una misma saga", () => {
  // Caso real: «Capitan America 4Kremux2160», sin año en el nombre. El archivo
  // dura 124 min, que es «El primer vengador»; «Brave New World» dura 118 y es
  // mucho más popular por ser un estreno reciente.
  const query = { title: "Capitan America", runtimeMinutes: 124 } as const;
  const primerVengador = {
    id: 1771,
    title: "Capitán América: El primer vengador",
    releaseYear: 2011,
    runtimeMinutes: 124,
    popularity: 40,
    providerOrder: 1,
  } as const;
  const braveNewWorld = {
    id: 822119,
    title: "Capitán América: Brave New World",
    releaseYear: 2025,
    runtimeMinutes: 118,
    popularity: 250,
    providerOrder: 0,
  } as const;

  it("la duración exacta gana a la aproximada aunque la otra sea más popular", () => {
    const ranked = rankTmdbCandidates(query, [braveNewWorld, primerVengador]);
    expect(ranked.candidates[0]?.candidate.id).toBe(1771);
  });

  it("clavar la duración puntúa más que quedarse cerca", () => {
    const exact = scoreTmdbCandidate(query, primerVengador);
    const close = scoreTmdbCandidate(query, braveNewWorld);
    const pointsFor = (result: typeof exact, code: string): number =>
      result.components.find((component) => component.code === code)?.points ?? 0;

    expect(pointsFor(exact, "runtime-compatible")).toBeGreaterThan(
      pointsFor(close, "runtime-close") + pointsFor(close, "runtime-compatible"),
    );
  });

  it("descarta la de 1990 por duración imposible", () => {
    const ranked = rankTmdbCandidates(query, [
      { id: 13995, title: "Capitán América", releaseYear: 1990, runtimeMinutes: 97 },
      primerVengador,
    ]);
    expect(ranked.candidates[0]?.candidate.id).toBe(1771);
  });
});
