import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "compact";
  leadingIcon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "default",
  leadingIcon = null,
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`button button--${variant} button--${size} ${className}`.trim()}
    >
      {leadingIcon ? (
        <span className="button__icon" aria-hidden="true">
          {leadingIcon}
        </span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}
