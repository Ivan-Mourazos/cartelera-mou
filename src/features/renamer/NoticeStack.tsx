import { X } from "lucide-react";
import { useEffect } from "react";

import type { Notice } from "./useRenamerState";

export interface NoticeStackProps {
  readonly notices: readonly Notice[];
  readonly onDismiss: (id: string) => void;
}

/** Cuánto vive un aviso antes de irse solo. Los errores duran más. */
const LIFETIME_MS: Readonly<Record<Notice["tone"], number>> = {
  info: 3200,
  success: 3200,
  error: 6500,
};

const NoticeItem = ({
  notice,
  onDismiss,
}: {
  readonly notice: Notice;
  readonly onDismiss: (id: string) => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notice.id);
    }, LIFETIME_MS[notice.tone]);
    return () => {
      clearTimeout(timer);
    };
  }, [notice.id, notice.tone, onDismiss]);

  return (
    <div className={`notice notice-${notice.tone}`}>
      <span>{notice.text}</span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Descartar aviso"
        onClick={() => {
          onDismiss(notice.id);
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
};

/**
 * Avisos en la esquina superior derecha, fuera del camino y con caducidad.
 *
 * Antes se apilaban en el centro inferior, justo encima de la lista, y no se
 * iban nunca: había que cerrarlos a mano uno por uno.
 */
export const NoticeStack = ({ notices, onDismiss }: NoticeStackProps) => {
  if (notices.length === 0) return null;

  return (
    <div className="notice-stack" role="status" aria-live="polite">
      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
