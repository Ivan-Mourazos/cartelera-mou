import { describe, expect, it } from "vitest";
import {
  sanitizeWindowsFilenameComponent,
  sanitizeWindowsTitleComponent,
  validateWindowsFilename,
} from "./windows-filename";

describe("Windows filename safety", () => {
  it("detects incompatible characters and reserved device names", () => {
    expect(validateWindowsFilename("bad:name.mkv").issues.map((issue) => issue.code)).toContain(
      "invalid-character",
    );
    expect(validateWindowsFilename("CON.mkv").issues.map((issue) => issue.code)).toContain(
      "reserved-name",
    );
    expect(sanitizeWindowsFilenameComponent("CON.mkv").value).toBe("_CON.mkv");
  });

  it("removes trailing dots or spaces and reports the mutation", () => {
    const result = sanitizeWindowsFilenameComponent("Film. ");

    expect(result.value).toBe("Film");
    expect(result.changes).toContain("trailing-dots-or-spaces-removed");
  });

  it("turns a title colon into a readable Windows-safe separator", () => {
    const result = sanitizeWindowsTitleComponent("Dune: Parte dos");

    expect(result.value).toBe("Dune - Parte dos");
    expect(result.changes).toContain("invalid-characters-replaced");
    expect(sanitizeWindowsFilenameComponent("DTS:X").value).toBe("DTS X");
  });

  it("never truncates an overlong component", () => {
    const original = "a".repeat(256);
    const sanitized = sanitizeWindowsFilenameComponent(original);
    const validation = validateWindowsFilename(sanitized.value);

    expect(sanitized.value).toHaveLength(256);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain("component-too-long");
  });

  it("reports an overlong full path separately", () => {
    const validation = validateWindowsFilename("Film.mkv", {
      parentPath: `C:\\${"folder\\".repeat(50)}`,
      maxPathUtf16: 100,
    });

    expect(validation.issues.map((issue) => issue.code)).toContain("path-too-long");
  });

  it("reserves one UTF-16 unit for the classic MAX_PATH terminator", () => {
    const filename = "f.mkv";
    const parentPath = `C:\\${"a".repeat(251)}`;

    expect(
      validateWindowsFilename(filename, { parentPath }).issues.map((issue) => issue.code),
    ).toContain("path-too-long");
  });
});
