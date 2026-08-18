import { formatEpisodeCode } from "../identification/hints";
import type { ContentIdentification } from "../identification/types";
import {
  DEFAULT_LANGUAGE_SEPARATOR,
  formatOtherLanguages,
  formatPrimaryAudio,
  selectAudio,
  type AudioSelection,
} from "../media/audio-selection";
import { languageNameLabel } from "../media/language";
import { isKnown, isUsableForName } from "../media/provenance";
import { composeSourceLabel, describeSourceDetail } from "../media/source";
import { applyNameBudget, type DroppableToken } from "./budget";
import { bitDepthLabel, hdrLabel, videoCodecLabel } from "./release-labels";
import type { NormalizedMedia, VideoTrackInfo } from "../media/types";
import { findPreset, type NamePresetId } from "./presets";
import { renderNameTemplate, type NameTokenValues } from "./template";
import {
  sanitizeWindowsFilenameComponent,
  sanitizeWindowsTitleComponent,
  validateWindowsFilename,
  type WindowsFilenameValidation,
} from "./windows-filename";

/** Objetivo del producto: nombres legibles, no del ancho de la pantalla. */
export const DEFAULT_TARGET_LENGTH = 120;

/** Tope duro de Windows por componente de nombre, en unidades UTF-16. */
const WINDOWS_COMPONENT_LIMIT = 255;

export interface NameBuildOptions {
  readonly presetId?: NamePresetId;
  readonly movieTemplate?: string;
  readonly episodeTemplate?: string;
  readonly includeProviderId?: boolean;
  readonly includeSubtitleLanguages?: boolean;
  /** La fuente nunca es verificable en el fichero; por eso se permite inferida. */
  readonly allowInferredSource?: boolean;
  /** Separador entre idiomas. `/` no es válido en un nombre de archivo. */
  readonly languageSeparator?: string;
  readonly parentPath?: string;
  /** Longitud objetivo del nombre. Los topes de Windows son aparte y duros. */
  readonly targetLength?: number;
}

export interface NameBuildResult {
  readonly filename: string;
  readonly stem: string;
  readonly extension: string;
  readonly tokens: NameTokenValues;
  readonly audio: AudioSelection;
  readonly validation: WindowsFilenameValidation;
  readonly warnings: readonly string[];
  /** Avisos de calidad de datos que la interfaz debe mostrar. */
  readonly alerts: readonly string[];
  /** Bloques descartados para no superar el presupuesto de longitud. */
  readonly droppedTokens: readonly DroppableToken[];
  readonly truncatedTitle: boolean;
}

const formatFrameRate = (frameRate: number | undefined): string | undefined => {
  if (frameRate === undefined) return undefined;
  const rounded = Math.round(frameRate * 1000) / 1000;
  return `${String(rounded)} fps`;
};

const videoTokens = (video: VideoTrackInfo | undefined): NameTokenValues => {
  if (video === undefined) return {};

  const tokens: NameTokenValues = {};
  const resolution = isUsableForName(video.resolution, { allowInferred: true })
    ? video.resolution.value
    : undefined;
  if (resolution !== undefined) {
    tokens.quality = resolution.quality;
    tokens.resolutionLabel = resolution.pixelLabel;
    tokens.exactResolution = `${String(resolution.width)}×${String(resolution.height)}`;
  }

  const codec = isUsableForName(video.codec) ? videoCodecLabel(video.codec.value) : undefined;
  if (codec !== undefined) tokens.videoCodec = codec;

  const bits = isUsableForName(video.bitDepth) ? bitDepthLabel(video.bitDepth.value) : undefined;
  if (bits !== undefined) tokens.bitDepth = bits;

  const hdr = isUsableForName(video.hdrFormats) ? hdrLabel(video.hdrFormats.value) : undefined;
  if (hdr !== undefined) tokens.hdrShort = hdr;

  const frameRate = isUsableForName(video.frameRate)
    ? formatFrameRate(video.frameRate.value)
    : undefined;
  if (frameRate !== undefined) tokens.frameRate = frameRate;

  return tokens;
};

const subtitleToken = (media: NormalizedMedia, separator: string): string | undefined => {
  const labels: string[] = [];
  for (const track of media.subtitles) {
    const language = track.language.value;
    if (language === undefined) continue;
    const label = languageNameLabel(language);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.length === 0 ? undefined : `Subs ${labels.join(separator)}`;
};

/**
 * Los datos de identificación (título, año, temporada, episodio, edición) sí
 * pueden proceder del nombre original: sin proveedor de metadata es la única
 * fuente disponible, y la interfaz muestra su confianza. Lo que nunca puede
 * venir del nombre es un dato técnico.
 */
/**
 * Los corchetes y paréntesis delimitan bloques de la plantilla: si un valor los
 * trae dentro (títulos sacados de nombres tipo `Serie [4k][Cap.202]`), el
 * renderizado se descuadra. Se retiran del valor, nunca de la plantilla.
 */
const asTextValue = (value: string): string =>
  sanitizeWindowsTitleComponent(
    value
      .replace(/[[\]()]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  ).value;

const identificationTokens = (
  identification: ContentIdentification,
  includeProviderId: boolean,
): NameTokenValues => {
  const tokens: NameTokenValues = {};

  const title = isKnown(identification.spanishTitle)
    ? identification.spanishTitle.value
    : undefined;
  if (title !== undefined) tokens.title = asTextValue(title);

  const originalTitle = isKnown(identification.originalTitle)
    ? identification.originalTitle.value
    : undefined;
  if (originalTitle !== undefined) {
    tokens.originalTitle = asTextValue(originalTitle);
  }

  if (isKnown(identification.year)) tokens.year = String(identification.year.value);

  const episode = formatEpisodeCode(
    isKnown(identification.season) ? identification.season.value : undefined,
    isKnown(identification.episode) ? identification.episode.value : undefined,
    isKnown(identification.episodeEnd) ? identification.episodeEnd.value : undefined,
  );
  if (episode !== undefined) tokens.episode = episode;

  if (isKnown(identification.episodeTitle)) {
    tokens.episodeTitle = asTextValue(identification.episodeTitle.value);
  }

  if (isKnown(identification.edition)) {
    tokens.edition = asTextValue(identification.edition.value);
  }

  const reference = identification.reference;
  if (includeProviderId && reference !== undefined) {
    tokens.providerIdTag = `ID-${String(reference.id)}`;
    tokens.providerIdBrace = `{${reference.provider}-${String(reference.id)}}`;
  }

  return tokens;
};

export const buildNameTokens = (
  identification: ContentIdentification,
  media: NormalizedMedia,
  options: NameBuildOptions = {},
): { tokens: NameTokenValues; audio: AudioSelection; alerts: string[] } => {
  const allowInferredSource = options.allowInferredSource ?? true;
  const alerts: string[] = [];

  const originalLanguage = isUsableForName(identification.originalLanguage)
    ? identification.originalLanguage.value
    : undefined;
  const audio = selectAudio(
    media,
    originalLanguage === undefined ? {} : { originalLanguageBase: originalLanguage },
  );

  const video = videoTokens(media.video[0]);
  const identity = identificationTokens(identification, options.includeProviderId ?? false);

  const sourceLabel = composeSourceLabel(media.source, { allowInferred: allowInferredSource });

  const separator = options.languageSeparator ?? DEFAULT_LANGUAGE_SEPARATOR;
  const sourceDetail = describeSourceDetail(media.source);
  const primaryAudio = formatPrimaryAudio(audio.primary);
  const primaryAudioShort = formatPrimaryAudio(audio.primary, { compact: true });
  const otherLanguages = formatOtherLanguages(audio.otherLanguages, { separator });
  const subtitles =
    options.includeSubtitleLanguages === true ? subtitleToken(media, separator) : undefined;
  const container = media.general.container.value;

  const tokens: NameTokenValues = {
    ...identity,
    ...video,
    ...(sourceLabel === undefined ? {} : { source: sourceLabel }),
    ...(primaryAudio === undefined ? {} : { primaryAudio }),
    ...(primaryAudioShort === undefined ? {} : { primaryAudioShort }),
    ...(otherLanguages === undefined
      ? {}
      : { otherLanguages, otherLanguagesShort: otherLanguages }),
    ...(subtitles === undefined ? {} : { subtitleLanguages: subtitles }),
    ...(container === undefined ? {} : { container }),
  };

  if (!audio.hasCastilian) alerts.push("No se ha detectado audio en castellano.");
  if (audio.hasSpanishOfUnknownRegion) {
    alerts.push(
      "Hay audio en español sin región determinable: márcalo manualmente como castellano o latino.",
    );
  }
  if (media.source.media.source === "DERIVED" && media.source.media.value !== undefined) {
    alerts.push(
      `Fuente deducida del bitrate: ${sourceDetail ?? media.source.media.value}. Confírmala si no es correcta.`,
    );
  }
  if (tokens.quality === undefined) {
    alerts.push("No se pudo determinar la resolución real: el bloque de vídeo se omite.");
  }
  if (tokens.title === undefined) {
    alerts.push("Sin título identificado: no se puede proponer un nombre.");
  }
  if (identification.kind === "series" && tokens.episode === undefined) {
    alerts.push("Parece un episodio pero no se ha determinado temporada y episodio.");
  }

  return { tokens, audio, alerts };
};

/**
 * Construye el nombre propuesto. La extensión se conserva siempre tal cual.
 */
export const buildMediaName = (
  identification: ContentIdentification,
  media: NormalizedMedia,
  options: NameBuildOptions = {},
): NameBuildResult => {
  const preset = findPreset(options.presetId ?? "professional");
  const { tokens, audio, alerts } = buildNameTokens(identification, media, options);

  const template =
    identification.kind === "series"
      ? (options.episodeTemplate ?? preset.episodeTemplate)
      : (options.movieTemplate ?? preset.movieTemplate);

  const render = (values: NameTokenValues): string => renderNameTemplate(template, values);
  const extension = media.general.extension.replace(/^\./u, "").toLowerCase();
  const budget = applyNameBudget(tokens, render, {
    targetLength: options.targetLength ?? DEFAULT_TARGET_LENGTH,
    hardLimit: WINDOWS_COMPONENT_LIMIT,
    extensionLength: extension.length === 0 ? 0 : extension.length + 1,
  });

  const sanitizedStem = sanitizeWindowsFilenameComponent(render(budget.tokens));
  const filename =
    extension.length === 0 ? sanitizedStem.value : `${sanitizedStem.value}.${extension}`;

  const validation = validateWindowsFilename(filename, {
    ...(options.parentPath === undefined ? {} : { parentPath: options.parentPath }),
  });

  const warnings = [
    ...sanitizedStem.changes.map((change) => `El nombre se saneó para Windows: ${change}.`),
    ...validation.issues.map((issue) => issue.message),
  ];

  const budgetAlerts = budget.truncatedTitle
    ? ["El título se ha recortado para no superar el límite del sistema de archivos."]
    : [];

  return {
    filename,
    stem: sanitizedStem.value,
    extension,
    tokens: budget.tokens,
    audio,
    validation,
    warnings,
    alerts: [...alerts, ...budgetAlerts],
    droppedTokens: budget.dropped,
    truncatedTitle: budget.truncatedTitle,
  };
};
