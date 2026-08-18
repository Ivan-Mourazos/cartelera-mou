import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useState } from "react";

import type { EditableIdentificationField } from "../../domain/identification/build";
import type { SourceMedia, SourceType } from "../../domain/media/types";
import type { ProviderCandidate } from "../../services/providers/types";
import { effectiveName, type MediaItem } from "../../services/item-pipeline";
import type { RenamePlanItem } from "../../services/rename/plan";

export interface MediaItemCardProps {
  readonly item: MediaItem;
  readonly planItem: RenamePlanItem | undefined;
  readonly onRemove: (id: string) => void;
  readonly onOverrideName: (id: string, value: string | undefined) => void;
  readonly onGrantAccess: () => void;
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
}

const SOURCE_OPTIONS: readonly {
  readonly value: string;
  readonly label: string;
  readonly media: SourceMedia | undefined;
  readonly type: SourceType | undefined;
}[] = [
  { value: "", label: "Sin fuente", media: undefined, type: undefined },
  { value: "bluray-remux", label: "BluRay REMUX", media: "BluRay", type: "REMUX" },
  { value: "bluray", label: "BluRay", media: "BluRay", type: undefined },
  { value: "uhdrip", label: "UHDRip", media: "UHDRip", type: undefined },
  { value: "bdrip", label: "BDRip", media: "BDRip", type: undefined },
  { value: "brrip", label: "BRRip", media: "BRRip", type: undefined },
  { value: "webdl", label: "WEB-DL", media: "WEB-DL", type: undefined },
  { value: "webrip", label: "WEBRip", media: "WEBRip", type: undefined },
  { value: "hdtv", label: "HDTV", media: "HDTV", type: undefined },
  { value: "hdtvrip", label: "HDTVRip", media: "HDTVRip", type: undefined },
  { value: "microhd", label: "microHD", media: "microHD", type: undefined },
  { value: "hdrip", label: "HDRip", media: "HDRip", type: undefined },
  { value: "dvdrip", label: "DVDRip", media: "DVDRip", type: undefined },
  { value: "dvdscr", label: "DVDScr", media: "DVDScr", type: undefined },
  { value: "scr", label: "SCR", media: "SCR", type: undefined },
  { value: "tc", label: "TC", media: "TC", type: undefined },
  { value: "ts", label: "TS", media: "TS", type: undefined },
  { value: "camrip", label: "CamRip", media: "CamRip", type: undefined },
];
const currentSourceValue = (item: MediaItem): string => {
  const media = item.media.source.media.value;
  const type = item.media.source.type.value;
  return (
    SOURCE_OPTIONS.find((option) => option.media === media && option.type === type)?.value ?? ""
  );
};

const numberOrUndefined = (value: string): number | undefined =>
  value.trim() === "" ? undefined : Number(value);

/**
 * Una fila: nombre actual, nombre propuesto editable, avisos y —plegados— los
 * datos que la persona usuaria puede corregir cuando el archivo no los trae.
 */
export const MediaItemCard = ({
  item,
  planItem,
  onRemove,
  onOverrideName,
  onGrantAccess,
  onEditField,
  onSetKind,
  onSetSource,
  onSearch,
  onChooseCandidate,
}: MediaItemCardProps) => {
  const [showFields, setShowFields] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<readonly ProviderCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const value = effectiveName(item);

  const blocking = planItem?.issues.filter((issue) => issue.severity === "blocking") ?? [];
  const isSeries = item.identification.kind === "series";

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

  /**
   * Se guarda en cada pulsación, no al salir del campo: si se guardara al salir,
   * el clic en «Renombrar» ocurriría en el mismo evento que ese guardado y el
   * archivo se renombraría con la propuesta anterior.
   */
  const commit = (edited: string): void => {
    onOverrideName(item.id, edited === item.name.filename ? undefined : edited);
  };

  return (
    <article className={`file-card ${item.status === "renamed" ? "renamed" : ""}`}>
      <div className="file-card-main">
        <div className="name-comparison">
          <div className="original-name" title={item.currentName}>
            {item.currentName}
          </div>

          <div className="suggested-name-row">
            <ArrowRight size={14} className="suggest-arrow" aria-hidden />
            <label className="visually-hidden" htmlFor={`name-${item.id}`}>
              Nombre propuesto
            </label>
            <input
              id={`name-${item.id}`}
              className="proposed-name-input"
              value={value}
              spellCheck={false}
              onChange={(event) => commit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") onOverrideName(item.id, undefined);
              }}
            />
            {item.analysisPending ? (
              <Loader2 size={14} className="spin" aria-label="Analizando" />
            ) : null}
            {item.status === "renamed" ? (
              <span className="status-pill success">
                <Check size={12} aria-hidden /> Hecho
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className="icon-button"
          onClick={() => setShowFields((open) => !open)}
          aria-expanded={showFields}
          title="Corregir datos (año, temporada, episodio, fuente)"
        >
          <SlidersHorizontal size={14} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => onRemove(item.id)}
          title="Quitar de la lista"
        >
          <X size={14} />
        </button>
      </div>

      {showFields ? (
        <div className="item-search">
          <label className="visually-hidden" htmlFor={`search-${item.id}`}>
            Buscar en TMDb
          </label>
          <input
            id={`search-${item.id}`}
            className="inline-edit-input"
            placeholder="Buscar la película o serie en TMDb…"
            value={query ?? item.identification.spanishTitle.value ?? ""}
            onChange={(event) => setQuery(event.target.value)}
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

          {results !== null ? (
            results.length === 0 ? (
              <p className="search-empty">Sin resultados. Prueba con otro título.</p>
            ) : (
              <ul className="search-results">
                {results.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      className={
                        item.identification.reference?.id === candidate.id ? "is-applied" : ""
                      }
                      onClick={() => {
                        onChooseCandidate(item.id, candidate);
                        setResults(null);
                        setQuery(null);
                      }}
                    >
                      {candidate.posterUrl === undefined ? null : (
                        <img src={candidate.posterUrl} alt="" loading="lazy" />
                      )}
                      <span>
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
            )
          ) : null}
        </div>
      ) : null}

      {showFields ? (
        <div className="item-fields">
          <label>
            Título
            <input
              key={`title-${item.identification.spanishTitle.value ?? ""}`}
              className="inline-edit-input"
              defaultValue={item.identification.spanishTitle.value ?? ""}
              onBlur={(event) => onEditField(item.id, "spanishTitle", event.target.value.trim())}
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
              onBlur={(event) =>
                onEditField(item.id, "year", numberOrUndefined(event.target.value))
              }
            />
          </label>
          <label>
            Tipo
            <select
              value={isSeries ? "series" : "movie"}
              onChange={(event) =>
                onSetKind(item.id, event.target.value === "series" ? "series" : "movie")
              }
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
                  onBlur={(event) =>
                    onEditField(item.id, "season", numberOrUndefined(event.target.value))
                  }
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
                  onBlur={(event) =>
                    onEditField(item.id, "episode", numberOrUndefined(event.target.value))
                  }
                />
              </label>
              <label>
                Título del episodio
                <input
                  key={`episode-title-${item.identification.episodeTitle.value ?? ""}`}
                  className="inline-edit-input"
                  defaultValue={item.identification.episodeTitle.value ?? ""}
                  onBlur={(event) =>
                    onEditField(item.id, "episodeTitle", event.target.value.trim())
                  }
                />
              </label>
            </>
          ) : null}
          <label>
            Fuente / REMUX
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
        </div>
      ) : null}

      {blocking.length > 0 || item.error !== undefined ? (
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
        </ul>
      ) : null}
    </article>
  );
};
