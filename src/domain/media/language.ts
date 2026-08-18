import type { NormalizedLanguage } from "./types";

/**
 * Normalización de idiomas.
 *
 * Regla central del producto: `spa` NO es castellano. Un contenedor puede traer
 * `spa` para castellano de España, para español latino o para español sin marcar.
 * Solo se etiqueta `ESP` o `LAT` cuando hay evidencia real (subetiqueta de región
 * BCP-47 o título de pista explícito). En caso contrario la región queda
 * ambigua, la interfaz lo advierte y el nombre no puede afirmar `ESP`.
 */

interface LanguageDefinition {
  readonly base: string;
  readonly label: string;
  readonly display: string;
}

const BY_BASE: ReadonlyMap<string, LanguageDefinition> = new Map([
  ["es", { base: "es", label: "SPA", display: "Español" }],
  ["en", { base: "en", label: "ENG", display: "Inglés" }],
  ["fr", { base: "fr", label: "FRA", display: "Francés" }],
  ["de", { base: "de", label: "DEU", display: "Alemán" }],
  ["it", { base: "it", label: "ITA", display: "Italiano" }],
  ["pt", { base: "pt", label: "POR", display: "Portugués" }],
  ["ja", { base: "ja", label: "JPN", display: "Japonés" }],
  ["ko", { base: "ko", label: "KOR", display: "Coreano" }],
  ["zh", { base: "zh", label: "ZHO", display: "Chino" }],
  ["ru", { base: "ru", label: "RUS", display: "Ruso" }],
  ["gl", { base: "gl", label: "GLG", display: "Gallego" }],
  ["ca", { base: "ca", label: "CAT", display: "Catalán" }],
  ["eu", { base: "eu", label: "EUS", display: "Euskera" }],
  ["nl", { base: "nl", label: "NLD", display: "Neerlandés" }],
  ["sv", { base: "sv", label: "SWE", display: "Sueco" }],
  ["da", { base: "da", label: "DAN", display: "Danés" }],
  ["no", { base: "no", label: "NOR", display: "Noruego" }],
  ["fi", { base: "fi", label: "FIN", display: "Finés" }],
  ["pl", { base: "pl", label: "POL", display: "Polaco" }],
  ["tr", { base: "tr", label: "TUR", display: "Turco" }],
  ["ar", { base: "ar", label: "ARA", display: "Árabe" }],
  ["hi", { base: "hi", label: "HIN", display: "Hindi" }],
  ["cs", { base: "cs", label: "CES", display: "Checo" }],
  ["hu", { base: "hu", label: "HUN", display: "Húngaro" }],
  ["el", { base: "el", label: "ELL", display: "Griego" }],
  ["he", { base: "he", label: "HEB", display: "Hebreo" }],
  ["th", { base: "th", label: "THA", display: "Tailandés" }],
  ["uk", { base: "uk", label: "UKR", display: "Ucraniano" }],
  ["ro", { base: "ro", label: "RON", display: "Rumano" }],
  ["la", { base: "la", label: "LAT-LANG", display: "Latín" }],
]);

/** ISO 639-2/B y 639-2/T hacia ISO 639-1. */
const ISO3_TO_ISO1: ReadonlyMap<string, string> = new Map([
  ["spa", "es"],
  ["esp", "es"],
  ["eng", "en"],
  ["fra", "fr"],
  ["fre", "fr"],
  ["deu", "de"],
  ["ger", "de"],
  ["ita", "it"],
  ["por", "pt"],
  ["jpn", "ja"],
  ["kor", "ko"],
  ["zho", "zh"],
  ["chi", "zh"],
  ["rus", "ru"],
  ["glg", "gl"],
  ["gal", "gl"],
  ["cat", "ca"],
  ["eus", "eu"],
  ["baq", "eu"],
  ["nld", "nl"],
  ["dut", "nl"],
  ["swe", "sv"],
  ["dan", "da"],
  ["nor", "no"],
  ["fin", "fi"],
  ["pol", "pl"],
  ["tur", "tr"],
  ["ara", "ar"],
  ["hin", "hi"],
  ["ces", "cs"],
  ["cze", "cs"],
  ["hun", "hu"],
  ["ell", "el"],
  ["gre", "el"],
  ["heb", "he"],
  ["tha", "th"],
  ["ukr", "uk"],
  ["ron", "ro"],
  ["rum", "ro"],
  ["lat", "la"],
]);

const stripDiacritics = (value: string): string =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

const LATIN_AMERICAN_REGIONS = new Set([
  "419",
  "mx",
  "ar",
  "co",
  "cl",
  "pe",
  "ve",
  "uy",
  "py",
  "bo",
  "ec",
  "cr",
  "pa",
  "do",
  "gt",
  "hn",
  "ni",
  "sv",
  "cu",
  "pr",
]);

/** Pistas textuales que identifican castellano de España sin ambigüedad. */
const CASTILIAN_TITLE_HINTS = [
  "castellano",
  "espana",
  "espanol de espana",
  "espanol castellano",
  "iberico",
  "european spanish",
  "spanish castilian",
  "castilian",
];

/** Pistas textuales que identifican español latino sin ambigüedad. */
const LATIN_TITLE_HINTS = [
  "latino",
  "latinoamericano",
  "hispanoamericano",
  "latin american spanish",
  "latin spanish",
  "espanol latino",
  "mexicano",
  "argentino",
];

export type SpanishVariantHint = "castilian" | "latin" | "none";

/** Analiza un texto (título de pista o nombre de archivo) buscando la variante. */
export const spanishVariantFromTitle = (title: string | undefined): SpanishVariantHint => {
  if (title === undefined) return "none";
  const text = stripDiacritics(title);
  const latin = LATIN_TITLE_HINTS.some((hint) => text.includes(hint));
  const castilian = CASTILIAN_TITLE_HINTS.some((hint) => text.includes(hint));
  // Si aparecen las dos, no hay evidencia clara de ninguna.
  if (latin && castilian) return "none";
  if (latin) return "latin";
  if (castilian) return "castilian";
  return "none";
};

/**
 * Reetiqueta una pista de español sin región usando una pista externa (el nombre
 * del archivo). Es evidencia débil, así que quien la use debe marcarla como
 * inferida; si no hay variante clara, el idioma se deja como estaba.
 */
export const resolveSpanishVariant = (
  language: NormalizedLanguage,
  variant: SpanishVariantHint,
): NormalizedLanguage => {
  if (variant === "none" || language.base !== "es" || !language.regionAmbiguous) return language;
  return spanishLanguage(language.tag, undefined, variant);
};

const parseTag = (raw: string): { base: string; region?: string } | undefined => {
  const cleaned = stripDiacritics(raw).replace(/_/gu, "-").trim();
  if (cleaned.length === 0) return undefined;
  if (cleaned === "und" || cleaned === "undefined" || cleaned === "mul" || cleaned === "zxx") {
    return undefined;
  }

  const [rawBase, ...rest] = cleaned.split("-");
  if (rawBase === undefined) return undefined;

  const base = rawBase.length === 3 ? (ISO3_TO_ISO1.get(rawBase) ?? rawBase) : rawBase;
  if (base.length < 2) return undefined;

  // La región es la primera subetiqueta de 2 letras o 3 dígitos (BCP-47).
  const region = rest.find((part) => /^[a-z]{2}$/u.test(part) || /^\d{3}$/u.test(part));
  return region === undefined ? { base } : { base, region };
};

const spanishLanguage = (
  tag: string,
  region: string | undefined,
  variant: SpanishVariantHint,
): NormalizedLanguage => {
  const isLatinRegion = region !== undefined && LATIN_AMERICAN_REGIONS.has(region);
  const isSpainRegion = region === "es";

  if (variant === "latin" || isLatinRegion) {
    return {
      tag: region === undefined ? "es-419" : `es-${region.toUpperCase()}`,
      base: "es",
      ...(region === undefined ? {} : { region: region.toUpperCase() }),
      label: "LAT",
      display: "Español latino",
      regionAmbiguous: false,
    };
  }

  if (variant === "castilian" || isSpainRegion) {
    return {
      tag: "es-ES",
      base: "es",
      region: "ES",
      label: "ESP",
      display: "Castellano (España)",
      regionAmbiguous: false,
    };
  }

  return {
    tag,
    base: "es",
    label: "SPA",
    display: "Español — región desconocida",
    regionAmbiguous: true,
  };
};

/**
 * Normaliza una etiqueta de idioma usando, si existen, el título de la pista
 * como evidencia adicional para la variante del español.
 */
export const normalizeLanguage = (
  rawTag: string | undefined,
  trackTitle?: string,
): NormalizedLanguage | undefined => {
  const variant = spanishVariantFromTitle(trackTitle);
  const parsed = rawTag === undefined ? undefined : parseTag(rawTag);

  if (parsed === undefined) {
    // Sin etiqueta de idioma, el título de pista puede seguir siendo evidencia.
    if (variant === "none") return undefined;
    return spanishLanguage("es", undefined, variant);
  }

  if (parsed.base === "es") {
    return spanishLanguage(
      parsed.region === undefined ? "es" : `es-${parsed.region.toUpperCase()}`,
      parsed.region,
      variant,
    );
  }

  const definition = BY_BASE.get(parsed.base);
  const label = definition?.label ?? parsed.base.toUpperCase();
  const display = definition?.display ?? parsed.base.toUpperCase();
  const tag =
    parsed.region === undefined ? parsed.base : `${parsed.base}-${parsed.region.toUpperCase()}`;

  return {
    tag,
    base: parsed.base,
    ...(parsed.region === undefined ? {} : { region: parsed.region.toUpperCase() }),
    label,
    display,
    regionAmbiguous: false,
  };
};

/** Etiqueta corta segura para el nombre: nunca afirma región si es ambigua. */
export const languageNameLabel = (language: NormalizedLanguage): string =>
  language.regionAmbiguous && language.base === "es" ? "SPA" : language.label;

/**
 * Nombre del idioma tal y como se escribe en las publicaciones en español:
 * «Castellano», «Latino», «Inglés»… Se usa para la pista principal, que es la
 * que interesa leer de un vistazo. Sigue sin afirmar la región si no consta: en
 * ese caso pone «Español» a secas.
 */
export const languageFilenameLabel = (language: NormalizedLanguage): string => {
  if (language.base === "es") {
    if (language.label === "ESP") return "Castellano";
    if (language.label === "LAT") return "Latino";
    return "Español";
  }
  return language.display;
};

export const isCastilian = (language: NormalizedLanguage | undefined): boolean =>
  language?.base === "es" && language.label === "ESP";

/**
 * Abreviatura de tres letras para el resumen de idiomas secundarios. Nunca
 * afirma la región del español si no consta.
 */
export const otherLanguageLabel = (language: NormalizedLanguage): string =>
  languageNameLabel(language);
