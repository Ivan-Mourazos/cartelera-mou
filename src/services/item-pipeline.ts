import { extractIdentificationHints } from "../domain/identification/hints";
import type {
  ContentIdentification,
  ProviderCandidateSummary,
} from "../domain/identification/types";
import { resolveSpanishVariant } from "../domain/media/language";
import { emptyNormalizedMedia, normalizeMediaInfo } from "../domain/media/normalize";
import { unknown, userConfirmed } from "../domain/media/provenance";
import type { NormalizedMedia, SourceMedia, SourceType } from "../domain/media/types";
import { buildMediaName, type NameBuildResult } from "../domain/naming/build";
import { identificationFromHints } from "../domain/identification/build";
import { readRawMediaInfo } from "./analysis/mediainfo-client";
import type { PickedFile } from "./file-system";
import { identifyContent } from "./identification-service";
import type { MetadataProvider } from "./providers/types";
import { templatesFor, type AppSettings } from "./settings";

/**
 * Encadena las fases del producto para un fichero:
 * análisis técnico → identificación → nombre propuesto.
 * Cada fase es independiente y puede repetirse sin repetir las demás.
 */

export type MediaItemStatus =
  "pending" | "analyzing" | "identifying" | "ready" | "error" | "renamed";

export interface MediaItem {
  readonly id: string;
  readonly currentName: string;
  readonly sizeBytes: number;
  readonly folderName: string | undefined;
  readonly handle: FileSystemFileHandle | undefined;
  readonly file: File | undefined;
  readonly status: MediaItemStatus;
  readonly media: NormalizedMedia;
  readonly identification: ContentIdentification;
  readonly candidates: readonly ProviderCandidateSummary[];
  readonly name: NameBuildResult;
  /** Nombre escrito a mano. Tiene prioridad y no se sobrescribe al recalcular. */
  readonly nameOverride: string | undefined;
  /** La persona usuaria fijó película/serie a mano: no se vuelve a deducir. */
  readonly kindLocked: boolean;
  readonly error: string | undefined;
  readonly analysisPending: boolean;
  /** Consultas lanzadas al proveedor, en orden, para la ficha técnica. */
  readonly attempts: readonly string[];
}

let sequence = 0;
const nextId = (): string => {
  sequence += 1;
  return `item-${String(sequence)}-${Date.now().toString(36)}`;
};

const nameOptions = (settings: AppSettings) => {
  const templates = templatesFor(settings);
  return {
    presetId: templates.presetId,
    movieTemplate: templates.movieTemplate,
    episodeTemplate: templates.episodeTemplate,
    includeProviderId: settings.includeProviderId,
    includeSubtitleLanguages: settings.includeSubtitleLanguages,
    allowInferredSource: settings.includeSource,
    targetLength: settings.nameTargetLength,
  };
};

export const createMediaItem = (picked: PickedFile, settings: AppSettings): MediaItem => {
  const hints = extractIdentificationHints(picked.name, picked.folderName);
  const identification = identificationFromHints(hints);
  const media = emptyNormalizedMedia(
    picked.name,
    picked.file === undefined
      ? "Sin acceso al contenido del fichero: no hay datos técnicos confirmados."
      : "Pendiente de análisis técnico.",
  );

  return {
    id: nextId(),
    currentName: picked.name,
    sizeBytes: picked.size,
    folderName: picked.folderName,
    handle: picked.handle,
    file: picked.file,
    status: "pending",
    media,
    identification,
    candidates: [],
    name: buildMediaName(identification, media, nameOptions(settings)),
    nameOverride: undefined,
    kindLocked: false,
    error: undefined,
    analysisPending: picked.file !== undefined,
    attempts: [],
  };
};

/** Fase 1: análisis técnico real del fichero. */
export const analyzeMediaItem = async (
  item: MediaItem,
  settings: AppSettings,
  signal?: AbortSignal,
): Promise<MediaItem> => {
  if (item.file === undefined) {
    return { ...item, status: "ready", analysisPending: false };
  }

  try {
    const raw = await readRawMediaInfo(item.file, signal);
    const media = normalizeMediaInfo(raw, item.currentName, item.sizeBytes);
    return {
      ...item,
      media,
      status: "ready",
      analysisPending: false,
      error: undefined,
      name: buildMediaName(item.identification, media, nameOptions(settings)),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...item,
      status: "error",
      analysisPending: false,
      error: message,
      media: { ...item.media, warnings: [...item.media.warnings, message] },
    };
  }
};

/** Fase 2: identificación de la obra en el proveedor de metadata. */
export const identifyMediaItem = async (
  item: MediaItem,
  provider: MetadataProvider,
  settings: AppSettings,
  signal?: AbortSignal,
): Promise<MediaItem> => {
  const fromFilename = extractIdentificationHints(item.currentName, item.folderName);
  // Los MKV de release suelen traer el nombre completo dentro del contenedor:
  // es la salvación de los `01.mkv` y `pelicula.mkv`.
  const containerTitle = item.media.general.titleMetadata.value;
  const hints =
    fromFilename.titleGuess.length >= 3 || containerTitle === undefined
      ? fromFilename
      : extractIdentificationHints(containerTitle, item.folderName);

  const durationSeconds = item.media.general.durationSeconds.value;
  const audioLanguages = item.media.audio.flatMap((track) =>
    track.language.value === undefined ? [] : [track.language.value.base],
  );

  const outcome = await identifyContent(hints, provider, {
    ...(signal === undefined ? {} : { signal }),
    autoApplyBand: settings.autoApplyBand,
    ...(durationSeconds === undefined ? {} : { runtimeMinutes: Math.round(durationSeconds / 60) }),
    ...(audioLanguages.length === 0 ? {} : { audioLanguages }),
    ...(item.folderName === undefined ? {} : { parentFolderName: item.folderName }),
    ...(item.identification.reference === undefined
      ? {}
      : { previouslySelectedId: item.identification.reference.id }),
  });

  const identification = outcome.identification;
  return {
    ...item,
    identification,
    candidates: outcome.candidates,
    attempts: outcome.attempts,
    ...(outcome.error === undefined ? {} : { error: outcome.error.message }),
    name: buildMediaName(identification, item.media, nameOptions(settings)),
  };
};

/** Recalcula el nombre sin repetir análisis ni identificación. */
export const recomputeName = (item: MediaItem, settings: AppSettings): MediaItem => ({
  ...item,
  name: buildMediaName(item.identification, item.media, nameOptions(settings)),
});

export const withIdentification = (
  item: MediaItem,
  identification: ContentIdentification,
  settings: AppSettings,
): MediaItem => ({
  ...item,
  identification,
  name: buildMediaName(identification, item.media, nameOptions(settings)),
});

/**
 * Fija a mano la fuente y el tipo de lanzamiento (REMUX).
 *
 * No es un dato verificable en el archivo, así que ponerlo a mano es una vía
 * legítima: queda marcado como confirmado por la persona usuaria.
 */
export const withSource = (
  item: MediaItem,
  source: { media?: SourceMedia | undefined; type?: SourceType | undefined },
  settings: AppSettings,
): MediaItem => {
  const media: NormalizedMedia = {
    ...item.media,
    source: {
      media:
        source.media === undefined
          ? unknown<SourceMedia>("USER_INPUT", "Sin fuente")
          : userConfirmed(source.media, "Fuente indicada a mano"),
      type:
        source.type === undefined
          ? unknown<SourceType>("USER_INPUT", "Sin tipo de lanzamiento")
          : userConfirmed(source.type, "Tipo de lanzamiento indicado a mano"),
    },
  };
  return {
    ...item,
    media,
    name: buildMediaName(item.identification, media, nameOptions(settings)),
  };
};

const USER = "USER_CONFIRMED";

/**
 * Fusiona un resultado de análisis o identificación sobre el estado actual sin
 * pisar lo que la persona usuaria haya corregido mientras tanto.
 *
 * El análisis y la consulta a TMDb son asíncronos: sin esta fusión, una
 * respuesta tardía reemplazaba la fila entera con una copia anterior y borraba
 * el título, el año o la fuente recién escritos.
 */
export const preserveUserEdits = (
  current: MediaItem,
  incoming: MediaItem,
  settings: AppSettings,
): MediaItem => {
  const kept: Partial<ContentIdentification> = {};
  for (const field of [
    "spanishTitle",
    "originalTitle",
    "year",
    "season",
    "episode",
    "episodeEnd",
    "episodeTitle",
    "edition",
  ] as const) {
    if (current.identification[field].confidence === USER) {
      Object.assign(kept, { [field]: current.identification[field] });
    }
  }

  const identification: ContentIdentification = {
    ...incoming.identification,
    ...kept,
    ...(current.kindLocked ? { kind: current.identification.kind } : {}),
  };

  const source = {
    media:
      current.media.source.media.confidence === USER
        ? current.media.source.media
        : incoming.media.source.media,
    type:
      current.media.source.type.confidence === USER
        ? current.media.source.type
        : incoming.media.source.type,
  };
  const media: NormalizedMedia = { ...incoming.media, source };

  return {
    ...incoming,
    identification,
    media,
    kindLocked: current.kindLocked,
    nameOverride: current.nameOverride,
    name: buildMediaName(identification, media, nameOptions(settings)),
  };
};

/** Nombre que realmente se usará al renombrar. */
export const effectiveName = (item: MediaItem): string => item.nameOverride ?? item.name.filename;

/**
 * Fija a mano la variante del español en las pistas ambiguas.
 *
 * El contenedor suele traer `spa` a secas, que no dice si es castellano o
 * latino. Pedir que se confirme sin ofrecer dónde hacerlo era un callejón sin
 * salida: esto es la salida.
 */
export const withSpanishVariant = (
  item: MediaItem,
  variant: "castilian" | "latin",
  settings: AppSettings,
): MediaItem => {
  const media: NormalizedMedia = {
    ...item.media,
    audio: item.media.audio.map((track) => {
      const language = track.language.value;
      if (language?.base !== "es" || !language.regionAmbiguous) return track;
      return {
        ...track,
        language: userConfirmed(
          resolveSpanishVariant(language, variant),
          "Variante del español indicada a mano",
        ),
      };
    }),
  };

  return {
    ...item,
    media,
    name: buildMediaName(item.identification, media, nameOptions(settings)),
  };
};

/** ¿Hay alguna pista en español cuya región no se puede determinar? */
export const hasAmbiguousSpanish = (item: MediaItem): boolean =>
  item.media.audio.some(
    (track) => track.language.value?.base === "es" && track.language.value.regionAmbiguous,
  );
