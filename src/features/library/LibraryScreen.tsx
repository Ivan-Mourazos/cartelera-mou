import { ArrowUpDown, FolderOpen, Search, SlidersHorizontal } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Poster } from "../../components/Poster";
import { ScreenHeader } from "../../components/ScreenHeader";
import { formatBytes } from "../../components/format";
import type { MovieRecord } from "../../services/types";

interface LibraryScreenProps {
  movies: MovieRecord[];
  loading: boolean;
  onOpenMovie: (movieId: number) => void;
  onImport: () => void;
}

type SortOrder = "recent" | "title" | "year";

export function LibraryScreen({ movies, loading, onOpenMovie, onImport }: LibraryScreenProps) {
  const [query, setQuery] = useState("");
  const [resolution, setResolution] = useState("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const deferredQuery = useDeferredValue(query);

  const filteredMovies = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("es-ES");
    return movies
      .filter((movie) => {
        const matchesQuery =
          normalizedQuery.length === 0 ||
          `${movie.title} ${movie.originalTitle ?? ""} ${movie.year ?? ""}`
            .toLocaleLowerCase("es-ES")
            .includes(normalizedQuery);
        const matchesResolution = resolution === "all" || movie.resolution === resolution;
        return matchesQuery && matchesResolution;
      })
      .toSorted((left, right) => {
        if (sortOrder === "title") return left.title.localeCompare(right.title, "es-ES");
        if (sortOrder === "year") return (right.year ?? 0) - (left.year ?? 0);
        return Date.parse(right.addedAt) - Date.parse(left.addedAt);
      });
  }, [deferredQuery, movies, resolution, sortOrder]);

  return (
    <div className="screen library-screen">
      <ScreenHeader
        eyebrow="Archivo local"
        title="Biblioteca"
        description={
          loading
            ? "Leyendo el catálogo local…"
            : `${movies.length} películas catalogadas en este dispositivo.`
        }
        actions={
          <Button variant="primary" leadingIcon={<FolderOpen size={17} />} onClick={onImport}>
            Importar carpeta
          </Button>
        }
      />

      <section className="library-toolbar" aria-label="Buscar y filtrar biblioteca">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Buscar películas</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título o año…"
          />
          <kbd>Ctrl K</kbd>
        </label>
        <div className="filter-group" aria-label="Filtrar por resolución">
          <SlidersHorizontal size={16} aria-hidden="true" />
          {[
            ["all", "Todas"],
            ["2160p", "2160p"],
            ["1080p", "1080p"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={resolution === value ? "is-active" : ""}
              aria-pressed={resolution === value}
              onClick={() => setResolution(value ?? "all")}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="select-field select-field--compact">
          <ArrowUpDown size={16} aria-hidden="true" />
          <span className="sr-only">Ordenar biblioteca</span>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
          >
            <option value="recent">Incorporación</option>
            <option value="title">Título</option>
            <option value="year">Año</option>
          </select>
        </label>
      </section>

      {loading ? (
        <div className="poster-grid" aria-label="Cargando biblioteca" aria-busy="true">
          {Array.from({ length: 10 }, (_, index) => (
            <div className="poster-card-skeleton" key={index} />
          ))}
        </div>
      ) : movies.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Aún no hay películas catalogadas"
          description="Importa una carpeta para analizar sus archivos. Nada cambiará hasta que confirmes un renombrado."
          action={
            <Button variant="primary" onClick={onImport}>
              Importar una carpeta
            </Button>
          }
        />
      ) : filteredMovies.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No hay coincidencias"
          description="No hay películas que coincidan con la búsqueda y los filtros actuales."
          action={
            <Button
              onClick={() => {
                setQuery("");
                setResolution("all");
              }}
            >
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <section className="poster-grid" aria-label={`${filteredMovies.length} películas`}>
          {filteredMovies.map((movie) => (
            <button
              type="button"
              className="poster-card"
              key={movie.id}
              onClick={() => onOpenMovie(movie.id)}
              aria-label={`Abrir ficha de ${movie.title}, ${movie.year ?? "año desconocido"}`}
            >
              <Poster src={movie.posterUrl} title={movie.title} accentKey={movie.id} decorative />
              <span className="poster-card__body">
                <strong>{movie.title}</strong>
                <span>{movie.year ?? "Año desconocido"}</span>
                <span className="poster-card__meta">
                  <span>{movie.resolution ?? "—"}</span>
                  <span>{movie.extension.toLocaleUpperCase("es-ES")}</span>
                  <span>{formatBytes(movie.sizeBytes)}</span>
                </span>
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
