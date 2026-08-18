import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReactNode, RefObject } from "react";

export interface VirtualFileListProps {
  readonly count: number;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly renderRow: (index: number) => ReactNode;
}

/**
 * Lista virtualizada.
 *
 * Vive en su propio componente porque `useVirtualizer` devuelve funciones que el
 * compilador de React no puede memoizar: aislarlo evita que la exclusión afecte
 * a toda la pantalla.
 */
export const VirtualFileList = ({ count, scrollRef, renderRow }: VirtualFileListProps) => {
  // eslint-disable-next-line react-hooks/incompatible-library -- el aislamiento en este componente ES la mitigación
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });

  return (
    <div className="virtual-canvas" style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
      {virtualizer.getVirtualItems().map((virtualRow) => (
        <div
          key={virtualRow.key}
          ref={virtualizer.measureElement}
          data-index={virtualRow.index}
          className="virtual-row"
          style={{ transform: `translateY(${String(virtualRow.start)}px)` }}
        >
          {renderRow(virtualRow.index)}
        </div>
      ))}
    </div>
  );
};
