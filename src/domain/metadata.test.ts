import { describe, expect, it } from "vitest";
import { evidenceFor, mergeMetadataEvidence } from "./metadata";

describe("mergeMetadataEvidence", () => {
  it("prefers ffprobe for technical values while retaining rejected evidence", () => {
    const filename = evidenceFor(
      "videoCodec",
      "HEVC",
      { reason: "Etiqueta de nombre" },
      { origin: "filename" },
    );
    const ffprobe = evidenceFor(
      "videoCodec",
      "H.264",
      { reason: "codec_name del stream" },
      { origin: "ffprobe" },
    );
    const merged = mergeMetadataEvidence([filename, ffprobe]);

    expect(merged.selected).toEqual([ffprobe]);
    expect(merged.rejected).toEqual([filename]);
  });

  it("lets an auditable manual correction override external metadata", () => {
    const tmdb = evidenceFor("title", "The Killer", { reason: "TMDb" }, { origin: "tmdb" });
    const user = evidenceFor(
      "title",
      "El asesino",
      { reason: "Corrección en la revisión" },
      { origin: "user" },
    );
    const merged = mergeMetadataEvidence([tmdb, user]);

    expect(merged.selected).toEqual([user]);
    expect(merged.rejected).toContain(tmdb);
  });

  it("deduplicates repeated values without discarding their provenance", () => {
    const fromName = evidenceFor("audioLanguage", "ES", { reason: "ES" });
    const fromProbe = evidenceFor(
      "audioLanguage",
      "ES",
      { reason: "stream.language" },
      { origin: "ffprobe" },
    );
    const english = evidenceFor(
      "audioLanguage",
      "EN",
      { reason: "stream.language" },
      { origin: "ffprobe" },
    );
    const merged = mergeMetadataEvidence([fromName, fromProbe, english]);

    expect(merged.selected.map((value) => value.value)).toEqual(["ES", "EN"]);
    expect(merged.rejected).toContain(fromName);
  });
});
