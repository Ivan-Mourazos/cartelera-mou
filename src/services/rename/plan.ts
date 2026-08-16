import { validateWindowsFilename } from "../../domain/naming/windows-filename";

/**
 * Preflight del renombrado.
 *
 * Ninguna operación toca el disco hasta que este plan está construido y la
 * persona usuaria lo confirma. Un elemento bloqueado nunca se ejecuta.
 */

export type RenameIssueCode =
  | "empty-name"
  | "unchanged"
  | "extension-changed"
  | "invalid-name"
  | "duplicate-in-batch"
  | "target-exists"
  | "no-handle"
  | "too-long";

export type RenameIssueSeverity = "blocking" | "info";

export interface RenameIssue {
  readonly code: RenameIssueCode;
  readonly severity: RenameIssueSeverity;
  readonly message: string;
}

export type RenamePlanStatus = "ready" | "unchanged" | "blocked";

export interface RenamePlanCandidate {
  readonly id: string;
  readonly currentName: string;
  readonly proposedName: string;
  readonly hasHandle: boolean;
}

export interface RenamePlanItem extends RenamePlanCandidate {
  readonly status: RenamePlanStatus;
  readonly issues: readonly RenameIssue[];
}

export interface RenamePlan {
  readonly items: readonly RenamePlanItem[];
  readonly readyCount: number;
  readonly blockedCount: number;
  readonly unchangedCount: number;
}

const extensionOf = (filename: string): string => {
  const lastDot = filename.lastIndexOf(".");
  return lastDot <= 0 ? "" : filename.slice(lastDot + 1).toLowerCase();
};

const lower = (value: string): string => value.toLocaleLowerCase("es-ES");

const issue = (
  code: RenameIssueCode,
  message: string,
  severity: RenameIssueSeverity = "blocking",
): RenameIssue => ({ code, severity, message });

export interface BuildPlanOptions {
  /** Nombres ya presentes en la carpeta destino (incluye los originales). */
  readonly existingNames?: Iterable<string>;
  readonly requireHandles?: boolean;
  readonly parentPath?: string;
}

export const buildRenamePlan = (
  candidates: readonly RenamePlanCandidate[],
  options: BuildPlanOptions = {},
): RenamePlan => {
  const existing = new Set<string>();
  for (const name of options.existingNames ?? []) existing.add(lower(name));

  // Los nombres de origen dejan de estar ocupados tras el lote.
  const sourceNames = new Set(candidates.map((candidate) => lower(candidate.currentName)));

  const proposedCount = new Map<string, number>();
  for (const candidate of candidates) {
    const key = lower(candidate.proposedName);
    proposedCount.set(key, (proposedCount.get(key) ?? 0) + 1);
  }

  const items = candidates.map<RenamePlanItem>((candidate) => {
    const issues: RenameIssue[] = [];
    const proposed = candidate.proposedName.trim();
    const isCaseOnlyChange =
      proposed !== candidate.currentName && lower(proposed) === lower(candidate.currentName);

    if (proposed.length === 0) {
      issues.push(issue("empty-name", "El nombre propuesto está vacío."));
    }

    if (proposed === candidate.currentName) {
      issues.push(issue("unchanged", "El nombre no cambia.", "info"));
    }

    if (proposed.length > 0 && extensionOf(proposed) !== extensionOf(candidate.currentName)) {
      issues.push(
        issue(
          "extension-changed",
          `La extensión cambiaría de «.${extensionOf(candidate.currentName)}» a «.${extensionOf(proposed)}».`,
        ),
      );
    }

    const validation = validateWindowsFilename(proposed, {
      ...(options.parentPath === undefined ? {} : { parentPath: options.parentPath }),
    });
    for (const problem of validation.issues) {
      issues.push(
        issue(
          problem.code === "component-too-long" || problem.code === "path-too-long"
            ? "too-long"
            : "invalid-name",
          problem.message,
        ),
      );
    }

    if ((proposedCount.get(lower(proposed)) ?? 0) > 1) {
      issues.push(
        issue("duplicate-in-batch", "Otro archivo del lote generaría exactamente este nombre."),
      );
    }

    const collidesWithDirectory =
      existing.has(lower(proposed)) && !sourceNames.has(lower(proposed)) && !isCaseOnlyChange;
    const collidesWithUntouchedSource =
      existing.has(lower(proposed)) &&
      sourceNames.has(lower(proposed)) &&
      lower(proposed) !== lower(candidate.currentName) &&
      !candidates.some(
        (other) =>
          lower(other.currentName) === lower(proposed) && other.proposedName !== other.currentName,
      );

    if (collidesWithDirectory || collidesWithUntouchedSource) {
      issues.push(issue("target-exists", "Ya existe un archivo con ese nombre en la carpeta."));
    }

    if (options.requireHandles === true && !candidate.hasHandle) {
      issues.push(
        issue(
          "no-handle",
          "Este navegador no dio acceso para renombrar este archivo. Vuelve a cargarlo con «Elegir archivos» o abre su carpeta.",
        ),
      );
    }

    const blocking = issues.filter((entry) => entry.severity === "blocking");
    const status: RenamePlanStatus =
      blocking.length > 0 ? "blocked" : proposed === candidate.currentName ? "unchanged" : "ready";

    return { ...candidate, proposedName: proposed, status, issues };
  });

  return {
    items,
    readyCount: items.filter((item) => item.status === "ready").length,
    blockedCount: items.filter((item) => item.status === "blocked").length,
    unchangedCount: items.filter((item) => item.status === "unchanged").length,
  };
};
