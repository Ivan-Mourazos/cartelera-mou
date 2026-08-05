import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action = null }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <div className="empty-state__frames" aria-hidden="true">
        <span />
        <span />
        <Icon size={26} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </section>
  );
}
