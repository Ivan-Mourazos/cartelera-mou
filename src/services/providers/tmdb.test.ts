import { afterEach, describe, expect, it, vi } from "vitest";

import { createTmdbProvider } from "./tmdb";
import { MetadataProviderError, nullMetadataProvider } from "./types";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type FetchInput = string | URL | Request;

const urlOf = (input: FetchInput | undefined): URL =>
  new URL(input instanceof Request ? input.url : (input ?? ""));

const mockFetch = (handler: (url: URL, init: RequestInit | undefined) => Response) => {
  const spy = vi.fn((input: FetchInput, init?: RequestInit) =>
    Promise.resolve(handler(urlOf(input), init)),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proveedor TMDb", () => {
  it("consulta localizado a España", async () => {
    const spy = mockFetch(() =>
      jsonResponse({
        results: [
          {
            id: 693134,
            title: "Dune: Parte dos",
            original_title: "Dune: Part Two",
            original_language: "en",
            release_date: "2024-02-27",
            poster_path: "/abc.jpg",
          },
        ],
      }),
    );

    const provider = createTmdbProvider({ key: "clave-v3" });
    const results = await provider.search({ title: "Dune Part Two", year: 2024, kind: "movie" });

    const url = urlOf(spy.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/3/search/movie");
    expect(url.searchParams.get("language")).toBe("es-ES");
    expect(url.searchParams.get("region")).toBe("ES");
    expect(url.searchParams.get("year")).toBe("2024");
    expect(url.searchParams.get("api_key")).toBe("clave-v3");

    expect(results[0]).toEqual({
      id: 693134,
      kind: "movie",
      spanishTitle: "Dune: Parte dos",
      originalTitle: "Dune: Part Two",
      originalLanguage: "en",
      year: 2024,
      runtimeMinutes: undefined,
      posterUrl: "https://image.tmdb.org/t/p/w185/abc.jpg",
      overview: undefined,
    });
  });

  it("usa cabecera Bearer con un token v4", async () => {
    const spy = mockFetch(() => jsonResponse({ results: [] }));
    const provider = createTmdbProvider({ key: "aaa.bbb.ccc" });
    await provider.search({ title: "X", kind: "movie" });

    const init = spy.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer aaa.bbb.ccc");
    expect(urlOf(spy.mock.calls[0]?.[0]).searchParams.get("api_key")).toBeNull();
  });

  it("conserva el título en inglés si TMDb no da traducción española", async () => {
    mockFetch(() =>
      jsonResponse({
        results: [
          {
            id: 1,
            title: "Fast & Furious",
            original_title: "Fast & Furious",
            release_date: "2009-04-02",
          },
        ],
      }),
    );
    const provider = createTmdbProvider({ key: "k" });
    const [candidate] = await provider.search({ title: "Fast and Furious", kind: "movie" });
    expect(candidate?.spanishTitle).toBe("Fast & Furious");
  });

  it("descarta resultados que no cumplen el esquema", async () => {
    mockFetch(() =>
      jsonResponse({
        results: [
          { id: "no-es-un-numero", title: "Basura" },
          { id: 5, title: "Válida" },
        ],
      }),
    );
    const provider = createTmdbProvider({ key: "k" });
    const results = await provider.search({ title: "X", kind: "movie" });
    expect(results).toHaveLength(1);
    expect(results[0]?.spanishTitle).toBe("Válida");
  });

  it("rechaza rutas de imagen que no son de TMDb", async () => {
    mockFetch(() =>
      jsonResponse({
        results: [{ id: 5, title: "X", poster_path: "https://evil.example/x.jpg" }],
      }),
    );
    const provider = createTmdbProvider({ key: "k" });
    const [candidate] = await provider.search({ title: "X", kind: "movie" });
    expect(candidate?.posterUrl).toBeUndefined();
  });

  it("traduce los errores de la API a errores del dominio", async () => {
    mockFetch(() => jsonResponse({}, 401));
    const provider = createTmdbProvider({ key: "k" });
    await expect(provider.search({ title: "X", kind: "movie" })).rejects.toMatchObject({
      code: "unauthorized",
      retryable: false,
    });

    vi.unstubAllGlobals();
    mockFetch(() => jsonResponse({}, 429));
    await expect(
      createTmdbProvider({ key: "k" }).search({ title: "X", kind: "movie" }),
    ).rejects.toMatchObject({ code: "rate-limited", retryable: true });
  });

  it("marca un fallo de red como reintentable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(
      createTmdbProvider({ key: "k" }).search({ title: "X", kind: "movie" }),
    ).rejects.toBeInstanceOf(MetadataProviderError);
  });

  it("sin clave no consulta nada", async () => {
    const spy = mockFetch(() => jsonResponse({ results: [] }));
    const provider = createTmdbProvider({ key: "" });
    expect(provider.available).toBe(false);
    await expect(provider.search({ title: "X", kind: "movie" })).rejects.toMatchObject({
      code: "no-credentials",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("cachea la misma consulta", async () => {
    const spy = mockFetch(() => jsonResponse({ results: [{ id: 1, title: "X" }] }));
    const provider = createTmdbProvider({ key: "k" });
    await provider.search({ title: "X", kind: "movie" });
    await provider.search({ title: "X", kind: "movie" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("pide el título del episodio en español", async () => {
    const spy = mockFetch(() =>
      jsonResponse({ name: "Mucho mucho tiempo", air_date: "2023-01-29" }),
    );
    const provider = createTmdbProvider({ key: "k" });
    const episode = await provider.getEpisode(100088, 1, 3);

    expect(episode?.title).toBe("Mucho mucho tiempo");
    const url = urlOf(spy.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/3/tv/100088/season/1/episode/3");
    expect(url.searchParams.get("language")).toBe("es-ES");
  });

  it("un episodio inexistente no es un error", async () => {
    mockFetch(() => jsonResponse({}, 404));
    await expect(createTmdbProvider({ key: "k" }).getEpisode(1, 1, 1)).resolves.toBeUndefined();
  });
});

describe("modo sin proveedor", () => {
  it("devuelve listas vacías sin romper el flujo", async () => {
    expect(nullMetadataProvider.available).toBe(false);
    await expect(nullMetadataProvider.search({ title: "X", kind: "movie" })).resolves.toEqual([]);
    await expect(nullMetadataProvider.getEpisode(1, 1, 1)).resolves.toBeUndefined();
  });
});

describe("createTmdbProvider — búsqueda multi", () => {
  it("devuelve películas y series con su tipo y descarta personas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              results: [
                { id: 1, media_type: "movie", title: "Dune", release_date: "2021-09-15" },
                {
                  id: 2,
                  media_type: "tv",
                  name: "Dune: La profecía",
                  first_air_date: "2024-11-17",
                },
                { id: 3, media_type: "person", name: "Denis Villeneuve" },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    const provider = createTmdbProvider({ key: "clave" });
    const results = await provider.searchMulti("Dune");

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ id: 1, kind: "movie", spanishTitle: "Dune", year: 2021 });
    expect(results[1]).toMatchObject({ id: 2, kind: "series", year: 2024 });
  });
});

describe("createTmdbProvider — identificador externo", () => {
  it("resuelve un identificador de IMDb", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              movie_results: [{ id: 949, title: "Heat", release_date: "1995-12-15" }],
              tv_results: [],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    const provider = createTmdbProvider({ key: "clave" });
    const found = await provider.findByExternalId({ provider: "imdb", imdbId: "tt0113277" });

    expect(found).toMatchObject({ id: 949, kind: "movie", spanishTitle: "Heat" });
  });
});

describe("createTmdbProvider — temporada completa", () => {
  it("devuelve los títulos de episodio en una sola llamada", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            episodes: [
              { episode_number: 1, name: "Cuando estés perdido en la oscuridad" },
              { episode_number: 3, name: "Mucho mucho tiempo" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createTmdbProvider({ key: "clave" });
    const episodes = await provider.getSeasonEpisodes(100088, 1);

    expect(episodes.get(3)).toBe("Mucho mucho tiempo");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cachea la temporada: la segunda consulta no vuelve a la red", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ episodes: [{ episode_number: 1, name: "Piloto" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createTmdbProvider({ key: "clave" });
    await provider.getSeasonEpisodes(1, 1);
    await provider.getSeasonEpisodes(1, 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
