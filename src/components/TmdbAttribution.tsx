interface TmdbAttributionProps {
  compact?: boolean;
}

export function TmdbAttribution({ compact = false }: TmdbAttributionProps) {
  return (
    <div className={`tmdb-attribution${compact ? " tmdb-attribution--compact" : ""}`}>
      <img src="/tmdb-logo.svg" alt="The Movie Database (TMDB)" />
      <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div>
  );
}
