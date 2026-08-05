import type { ReactNode } from "react";

interface ScreenHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function ScreenHeader({ eyebrow, title, description, actions = null }: ScreenHeaderProps) {
  return (
    <header className="screen-header">
      <div className="screen-header__copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="screen-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="screen-header__actions">{actions}</div> : null}
    </header>
  );
}
