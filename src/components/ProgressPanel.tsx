import { LoaderCircle } from "lucide-react";

import type { ScanProgress } from "../services/types";

const STAGES = ["Carpeta", "Análisis", "Identificación", "Propuesta", "Revisión"];

function stageIndex(stage: ScanProgress["stage"]): number {
  if (stage === "discovering") return 0;
  if (stage === "probing") return 1;
  if (stage === "identifying") return 2;
  if (stage === "proposing") return 3;
  return 4;
}

export function ProgressPanel({ progress }: { progress: ScanProgress }) {
  const activeIndex = stageIndex(progress.stage);
  const percentage =
    progress.total > 0 ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 4;

  return (
    <section className="scan-progress" aria-live="polite" aria-busy={progress.stage !== "complete"}>
      <ol className="scan-progress__stages" aria-label="Fases de importación">
        {STAGES.map((stage, index) => (
          <li
            key={stage}
            className={
              index < activeIndex ? "is-complete" : index === activeIndex ? "is-active" : ""
            }
            aria-current={index === activeIndex ? "step" : undefined}
          >
            <span>{index + 1}</span>
            {stage}
          </li>
        ))}
      </ol>
      <div className="scan-progress__body">
        {progress.stage === "complete" ? null : (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        )}
        <div className="scan-progress__copy">
          <strong>{progress.message}</strong>
          {progress.currentFile ? <bdi>{progress.currentFile}</bdi> : null}
        </div>
        <span className="scan-progress__count">
          {progress.total > 0 ? `${progress.completed} de ${progress.total}` : "Preparando"}
        </span>
      </div>
      <div
        className="scan-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total || undefined}
        aria-valuenow={progress.total > 0 ? progress.completed : undefined}
        aria-label="Progreso del análisis"
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
    </section>
  );
}
