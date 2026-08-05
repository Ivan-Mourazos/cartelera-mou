import { AlertTriangle, Check, CircleDashed, RotateCcw, X } from "lucide-react";

import type { HistoryStatus, MatchLevel, ScanItemStatus } from "../services/types";

type BadgeStatus = ScanItemStatus | MatchLevel | HistoryStatus;

const LABELS: Record<BadgeStatus, string> = {
  ready: "Listo",
  review: "Revisar",
  conflict: "Conflicto",
  error: "Error",
  excluded: "Excluido",
  renamed: "Renombrado",
  high: "Alta",
  medium: "Media",
  low: "Baja",
  unmatched: "Sin identificar",
  completed: "Completado",
  failed: "Fallido",
  partial: "Parcial",
  undone: "Deshecho",
  recoveryRequired: "Requiere recuperación",
};

function statusTone(status: BadgeStatus): "positive" | "warning" | "negative" | "neutral" {
  if (["ready", "renamed", "high", "completed"].includes(status)) return "positive";
  if (["review", "medium", "partial", "recoveryRequired"].includes(status)) return "warning";
  if (["conflict", "error", "low", "failed"].includes(status)) return "negative";
  return "neutral";
}

function StatusIcon({
  tone,
  status,
}: {
  tone: ReturnType<typeof statusTone>;
  status: BadgeStatus;
}) {
  if (status === "undone") return <RotateCcw size={13} />;
  if (tone === "positive") return <Check size={13} />;
  if (tone === "warning") return <AlertTriangle size={13} />;
  if (tone === "negative") return <X size={13} />;
  return <CircleDashed size={13} />;
}

interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const tone = statusTone(status);
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span aria-hidden="true">
        <StatusIcon tone={tone} status={status} />
      </span>
      <span>{label ?? LABELS[status]}</span>
    </span>
  );
}
