import { normalizeLanguage } from "./language";
import { confirmed, unknown, type Traced } from "./provenance";
import { toFlag, toInteger, toText, type RawAudioTrack } from "./raw";
import type { AudioCodecName, AudioTrackInfo, NormalizedLanguage } from "./types";

const SOURCE = "AUDIO_STREAM_METADATA" as const;

/**
 * Normalización de audio.
 *
 * MediaInfo nombra los formatos por su especificación (`AC-3`, `E-AC-3`,
 * `MLP FBA`, `DTS`) y reserva el nombre comercial para
 * `Format_Commercial_IfAny`. Atmos y DTS:X viajan además en
 * `Format_AdditionalFeatures` (`JOC`, `16-ch`, `XLL X`). Nunca se deducen del
 * nombre del fichero ni del códec base.
 */

const CODEC_BY_FORMAT: ReadonlyMap<string, AudioCodecName> = new Map([
  ["ac-3", "Dolby Digital"],
  ["ac3", "Dolby Digital"],
  ["e-ac-3", "Dolby Digital Plus"],
  ["eac3", "Dolby Digital Plus"],
  ["e-ac-3 joc", "Dolby Digital Plus"],
  ["mlp fba", "TrueHD"],
  ["truehd", "TrueHD"],
  ["mlp", "TrueHD"],
  ["dts", "DTS"],
  ["aac", "AAC"],
  ["aac lc", "AAC"],
  ["flac", "FLAC"],
  ["pcm", "PCM"],
  ["opus", "Opus"],
  ["vorbis", "Vorbis"],
  ["mpeg audio", "MP3"],
]);

const DTS_PROFILE_BY_KEYWORD: readonly (readonly [string, AudioCodecName])[] = [
  ["master audio", "DTS-HD MA"],
  ["ma / core", "DTS-HD MA"],
  ["ma", "DTS-HD MA"],
  ["high resolution", "DTS-HD HRA"],
  ["hra", "DTS-HD HRA"],
  ["es", "DTS-ES"],
];

const dtsVariant = (track: RawAudioTrack): AudioCodecName => {
  const profile = toText(track.Format_Profile)?.toLowerCase() ?? "";
  const commercial =
    toText(track.Format_Commercial_IfAny ?? track.Format_Commercial)?.toLowerCase() ?? "";
  const haystack = `${profile} ${commercial}`;

  for (const [keyword, codec] of DTS_PROFILE_BY_KEYWORD) {
    if (new RegExp(`\\b${keyword}\\b`, "u").test(haystack)) return codec;
  }
  return "DTS";
};

export const normalizeAudioCodec = (track: RawAudioTrack): AudioCodecName | undefined => {
  const format = toText(track.Format)?.toLowerCase();
  if (format === undefined) return undefined;

  if (format === "dts" || format.startsWith("dts")) return dtsVariant(track);

  const direct = CODEC_BY_FORMAT.get(format);
  if (direct !== undefined) return direct;

  if (format.includes("pcm")) return "PCM";
  if (format.includes("aac")) return "AAC";
  return undefined;
};

/** `true` solo con evidencia real de Dolby Atmos en la pista. */
export const detectAtmos = (track: RawAudioTrack): boolean => {
  const commercial =
    toText(track.Format_Commercial_IfAny ?? track.Format_Commercial)?.toLowerCase() ?? "";
  const additional = toText(track.Format_AdditionalFeatures)?.toLowerCase() ?? "";
  if (commercial.includes("atmos")) return true;
  // E-AC-3 con Joint Object Coding y TrueHD con 16 canales de objetos.
  if (additional.includes("joc")) return true;
  if (additional.includes("16-ch")) return true;
  return false;
};

/** `true` solo con evidencia real de DTS:X. DTS-HD MA por sí solo no lo es. */
export const detectDtsX = (track: RawAudioTrack): boolean => {
  const commercial =
    toText(track.Format_Commercial_IfAny ?? track.Format_Commercial)?.toLowerCase() ?? "";
  const additional = toText(track.Format_AdditionalFeatures)?.toLowerCase() ?? "";
  if (commercial.includes("dts:x") || commercial.includes("dts-x")) return true;
  return /\bxll\s*x\b/u.test(additional);
};

/**
 * Presentación de canales.
 *
 * Se prefiere el layout real: `L R C LFE Ls Rs` es 5.1, mientras que
 * `L R C Ls Rs Cs` son también 6 canales pero 6.0. Solo cuando no hay layout se
 * cae al recuento.
 */
export const formatChannels = (
  channels: number | undefined,
  layout: string | undefined,
): string | undefined => {
  const positions = toText(layout)
    ?.split(/\s+/u)
    .filter((part) => part.length > 0);

  if (positions !== undefined && positions.length > 0) {
    const lfe = positions.filter((position) => /lfe/iu.test(position)).length;
    const main = positions.length - lfe;
    return `${String(main)}.${String(lfe)}`;
  }

  if (channels === undefined || channels <= 0) return undefined;
  // Sin layout, el recuento solo permite una convención estándar.
  const fallback: Readonly<Record<number, string>> = {
    1: "1.0",
    2: "2.0",
    3: "2.1",
    4: "4.0",
    6: "5.1",
    7: "6.1",
    8: "7.1",
    10: "9.1",
  };
  return fallback[channels] ?? `${String(channels)}.0`;
};

const COMMENTARY_HINTS = [
  "commentary",
  "comentario",
  "comentarios",
  "director's commentary",
  "audiocomentario",
];

const DESCRIPTIVE_HINTS = [
  "audio description",
  "audiodescripcion",
  "audiodescripción",
  "descriptive",
  "described video",
  "visually impaired",
  "para personas ciegas",
];

const containsHint = (text: string | undefined, hints: readonly string[]): boolean => {
  if (text === undefined) return false;
  const normalized = text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  return hints.some((hint) =>
    normalized.includes(hint.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()),
  );
};

export const isCommentaryTrack = (track: RawAudioTrack): boolean =>
  containsHint(toText(track.Title), COMMENTARY_HINTS);

export const isDescriptiveAudioTrack = (track: RawAudioTrack): boolean =>
  containsHint(toText(track.Title), DESCRIPTIVE_HINTS);

const tracedText = (value: string | undefined): Traced<string> =>
  value === undefined ? unknown<string>(SOURCE) : confirmed(value, SOURCE);

const tracedNumber = (value: number | undefined): Traced<number> =>
  value === undefined ? unknown<number>(SOURCE) : confirmed(value, SOURCE);

const tracedFlag = (value: boolean | undefined): Traced<boolean> =>
  value === undefined ? unknown<boolean>(SOURCE) : confirmed(value, SOURCE);

export const normalizeAudioTrack = (track: RawAudioTrack, index: number): AudioTrackInfo => {
  const codec = normalizeAudioCodec(track);
  const channels = toInteger(track.Channels);
  const layout = toText(track.ChannelLayout ?? track.ChannelPositions);
  const channelLabel = formatChannels(channels, layout);
  const title = toText(track.Title);
  const language = normalizeLanguage(toText(track.Language), title);

  return {
    index,
    codec:
      codec === undefined
        ? unknown<AudioCodecName>(
            SOURCE,
            `Formato de audio no reconocido: ${toText(track.Format) ?? "sin dato"}`,
          )
        : confirmed(codec, SOURCE, `MediaInfo Format = ${toText(track.Format) ?? ""}`),
    commercialCodecName: tracedText(
      toText(track.Format_Commercial_IfAny ?? track.Format_Commercial),
    ),
    codecProfile: tracedText(toText(track.Format_Profile)),
    bitrate: tracedNumber(toInteger(track.BitRate)),
    sampleRate: tracedNumber(toInteger(track.SamplingRate)),
    bitDepth: tracedNumber(toInteger(track.BitDepth)),
    channels: tracedNumber(channels),
    channelLayout:
      channelLabel === undefined
        ? unknown<string>(SOURCE, "La pista no declara canales")
        : confirmed(
            channelLabel,
            SOURCE,
            layout === undefined
              ? `Derivado del recuento de canales (${String(channels ?? 0)})`
              : `Derivado del layout: ${layout}`,
          ),
    rawChannelLayout: tracedText(layout),
    language:
      language === undefined
        ? unknown<NormalizedLanguage>(SOURCE, "La pista no declara idioma")
        : confirmed(
            language,
            SOURCE,
            language.regionAmbiguous
              ? "Español sin región determinable: requiere confirmación manual"
              : `Etiqueta de idioma ${language.tag}`,
          ),
    title: tracedText(title),
    isDefault: tracedFlag(toFlag(toText(track.Default))),
    isForced: tracedFlag(toFlag(toText(track.Forced))),
    isCommentary: confirmed(isCommentaryTrack(track), SOURCE, "Analizado del título de la pista"),
    isDescriptiveAudio: confirmed(
      isDescriptiveAudioTrack(track),
      SOURCE,
      "Analizado del título de la pista",
    ),
    atmos: confirmed(
      detectAtmos(track),
      SOURCE,
      `Format_Commercial_IfAny/AdditionalFeatures = ${
        toText(track.Format_Commercial_IfAny ?? track.Format_Commercial) ?? "—"
      } / ${toText(track.Format_AdditionalFeatures) ?? "—"}`,
    ),
    dtsX: confirmed(detectDtsX(track), SOURCE, "Requiere XLL X o nombre comercial DTS:X"),
  };
};

/** Nombre del códec tal y como debe aparecer en el fichero, con audio espacial. */
export const formatAudioCodecForName = (
  codec: AudioCodecName | undefined,
  options: { readonly atmos: boolean; readonly dtsX: boolean },
): string | undefined => {
  if (codec === undefined) return undefined;
  if (options.dtsX) return "DTS:X";
  if (!options.atmos) return codec;
  if (codec === "TrueHD") return "TrueHD Atmos";
  if (codec === "Dolby Digital Plus") return "Dolby Digital Plus Atmos";
  if (codec === "Dolby Digital") return "Dolby Digital Atmos";
  return `${codec} Atmos`;
};
