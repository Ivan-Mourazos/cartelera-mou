import { ArrowLeft, ArrowRight, Check, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { EditableIdentificationField } from "../../domain/identification/build";
import type { ProviderCandidateSummary } from "../../domain/identification/types";
import { ALL_RELEASE_SOURCES } from "../../domain/naming/release-labels";
import type { SourceMedia, SourceType } from "../../domain/media/types";
import { effectiveName, hasAmbiguousSpanish, type MediaItem } from "../../services/item-pipeline";
import { TechnicalSheet } from "./TechnicalSheet";
import type { ProviderCandidate } from "../../services/providers/types";

export interface ReviewModeProps {
  readonly items: readonly MediaItem[];
  readonly onClose: () => void;
  readonly onEditField: (
    id: string,
    field: EditableIdentificationField,
    value: string | number | undefined,
  ) => void;
  readonly onSetKind: (id: string, kind: "movie" | "series") => void;
  readonly onSetSource: (
    id: string,
    media: SourceMedia | undefined,
    type: SourceType | undefined,
  ) => void;
  readonly onSetSpanishVariant: (id: string, variant: "castilian" | "latin") => void;
  readonly onSetSpanishVariantForAll: (variant: "castilian" | "latin") => void;
  readonly onChooseSummary: (id: string, candidate: ProviderCandidateSummary) => void;
  readonly onChooseCandidate: (id: string, candidate: ProviderCandidate) => void;
  readonly onSearch: (
    query: string,
    kind: "movie" | "series",
  ) => Promise<readonly ProviderCandidate[]>;
}

const SOURCE_VALUES: readonly (SourceMedia | "BluRay REMUX")[] = ALL_RELEASE_SOURCES;

const sourceValueOf = (item: MediaItem): string => {
  const media = item.media.source.media.value;
  if (media === undefined) return "";
  return item.media.source.type.value === "REMUX" && media === "BluRay" ? "BluRay REMUX" : media;
};

const applySource = (
  value: string,
): { media: SourceMedia | undefined; type: SourceType | undefined } => {
  if (value === "") return { media: undefined, type: undefined };
  if (value === "BluRay REMUX") return { media: "BluRay", type: "REMUX" };
  return { media: value as SourceMedia, type: undefined };
};

interface WorkPickerProps {
  readonly item: MediaItem;
  readonly onChooseSummary: (id: string, candidate: ProviderCandidateSummary) => void;
  readonly onChooseCandidate: (id: string, candidate: ProviderCandidate) => void;
  readonly onSearch: (
    query: string,
    kind: "movie" | "series",
  ) => Promise<readonly ProviderCandidate[]>;
}

/**
 * Elección de la obra: las alternativas ya puntuadas y, si ninguna vale, una
 * búsqueda nueva. Vive aparte y se monta con `key={item.id}`, de modo que al
 * pasar al siguiente archivo su estado se reinicia solo.
 */
const WorkPicker = ({ item, onChooseSummary, onChooseCandidate, onSearch }: WorkPickerProps) => {
  const [query, setQuery] = useState(item.identification.spanishTitle.value ?? "");
  const [results, setResults] = useState<readonly ProviderCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);

  const runSearch = async (): Promise<void> => {
    if (query.trim().length === 0) return;
    setSearching(true);
    try {
      setResults(
        await onSearch(query.trim(), item.identification.kind === "series" ? "series" : "movie"),
      );
    } finally {
      setSearching(false);
    }
  };

  const chosenId = item.identification.reference?.id;

  return (
    <section className="review-question">
      <h3>¿Qué obra es?</h3>

      {item.identification.alternatives.length === 0 ? null : (
        <ul className="poster-grid">
          {item.identification.alternatives.slice(0, 6).map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                className={chosenId === candidate.id ? "poster is-chosen" : "poster"}
                onClick={() => {
                  onChooseSummary(item.id, candidate);
                }}
              >
                {candidate.posterUrl === undefined ? (
                  <span className="poster-blank" aria-hidden />
                ) : (
                  <img src={candidate.posterUrl} alt="" loading="lazy" />
                )}
                <span className="poster-title">{candidate.spanishTitle}</span>
                <span className="poster-year">{candidate.year ?? "—"}</span>
                {chosenId === candidate.id ? (
                  <span className="poster-check" aria-hidden>
                    <Check size={11} />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="review-search">
        <label className="visually-hidden" htmlFor={`review-search-${item.id}`}>
          Buscar otra obra
        </label>
        <input
          id={`review-search-${item.id}`}
          value={query}
          spellCheck={false}
          placeholder="Buscar otro título…"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void runSearch();
          }}
        />
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => void runSearch()}
          disabled={searching}
        >
          {searching ? (
            <Loader2 size={13} className="spin" aria-hidden />
          ) : (
            <Search size={13} aria-hidden />
          )}
          Buscar
        </button>
      </div>

      {results === null ? null : results.length === 0 ? (
        <p className="review-hint">Sin resultados para «{query}».</p>
      ) : (
        <ul className="poster-grid">
          {results.slice(0, 6).map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                className={chosenId === candidate.id ? "poster is-chosen" : "poster"}
                onClick={() => {
                  onChooseCandidate(item.id, candidate);
                  setResults(null);
                }}
              >
                {candidate.posterUrl === undefined ? (
                  <span className="poster-blank" aria-hidden />
                ) : (
                  <img src={candidate.posterUrl} alt="" loading="lazy" />
                )}
                <span className="poster-title">{candidate.spanishTitle}</span>
                <span className="poster-year">{candidate.year ?? "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * Recorrido guiado por los archivos que necesitan una decisión.
 *
 * Sustituye al desplegable por fila: en vez de abrir y cerrar paneles, se
 * atiende una cosa cada vez y se avanza. Solo aparece lo que a ESE archivo le
 * falta, así que no hay formularios vacíos que leer.
 */
export const ReviewMode = ({
  items,
  onClose,
  onEditField,
  onSetKind,
  onSetSource,
  onSetSpanishVariant,
  onSetSpanishVariantForAll,
  onChooseSummary,
  onChooseCandidate,
  onSearch,
}: ReviewModeProps) => {
  const [index, setIndex] = useState(0);

  const current = items[Math.min(index, items.length - 1)];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const inField =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLSelectElement;
      if (event.key === "Escape") onClose();
      if (inField) return;
      if (event.key === "ArrowRight") setIndex((value) => Math.min(value + 1, items.length - 1));
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(value - 1, 0));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [items.length, onClose]);

  const needs = useMemo(() => {
    if (current === undefined)
      return { work: false, spanish: false, source: false, episode: false };
    return {
      work:
        current.identification.matchBand !== "high" ||
        current.identification.reference === undefined,
      spanish: hasAmbiguousSpanish(current),
      source: current.media.source.media.value === undefined,
      episode:
        current.identification.kind === "series" &&
        (current.identification.season.value === undefined ||
          current.identification.episode.value === undefined),
    };
  }, [current]);

  const alsoAmbiguous = items.filter(hasAmbiguousSpanish).length;

  if (current === undefined) return null;

  const isLast = index >= items.length - 1;

  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-label="Revisión">
      <div className="review-panel">
        <header className="review-header">
          <div className="review-progress">
            <span className="review-step">
              {index + 1} de {items.length}
            </span>
            <div className="review-bar" aria-hidden>
              <span style={{ width: `${String(((index + 1) / items.length) * 100)}%` }} />
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Cerrar revisión">
            <X size={15} />
          </button>
        </header>

        <p className="review-filename" title={current.currentName}>
          {current.currentName}
        </p>

        <div className="review-body">
          {needs.work ? (
            <WorkPicker
              key={current.id}
              item={current}
              onChooseSummary={onChooseSummary}
              onChooseCandidate={onChooseCandidate}
              onSearch={onSearch}
            />
          ) : null}

          {needs.spanish ? (
            <section className="review-question">
              <h3>El audio está en español, pero no consta la región</h3>
              <div className="choice-row">
                <button
                  type="button"
                  className="btn btn-choice"
                  onClick={() => {
                    onSetSpanishVariant(current.id, "castilian");
                  }}
                >
                  Castellano
                </button>
                <button
                  type="button"
                  className="btn btn-choice"
                  onClick={() => {
                    onSetSpanishVariant(current.id, "latin");
                  }}
                >
                  Latino
                </button>
              </div>
              {alsoAmbiguous > 1 ? (
                <p className="review-hint">
                  Otros {alsoAmbiguous - 1} archivos tienen la misma duda.{" "}
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      onSetSpanishVariantForAll("castilian");
                    }}
                  >
                    Castellano para todos
                  </button>
                  {" · "}
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      onSetSpanishVariantForAll("latin");
                    }}
                  >
                    Latino para todos
                  </button>
                </p>
              ) : null}
            </section>
          ) : null}

          {needs.episode ? (
            <section className="review-question">
              <h3>Falta la temporada o el episodio</h3>
              <div className="field-row">
                <label>
                  Temporada
                  <input
                    type="number"
                    min={0}
                    defaultValue={current.identification.season.value ?? ""}
                    onBlur={(event) => {
                      onEditField(
                        current.id,
                        "season",
                        event.target.value === "" ? undefined : Number(event.target.value),
                      );
                    }}
                  />
                </label>
                <label>
                  Episodio
                  <input
                    type="number"
                    min={0}
                    defaultValue={current.identification.episode.value ?? ""}
                    onBlur={(event) => {
                      onEditField(
                        current.id,
                        "episode",
                        event.target.value === "" ? undefined : Number(event.target.value),
                      );
                    }}
                  />
                </label>
              </div>
            </section>
          ) : null}

          <section className="review-question">
            <h3>Ajustes de este archivo</h3>
            <div className="field-row">
              <label>
                Tipo
                <select
                  value={current.identification.kind}
                  onChange={(event) => {
                    onSetKind(current.id, event.target.value === "series" ? "series" : "movie");
                  }}
                >
                  <option value="movie">Película</option>
                  <option value="series">Serie</option>
                </select>
              </label>
              <label>
                Fuente
                <select
                  value={sourceValueOf(current)}
                  onChange={(event) => {
                    const next = applySource(event.target.value);
                    onSetSource(current.id, next.media, next.type);
                  }}
                >
                  <option value="">Sin fuente</option>
                  {SOURCE_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Año
                <input
                  key={`year-${String(current.identification.year.value ?? "")}`}
                  type="number"
                  defaultValue={current.identification.year.value ?? ""}
                  onBlur={(event) => {
                    onEditField(
                      current.id,
                      "year",
                      event.target.value === "" ? undefined : Number(event.target.value),
                    );
                  }}
                />
              </label>
            </div>
          </section>
          <TechnicalSheet
            media={current.media}
            identification={current.identification}
            attempts={current.attempts}
          />
        </div>

        <footer className="review-footer">
          <p className="review-result" title={effectiveName(current)}>
            {effectiveName(current)}
          </p>
          <div className="review-nav">
            <button
              type="button"
              className="btn btn-quiet"
              disabled={index === 0}
              onClick={() => {
                setIndex((value) => Math.max(value - 1, 0));
              }}
            >
              <ArrowLeft size={14} aria-hidden /> Anterior
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (isLast) onClose();
                else setIndex((value) => value + 1);
              }}
            >
              {isLast ? "Terminar" : "Siguiente"} <ArrowRight size={14} aria-hidden />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
