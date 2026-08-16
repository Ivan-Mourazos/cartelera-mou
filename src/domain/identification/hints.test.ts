import { describe, expect, it } from "vitest";

import { extractIdentificationHints, formatEpisodeCode } from "./hints";

describe("pistas de identificación", () => {
  it("separa título y año de una película", () => {
    const hints = extractIdentificationHints(
      "Dune.Part.Two.2024.MULTi.2160p.UHD.BluRay.REMUX.DV.HDR10.TrueHD.Atmos.7.1.mkv",
    );
    expect(hints.kind).toBe("movie");
    expect(hints.titleGuess).toBe("Dune Part Two");
    expect(hints.year).toBe(2024);
  });

  it("no confunde el año interno del título con el año de estreno", () => {
    const hints = extractIdentificationHints("Blade.Runner.2049.2017.2160p.WEB-DL.HDR10.HEVC.mkv");
    // 2049 forma parte del título; el año de estreno es el último candidato realista.
    expect(hints.titleGuess).toBe("Blade Runner 2049");
    expect(hints.year).toBe(2017);
  });

  it("conserva la edición especial y no la mete en el título", () => {
    const hints = extractIdentificationHints(
      "Alien.Directors.Cut.1979.2160p.UHD.BluRay.REMUX.HDR10.HEVC.TrueHD.7.1.mkv",
    );
    expect(hints.titleGuess).toBe("Alien");
    expect(hints.edition).toBe("Director's Cut");
    expect(hints.year).toBe(1979);
  });

  it.each([
    ["Oppenheimer.2023.IMAX.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.HEVC.mkv", "Oppenheimer", "IMAX"],
    ["Se7en.1995.REMASTERED.2160p.UHD.BluRay.REMUX.mkv", "Se7en", "Remastered"],
  ])("%s", (filename, title, edition) => {
    const hints = extractIdentificationHints(filename);
    expect(hints.titleGuess).toBe(title);
    expect(hints.edition).toBe(edition);
  });

  it("no rompe títulos con números", () => {
    expect(extractIdentificationHints("1917.2019.2160p.UHD.BluRay.REMUX.mkv").titleGuess).toBe(
      "1917",
    );
    expect(extractIdentificationHints("1917.2019.2160p.UHD.BluRay.REMUX.mkv").year).toBe(2019);
  });

  it("no toma el grupo de lanzamiento como parte del título", () => {
    const hints = extractIdentificationHints(
      "The.Killer.2023.1080p.BluRay.x264.DTS-HD.MA.5.1-FraMeSToR.mkv",
    );
    expect(hints.titleGuess).toBe("The Killer");
    expect(hints.titleGuess).not.toContain("FraMeSToR");
  });

  it.each([
    ["Serie.S01E03.1080p.mkv", 1, 3, undefined],
    ["Serie.S00E01.1080p.mkv", 0, 1, undefined],
    ["Serie.S01E01-E02.1080p.mkv", 1, 1, 2],
    ["Serie.1x05.1080p.mkv", 1, 5, undefined],
    ["Serie.T03E12.1080p.mkv", 3, 12, undefined],
    ["Serie.Temporada.2.Capitulo.4.mkv", 2, 4, undefined],
  ])("%s ⇒ temporada/episodio", (filename, season, episode, end) => {
    const hints = extractIdentificationHints(filename);
    expect(hints.kind).toBe("series");
    expect(hints.season).toBe(season);
    expect(hints.episode).toBe(episode);
    expect(hints.episodeEnd).toBe(end);
  });

  it("una película no se convierte en serie por tener números", () => {
    expect(extractIdentificationHints("300.2006.1080p.BluRay.mkv").kind).toBe("movie");
    expect(extractIdentificationHints("Se7en.1995.1080p.BluRay.mkv").kind).toBe("movie");
  });

  it("usa la carpeta cuando el nombre solo trae el capítulo", () => {
    const hints = extractIdentificationHints("cap03.mkv", "Los Serrano");
    expect(hints.titleGuess).toBe("Los Serrano");
    expect(hints.kind).toBe("series");
    expect(hints.episode).toBe(3);
    // Sin evidencia de temporada no se inventa ninguna.
    expect(hints.season).toBeUndefined();
  });

  it("MULTi no se convierte en idiomas concretos: no es una pista de identificación", () => {
    const hints = extractIdentificationHints("Dune.2021.MULTi.2160p.mkv");
    expect(hints.titleGuess).toBe("Dune");
  });
});

describe("código de episodio", () => {
  it.each([
    [1, 3, undefined, "S01E03"],
    [1, 10, undefined, "S01E10"],
    [10, 1, undefined, "S10E01"],
    [0, 1, undefined, "S00E01"],
    [1, 1, 2, "S01E01-E02"],
  ])("%i/%i ⇒ %s", (season, episode, end, expected) => {
    expect(formatEpisodeCode(season, episode, end)).toBe(expected);
  });

  it("sin temporada o episodio no hay código", () => {
    expect(formatEpisodeCode(undefined, 3)).toBeUndefined();
    expect(formatEpisodeCode(1, undefined)).toBeUndefined();
  });
});

describe("capítulos con la convención española de 3 cifras", () => {
  it.each([
    ["La Casa Del Dragon [4k 2160p][Cap.202](wolfmax4k.com).mkv", "La Casa Del Dragon", 2, 2],
    ["Serie [Cap.308].mkv", "Serie", 3, 8],
    ["Serie.Capitulo.105.mkv", "Serie", 1, 5],
  ])("%s ⇒ %s S%iE%i", (filename, title, season, episode) => {
    const hints = extractIdentificationHints(filename);
    expect(hints.titleGuess).toBe(title);
    expect(hints.season).toBe(season);
    expect(hints.episode).toBe(episode);
  });

  it("con una o dos cifras no se inventa la temporada", () => {
    const hints = extractIdentificationHints("Serie [Cap.12].mkv");
    expect(hints.episode).toBe(12);
    expect(hints.season).toBeUndefined();
  });

  it("el título no arrastra corchetes ni dominios del grupo", () => {
    const hints = extractIdentificationHints("Serie [1080p][Cap.101](web.com).mkv");
    expect(hints.titleGuess).toBe("Serie");
  });
});
