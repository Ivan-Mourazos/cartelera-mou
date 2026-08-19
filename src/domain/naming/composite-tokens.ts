import type { MediaSource, Resolution } from "../metadata";

/**
 * Etiquetas de publicación pegadas en un solo token.
 *
 * Las webs españolas no separan nada: `4Kremux2160`, `BDR1080`, `HD4K`,
 * `MicroHD1080`. El tokenizador ve una sola palabra y, al no reconocerla, la
 * daba por parte del título — así que el título viajaba a TMDb con basura
 * pegada y no encontraba la película.
 *
 * Aquí se intenta descomponer el token en piezas conocidas. Solo cuenta si
 * TODAS las piezas son de publicación: `Eternals` no se descompone, `HD4K` sí.
 */

interface Atom {
  readonly pattern: RegExp;
  readonly resolution?: Resolution;
  readonly source?: MediaSource;
  readonly remux?: boolean;
}

/** Piezas reconocidas, de la más larga a la más corta para no cortar de más. */
const ATOMS: readonly Atom[] = [
  { pattern: /^microhd/u, source: "microHD" },
  { pattern: /^hdtvrip/u, source: "HDTVRip" },
  { pattern: /^uhdrip/u, source: "UHDRip" },
  { pattern: /^hdrip/u, source: "HDRip" },
  { pattern: /^dvdscr/u, source: "DVDScr" },
  { pattern: /^bluray/u, source: "BluRay" },
  { pattern: /^bdrip/u, source: "BDRip" },
  { pattern: /^brrip/u, source: "BRRip" },
  { pattern: /^webrip/u, source: "WEBRip" },
  { pattern: /^webdl/u, source: "WEB-DL" },
  { pattern: /^hdtv/u, source: "HDTV" },
  { pattern: /^dvdrip/u, source: "DVDRip" },
  { pattern: /^remux/u, remux: true },
  { pattern: /^bdr/u, source: "BDRip" },
  { pattern: /^4320p?/u, resolution: "4320p" },
  { pattern: /^2160p?/u, resolution: "2160p" },
  { pattern: /^1440p?/u, resolution: "1440p" },
  { pattern: /^1080p?/u, resolution: "1080p" },
  { pattern: /^720p?/u, resolution: "720p" },
  { pattern: /^576p?/u, resolution: "576p" },
  { pattern: /^480p?/u, resolution: "480p" },
  { pattern: /^uhd/u, resolution: "4K" },
  { pattern: /^4k/u, resolution: "4K" },
  { pattern: /^fhd/u, resolution: "1080p" },
  { pattern: /^hdr10\+?/u },
  { pattern: /^hdr/u },
  { pattern: /^x?265/u },
  { pattern: /^x?264/u },
  { pattern: /^hevc/u },
  { pattern: /^avc/u },
  { pattern: /^web/u, source: "WEB-DL" },
  { pattern: /^bd/u, source: "BluRay" },
  { pattern: /^hd/u },
  { pattern: /^rip/u },
  { pattern: /^dv/u },
];

export interface CompositeRelease {
  readonly resolution: Resolution | undefined;
  readonly source: MediaSource | undefined;
  readonly remux: boolean;
  /** Piezas encontradas, para poder explicar la decisión. */
  readonly atoms: readonly string[];
}

/**
 * Descompone un token pegado. Devuelve `undefined` si sobra cualquier trozo que
 * no sea una etiqueta conocida, que es lo que impide que se coma títulos.
 */
export const parseCompositeReleaseToken = (raw: string): CompositeRelease | undefined => {
  let rest = raw.toLowerCase();
  if (rest.length < 4) return undefined;

  let resolution: Resolution | undefined;
  let source: MediaSource | undefined;
  let remux = false;
  const atoms: string[] = [];

  while (rest.length > 0) {
    const atom = ATOMS.find((entry) => entry.pattern.test(rest));
    if (atom === undefined) return undefined;

    const matched = atom.pattern.exec(rest)?.[0];
    if (matched === undefined || matched.length === 0) return undefined;

    atoms.push(matched);
    // La resolución en píxeles gana a la clase comercial: `4K2160` es 2160p.
    if (atom.resolution !== undefined && (resolution === undefined || resolution === "4K")) {
      resolution = atom.resolution;
    }
    if (atom.source !== undefined && source === undefined) source = atom.source;
    if (atom.remux === true) remux = true;

    rest = rest.slice(matched.length);
  }

  // Una sola pieza no es un token pegado: de eso ya se encargan las reglas
  // normales, y aceptarlo aquí haría que `HD` suelto tumbara un título.
  if (atoms.length < 2) return undefined;
  if (resolution === undefined && source === undefined && !remux) return undefined;

  return { resolution, source, remux, atoms };
};

const DOMAIN =
  /\b(?:www\.)?[a-z0-9][a-z0-9-]{1,}\.(?:com|net|org|es|tv|to|cc|io|me|one|link|info|xyz|club|site|online|pro|biz|co|us|eu|ru|nu|se|is|ws|mx|ar|cl|pe)\b/giu;

/**
 * Tramos del nombre ocupados por un dominio (`www.pctnew.com`, `atomixhq.one`).
 * Se devuelven como posiciones para poder marcar los tokens que caen dentro sin
 * alterar el texto ni descuadrar el resto de índices.
 */
export const websiteSpans = (stem: string): readonly (readonly [number, number])[] => {
  DOMAIN.lastIndex = 0;
  const spans: (readonly [number, number])[] = [];
  for (const match of stem.matchAll(DOMAIN)) {
    spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
};
