import type {
  AudioCodec,
  HdrFormat,
  MediaSource,
  ReleaseType,
  Resolution,
  SpatialAudio,
  SpecialEdition,
  VideoCodec,
} from "../metadata";
import {
  sanitizeWindowsFilenameComponent,
  sanitizeWindowsTitleComponent,
  validateWindowsFilename,
  type WindowsFilenameValidation,
  type WindowsSanitizationChange,
} from "./windows-filename";

export type NamingTagKind =
  | "resolution"
  | "source"
  | "releaseType"
  | "videoCodec"
  | "bitDepth"
  | "dolbyVision"
  | "dolbyVisionProfile"
  | "hdr"
  | "audioCodec"
  | "spatialAudio"
  | "channels"
  | "audioLanguage"
  | "subtitleLanguage"
  | "edition"
  | "identifier";

export const DEFAULT_NAMING_ORDER: readonly NamingTagKind[] = [
  "resolution",
  "source",
  "releaseType",
  "videoCodec",
  "bitDepth",
  "dolbyVision",
  "dolbyVisionProfile",
  "hdr",
  "audioCodec",
  "spatialAudio",
  "channels",
  "audioLanguage",
  "subtitleLanguage",
  "edition",
  "identifier",
];

export const DEFAULT_NAMING_TEMPLATE = "{title} ({year}) {tags}";

export interface MediaNamingInput {
  readonly title: string;
  readonly year?: number;
  readonly resolution?: Resolution;
  readonly source?: MediaSource;
  readonly releaseType?: ReleaseType;
  readonly videoCodec?: VideoCodec;
  readonly bitDepth?: number;
  readonly dolbyVision?: boolean;
  readonly dolbyVisionProfile?: string;
  readonly hdrFormats?: readonly HdrFormat[];
  readonly audioCodec?: AudioCodec;
  readonly spatialAudio?: SpatialAudio;
  readonly channels?: string;
  readonly audioLanguages?: readonly string[];
  readonly subtitleLanguages?: readonly string[];
  readonly editions?: readonly SpecialEdition[];
  readonly tmdbId?: number;
  readonly extension: string;
}

export interface NamingOptions {
  readonly includeIdentifier?: boolean;
  readonly tagOrder?: readonly NamingTagKind[];
  readonly enabledTags?: readonly NamingTagKind[];
  readonly template?: string;
  readonly parentPath?: string;
  readonly maxPathUtf16?: number;
}

export interface GeneratedMediaFilename {
  readonly filename: string;
  readonly tags: readonly string[];
  readonly sanitizationChanges: readonly WindowsSanitizationChange[];
  readonly warnings: readonly string[];
  readonly validation: WindowsFilenameValidation;
}

const compactUnique = (values: readonly (string | undefined)[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of values) {
    const value = candidate?.trim();
    if (value !== undefined && value.length > 0 && !seen.has(value)) {
      result.push(value);
      seen.add(value);
    }
  }
  return result;
};

const toLanguageCode = (language: string): string => {
  const upper = language.trim().toUpperCase();
  if (["SPA", "ESP", "CAST", "ES", "CASTELLANO"].includes(upper)) return "ES";
  if (["ENG", "EN", "INGLES"].includes(upper)) return "EN";
  if (["GLG", "GAL", "GALLEGO"].includes(upper)) return "GAL";
  if (["CAT", "CA", "CATALAN"].includes(upper)) return "CAT";
  if (["FRA", "FRE", "FR", "FRANCES"].includes(upper)) return "FR";
  if (["DEU", "GER", "DE", "ALEMAN"].includes(upper)) return "DE";
  if (["ITA", "IT", "ITALIANO"].includes(upper)) return "IT";
  if (["POR", "PT", "PORTUGUES"].includes(upper)) return "PT";
  if (["JPN", "JA", "JAPONES"].includes(upper)) return "JA";
  return upper;
};

const renderNamingTemplate = (
  template: string | undefined,
  values: { readonly title: string; readonly year: string; readonly tags: string },
): string => {
  const trimmedTemplate = template?.trim();
  const selectedTemplate =
    trimmedTemplate === undefined || trimmedTemplate.length === 0
      ? DEFAULT_NAMING_TEMPLATE
      : trimmedTemplate;
  const rendered = selectedTemplate
    .replaceAll("{title}", values.title)
    .replaceAll("{year}", values.year)
    .replaceAll("{tags}", values.tags)
    .replace(/\(\s*\)/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return rendered || values.title;
};

const tagsByKind = (
  input: MediaNamingInput,
  includeIdentifier: boolean,
): Readonly<Record<NamingTagKind, readonly string[]>> => ({
  resolution: compactUnique([input.resolution]),
  source: compactUnique([input.source]),
  releaseType: compactUnique([input.releaseType]),
  videoCodec: compactUnique([input.videoCodec]),
  bitDepth: compactUnique([input.bitDepth === undefined ? undefined : `${input.bitDepth}-bit`]),
  dolbyVision: input.dolbyVision === true ? ["Dolby Vision"] : [],
  dolbyVisionProfile:
    input.dolbyVision === true && input.dolbyVisionProfile !== undefined
      ? compactUnique([`Profile ${input.dolbyVisionProfile}`])
      : [],
  hdr: compactUnique(input.hdrFormats ?? []),
  audioCodec: compactUnique([input.audioCodec]),
  spatialAudio: compactUnique([input.spatialAudio]),
  channels: compactUnique([input.channels]),
  audioLanguage: compactUnique((input.audioLanguages ?? []).map(toLanguageCode)),
  subtitleLanguage: compactUnique(
    (input.subtitleLanguages ?? [])
      .map(toLanguageCode)
      .filter((language) => language.length > 0)
      .map((language) => `subs ${language}`),
  ),
  edition: compactUnique(input.editions ?? []),
  identifier:
    includeIdentifier && input.tmdbId !== undefined ? compactUnique([`ID-${input.tmdbId}`]) : [],
});

export const generateMediaFilename = (
  input: MediaNamingInput,
  options: NamingOptions = {},
): GeneratedMediaFilename => {
  const sanitizedTitle = sanitizeWindowsTitleComponent(input.title.trim());
  const rawExtension = input.extension.replace(/^\./u, "").toLowerCase();
  const extension =
    rawExtension.length === 0
      ? { value: "", changes: [] as readonly WindowsSanitizationChange[] }
      : sanitizeWindowsFilenameComponent(rawExtension);
  const groupedTags = tagsByKind(input, options.includeIdentifier ?? false);
  const requestedOrder = options.tagOrder ?? DEFAULT_NAMING_ORDER;
  const normalizedOrder = [
    ...new Set([
      ...requestedOrder.filter((kind) => DEFAULT_NAMING_ORDER.includes(kind)),
      ...DEFAULT_NAMING_ORDER,
    ]),
  ];
  const enabledTags = new Set(options.enabledTags ?? DEFAULT_NAMING_ORDER);
  const rawTags = compactUnique(
    normalizedOrder.filter((kind) => enabledTags.has(kind)).flatMap((kind) => groupedTags[kind]),
  );
  const tagSanitizationChanges: WindowsSanitizationChange[] = [];
  const tags = compactUnique(
    rawTags.flatMap((tag) => {
      const withoutDelimiters = tag
        .replaceAll("[", " ")
        .replaceAll("]", " ")
        .replace(/\s+/gu, " ")
        .trim();
      if (withoutDelimiters.length === 0) return [];
      if (withoutDelimiters !== tag) {
        tagSanitizationChanges.push("invalid-characters-replaced");
      }
      const sanitized = sanitizeWindowsFilenameComponent(withoutDelimiters);
      tagSanitizationChanges.push(...sanitized.changes);
      return sanitized.value === "_" ? [] : [sanitized.value];
    }),
  );
  const year = input.year === undefined ? "" : String(input.year);
  const renderedTags = tags.map((tag) => `[${tag}]`).join(" ");
  const stem = renderNamingTemplate(options.template, {
    title: sanitizedTitle.value,
    year,
    tags: renderedTags,
  });
  const filename = `${stem}${extension.value.length === 0 ? "" : `.${extension.value}`}`;
  const validation = validateWindowsFilename(filename, {
    ...(options.parentPath === undefined ? {} : { parentPath: options.parentPath }),
    ...(options.maxPathUtf16 === undefined ? {} : { maxPathUtf16: options.maxPathUtf16 }),
  });
  const sanitizationChanges = [
    ...sanitizedTitle.changes,
    ...tagSanitizationChanges,
    ...extension.changes,
  ];
  const warnings = [
    ...sanitizationChanges.map((change) => `El nombre fue saneado: ${change}.`),
    ...validation.issues.map((issue) => issue.message),
  ];

  return { filename, tags, sanitizationChanges, warnings, validation };
};
