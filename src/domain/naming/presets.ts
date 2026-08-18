export type NamePresetId = "professional" | "compact" | "media-server" | "technical" | "custom";

export interface NamePreset {
  readonly id: NamePresetId;
  readonly label: string;
  readonly description: string;
  readonly movieTemplate: string;
  readonly episodeTemplate: string;
}

const VIDEO_BLOCK = "[{quality} {resolutionLabel} {source} {videoCodec} {bitDepth} {hdrShort}]";
const AUDIO_BLOCK = "[{primaryAudio} · {otherLanguages}]";

const PROFESSIONAL_MOVIE = `{title} ({year}) ${VIDEO_BLOCK} ${AUDIO_BLOCK}`;

const PROFESSIONAL_EPISODE = `{title} ({year}) - {episode} - {episodeTitle} ${VIDEO_BLOCK} ${AUDIO_BLOCK}`;

export const NAME_PRESETS: readonly NamePreset[] = [
  {
    id: "professional",
    label: "Profesional",
    description:
      "Preset predeterminado. Clase comercial, resolución, fuente, códec, bits y HDR; después el audio principal y el resto de idiomas.",
    movieTemplate: PROFESSIONAL_MOVIE,
    episodeTemplate: PROFESSIONAL_EPISODE,
  },
  {
    id: "compact",
    label: "Compacto",
    description: "Nombres cortos: solo resolución y fuente, y el audio principal abreviado.",
    movieTemplate: "{title} ({year}) [{resolutionLabel} {source}] [{primaryAudioShort}]",
    episodeTemplate:
      "{title} ({year}) - {episode} - {episodeTitle} [{resolutionLabel} {source}] [{primaryAudioShort}]",
  },
  {
    id: "media-server",
    label: "Media server",
    description:
      "Pensado para Plex, Jellyfin y Emby: título, año e identificador del proveedor entre llaves, con la información técnica al final.",
    movieTemplate:
      "{title} ({year}) {providerIdBrace} - [{quality} {resolutionLabel} {source} {videoCodec} {bitDepth} {hdrShort}]",
    episodeTemplate:
      "{title} ({year}) - {episode} - {episodeTitle} - [{quality} {resolutionLabel} {source} {videoCodec}]",
  },
  {
    id: "technical",
    label: "Técnico",
    description:
      "Añade resolución exacta, fotogramas por segundo, edición e identificador del proveedor.",
    movieTemplate:
      "{title} ({year}) [{edition}] [{quality} {resolutionLabel} {source} {videoCodec} {bitDepth} {hdrShort} · {exactResolution} · {frameRate}] [{primaryAudio} · {otherLanguages}] [{subtitleLanguages}] [{providerIdTag}]",
    episodeTemplate:
      "{title} ({year}) - {episode} - {episodeTitle} [{quality} {resolutionLabel} {source} {videoCodec} {bitDepth} {hdrShort} · {exactResolution} · {frameRate}] [{primaryAudio} · {otherLanguages}] [{providerIdTag}]",
  },
  {
    id: "custom",
    label: "Personalizado",
    description: "Plantillas libres definidas en la configuración.",
    movieTemplate: PROFESSIONAL_MOVIE,
    episodeTemplate: PROFESSIONAL_EPISODE,
  },
];

export const findPreset = (id: NamePresetId): NamePreset =>
  NAME_PRESETS.find((preset) => preset.id === id) ?? {
    id: "professional",
    label: "Profesional",
    description: "",
    movieTemplate: PROFESSIONAL_MOVIE,
    episodeTemplate: PROFESSIONAL_EPISODE,
  };
