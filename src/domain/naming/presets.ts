export type NamePresetId = "professional" | "compact" | "media-server" | "technical" | "custom";

export interface NamePreset {
  readonly id: NamePresetId;
  readonly label: string;
  readonly description: string;
  readonly movieTemplate: string;
  readonly episodeTemplate: string;
}

const PROFESSIONAL_MOVIE =
  "{title} ({year}) [{qualitySource} · {videoCodecBitDepth} · {hdr}] [{primaryAudio} · {otherLanguages}]";

const PROFESSIONAL_EPISODE =
  "{title} ({year}) - {episode} - {episodeTitle} [{qualitySource} · {videoCodecBitDepth} · {hdr}] [{primaryAudio} · {otherLanguages}]";

export const NAME_PRESETS: readonly NamePreset[] = [
  {
    id: "professional",
    label: "Profesional",
    description:
      "Preset predeterminado. Calidad + fuente, códec con profundidad de bits, HDR, audio principal completo y resumen del resto de idiomas.",
    movieTemplate: PROFESSIONAL_MOVIE,
    episodeTemplate: PROFESSIONAL_EPISODE,
  },
  {
    id: "compact",
    label: "Compacto",
    description: "Nombres más cortos: HDR y audio abreviados, idiomas sin la palabra «Otros».",
    movieTemplate:
      "{title} ({year}) [{qualitySource} · {hdrShort}] [{primaryAudioShort} · {otherLanguagesShort}]",
    episodeTemplate:
      "{title} ({year}) - {episode} - {episodeTitle} [{qualitySource} · {hdrShort}] [{primaryAudioShort} · {otherLanguagesShort}]",
  },
  {
    id: "media-server",
    label: "Media server",
    description:
      "Pensado para Plex, Jellyfin y Emby: título, año e identificador del proveedor entre llaves, con la información técnica al final.",
    movieTemplate:
      "{title} ({year}) {providerIdBrace} - [{qualitySource} · {videoCodecBitDepth} · {hdr}]",
    episodeTemplate:
      "{title} ({year}) - {episode} - {episodeTitle} - [{qualitySource} · {videoCodecBitDepth}]",
  },
  {
    id: "technical",
    label: "Técnico",
    description:
      "Añade resolución exacta, fotogramas por segundo, edición e identificador del proveedor.",
    movieTemplate:
      "{title} ({year}) [{edition}] [{qualitySource} · {videoCodecBitDepth} · {hdr} · {exactResolution} · {frameRate}] [{primaryAudio} · {otherLanguages}] [{subtitleLanguages}] [{providerIdTag}]",
    episodeTemplate:
      "{title} ({year}) - {episode} - {episodeTitle} [{qualitySource} · {videoCodecBitDepth} · {hdr} · {exactResolution} · {frameRate}] [{primaryAudio} · {otherLanguages}] [{providerIdTag}]",
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
