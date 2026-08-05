import { FolderSearch, History, Library, Settings2 } from "lucide-react";
import type { ReactNode } from "react";

import type { AppSection, ScanProgress } from "../services/types";
import { BrandMark } from "./BrandMark";

const NAVIGATION: {
  id: AppSection;
  label: string;
  shortcut: string;
  icon: typeof Library;
}[] = [
  { id: "library", label: "Biblioteca", shortcut: "Alt+1", icon: Library },
  { id: "import", label: "Importar", shortcut: "Alt+2", icon: FolderSearch },
  { id: "history", label: "Historial", shortcut: "Alt+3", icon: History },
  { id: "settings", label: "Ajustes", shortcut: "Alt+4", icon: Settings2 },
];

interface AppShellProps {
  productName: string;
  tagline: string;
  activeSection: AppSection;
  demoMode: boolean;
  progress: ScanProgress | null;
  onNavigate: (section: AppSection) => void;
  children: ReactNode;
}

export function AppShell({
  productName,
  tagline,
  activeSection,
  demoMode,
  progress,
  onNavigate,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand-wide">
          <BrandMark productName={productName} />
        </div>
        <div className="sidebar__brand-compact">
          <BrandMark productName={productName} compact />
        </div>
        <nav className="sidebar__nav" aria-label="Navegación principal">
          {NAVIGATION.map(({ id, label, shortcut, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${activeSection === id ? "nav-item--active" : ""}`}
              aria-current={activeSection === id ? "page" : undefined}
              aria-label={`${label} (${shortcut})`}
              title={`${label} · ${shortcut}`}
              onClick={() => onNavigate(id)}
            >
              <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {progress && progress.stage !== "complete" ? (
          <button type="button" className="sidebar-task" onClick={() => onNavigate("import")}>
            <span className="sidebar-task__pulse" aria-hidden="true" />
            <span>
              <strong>Analizando</strong>
              <small>
                {progress.total > 0 ? `${progress.completed}/${progress.total}` : "Preparando"}
              </small>
            </span>
          </button>
        ) : null}
      </aside>
      <div className="app-stage">
        <header className="context-bar">
          <p>{tagline}</p>
          <div className="context-bar__status">
            <span className="local-status">
              <span aria-hidden="true" /> Solo local
            </span>
            {demoMode ? <span className="demo-badge">Modo demostración</span> : null}
          </div>
        </header>
        <main className="app-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
