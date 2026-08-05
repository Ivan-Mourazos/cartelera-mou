import { Film } from "lucide-react";

interface PosterProps {
  src: string | null;
  title: string;
  accentKey?: number;
  decorative?: boolean;
}

export function Poster({ src, title, accentKey = 0, decorative = false }: PosterProps) {
  if (src) {
    return (
      <img
        className="poster"
        src={src}
        alt={decorative ? "" : `Carátula de ${title}`}
        loading="lazy"
      />
    );
  }

  const initials = title
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("es-ES") ?? "")
    .join("");

  return (
    <div
      className="poster poster--placeholder"
      data-accent={String(accentKey % 6)}
      aria-label={decorative ? undefined : `Carátula no disponible para ${title}`}
      aria-hidden={decorative ? "true" : undefined}
    >
      <Film size={22} aria-hidden="true" />
      <span className="poster__initials">{initials}</span>
      <span className="poster__shelf-code">CV-{String(accentKey + 1).padStart(4, "0")}</span>
    </div>
  );
}
