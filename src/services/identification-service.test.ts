import { describe, expect, it } from "vitest";

import { extractIdentificationHints } from "../domain/identification/hints";
import { applyCandidate, identifyContent } from "./identification-service";
import type { MetadataProvider, ProviderCandidate } from "./providers/types";
import { nullMetadataProvider } from "./providers/types";

const providerWith = (
  candidates: readonly ProviderCandidate[],
  episodeTitle?: string,
): MetadataProvider => ({
  ...nullMetadataProvider,
  id: "tmdb",
  available: true,
  attribution: { name: "TMDb", notice: "", logoUrl: undefined, homepage: "" },
  search: () => Promise.resolve(candidates),
  searchMulti: () => Promise.resolve(candidates),
  getSeasonEpisodes: () =>
    Promise.resolve(
      episodeTitle === undefined
        ? new Map<number, string>()
        : new Map<number, string>([[3, episodeTitle]]),
    ),
  getEpisode: () =>
    Promise.resolve(
      episodeTitle === undefined ? undefined : { title: episodeTitle, airYear: 2023 },
    ),
});

const candidate = (
  id: number,
  spanishTitle: string,
  year: number | undefined,
  originalTitle = spanishTitle,
): ProviderCandidate => ({
  id,
  kind: "movie",
  spanishTitle,
  originalTitle,
  originalLanguage: "en",
  year,
  runtimeMinutes: undefined,
  posterUrl: undefined,
  overview: undefined,
});

describe("identificación", () => {
  it("aplica automáticamente una coincidencia inequívoca", async () => {
    const hints = extractIdentificationHints("Dune.Part.Two.2024.2160p.mkv");
    const outcome = await identifyContent(
      hints,
      providerWith([candidate(693134, "Dune Part Two", 2024)]),
    );

    expect(outcome.identification.spanishTitle.value).toBe("Dune Part Two");
    expect(outcome.identification.spanishTitle.confidence).toBe("CONFIRMED");
    expect(outcome.identification.spanishTitle.source).toBe("METADATA_PROVIDER");
    expect(outcome.identification.reference).toEqual({ provider: "tmdb", id: 693134 });
  });

  it("aplica también una coincidencia ambigua, pero marcada y con alternativas", async () => {
    const hints = extractIdentificationHints("Alien.1979.2160p.mkv");
    const outcome = await identifyContent(
      hints,
      providerWith([
        candidate(1, "Alien", 1979),
        candidate(2, "Alien", 1979),
        candidate(3, "Alien", 1979),
      ]),
    );

    // La política del producto es aplicar siempre el mejor candidato y dejar
    // visible que la coincidencia no es segura, en vez de no proponer nada.
    expect(outcome.identification.reference).toBeDefined();
    expect(outcome.identification.matchBand).not.toBe("high");
    expect(outcome.candidates.length).toBeGreaterThan(1);
    expect(outcome.candidates[0]?.components.length).toBeGreaterThan(0);
  });

  it("distingue remakes por el año", async () => {
    const hints = extractIdentificationHints("Dune.2021.2160p.mkv");
    const outcome = await identifyContent(
      hints,
      providerWith([candidate(1, "Dune", 1984), candidate(2, "Dune", 2021)]),
    );
    const best = outcome.candidates[0];
    expect(best?.id).toBe(2);
    expect(best?.score).toBeGreaterThan(outcome.candidates[1]?.score ?? 0);
  });

  it("la puntuación es explicable, no una probabilidad", async () => {
    const hints = extractIdentificationHints("Heat.1995.1080p.mkv");
    const outcome = await identifyContent(hints, providerWith([candidate(1, "Heat", 1995)]));
    const explanations =
      outcome.candidates[0]?.components.map((component) => component.explanation) ?? [];
    expect(explanations.join(" ")).toContain("Título exacto");
    expect(explanations.join(" ")).toContain("Año exacto");
  });

  it("un error del proveedor no rompe la identificación por nombre", async () => {
    const failing: MetadataProvider = {
      ...providerWith([]),
      search: () => Promise.reject(new Error("Sin red")),
    };
    const outcome = await identifyContent(
      extractIdentificationHints("Heat.1995.1080p.mkv"),
      failing,
    );

    expect(outcome.error?.message).toBe("Sin red");
    expect(outcome.identification.spanishTitle.value).toBe("Heat");
    expect(outcome.identification.spanishTitle.confidence).toBe("INFERRED");
  });

  it("sin proveedor la identificación se queda en el nombre", async () => {
    const outcome = await identifyContent(
      extractIdentificationHints("Heat.1995.1080p.mkv"),
      nullMetadataProvider,
    );
    expect(outcome.identification.spanishTitle.value).toBe("Heat");
    expect(outcome.identification.spanishTitle.source).toBe("ORIGINAL_FILENAME");
    expect(outcome.candidates).toEqual([]);
  });

  it("elegir manualmente un candidato lo marca como confirmado y trae el episodio", async () => {
    const hints = extractIdentificationHints("The.Last.of.Us.S01E03.2160p.mkv");
    const provider = providerWith(
      [candidate(100088, "The Last of Us", 2023)],
      "Mucho mucho tiempo",
    );
    const outcome = await identifyContent(hints, provider);

    const identification = await applyCandidate(
      outcome.identification,
      candidate(100088, "The Last of Us", 2023),
      provider,
      { score: 80, band: "medium", components: [], alternatives: [] },
    );

    expect(identification.episodeTitle.value).toBe("Mucho mucho tiempo");
    expect(identification.episodeTitle.confidence).toBe("CONFIRMED");
    expect(identification.season.value).toBe(1);
    expect(identification.episode.value).toBe(3);
  });
});
