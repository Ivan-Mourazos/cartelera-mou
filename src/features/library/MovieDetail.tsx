import { ArrowLeft, Copy, HardDrive, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "../../components/Button";
import { Poster } from "../../components/Poster";
import { SpliceBand } from "../../components/SpliceBand";
import { TmdbAttribution } from "../../components/TmdbAttribution";
import { formatBitrate, formatBytes, formatDate, formatDuration } from "../../components/format";
import type { MovieRecord, NamingToken } from "../../services/types";

type DetailTab = "summary" | "file" | "video" | "audio" | "subtitles" | "advanced";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "summary", label: "Resumen" },
  { id: "file", label: "Archivo" },
  { id: "video", label: "Vídeo" },
  { id: "audio", label: "Audio" },
  { id: "subtitles", label: "Subtítulos" },
  { id: "advanced", label: "Avanzado" },
];

function filenameTokens(filename: string): NamingToken[] {
  const tokens: NamingToken[] = [];
  const extensionIndex = filename.lastIndexOf(".");
  const stem = extensionIndex >= 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex) : "";
  const year = /\(\d{4}\)/u.exec(stem);
  const titleEnd = year?.index ?? stem.indexOf("[");
  tokens.push({
    id: "title",
    label: stem.slice(0, titleEnd >= 0 ? titleEnd : stem.length).trim(),
    source: "tmdb",
    kind: "title",
    edited: false,
  });
  if (year)
    tokens.push({ id: "year", label: year[0], source: "tmdb", kind: "year", edited: false });
  [...stem.matchAll(/\[[^\]]+\]/gu)].forEach((match, index) => {
    tokens.push({
      id: `tag-${index}`,
      label: match[0],
      source: index < 2 ? "filename" : "ffprobe",
      kind: "tag",
      edited: false,
    });
  });
  if (extension)
    tokens.push({
      id: "extension",
      label: extension,
      source: "filename",
      kind: "extension",
      edited: false,
    });
  return tokens;
}

function DefinitionRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="definition-row">
      <dt>{label}</dt>
      <dd>{value ?? "No disponible"}</dd>
    </div>
  );
}

interface MovieDetailProps {
  movie: MovieRecord;
  onBack: () => void;
}

export function MovieDetail({ movie, onBack }: MovieDetailProps) {
  const [tab, setTab] = useState<DetailTab>("summary");
  const [copied, setCopied] = useState(false);

  async function copyPath() {
    await navigator.clipboard.writeText(movie.currentPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <article className="movie-detail">
      <button type="button" className="detail-back" onClick={onBack}>
        <ArrowLeft size={17} /> Volver a Biblioteca
      </button>
      <header className="movie-hero" data-accent={String(movie.id % 6)}>
        <div className="movie-hero__grain" aria-hidden="true" />
        <Poster src={movie.posterUrl} title={movie.title} accentKey={movie.id} />
        <div className="movie-hero__copy">
          <p className="eyebrow">Ficha de película</p>
          <h1>{movie.title}</h1>
          <p className="movie-hero__original">{movie.originalTitle}</p>
          <div className="movie-hero__meta">
            <span>{movie.year ?? "Año desconocido"}</span>
            <span>{formatDuration(movie.runtimeMinutes)}</span>
            <span>{movie.genres.join(" · ")}</span>
          </div>
          <div className="movie-hero__actions">
            <Button
              variant="ghost"
              leadingIcon={<Copy size={17} />}
              onClick={() => void copyPath()}
            >
              {copied ? "Ruta copiada" : "Copiar ruta"}
            </Button>
          </div>
        </div>
      </header>

      <div className="detail-tabs" role="tablist" aria-label="Secciones de la ficha">
        {TABS.map((item) => (
          <button
            type="button"
            role="tab"
            key={item.id}
            aria-selected={tab === item.id}
            className={tab === item.id ? "is-active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="detail-panel" role="tabpanel">
        {tab === "summary" ? (
          <div className="detail-summary">
            <div className="prose-panel">
              <p className="eyebrow">Sinopsis</p>
              <h2>{movie.title}</h2>
              <p>{movie.overview ?? "No hay una sinopsis disponible para esta película."}</p>
            </div>
            <dl className="definition-list">
              <DefinitionRow label="Incorporada" value={formatDate(movie.addedAt)} />
              <DefinitionRow label="Resolución" value={movie.resolution} />
              <DefinitionRow label="Fuente" value={movie.source} />
              <DefinitionRow label="Tamaño" value={formatBytes(movie.sizeBytes)} />
              <DefinitionRow label="Colección" value={movie.collectionName} />
            </dl>
          </div>
        ) : null}

        {tab === "file" ? (
          <div className="detail-stack">
            <SpliceBand
              currentName={movie.currentFilename}
              proposedName={movie.currentFilename}
              tokens={filenameTokens(movie.currentFilename)}
            />
            <dl className="definition-list definition-list--wide">
              <DefinitionRow label="Ubicación actual" value={movie.currentPath} />
              <DefinitionRow label="Contenedor" value={movie.container} />
              <DefinitionRow label="Extensión" value={movie.extension.toLocaleUpperCase("es-ES")} />
              <DefinitionRow label="Tamaño" value={formatBytes(movie.sizeBytes)} />
            </dl>
          </div>
        ) : null}

        {tab === "video" ? (
          movie.video ? (
            <dl className="technical-grid">
              <DefinitionRow label="Códec" value={movie.video.codec} />
              <DefinitionRow label="Perfil" value={movie.video.profile} />
              <DefinitionRow
                label="Dimensiones"
                value={
                  movie.video.width && movie.video.height
                    ? `${movie.video.width} × ${movie.video.height}`
                    : null
                }
              />
              <DefinitionRow
                label="Profundidad"
                value={movie.video.bitDepth ? `${movie.video.bitDepth}-bit` : null}
              />
              <DefinitionRow label="HDR" value={movie.video.hdrFormat} />
              <DefinitionRow label="Espacio de color" value={movie.video.colorSpace} />
              <DefinitionRow
                label="Fotogramas"
                value={movie.video.frameRate ? `${movie.video.frameRate} fps` : null}
              />
              <DefinitionRow label="Bitrate" value={formatBitrate(movie.video.bitrate)} />
            </dl>
          ) : (
            <p className="detail-empty">
              No hay información de vídeo. Valida ffprobe y vuelve a analizar el archivo.
            </p>
          )
        ) : null}

        {tab === "audio" ? (
          <div className="track-list">
            {movie.audioTracks.map((track) => (
              <article className="track-card" key={track.index}>
                <div className="track-card__index">A{track.index}</div>
                <div>
                  <h3>
                    {track.title ??
                      track.language?.toLocaleUpperCase("es-ES") ??
                      "Pista sin idioma"}
                  </h3>
                  <p>
                    {track.codec} · {track.channelLayout ?? `${track.channels ?? "—"} canales`}{" "}
                    {track.hasAtmos ? "· Atmos" : ""}
                  </p>
                </div>
                <div className="track-card__flags">
                  {track.isDefault ? <span>Predeterminada</span> : null}
                  {track.isCommentary ? <span>Comentarios</span> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {tab === "subtitles" ? (
          <div className="track-list">
            {movie.subtitleTracks.map((track) => (
              <article className="track-card" key={track.index}>
                <div className="track-card__index">S{track.index}</div>
                <div>
                  <h3>
                    {track.title ??
                      track.language?.toLocaleUpperCase("es-ES") ??
                      "Subtítulo sin idioma"}
                  </h3>
                  <p>{track.codec}</p>
                </div>
                <div className="track-card__flags">
                  {track.isDefault ? <span>Predeterminado</span> : null}
                  {track.isForced ? <span>Forzado</span> : null}
                  {track.isHearingImpaired ? <span>SDH</span> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {tab === "advanced" ? (
          <div className="advanced-panel">
            <ShieldCheck size={24} aria-hidden="true" />
            <div>
              <p className="eyebrow">Identidad interna</p>
              <h2>Datos para auditoría</h2>
              <dl className="definition-list definition-list--wide">
                <DefinitionRow label="Movie ID" value={movie.id} />
                <DefinitionRow label="Media file ID" value={movie.mediaFileId} />
                <DefinitionRow label="TMDb ID" value={movie.tmdbId} />
              </dl>
              {movie.tmdbId ? <TmdbAttribution compact /> : null}
            </div>
            <HardDrive size={22} aria-hidden="true" />
          </div>
        ) : null}
      </section>
    </article>
  );
}
