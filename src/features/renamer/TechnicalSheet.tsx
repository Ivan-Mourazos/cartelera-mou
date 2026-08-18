import type { ContentIdentification } from "../../domain/identification/types";
import { describeConfidence, describeSource, type Traced } from "../../domain/media/provenance";
import type { NormalizedMedia } from "../../domain/media/types";

export interface TechnicalSheetProps {
  readonly media: NormalizedMedia;
  readonly identification: ContentIdentification;
  readonly attempts: readonly string[];
}

/** Nombre legible de cada paso de la cascada de identificación. */
const ATTEMPT_LABEL: Readonly<Record<string, string>> = {
  "embedded-id": "identificador incrustado",
  "title-year": "título y año",
  "title-year-nearby": "título y año ±1",
  "title-only": "título sin año",
  multi: "búsqueda multi",
  "normalized-title": "título normalizado",
  "parent-folder": "título de la carpeta",
};

const UNKNOWN: Traced<never> = { value: undefined, confidence: "UNKNOWN", source: "DERIVED" };

interface Entry {
  readonly label: string;
  readonly traced: Traced<unknown>;
  readonly text: string | undefined;
}

/** Solo se imprimen valores escalares; los compuestos traen su propio texto. */
const scalarText = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
};

const entry = (label: string, traced: Traced<unknown>, text?: string): Entry => ({
  label,
  traced,
  text: text ?? scalarText(traced.value),
});

/**
 * Hace visible el modelo de procedencia: cada dato con su valor, su confianza y
 * el motivo por el que vale eso. Es lo que permite discutir con la herramienta
 * en lugar de creerle.
 */
export const TechnicalSheet = ({ media, identification, attempts }: TechnicalSheetProps) => {
  const video = media.video[0];
  const resolution = video?.resolution;
  const duration = media.general.durationSeconds;

  const entries: readonly Entry[] = [
    entry("Título", identification.spanishTitle),
    entry("Título original", identification.originalTitle),
    entry("Año", identification.year),
    entry(
      "Resolución",
      resolution ?? UNKNOWN,
      resolution?.value === undefined
        ? undefined
        : `${resolution.value.quality} ${resolution.value.pixelLabel} (${String(resolution.value.width)}×${String(resolution.value.height)})`,
    ),
    entry("Fuente", media.source.media),
    entry("Tipo de lanzamiento", media.source.type),
    entry("Códec de vídeo", video?.codec ?? UNKNOWN),
    entry("Profundidad de bits", video?.bitDepth ?? UNKNOWN),
    entry(
      "Duración",
      duration,
      duration.value === undefined ? undefined : `${String(Math.round(duration.value / 60))} min`,
    ),
    entry("Contenedor", media.general.container),
  ];

  return (
    <details className="technical-sheet">
      <summary>Ficha técnica</summary>

      <dl>
        {entries.map((item) => (
          <div key={item.label} className={`sheet-entry confidence-${item.traced.confidence}`}>
            <dt>{item.label}</dt>
            <dd>
              <span className="sheet-value">{item.text ?? "—"}</span>
              <span className="sheet-meta">
                {describeConfidence(item.traced.confidence)} · {describeSource(item.traced.source)}
              </span>
              {item.traced.note === undefined ? null : (
                <span className="sheet-note">{item.traced.note}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {attempts.length === 0 ? null : (
        <p className="sheet-attempts">
          Consultas lanzadas: {attempts.map((name) => ATTEMPT_LABEL[name] ?? name).join(" → ")}
        </p>
      )}

      {media.warnings.length === 0 ? null : (
        <ul className="sheet-warnings">
          {media.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </details>
  );
};
