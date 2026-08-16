import { normalizeLanguage } from "./language";
import { confirmed, unknown, type Traced } from "./provenance";
import { toFlag, toText, type RawTextTrack } from "./raw";
import type { NormalizedLanguage, SubtitleTrackInfo } from "./types";

const SOURCE = "TEXT_STREAM_METADATA" as const;

const HEARING_IMPAIRED_HINTS = [
  "sdh",
  "hearing impaired",
  "hard of hearing",
  "sordos",
  "personas sordas",
  "subtitulos para sordos",
];

const normalizeText = (value: string): string =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

export const isHearingImpairedTrack = (track: RawTextTrack): boolean => {
  const title = toText(track.Title);
  if (title === undefined) return false;
  const text = normalizeText(title);
  return HEARING_IMPAIRED_HINTS.some((hint) => text.includes(normalizeText(hint)));
};

const tracedText = (value: string | undefined): Traced<string> =>
  value === undefined ? unknown<string>(SOURCE) : confirmed(value, SOURCE);

const tracedFlag = (value: boolean | undefined): Traced<boolean> =>
  value === undefined ? unknown<boolean>(SOURCE) : confirmed(value, SOURCE);

export const normalizeSubtitleTrack = (track: RawTextTrack, index: number): SubtitleTrackInfo => {
  const title = toText(track.Title);
  const language = normalizeLanguage(toText(track.Language), title);

  return {
    index,
    language:
      language === undefined
        ? unknown<NormalizedLanguage>(SOURCE, "La pista no declara idioma")
        : confirmed(language, SOURCE, `Etiqueta de idioma ${language.tag}`),
    format: tracedText(toText(track.Format)),
    title: tracedText(title),
    isDefault: tracedFlag(toFlag(toText(track.Default))),
    isForced: tracedFlag(toFlag(toText(track.Forced))),
    isHearingImpaired: confirmed(
      isHearingImpairedTrack(track),
      SOURCE,
      "Analizado del título de la pista",
    ),
  };
};
