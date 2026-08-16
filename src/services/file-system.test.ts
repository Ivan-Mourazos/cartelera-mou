import { describe, expect, it } from "vitest";

import { extensionOf, isVideoFile } from "./file-system";

describe("filtrado de ficheros", () => {
  it.each(["a.mkv", "a.mp4", "a.m4v", "a.avi", "a.mov", "a.ts"])("%s es vídeo", (name) => {
    expect(isVideoFile(name)).toBe(true);
  });

  it.each(["a.mp3", "a.flac", "a.iso", "a.txt", "sin-extension", ".oculto.mkv"])(
    "%s no se procesa",
    (name) => {
      expect(isVideoFile(name)).toBe(false);
    },
  );

  it("extrae la extensión en minúsculas", () => {
    expect(extensionOf("Película (2024).MKV")).toBe("mkv");
    expect(extensionOf("sin-extension")).toBe("");
  });
});
