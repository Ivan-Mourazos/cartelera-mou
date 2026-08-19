import { describe, expect, it, vi } from "vitest";

import { extractIdentificationHints } from "../../domain/identification/hints";
import {
  nullMetadataProvider,
  type MetadataProvider,
  type ProviderCandidate,
} from "../providers/types";
import { normalizeTitleForSearch, resolveWork } from "./resolver";

const candidate = (partial: Partial<ProviderCandidate> = {}): ProviderCandidate => ({
  id: 1,
  kind: "movie",
  spanishTitle: "Dune",
  originalTitle: "Dune",
  originalLanguage: "en",
  year: 2021,
  runtimeMinutes: 155,
  popularity: undefined,
  posterUrl: undefined,
  overview: undefined,
  ...partial,
});

const providerWith = (overrides: Partial<MetadataProvider>): MetadataProvider => ({
  ...nullMetadataProvider,
  id: "tmdb",
  available: true,
  ...overrides,
});

describe("resolveWork", () => {
  it("resuelve por identificador incrustado sin llegar a buscar", async () => {
    const search = vi.fn(() => Promise.resolve([]));
    const findByExternalId = vi.fn(() => Promise.resolve(candidate({ id: 438631 })));
    const provider = providerWith({ search, findByExternalId });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Dune (2021) {tmdb-438631}.mkv") },
      provider,
    );

    expect(outcome.candidate?.id).toBe(438631);
    expect(outcome.band).toBe("high");
    expect(search).not.toHaveBeenCalled();
    expect(outcome.attempts).toEqual(["embedded-id"]);
  });

  it("reintenta con el año adyacente y sin año cuando la búsqueda exacta falla", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([candidate()]);
    const provider = providerWith({ search });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Dune.2020.2160p.mkv"), runtimeMinutes: 155 },
      provider,
    );

    expect(outcome.candidate?.id).toBe(1);
    expect(outcome.attempts).toContain("title-year");
    expect(outcome.attempts).toContain("title-year-nearby");
    expect(outcome.attempts).toContain("title-only");
  });

  it("cae en la búsqueda multi y adopta el tipo que devuelve", async () => {
    const search = vi.fn(() => Promise.resolve([]));
    const searchMulti = vi.fn(() =>
      Promise.resolve([candidate({ id: 7, kind: "series", spanishTitle: "Fargo" })]),
    );
    const provider = providerWith({ search, searchMulti });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Fargo.1080p.mkv") },
      provider,
    );

    expect(outcome.kind).toBe("series");
    expect(outcome.candidate?.id).toBe(7);
    expect(outcome.attempts).toContain("multi");
  });

  it("usa el título de la carpeta como último recurso", async () => {
    const provider = providerWith({
      search: vi.fn(() => Promise.resolve([])),
      searchMulti: vi.fn(() => Promise.resolve([])),
    });

    const outcome = await resolveWork(
      {
        hints: extractIdentificationHints("01.mkv"),
        parentFolderName: "The Last of Us (2023)",
      },
      provider,
    );

    expect(outcome.attempts).toContain("parent-folder");
  });

  it("devuelve las alternativas cuando la banda no es alta", async () => {
    const search = vi.fn(() =>
      Promise.resolve([
        candidate({ id: 1, spanishTitle: "Dune" }),
        candidate({ id: 2, spanishTitle: "Dune" }),
      ]),
    );
    const provider = providerWith({ search });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Dune.2021.mkv") },
      provider,
    );

    expect(outcome.alternatives.length).toBeGreaterThan(1);
    expect(outcome.band).not.toBe("high");
  });

  it("sin proveedor disponible no consulta nada y no falla", async () => {
    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Dune.2021.mkv") },
      nullMetadataProvider,
    );
    expect(outcome.candidate).toBeUndefined();
    expect(outcome.error).toBeUndefined();
    expect(outcome.attempts).toEqual([]);
  });

  it("propaga el error del proveedor sin perder los intentos hechos", async () => {
    const provider = providerWith({
      search: vi.fn(() => Promise.reject(new Error("TMDb no respondió a tiempo."))),
    });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Dune.2021.mkv") },
      provider,
    );

    expect(outcome.error?.message).toBe("TMDb no respondió a tiempo.");
    expect(outcome.attempts.length).toBeGreaterThan(0);
  });
});

describe("normalizeTitleForSearch", () => {
  it("quita dominios, acentos y ruido de las webs de descarga", () => {
    expect(normalizeTitleForSearch("El Señor de los Anillos wolfmax4k.com")).toBe(
      "Senor de los Anillos",
    );
  });

  it("quita el artículo inicial", () => {
    expect(normalizeTitleForSearch("The Batman")).toBe("Batman");
  });

  it("deja intacto un título que ya está limpio", () => {
    expect(normalizeTitleForSearch("Dune Parte Dos")).toBe("Dune Parte Dos");
  });
});

describe("resolveWork — duración de la ficha completa", () => {
  it("pide la ficha de los candidatos y descarta el remake por duración", async () => {
    // La búsqueda de TMDb NO devuelve `runtime`: sin pedir la ficha, un archivo
    // de 4K REMUX de 2 h se emparejaba con la película homónima de 1990.
    // Tal y como los devuelve `/search/movie`: sin duración.
    const antiguo = candidate({
      id: 1,
      spanishTitle: "Capitán América",
      year: 1990,
      runtimeMinutes: undefined,
    });
    const moderno = candidate({
      id: 2,
      spanishTitle: "Capitán América",
      year: 2011,
      runtimeMinutes: undefined,
    });
    const runtimes = new Map([
      [1, 97],
      [2, 124],
    ]);

    const getDetails = vi.fn((id: number) =>
      Promise.resolve(candidate({ id, runtimeMinutes: runtimes.get(id) })),
    );
    const provider = providerWith({
      search: vi.fn(() => Promise.resolve([antiguo, moderno])),
      getDetails,
    });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Capitan America 4Kremux2160.mkv"), runtimeMinutes: 124 },
      provider,
    );

    expect(getDetails).toHaveBeenCalled();
    expect(outcome.candidate?.id).toBe(2);
  });

  it("no pide fichas cuando el archivo no tiene duración legible", async () => {
    const getDetails = vi.fn(() => Promise.resolve(undefined));
    const provider = providerWith({
      search: vi.fn(() =>
        Promise.resolve([
          candidate({ id: 1, runtimeMinutes: undefined }),
          candidate({ id: 2, runtimeMinutes: undefined }),
        ]),
      ),
      getDetails,
    });

    await resolveWork({ hints: extractIdentificationHints("Peli.2020.mkv") }, provider);

    expect(getDetails).not.toHaveBeenCalled();
  });

  it("sigue adelante si la ficha falla", async () => {
    const provider = providerWith({
      search: vi.fn(() =>
        Promise.resolve([
          candidate({ id: 1, runtimeMinutes: undefined }),
          candidate({ id: 2, runtimeMinutes: undefined }),
        ]),
      ),
      getDetails: vi.fn(() => Promise.reject(new Error("TMDb caído"))),
    });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Peli.2020.mkv"), runtimeMinutes: 100 },
      provider,
    );

    expect(outcome.candidate).toBeDefined();
    expect(outcome.error).toBeUndefined();
  });

  it("la relevancia del proveedor desempata títulos igual de parecidos", async () => {
    const provider = providerWith({
      search: vi.fn(() =>
        Promise.resolve([
          candidate({ id: 10, spanishTitle: "Venom: Habrá matanza", year: 2021 }),
          candidate({ id: 11, spanishTitle: "Veneno mortal", year: 2002 }),
        ]),
      ),
    });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Venom 2 4Kremux2160.mkv") },
      provider,
    );

    expect(outcome.candidate?.id).toBe(10);
  });
});
