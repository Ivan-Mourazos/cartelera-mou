import { describe, expect, it } from "vitest";
import { rankTmdbCandidates, scoreMovieCandidate } from "./tmdb-score";

describe("TMDb auditable matching", () => {
  it("explains an exact, compatible match and can auto-select it", () => {
    const result = scoreMovieCandidate(
      { title: "Dune: Part Two", year: 2024, runtimeMinutes: 166 },
      { id: 693134, title: "Dune: Part Two", releaseYear: 2024, runtimeMinutes: 166 },
    );

    expect(result.band).toBe("high");
    expect(result.score).toBe(90);
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
