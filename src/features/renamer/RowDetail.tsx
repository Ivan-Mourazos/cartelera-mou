import { AlertTriangle, Loader2, Search } from "lucide-react";
import { useState } from "react";

import type { EditableIdentificationField } from "../../domain/identification/build";
import type { ProviderCandidateSummary } from "../../domain/identification/types";
import { ALL_RELEASE_SOURCES } from "../../domain/naming/release-labels";
import type { SourceMedia, SourceType } from "../../domain/media/types";
import type { MediaItem } from "../../services/item-pipeline";
import type { ProviderCandidate } from "../../services/providers/types";
import type { RenamePlanItem } from "../../services/rename/plan";
import { CandidateList } from "./CandidateList";
import { TechnicalSheet } from "./TechnicalSheet";

export interface RowDetailProps {
  readonly item: MediaItem;
  readonly planItem: RenamePlanItem | undefined;
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
  readonly onSearch: (
    query: string,
    kind: "movie" | "series",
  ) => Promise<readonly ProviderCandidate[]>;
  readonly onChooseCandidate: (id: string, candidate: ProviderCandidate) => void;
  readonly onChooseSummary: (id: string, candidate: ProviderCandidateSummary) => void;
  readonly onGrantAccess: () => void;
}

interface SourceOption {
  readonly value: string;
  readonly label: string;
  readonly media: SourceMedia | undefined;
  readonly type: SourceType | undefined;
}

/** `BluRay REMUX` es la combinación de un soporte y un tipo de lanzamiento. */
const SOURCE_OPTIONS: readonly SourceOption[] = [
  { value: "", label: "Sin fuente", media: undefined, type: undefined },
  ...ALL_RELEASE_SOURCES.map<SourceOption>((source) =>
    source === "BluRay REMUX"
      ? { value: source, label: source, media: "BluRay", type: "REMUX" }
      : { value: source, label: source, media: source, type: undefined },
  ),
];

const currentSourceValue = (item: MediaItem): string => {
  const media = item.media.source.media.value;
  const type = item.media.source.type.value;
  if (media === undefined) return "";
  return type === "REMUX" && media === "BluRay" ? "BluRay REMUX" : media;
};

const numberOrUndefined = (value: string): number | undefined =>
  value.trim() === "" ? undefined : Number(value);

/**
 * Detalle desplegable: alternativas del proveedor, campos corregibles, avisos y
 * ficha técnica. Todo lo que hace falta para arreglar una fila sin salir de ella.
 */
export const RowDetail = ({
  item,
  planItem,
  onEditField,
  onSetKind,
  onSetSource,
  onSearch,
  onChooseCandidate,
  onChooseSummary,
  onGrantAccess,
}: RowDetailProps) => {
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<readonly ProviderCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);

  const isSeries = item.identification.kind === "series";
  const blocking = planItem?.issues.filter((issue) => issue.severity === "blocking") ?? [];

  const runSearch = async (): Promise<void> => {
    const text = (query ?? item.identification.spanishTitle.value ?? "").trim();
    if (text.length === 0) return;
    setSearching(true);
    try {
      setResults(await onSearch(text, isSeries ? "series" : "movie"));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="row-detail">
      {item.name.alerts.length === 0 && blocking.length === 0 && item.error === undefined ? null : (
        <ul className="item-alerts">
          {item.error === undefined ? null : (
            <li className="alert-error">
              <AlertTriangle size={12} aria-hidden /> {item.error}
            </li>
          )}
          {blocking.map((issue) => (
            <li key={issue.code} className="alert-error">
              <AlertTriangle size={12} aria-hidden /> {issue.message}
              {issue.code === "no-handle" ? (
                <button
                  type="button"
                  className="apple-button apple-button-secondary"
                  onClick={onGrantAccess}
                >
                  Dar acceso
                </button>
              ) : null}
            </li>
          ))}
          {item.name.alerts.map((alert) => (
            <li key={alert} className="alert-warning">
              <AlertTriangle size={12} aria-hidden /> {alert}
            </li>
          ))}
        </ul>
      )}

      {item.identification.alternatives.length === 0 ? null : (
        <section className="detail-block">
          <h3>¿No es esta obra?</h3>
          <CandidateList
            candidates={item.identification.alternatives}
            appliedId={item.identification.reference?.id}
            onChoose={(candidate) => {
              onChooseSummary(item.id, candidate);
            }}
          />
        </section>
      )}

      <section className="detail-block item-search">
        <label className="visually-hidden" htmlFor={`search-${item.id}`}>
          Buscar en TMDb
        </label>
        <input
          id={`search-${item.id}`}
          className="inline-edit-input"
          placeholder="Buscar la película o serie en TMDb…"
          value={query ?? item.identification.spanishTitle.value ?? ""}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void runSearch();
          }}
        />
        <button
          type="button"
          className="apple-button apple-button-secondary"
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

        {results === null ? null : results.length === 0 ? (
          <p className="search-empty">Sin resultados. Prueba con otro título.</p>
        ) : (
          <ul className="search-results">
            {results.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  className={item.identification.reference?.id === candidate.id ? "is-applied" : ""}
                  onClick={() => {
                    onChooseCandidate(item.id, candidate);
                    setResults(null);
                    setQuery(null);
                  }}
                >
                  {candidate.posterUrl === undefined ? (
                    <span className="candidate-poster-placeholder" aria-hidden />
                  ) : (
                    <img src={candidate.posterUrl} alt="" loading="lazy" />
                  )}
                  <span className="candidate-text">
                    <strong>{candidate.spanishTitle}</strong> ({candidate.year ?? "—"})
                    {candidate.originalTitle !== undefined &&
                    candidate.originalTitle !== candidate.spanishTitle ? (
                      <em> · {candidate.originalTitle}</em>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-block item-fields">
        <label>
          Título
          <input
            key={`title-${item.identification.spanishTitle.value ?? ""}`}
            className="inline-edit-input"
            defaultValue={item.identification.spanishTitle.value ?? ""}
            onBlur={(event) => {
              onEditField(item.id, "spanishTitle", event.target.value.trim());
            }}
          />
        </label>
        <label>
          Año
          <input
            key={`year-${String(item.identification.year.value ?? "")}`}
            className="inline-edit-input"
            type="number"
            placeholder="—"
            defaultValue={item.identification.year.value ?? ""}
            onBlur={(event) => {
              onEditField(item.id, "year", numberOrUndefined(event.target.value));
            }}
          />
        </label>
        <label>
          Tipo
          <select
            value={isSeries ? "series" : "movie"}
            onChange={(event) => {
              onSetKind(item.id, event.target.value === "series" ? "series" : "movie");
            }}
          >
            <option value="movie">Película</option>
            <option value="series">Serie</option>
          </select>
        </label>
        {isSeries ? (
          <>
            <label>
              Temporada
              <input
                key={`season-${String(item.identification.season.value ?? "")}`}
                className="inline-edit-input"
                type="number"
                placeholder="—"
                defaultValue={item.identification.season.value ?? ""}
                onBlur={(event) => {
                  onEditField(item.id, "season", numberOrUndefined(event.target.value));
                }}
              />
            </label>
            <label>
              Episodio
              <input
                key={`episode-${String(item.identification.episode.value ?? "")}`}
                className="inline-edit-input"
                type="number"
                placeholder="—"
                defaultValue={item.identification.episode.value ?? ""}
                onBlur={(event) => {
                  onEditField(item.id, "episode", numberOrUndefined(event.target.value));
                }}
              />
            </label>
            <label>
              Título del episodio
              <input
                key={`episode-title-${item.identification.episodeTitle.value ?? ""}`}
                className="inline-edit-input"
                defaultValue={item.identification.episodeTitle.value ?? ""}
                onBlur={(event) => {
                  onEditField(item.id, "episodeTitle", event.target.value.trim());
                }}
              />
            </label>
          </>
        ) : null}
        <label>
          Fuente
          <select
            value={currentSourceValue(item)}
            onChange={(event) => {
              const option = SOURCE_OPTIONS.find((entry) => entry.value === event.target.value);
              onSetSource(item.id, option?.media, option?.type);
            }}
          >
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <TechnicalSheet
        media={item.media}
        identification={item.identification}
        attempts={item.attempts}
      />
    </div>
  );
};
