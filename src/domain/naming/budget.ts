import type { NameTokenValues } from "./template";

/**
 * Presupuesto de longitud del nombre.
 *
 * Windows admite 255 unidades UTF-16 por componente de nombre y 259 en la ruta
 * completa clásica, pero un nombre de 250 caracteres es inmanejable. El producto
 * fija un objetivo cómodo y descarta información por orden de menor valor hasta
 * entrar. Título, año, código de episodio y resolución no se descartan nunca:
 * son la identidad del archivo.
 */

export type DroppableToken =
  | "otherLanguages"
  | "bitDepth"
  | "hdrShort"
  | "videoCodec"
  | "primaryAudioChannels"
  | "quality";

export const DROP_ORDER: readonly DroppableToken[] = [
  "otherLanguages",
  "bitDepth",
  "hdrShort",
  "videoCodec",
  "primaryAudioChannels",
  "quality",
];

export interface NameBudgetOptions {
  /** Longitud deseada del nombre, extensión incluida. */
  readonly targetLength: number;
  /** Tope absoluto impuesto por el sistema de archivos. */
  readonly hardLimit: number;
  /** Longitud de `.mkv`, punto incluido. */
  readonly extensionLength: number;
}

export interface NameBudgetResult {
  readonly tokens: NameTokenValues;
  readonly dropped: readonly DroppableToken[];
  readonly truncatedTitle: boolean;
}

/** `Castellano TrueHD Atmos 7.1` ⇒ se recortan solo los canales del final. */
const CHANNELS_PATTERN = /\s\d+\.\d+$/u;

const withoutToken = (tokens: NameTokenValues, token: DroppableToken): NameTokenValues => {
  if (token === "primaryAudioChannels") {
    const primary = tokens.primaryAudio;
    if (primary === undefined) return tokens;
    return { ...tokens, primaryAudio: primary.replace(CHANNELS_PATTERN, "") };
  }
  const next = { ...tokens };
  delete next[token];
  return next;
};

/**
 * Recorta el título palabra a palabra midiendo el nombre completo en cada paso.
 * Estimar por diferencia de longitudes no vale: los bloques fijos también
 * cuentan y el renderizado colapsa espacios.
 */
const truncateTitleToFit = (
  tokens: NameTokenValues,
  fits: (values: NameTokenValues) => boolean,
): NameTokenValues => {
  const title = tokens.title;
  if (title === undefined) return tokens;

  const words = title.split(" ");
  let candidate = tokens;
  while (words.length > 1 && !fits(candidate)) {
    words.pop();
    candidate = { ...tokens, title: words.join(" ").replace(/[\s.,;:–-]+$/u, "") };
  }
  return candidate;
};

export const applyNameBudget = (
  tokens: NameTokenValues,
  render: (values: NameTokenValues) => string,
  options: NameBudgetOptions,
): NameBudgetResult => {
  const totalLength = (values: NameTokenValues): number =>
    render(values).length + options.extensionLength;

  let current = tokens;
  const dropped: DroppableToken[] = [];

  for (const token of DROP_ORDER) {
    if (totalLength(current) <= options.targetLength) break;
    const next = withoutToken(current, token);
    // Un token que ya faltaba no cuenta como descarte.
    if (render(next) === render(current)) continue;
    current = next;
    dropped.push(token);
  }

  if (totalLength(current) > options.hardLimit && current.title !== undefined) {
    const truncated = truncateTitleToFit(
      current,
      (values) => totalLength(values) <= options.hardLimit,
    );
    return { tokens: truncated, dropped, truncatedTitle: truncated.title !== current.title };
  }

  return { tokens: current, dropped, truncatedTitle: false };
};
