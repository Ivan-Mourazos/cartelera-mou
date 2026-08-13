import { describe, expect, it } from "vitest";

import { isMediaFile } from "./file-system";
import { calculateSuggestedName, createRenamerItem, toTitleCase } from "./renamer-engine";

describe("renamer-engine", () => {
  it("formats title casing correctly with smart Roman numerals and minor words", () => {
    expect(toTitleCase("the lord of the rings")).toBe("The Lord of the Rings");
    expect(toTitleCase("el caballero oscuro")).toBe("El Caballero Oscuro");
    expect(toTitleCase("gladiator ii")).toBe("Gladiator II");
    expect(toTitleCase("spider-man no way home")).toBe("Spider-Man No Way Home");
    expect(toTitleCase("oppenheimer")).toBe("Oppenheimer");
  });

  it("extracts all rich metadata tags from file", () => {
    const dirty = "Oppenheimer.2023.IMAX.2160p.UHD.BluRay.x265.TrueHD.Atmos.SPA-SPARKS.mkv";
    const item = createRenamerItem(dirty, 1024, undefined);

    expect(item.title).toBe("Oppenheimer");
    expect(item.year).toBe(2023);
    expect(item.extension).toBe("mkv");

    const tagLabels = item.tags.map((t) => t.label);
    expect(tagLabels).toContain("IMAX");
    expect(tagLabels).toContain("2160p");
    expect(tagLabels).toContain("UHD Blu-ray");
    expect(tagLabels).toContain("HEVC");
    expect(tagLabels).toContain("TrueHD");
    expect(tagLabels).toContain("Atmos");
    expect(tagLabels).toContain("ES");

    expect(item.suggestedName).toContain("Oppenheimer (2023)");
    expect(item.suggestedName).toContain("[2160p]");
    expect(item.suggestedName).toContain("[UHD Blu-ray]");
    expect(item.suggestedName.endsWith(".mkv")).toBe(true);
  });

  it("correctly cleans Spanish torrent releases without leaking metadata to title", () => {
    const florida =
      "The Florida Project [BluRay 720p X264 MKV][AC3 5.1 Castellano][2018][www.descargas2020.com].mkv";
    const itemFlorida = createRenamerItem(florida);
    expect(itemFlorida.title).toBe("The Florida Project");
    expect(itemFlorida.year).toBe(2018);
    expect(itemFlorida.suggestedName).toBe(
      "The Florida Project (2018) [720p] [Blu-ray] [H.264] [AC-3] [5.1] [ES].mkv",
    );

    const chuck = "La vida de Chuck (2024) [Bluray][Esp].avi";
    const itemChuck = createRenamerItem(chuck);
    expect(itemChuck.title).toBe("La vida de Chuck");
    expect(itemChuck.year).toBe(2024);
    expect(itemChuck.suggestedName).toBe("La Vida de Chuck (2024) [Blu-ray] [ES].avi");

    const bestias =
      "Las Bestias (As bestas) (2022) [BluRay Rip][AC3 5.1 Castellano][www.nucleohd.com].avi";
    const itemBestias = createRenamerItem(bestias);
    expect(itemBestias.title).toBe("Las Bestias");
    expect(itemBestias.year).toBe(2022);
    expect(itemBestias.suggestedName).toBe("Las Bestias (2022) [Blu-ray] [AC-3] [5.1] [ES].avi");
  });

  it("correctly detects season and episode tags in TV series in 3-digit bracket format", () => {
    // La Casa del Dragón 2x01 -> [201]
    const dragon = "La.Casa.Del.Dragon.2x01.1080p.BluRay.mkv";
    const itemDragon = createRenamerItem(dragon);
    expect(itemDragon.title).toBe("La Casa Del Dragon");
    expect(itemDragon.tags.find((t) => t.kind === "episode")?.label).toBe("201");
    expect(itemDragon.suggestedName).toBe("La Casa del Dragon [201] [1080p] [Blu-ray].mkv");

    // Standard S01E05 -> [105]
    const breakingBad = "Breaking.Bad.S01E05.1080p.BluRay.x264.mkv";
    const itemBB = createRenamerItem(breakingBad);
    expect(itemBB.title).toBe("Breaking Bad");
    expect(itemBB.tags.find((t) => t.kind === "episode")?.label).toBe("105");
    expect(itemBB.suggestedName).toBe("Breaking Bad [105] [1080p] [Blu-ray] [H.264].mkv");

    // 4x01 format -> [401]
    const strangerThings = "Stranger.Things.4x01.2160p.HDR.WEB-DL.mkv";
    const itemST = createRenamerItem(strangerThings);
    expect(itemST.title).toBe("Stranger Things");
    expect(itemST.tags.find((t) => t.kind === "episode")?.label).toBe("401");
    expect(itemST.suggestedName).toBe("Stranger Things [401] [2160p] [WEB-DL] [HDR].mkv");

    // Spanish T01E03 format -> [103]
    const casaPapel = "La.Casa.de.Papel.T01E03.1080p.WEBDL.mkv";
    const itemCP = createRenamerItem(casaPapel);
    expect(itemCP.title).toBe("La Casa de Papel");
    expect(itemCP.tags.find((t) => t.kind === "episode")?.label).toBe("103");
    expect(itemCP.suggestedName).toBe("La Casa de Papel [103] [1080p] [WEB-DL].mkv");

    // Multi-token Temporada 1 Capitulo 5 format -> [105]
    const got = "Juego.de.Tronos.Temporada.1.Capitulo.5.1080p.BluRay.mkv";
    const itemGOT = createRenamerItem(got);
    expect(itemGOT.title).toBe("Juego de Tronos");
    expect(itemGOT.tags.find((t) => t.kind === "episode")?.label).toBe("105");
    expect(itemGOT.suggestedName).toBe("Juego de Tronos [105] [1080p] [Blu-ray].mkv");

    // Standalone bracketed [308] episode
    const dragon308 =
      "La casa del Dragon [308] [1440p] [HEVC] [10-bit] [Dolby Vision] [Profile 8] [E-AC-3] [5.1] [Castellano] [Inglés].mkv";
    const itemDragon308 = createRenamerItem(dragon308);
    expect(itemDragon308.title).toBe("La casa del Dragon");
    expect(itemDragon308.tags.find((t) => t.kind === "episode")?.label).toBe("308");
    expect(itemDragon308.suggestedName).toContain("La Casa del Dragon [308]");
    expect(itemDragon308.suggestedName).toContain("[1440p]");
    expect(itemDragon308.suggestedName).toContain("[HEVC]");
    expect(itemDragon308.suggestedName).toContain("[Dolby Vision]");
    expect(itemDragon308.suggestedName).toContain("[E-AC-3]");
    expect(itemDragon308.suggestedName).toContain("[5.1]");
    expect(itemDragon308.suggestedName).toContain("[ES]");
    expect(itemDragon308.suggestedName).toContain("[EN]");
  });

  it("dynamically updates suggested name when tags are toggled off", () => {
    const dirty = "the.dark.knight.2008.1080p.bluray.dts.x264.mp4";
    const item = createRenamerItem(dirty, 1024, undefined);

    // Disable all tags
    const noTags = item.tags.map((t) => ({ ...t, active: false }));
    const { suggestedName } = calculateSuggestedName(item.title, item.year, noTags, item.extension);

    expect(suggestedName).toBe("The Dark Knight (2008).mp4");
  });

  it("adds specific enabled tags in brackets separated by spaces", () => {
    const dirty = "Blade.Runner.2049.2017.PROPER.1080p.BluRay.x264.DTS.mkv";
    const item = createRenamerItem(dirty, 1024, undefined);

    // Only keep 1080p and Blu-ray active
    const selectedTags = item.tags.map((t) => ({
      ...t,
      active: t.label === "1080p" || t.label === "Blu-ray",
    }));

    const { suggestedName } = calculateSuggestedName(
      item.title,
      item.year,
      selectedTags,
      item.extension,
    );

    expect(suggestedName).toBe("Blade Runner 2049 (2017) [1080p] [Blu-ray].mkv");
  });

  it("identifies multimedia files and rejects non-media/system files", () => {
    expect(isMediaFile("movie.mkv")).toBe(true);
    expect(isMediaFile("clip.mp4")).toBe(true);
    expect(isMediaFile("soundtrack.flac")).toBe(true);
    expect(isMediaFile("track.mp3")).toBe(true);
    expect(isMediaFile("video.avi")).toBe(true);
    expect(isMediaFile("sample.ts")).toBe(true);

    expect(isMediaFile("subtitles.srt")).toBe(false);
    expect(isMediaFile("info.nfo")).toBe(false);
    expect(isMediaFile("notes.txt")).toBe(false);
    expect(isMediaFile("cover.jpg")).toBe(false);
    expect(isMediaFile(".DS_Store")).toBe(false);
    expect(isMediaFile("Thumbs.db")).toBe(false);
  });
});
