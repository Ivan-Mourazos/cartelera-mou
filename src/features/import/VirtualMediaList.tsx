import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Poster } from "../../components/Poster";
import { StatusBadge } from "../../components/StatusBadge";
import type { ScanItem } from "../../services/types";

interface VirtualMediaListProps {
  items: ScanItem[];
  selectedIds: ReadonlySet<string>;
  activeId: string | null;
  onActivate: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onToggleExcluded: (id: string) => void;
}

function canSelect(item: ScanItem): boolean {
  return !["conflict", "error", "excluded", "renamed"].includes(item.status);
}

export function VirtualMediaList({
  items,
  selectedIds,
  activeId,
  onActivate,
  onToggleSelected,
  onToggleExcluded,
}: VirtualMediaListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual is intentionally the state owner for the recycled viewport.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 8,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  return (
    <div
      className="media-table"
      role="table"
      aria-label="Archivos analizados"
      aria-rowcount={items.length + 1}
    >
      <div className="media-table__header" role="row" aria-rowindex={1}>
        <span role="columnheader" aria-label="Seleccionar" />
        <span role="columnheader">Archivo</span>
        <span role="columnheader">Coincidencia</span>
        <span role="columnheader">Estado</span>
        <span role="columnheader" aria-label="Acciones" />
      </div>
      <div className="media-table__viewport" ref={scrollRef}>
        <div className="media-table__spacer" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            if (!item) return null;
            const selectable = canSelect(item);
            return (
              <div
                key={item.id}
                className={`media-row ${activeId === item.id ? "media-row--active" : ""} ${item.status === "excluded" ? "media-row--excluded" : ""}`}
                role="row"
                aria-rowindex={virtualRow.index + 2}
                tabIndex={0}
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                onClick={() => onActivate(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onActivate(item.id);
                }}
              >
                <span role="cell" className="media-row__check">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    disabled={!selectable}
                    aria-label={`Seleccionar ${item.originalFilename}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggleSelected(item.id)}
                  />
                </span>
                <span role="cell" className="media-row__file">
                  <span className="media-row__poster">
                    <Poster
                      src={item.posterUrl}
                      title={item.title}
                      accentKey={item.mediaFileId}
                      decorative
                    />
                  </span>
                  <span className="media-row__names">
                    <bdi className="media-row__current" title={item.originalFilename}>
                      {item.originalFilename}
                    </bdi>
                    <bdi className="media-row__proposed" title={item.proposedFilename}>
                      {item.proposedFilename}
                    </bdi>
                    <span>
                      {item.title} · {item.year ?? "Año por revisar"}
                    </span>
                  </span>
                </span>
                <span role="cell" className="media-row__score">
                  <StatusBadge
                    status={item.matchLevel}
                    label={
                      item.matchScore === null
                        ? "Sin puntuación"
                        : `${item.matchLevel === "high" ? "Alta" : item.matchLevel === "medium" ? "Media" : "Baja"} · ${item.matchScore} pt`
                    }
                  />
                </span>
                <span role="cell" className="media-row__status">
                  <StatusBadge status={item.status} />
                  {item.warnings.length > 0 ? (
                    <span className="media-row__warning" title={item.warnings.join(" ")}>
                      <AlertTriangle size={14} aria-label={`${item.warnings.length} avisos`} />
                    </span>
                  ) : null}
                </span>
                <span role="cell" className="media-row__actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleExcluded(item.id);
                    }}
                    aria-label={
                      item.status === "excluded"
                        ? `Incluir ${item.originalFilename}`
                        : `Excluir ${item.originalFilename}`
                    }
                    title={item.status === "excluded" ? "Incluir archivo" : "Excluir archivo"}
                  >
                    {item.status === "excluded" ? <Eye size={17} /> : <EyeOff size={17} />}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
