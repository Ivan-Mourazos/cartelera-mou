import { z } from "zod";

import { findPreset, type NamePresetId } from "../domain/naming/presets";

/**
 * Configuración persistente.
 *
 * Se guarda en `localStorage`. La clave de TMDb es la única información
 * sensible: en una aplicación de navegador sin backend no existe forma de
 * ocultarla, y la interfaz lo advierte explícitamente.
 */

const STORAGE_KEY = "renombrador.settings.v1";

const presetIds = ["professional", "compact", "media-server", "technical", "custom"] as const;

const settingsSchema = z.object({
  metadataLanguage: z.string().default("es-ES"),
  metadataRegion: z.string().default("ES"),
  presetId: z.enum(presetIds).default("professional"),
  customMovieTemplate: z.string().default(findPreset("professional").movieTemplate),
  customEpisodeTemplate: z.string().default(findPreset("professional").episodeTemplate),
  includeYear: z.boolean().default(true),
  includeQuality: z.boolean().default(true),
  includeSource: z.boolean().default(true),
  includeVideoCodec: z.boolean().default(true),
  includeBitDepth: z.boolean().default(true),
  includeHdr: z.boolean().default(true),
  includePrimaryAudio: z.boolean().default(true),
  includeOtherLanguages: z.boolean().default(true),
  includeSubtitleLanguages: z.boolean().default(false),
  includeProviderId: z.boolean().default(false),
  analysisConcurrency: z.number().int().min(1).max(8).default(2),
  autoApplyBand: z.enum(["high", "medium"]).default("high"),
  tmdbApiKey: z.string().default(""),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = settingsSchema.parse({});

export const loadSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Sin almacenamiento, la sesión sigue funcionando con la configuración en memoria.
  }
};

export const templatesFor = (
  settings: AppSettings,
): {
  readonly movieTemplate: string;
  readonly episodeTemplate: string;
  readonly presetId: NamePresetId;
} => {
  if (settings.presetId === "custom") {
    return {
      movieTemplate: settings.customMovieTemplate,
      episodeTemplate: settings.customEpisodeTemplate,
      presetId: "custom",
    };
  }
  const preset = findPreset(settings.presetId);
  return {
    movieTemplate: preset.movieTemplate,
    episodeTemplate: preset.episodeTemplate,
    presetId: preset.id,
  };
};
