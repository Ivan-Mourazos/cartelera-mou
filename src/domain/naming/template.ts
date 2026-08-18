/**
 * Motor de plantillas del nombre.
 *
 * Sustituye `{token}` por su valor y limpia el resultado: bloques `[…]` vacíos,
 * separadores `·` colgando, paréntesis sin año, tramos ` - ` sin contenido y
 * espacios repetidos. Un token sin valor nunca deja rastro en el nombre.
 */

export const INTERNAL_SEPARATOR = " · ";
export const LANGUAGE_SEPARATOR = "/";

export type NameTokenName =
  | "title"
  | "originalTitle"
  | "year"
  | "episode"
  | "episodeTitle"
  | "quality"
  | "resolutionLabel"
  | "source"
  | "videoCodec"
  | "bitDepth"
  | "videoCodecBitDepth"
  | "hdr"
  | "hdrShort"
  | "exactResolution"
  | "frameRate"
  | "container"
  | "edition"
  | "primaryAudio"
  | "primaryAudioShort"
  | "otherLanguages"
  | "otherLanguagesShort"
  | "subtitleLanguages"
  | "providerIdTag"
  | "providerIdBrace";

export type NameTokenValues = Partial<Record<NameTokenName, string>>;

export const ALL_NAME_TOKENS: readonly NameTokenName[] = [
  "title",
  "originalTitle",
  "year",
  "episode",
  "episodeTitle",
  "quality",
  "resolutionLabel",
  "source",
  "videoCodec",
  "bitDepth",
  "videoCodecBitDepth",
  "hdr",
  "hdrShort",
  "exactResolution",
  "frameRate",
  "container",
  "edition",
  "primaryAudio",
  "primaryAudioShort",
  "otherLanguages",
  "otherLanguagesShort",
  "subtitleLanguages",
  "providerIdTag",
  "providerIdBrace",
];

const TOKEN_PATTERN = /\{([a-zA-Z]+)\}/gu;

/** Tokens presentes en una plantilla, incluidos los no reconocidos. */
export const parseTemplateTokens = (template: string): readonly string[] => {
  const found: string[] = [];
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    const name = match[1];
    if (name !== undefined && !found.includes(name)) found.push(name);
  }
  return found;
};

export const unknownTemplateTokens = (template: string): readonly string[] =>
  parseTemplateTokens(template).filter(
    (token) => !(ALL_NAME_TOKENS as readonly string[]).includes(token),
  );

const cleanBracketGroups = (value: string): string =>
  value.replace(/\[([^\]]*)\]/gu, (_match, inner: string) => {
    const parts = inner
      .split("·")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return parts.length === 0 ? "" : `[${parts.join(INTERNAL_SEPARATOR)}]`;
  });

/**
 * Elimina los tramos ` - ` que se quedan sin contenido (por ejemplo un episodio
 * sin título). Solo actúa sobre la cabecera del nombre: los bloques `[…]` van
 * separados por espacios y no participan en esta unión.
 */
const dropEmptyDashChunks = (value: string): string => {
  const firstBlock = value.indexOf("[");
  const head = firstBlock < 0 ? value : value.slice(0, firstBlock);
  const tail = firstBlock < 0 ? "" : value.slice(firstBlock);

  const cleanedHead = head
    .split(/\s+-\s+/u)
    .map((chunk) => chunk.trim())
    // Un tramo que solo tiene guiones es el resto de un token vacío.
    .filter((chunk) => chunk.replace(/[-–\s]+/gu, "").length > 0)
    .join(" - ")
    .replace(/\s*[-–]+\s*$/u, "")
    .trim();

  if (tail.length === 0) return cleanedHead;
  return cleanedHead.length === 0 ? tail : `${cleanedHead} ${tail}`;
};

/**
 * Renderiza la plantilla. El resultado es solo el tronco del nombre: la
 * extensión se añade después para garantizar que nunca se pierde.
 */
export const renderNameTemplate = (template: string, values: NameTokenValues): string => {
  const substituted = template.replace(TOKEN_PATTERN, (_match, name: string) => {
    const value = values[name as NameTokenName];
    return value === undefined ? "" : value.trim();
  });

  return dropEmptyDashChunks(
    cleanBracketGroups(substituted)
      // Paréntesis vacíos cuando no hay año.
      .replace(/\(\s*\)/gu, "")
      // Llaves vacías (identificador de proveedor ausente).
      .replace(/\{\s*\}/gu, "")
      .replace(/\s+/gu, " ")
      .replace(/\s+([),\]])/gu, "$1")
      .replace(/([([])\s+/gu, "$1")
      .trim(),
  )
    .replace(/\s+/gu, " ")
    .replace(/[\s.]+$/u, "")
    .trim();
};
