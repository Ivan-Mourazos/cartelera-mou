import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { AppShell } from "../components/AppShell";
import { Notice } from "../components/Notice";
import { HistoryScreen } from "../features/history/HistoryScreen";
import { ImportScreen } from "../features/import/ImportScreen";
import { LibraryScreen } from "../features/library/LibraryScreen";
import { MovieDetail } from "../features/library/MovieDetail";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { createDesktopGateway } from "../services/gateway";
import type {
  AppSection,
  AppSettings,
  HistoryEntry,
  MovieRecord,
  ScanProgress,
} from "../services/types";
import { branding } from "./branding";

type AppRoute = { kind: "section"; section: AppSection } | { kind: "movie"; movieId: number };

const gateway = createDesktopGateway();

export function App() {
  const [route, setRoute] = useState<AppRoute>({ kind: "section", section: "library" });
  const [library, setLibrary] = useState<MovieRecord[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const activeSection: AppSection = route.kind === "movie" ? "library" : route.section;
  const selectedMovie = useMemo(
    () =>
      route.kind === "movie" ? (library.find((movie) => movie.id === route.movieId) ?? null) : null,
    [library, route],
  );

  const reloadLocalData = useCallback(async () => {
    const [nextLibrary, nextHistory] = await Promise.all([
      gateway.listLibrary(),
      gateway.listHistory(),
    ]);
    setLibrary(nextLibrary);
    setHistory(nextHistory);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [nextLibrary, nextHistory, nextSettings] = await Promise.all([
          gateway.listLibrary(),
          gateway.listHistory(),
          gateway.getSettings(),
        ]);
        if (cancelled) return;
        setLibrary(nextLibrary);
        setHistory(nextHistory);
        setSettings(nextSettings);
      } catch (cause) {
        if (!cancelled) {
          setGlobalError(
            cause instanceof Error ? cause.message : "No se pudieron cargar los datos locales.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme ?? "dark";
  }, [settings?.theme]);

  useLayoutEffect(() => {
    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      mainContent.scrollTop = 0;
      mainContent.scrollLeft = 0;
    }
  }, [route]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.altKey && ["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        const sections: AppSection[] = ["library", "import", "history", "settings"];
        const section = sections[Number(event.key) - 1];
        if (section) setRoute({ kind: "section", section });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("es-ES") === "k") {
        event.preventDefault();
        setRoute({ kind: "section", section: "library" });
        window.requestAnimationFrame(() =>
          document
            .querySelector<HTMLInputElement>(".library-toolbar input[type='search']")
            ?.focus(),
        );
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("es-ES") === "o") {
        event.preventDefault();
        setRoute({ kind: "section", section: "import" });
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function navigate(section: AppSection) {
    setRoute({ kind: "section", section });
  }

  const handleRenameCompleted = useCallback(async () => {
    try {
      await reloadLocalData();
    } catch (cause) {
      setGlobalError(
        cause instanceof Error
          ? cause.message
          : "El lote terminó, pero no se pudo actualizar la biblioteca.",
      );
    }
  }, [reloadLocalData]);

  const handleMovieIdentified = useCallback(async () => {
    try {
      setLibrary(await gateway.listLibrary());
    } catch (cause) {
      setGlobalError(
        cause instanceof Error
          ? cause.message
          : "La identificación se guardó, pero no se pudo actualizar la biblioteca.",
      );
    }
  }, []);

  const handleHistoryUpdated = useCallback(async () => {
    try {
      await reloadLocalData();
    } catch (cause) {
      setGlobalError(
        cause instanceof Error ? cause.message : "No se pudo actualizar el historial.",
      );
    }
  }, [reloadLocalData]);

  return (
    <AppShell
      productName={branding.productName}
      tagline={branding.tagline}
      activeSection={activeSection}
      demoMode={gateway.mode === "demo"}
      progress={progress}
      onNavigate={navigate}
    >
      {globalError ? (
        <div className="global-notice">
          <Notice
            tone="error"
            title="No se pudo completar una operación local"
            message={globalError}
            onDismiss={() => setGlobalError(null)}
          />
        </div>
      ) : null}

      {route.kind === "movie" && selectedMovie ? (
        <MovieDetail movie={selectedMovie} onBack={() => navigate("library")} />
      ) : null}
      {route.kind === "movie" && !selectedMovie && !loading ? (
        <LibraryScreen
          movies={library}
          loading={false}
          onOpenMovie={(movieId) => setRoute({ kind: "movie", movieId })}
          onImport={() => navigate("import")}
        />
      ) : null}
      {route.kind === "section" && route.section === "library" ? (
        <LibraryScreen
          movies={library}
          loading={loading}
          onOpenMovie={(movieId) => setRoute({ kind: "movie", movieId })}
          onImport={() => navigate("import")}
        />
      ) : null}
      {route.kind === "section" && route.section === "import" ? (
        settings ? (
          <ImportScreen
            gateway={gateway}
            settings={settings}
            onProgressChange={setProgress}
            onIdentified={handleMovieIdentified}
            onCompleted={handleRenameCompleted}
          />
        ) : (
          <div className="screen import-screen">
            <div className="settings-loading" aria-busy="true">
              Cargando ajustes locales…
            </div>
          </div>
        )
      ) : null}
      {route.kind === "section" && route.section === "history" ? (
        <HistoryScreen
          gateway={gateway}
          entries={history}
          loading={loading}
          onUpdated={handleHistoryUpdated}
        />
      ) : null}
      {route.kind === "section" && route.section === "settings" ? (
        settings ? (
          <SettingsScreen gateway={gateway} settings={settings} onSaved={setSettings} />
        ) : (
          <div className="screen settings-screen">
            <div className="settings-loading" aria-busy="true">
              Cargando ajustes locales…
            </div>
          </div>
        )
      ) : null}
    </AppShell>
  );
}
