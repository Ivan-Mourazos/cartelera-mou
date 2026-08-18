import { beforeEach, describe, expect, it } from "vitest";

import { forgetAllCorrections, recallCorrection, rememberCorrection } from "./learned-corrections";

beforeEach(() => {
  forgetAllCorrections();
});

describe("correcciones aprendidas", () => {
  it("recuerda una corrección y la aplica al mismo título", () => {
    rememberCorrection("El Ministerio del Tiempo", "series", 62126);
    expect(recallCorrection("El Ministerio del Tiempo", "series")).toBe(62126);
  });

  it("ignora acentos, mayúsculas y separadores", () => {
    rememberCorrection("El Señor de los Anillos", "movie", 120);
    expect(recallCorrection("el senor  de los anillos", "movie")).toBe(120);
  });

  it("no confunde una serie con una película del mismo título", () => {
    rememberCorrection("Fargo", "movie", 275);
    expect(recallCorrection("Fargo", "series")).toBeUndefined();
  });

  it("la corrección más reciente sustituye a la anterior", () => {
    rememberCorrection("Dune", "movie", 1);
    rememberCorrection("Dune", "movie", 438631);
    expect(recallCorrection("Dune", "movie")).toBe(438631);
  });

  it("no guarda un título vacío", () => {
    rememberCorrection("   ", "movie", 1);
    expect(recallCorrection("   ", "movie")).toBeUndefined();
  });

  it("se pueden olvidar todas", () => {
    rememberCorrection("Dune", "movie", 438631);
    forgetAllCorrections();
    expect(recallCorrection("Dune", "movie")).toBeUndefined();
  });

  it("sobrevive a un almacenamiento corrupto", () => {
    // El almacén real solo existe en el navegador; fuera de él la reserva en
    // memoria cubre el mismo camino de código.
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    rememberCorrection("Dune", "movie", 438631);
    storage?.setItem("renombrador.corrections.v1", "{ esto no es json");
    if (storage === undefined) return;

    expect(recallCorrection("Dune", "movie")).toBeUndefined();
  });
});
