import { describe, expect, it } from "vitest";

import { extractEmbeddedId } from "./embedded-ids";

describe("extractEmbeddedId", () => {
  it("reconoce el identificador de IMDb entre corchetes", () => {
    expect(extractEmbeddedId("Heat (1995) [imdb-tt0113277].mkv")).toEqual({
      provider: "imdb",
      imdbId: "tt0113277",
    });
  });

  it("reconoce el identificador de IMDb suelto", () => {
    expect(extractEmbeddedId("Heat.1995.tt0113277.1080p.mkv")).toEqual({
      provider: "imdb",
      imdbId: "tt0113277",
    });
  });

  it("reconoce el identificador de TMDb entre llaves", () => {
    expect(extractEmbeddedId("Dune (2021) {tmdb-438631}.mkv")).toEqual({
      provider: "tmdb",
      tmdbId: 438631,
    });
  });

  it("reconoce tmdbid-", () => {
    expect(extractEmbeddedId("Dune.2021.tmdbid-438631.mkv")).toEqual({
      provider: "tmdb",
      tmdbId: 438631,
    });
  });

  it("prefiere TMDb cuando aparecen los dos", () => {
    expect(extractEmbeddedId("Dune (2021) [imdb-tt1160419] {tmdb-438631}.mkv")).toEqual({
      provider: "tmdb",
      tmdbId: 438631,
    });
  });

  it("devuelve undefined cuando no hay ninguno", () => {
    expect(extractEmbeddedId("Dune.2021.2160p.mkv")).toBeUndefined();
  });

  it("no confunde texto corriente con un identificador", () => {
    expect(extractEmbeddedId("Serie.attt.1080p.mkv")).toBeUndefined();
    expect(extractEmbeddedId("Peli.tt12.mkv")).toBeUndefined();
  });
});
