import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

interface NoticeProps {
  tone: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  onDismiss?: () => void;
}

export function Notice({ tone, title, message, onDismiss }: NoticeProps) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div className={`notice notice--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {onDismiss ? (
        <button type="button" className="icon-button" onClick={onDismiss} aria-label="Cerrar aviso">
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}
