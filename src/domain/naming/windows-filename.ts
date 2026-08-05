export type WindowsFilenameIssueCode =
  | "empty"
  | "dot-segment"
  | "invalid-character"
  | "trailing-dot-or-space"
  | "reserved-name"
  | "component-too-long"
  | "path-too-long";

export interface WindowsFilenameIssue {
  readonly code: WindowsFilenameIssueCode;
  readonly message: string;
}

export interface WindowsFilenameValidationOptions {
  readonly parentPath?: string;
  readonly maxComponentUtf16?: number;
  readonly maxPathUtf16?: number;
}

export interface WindowsFilenameValidation {
  readonly valid: boolean;
  readonly issues: readonly WindowsFilenameIssue[];
  readonly utf16Length: number;
  readonly fullPathUtf16Length?: number;
}

export type WindowsSanitizationChange =
  | "invalid-characters-replaced"
  | "trailing-dots-or-spaces-removed"
  | "reserved-name-prefixed"
  | "empty-name-replaced";

export interface WindowsSanitizationResult {
  readonly value: string;
  readonly changes: readonly WindowsSanitizationChange[];
}

// Windows explicitly reserves ASCII control codes U+0000–U+001F in path components.
// eslint-disable-next-line no-control-regex
const INVALID_WINDOWS_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/gu;
const RESERVED_WINDOWS_BASENAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/iu;

const baseBeforeExtension = (filename: string): string => filename.split(".")[0]?.trim() ?? "";

export const isReservedWindowsFilename = (filename: string): boolean =>
  RESERVED_WINDOWS_BASENAME.test(baseBeforeExtension(filename));

/**
 * Produces a safe component and reports every mutation. It deliberately never
 * truncates: excessive length remains visible to validation and to the user.
 */
export const sanitizeWindowsFilenameComponent = (input: string): WindowsSanitizationResult => {
  const changes: WindowsSanitizationChange[] = [];
  let value = input.normalize("NFC");

  const replaced = value.replace(INVALID_WINDOWS_CHARACTERS, " ").replace(/\s+/gu, " ").trim();
  if (replaced !== value) changes.push("invalid-characters-replaced");
  value = replaced;

  const withoutTrailing = value.replace(/[ .]+$/u, "");
  if (withoutTrailing !== value) changes.push("trailing-dots-or-spaces-removed");
  value = withoutTrailing;

  if (value === "" || value === "." || value === "..") {
    value = "_";
    changes.push("empty-name-replaced");
  }

  if (isReservedWindowsFilename(value)) {
    value = `_${value}`;
    changes.push("reserved-name-prefixed");
  }

  return { value, changes };
};

export const sanitizeWindowsTitleComponent = (input: string): WindowsSanitizationResult => {
  const titleWithReadableColons = input.replace(/:+/gu, " - ");
  const sanitized = sanitizeWindowsFilenameComponent(titleWithReadableColons);
  if (titleWithReadableColons === input) return sanitized;
  return {
    value: sanitized.value,
    changes: [...new Set(["invalid-characters-replaced" as const, ...sanitized.changes])],
  };
};

export const validateWindowsFilename = (
  filename: string,
  options: WindowsFilenameValidationOptions = {},
): WindowsFilenameValidation => {
  const issues: WindowsFilenameIssue[] = [];
  const maxComponentUtf16 = options.maxComponentUtf16 ?? 255;
  // Classic MAX_PATH includes the terminating NUL, so 259 visible UTF-16 units is the safe default.
  const maxPathUtf16 = options.maxPathUtf16 ?? 259;

  if (filename.length === 0) {
    issues.push({ code: "empty", message: "El nombre no puede estar vacío." });
  }
  if (filename === "." || filename === "..") {
    issues.push({ code: "dot-segment", message: "El nombre no puede ser . ni ..." });
  }
  if (INVALID_WINDOWS_CHARACTERS.test(filename)) {
    issues.push({
      code: "invalid-character",
      message: "El nombre contiene caracteres incompatibles con Windows.",
    });
  }
  INVALID_WINDOWS_CHARACTERS.lastIndex = 0;
  if (/[ .]$/u.test(filename)) {
    issues.push({
      code: "trailing-dot-or-space",
      message: "El nombre no puede terminar en punto ni espacio.",
    });
  }
  if (isReservedWindowsFilename(filename)) {
    issues.push({ code: "reserved-name", message: "El nombre está reservado por Windows." });
  }
  if (filename.length > maxComponentUtf16) {
    issues.push({
      code: "component-too-long",
      message: `El nombre ocupa ${filename.length} unidades UTF-16; el máximo es ${maxComponentUtf16}.`,
    });
  }

  const fullPathLength =
    options.parentPath === undefined
      ? undefined
      : `${options.parentPath.replace(/[\\/]$/u, "")}\\${filename}`.length;
  if (fullPathLength !== undefined && fullPathLength > maxPathUtf16) {
    issues.push({
      code: "path-too-long",
      message: `La ruta ocupa ${fullPathLength} unidades UTF-16; el límite configurado es ${maxPathUtf16}.`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    utf16Length: filename.length,
    ...(fullPathLength === undefined ? {} : { fullPathUtf16Length: fullPathLength }),
  };
};
