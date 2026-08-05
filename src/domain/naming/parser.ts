import { applyFilenameRules } from "./rules";
import { tokenizeFilename } from "./tokenizer";
import type { FilenameToken, ParsedFilename } from "./types";

const NON_TITLE_CATEGORIES = new Set([
  "year",
  "resolution",
  "source",
  "release-type",
  "video-codec",
  "bit-depth",
  "dolby-vision",
  "dolby-vision-profile",
  "hdr",
  "audio-codec",
  "spatial-audio",
  "channels",
  "audio-language",
  "subtitle-language",
  "language-marker",
  "edition",
  "release-group",
]);

const titleBoundary = (tokens: ReturnType<typeof tokenizeFilename>["tokens"]): number => {
  const yearIndex = tokens.findIndex((token) => token.categories.has("year"));
  if (yearIndex >= 0) return yearIndex;

  const metadataIndex = tokens.findIndex((token) =>
    [...token.categories].some((category) => NON_TITLE_CATEGORIES.has(category)),
  );
  return metadataIndex < 0 ? tokens.length : metadataIndex;
};

const isMetadataToken = (categories: ReadonlySet<string>): boolean =>
  [...categories].some((category) => NON_TITLE_CATEGORIES.has(category));

export const parseMediaFilename = (filename: string): ParsedFilename => {
  const tokenized = tokenizeFilename(filename);
  const classified = applyFilenameRules(tokenized);
  const boundary = titleBoundary(tokenized.tokens);

  const titleTokens = tokenized.tokens.filter(
    (token, index) => index < boundary && !isMetadataToken(token.categories),
  );
  for (const token of titleTokens) token.categories.add("title");

  const probableTitle = titleTokens
    .map((token) => token.raw)
    .join(" ")
    .trim();
  const tokens: FilenameToken[] = tokenized.tokens.map((token) => ({
    raw: token.raw,
    normalized: token.normalized,
    start: token.start,
    end: token.end,
    categories: token.categories.size === 0 ? ["unknown"] : [...token.categories],
  }));
  const unclassifiedTokens = tokens
    .filter((token) => token.categories.includes("unknown"))
    .map((token) => token.raw);

  return {
    originalFilename: tokenized.originalFilename,
    originalStem: tokenized.stem,
    extension: tokenized.extension,
    probableTitle: probableTitle || tokenized.stem,
    ...(classified.year === undefined ? {} : { year: classified.year }),
    ...(classified.releaseGroup === undefined ? {} : { releaseGroup: classified.releaseGroup }),
    tokens,
    unclassifiedTokens,
    evidence: classified.evidence,
  };
};
