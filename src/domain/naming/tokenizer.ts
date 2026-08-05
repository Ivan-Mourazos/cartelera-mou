import type { MutableFilenameToken, TokenizedFilename } from "./types";

// Decimal dots are only retained for known technical token shapes. A generic
// optional decimal would incorrectly merge `Title.2024` into one token.
const TOKEN_PATTERN = /(?:E-AC-3|AC-3|DDP\d\.\d|H\.\d{3}|\d\.\d)|[\p{L}\p{N}+'’+]+/giu;
const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/iu;

const splitExtension = (filename: string): { stem: string; extension: string } => {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return { stem: filename, extension: "" };
  }

  const candidate = filename.slice(lastDot + 1);
  if (!EXTENSION_PATTERN.test(candidate)) {
    return { stem: filename, extension: "" };
  }

  return { stem: filename.slice(0, lastDot), extension: candidate.toLowerCase() };
};

export const normalizeFilenameToken = (value: string): string =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[’']/gu, "").toUpperCase();

export const tokenizeFilename = (filename: string): TokenizedFilename => {
  const { stem, extension } = splitExtension(filename);
  const tokens: MutableFilenameToken[] = [];

  for (const match of stem.matchAll(TOKEN_PATTERN)) {
    const raw = match[0];
    const start = match.index;
    tokens.push({
      raw,
      normalized: normalizeFilenameToken(raw),
      start,
      end: start + raw.length,
      categories: new Set(),
    });
  }

  return { originalFilename: filename, stem, extension, tokens };
};
