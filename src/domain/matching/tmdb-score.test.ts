import { describe, expect, it } from "vitest";
import { rankTmdbCandidates, scoreMovieCandidate } from "./tmdb-score";

describe("TMDb auditable matching", () => {
  it("explains an exact, compatible match and can auto-select it", () => {
    const result = scoreMovieCandidate(
      { title: "Dune: Part Two", year: 2024, runtimeMinutes: 166 },
      { id: 693134, title: "Dune: Part Two", releaseYear: 2024, runtimeMinutes: 166 },
    );

    expect(result.band).toBe("high");
    expect(result.score).toBe(110);
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
    const result = scoreMovieCandidate(
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
