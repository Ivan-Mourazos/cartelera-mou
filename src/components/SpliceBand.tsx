import { Database, FileText, Pencil, ScanLine } from "lucide-react";

import type { MetadataSource, NamingToken } from "../services/types";

const SOURCE_LABELS: Record<MetadataSource, string> = {
  filename: "Nombre original",
  ffprobe: "ffprobe",
  tmdb: "TMDb",
  manual: "Manual",
};

function SourceIcon({ source }: { source: MetadataSource }) {
  if (source === "tmdb") return <Database size={12} />;
  if (source === "ffprobe") return <ScanLine size={12} />;
  if (source === "manual") return <Pencil size={12} />;
  return <FileText size={12} />;
}

interface SpliceBandProps {
  currentName: string;
  proposedName: string;
  tokens: NamingToken[];
  editable?: boolean;
  onProposedNameChange?: (value: string) => void;
  compact?: boolean;
}

export function SpliceBand({
  currentName,
  proposedName,
  tokens,
  editable = false,
  onProposedNameChange,
  compact = false,
}: SpliceBandProps) {
  return (
    <section className={`splice-band ${compact ? "splice-band--compact" : ""}`}>
      <div className="splice-band__lane">
        <span className="splice-band__label">Actual</span>
        <bdi className="splice-band__filename">{currentName}</bdi>
      </div>
      <div className="splice-band__cut" aria-hidden="true">
        <span />
        <span>Corte</span>
        <span />
      </div>
      <div className="splice-band__lane">
        <label className="splice-band__label" htmlFor={editable ? "proposed-filename" : undefined}>
          Propuesto
        </label>
        {editable ? (
          <input
            id="proposed-filename"
            className="splice-band__input"
            value={proposedName}
            onChange={(event) => onProposedNameChange?.(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        ) : (
          <bdi className="splice-band__filename splice-band__filename--proposed">
            {proposedName}
          </bdi>
        )}
      </div>
      {compact || tokens.length === 0 ? null : (
        <div className="splice-band__tokens" aria-label="Origen de cada parte del nombre propuesto">
          {tokens.map((token) => (
            <span className="splice-token" data-source={token.source} key={token.id}>
              <bdi className="splice-token__value">{token.label}</bdi>
              <span className="splice-token__source">
                <SourceIcon source={token.source} />
                {token.edited ? "Editado" : SOURCE_LABELS[token.source]}
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
