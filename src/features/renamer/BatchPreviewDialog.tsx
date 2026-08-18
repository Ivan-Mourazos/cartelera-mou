import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

import type { RenamePlan } from "../../services/rename/plan";

export interface BatchPreviewDialogProps {
  readonly plan: RenamePlan;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Última barrera antes de escribir en disco.
 *
 * Renombrar es una operación que toca archivos reales de decenas de gigabytes:
 * merece ver exactamente qué va a pasar antes de que pase, aunque exista deshacer.
 */
export const BatchPreviewDialog = ({ plan, onConfirm, onCancel }: BatchPreviewDialogProps) => {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const ready = plan.items.filter((item) => item.status === "ready");
  const blocked = plan.items.filter((item) => item.status === "blocked");

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel]);

  return (
    <div className="dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <h2 id="preview-title">
          {ready.length === 0
            ? "No hay nada que renombrar"
            : `Vas a renombrar ${String(ready.length)} archivo(s)`}
        </h2>

        {ready.length === 0 ? null : (
          <ul className="preview-list">
            {ready.map((item) => (
              <li key={item.id}>
                <span className="preview-from">{item.currentName}</span>
                <ArrowRight size={12} className="preview-arrow" aria-hidden />
                <span className="preview-to">{item.proposedName}</span>
              </li>
            ))}
          </ul>
        )}

        {blocked.length === 0 ? null : (
          <>
            <h3>{blocked.length} bloqueado(s)</h3>
            <ul className="preview-blocked">
              {blocked.map((item) => (
                <li key={item.id}>
                  <span>{item.currentName}</span>
                  <em>{item.issues.map((issue) => issue.message).join(" · ")}</em>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="dialog-actions">
          <button type="button" className="apple-button apple-button-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="apple-button apple-button-primary"
            onClick={onConfirm}
            disabled={ready.length === 0}
          >
            Renombrar {ready.length}
          </button>
        </div>
      </div>
    </div>
  );
};
