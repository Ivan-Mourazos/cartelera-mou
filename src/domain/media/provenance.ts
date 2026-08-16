/**
 * Trazabilidad de datos.
 *
 * Regla del producto: EXACTITUD > CANTIDAD DE INFORMACIÓN. Cada dato relevante
 * viaja con su nivel de confianza y su procedencia, de modo que la interfaz y el
 * generador de nombres puedan decidir si es utilizable o si debe omitirse.
 */

export type Confidence = "CONFIRMED" | "INFERRED" | "UNKNOWN" | "USER_CONFIRMED";

export type DataSource =
  | "VIDEO_STREAM_METADATA"
  | "AUDIO_STREAM_METADATA"
  | "TEXT_STREAM_METADATA"
  | "CONTAINER_METADATA"
  | "ORIGINAL_FILENAME"
  | "FOLDER_NAME"
  | "METADATA_PROVIDER"
  | "USER_INPUT"
  | "DERIVED";

export interface Traced<T> {
  readonly value: T | undefined;
  readonly confidence: Confidence;
  readonly source: DataSource;
  /** Explicación auditable de por qué el dato tiene ese valor y esa confianza. */
  readonly note?: string;
}

const trace = <T>(
  value: T | undefined,
  confidence: Confidence,
  source: DataSource,
  note?: string,
): Traced<T> => ({
  value,
  confidence,
  source,
  ...(note === undefined ? {} : { note }),
});

/** Dato leído directamente del fichero o devuelto por el proveedor de metadata. */
export const confirmed = <T>(value: T, source: DataSource, note?: string): Traced<T> =>
  trace(value, "CONFIRMED", source, note);

/** Dato deducido de una pista no verificable (nombre de fichero, carpeta, etiqueta). */
export const inferred = <T>(value: T, source: DataSource, note?: string): Traced<T> =>
  trace(value, "INFERRED", source, note);

/** Dato que no puede determinarse con fiabilidad. Nunca se escribe en el nombre. */
export const unknown = <T>(source: DataSource = "DERIVED", note?: string): Traced<T> =>
  trace<T>(undefined, "UNKNOWN", source, note);

/** Corrección manual: siempre gana sobre cualquier otra procedencia. */
export const userConfirmed = <T>(value: T, note?: string): Traced<T> =>
  trace(value, "USER_CONFIRMED", "USER_INPUT", note);

/** ¿Tiene el dato un valor utilizable? */
export const isKnown = <T>(traced: Traced<T> | undefined): traced is Traced<T> & { value: T } =>
  traced?.value !== undefined && traced.confidence !== "UNKNOWN";

/**
 * ¿Puede este dato escribirse en el nombre del fichero?
 *
 * Por defecto solo datos confirmados o validados por la persona usuaria. Los
 * campos donde la inferencia es la única vía posible (fuente, REMUX) piden
 * explícitamente `allowInferred`.
 */
export const isUsableForName = <T>(
  traced: Traced<T> | undefined,
  options: { readonly allowInferred?: boolean } = {},
): traced is Traced<T> & { value: T } => {
  if (!isKnown(traced)) return false;
  if (traced.confidence === "INFERRED") return options.allowInferred === true;
  return true;
};

const PRECEDENCE: Readonly<Record<Confidence, number>> = {
  USER_CONFIRMED: 4,
  CONFIRMED: 3,
  INFERRED: 2,
  UNKNOWN: 1,
};

/** Selecciona el dato más fiable. Ante empate gana el primero recibido. */
export const preferMostReliable = <T>(...candidates: readonly Traced<T>[]): Traced<T> => {
  let best: Traced<T> = unknown<T>();
  for (const candidate of candidates) {
    if (!isKnown(candidate)) continue;
    if (PRECEDENCE[candidate.confidence] > PRECEDENCE[best.confidence]) best = candidate;
  }
  return best;
};

export const describeConfidence = (confidence: Confidence): string =>
  ({
    CONFIRMED: "Confirmado en el fichero",
    INFERRED: "Inferido",
    UNKNOWN: "Desconocido",
    USER_CONFIRMED: "Confirmado manualmente",
  })[confidence];

export const describeSource = (source: DataSource): string =>
  ({
    VIDEO_STREAM_METADATA: "Metadatos de la pista de vídeo",
    AUDIO_STREAM_METADATA: "Metadatos de la pista de audio",
    TEXT_STREAM_METADATA: "Metadatos de la pista de subtítulos",
    CONTAINER_METADATA: "Metadatos del contenedor",
    ORIGINAL_FILENAME: "Nombre original del fichero",
    FOLDER_NAME: "Nombre de la carpeta",
    METADATA_PROVIDER: "Proveedor de metadata",
    USER_INPUT: "Introducido manualmente",
    DERIVED: "Derivado de otros datos",
  })[source];
