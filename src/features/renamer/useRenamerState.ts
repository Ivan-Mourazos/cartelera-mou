import { useCallback, useMemo, useRef, useState } from "react";

import {
  applyUserCorrection,
  setContentKind,
  type EditableIdentificationField,
} from "../../domain/identification/build";
import type { SourceMedia, SourceType } from "../../domain/media/types";
import { runWithConcurrency } from "../../services/analysis/queue";
import {
  createDirectoryRenamePort,
  createHandleRenamePort,
  openFilesPicker,
  type PickedFile,
} from "../../services/file-system";
import {
  analyzeMediaItem,
  createMediaItem,
  effectiveName,
  identifyMediaItem,
  preserveUserEdits,
  recomputeName,
  withIdentification,
  withSource,
  type MediaItem,
} from "../../services/item-pipeline";
import { applyCandidate } from "../../services/identification-service";
import { createTmdbProvider } from "../../services/providers/tmdb";
import {
  nullMetadataProvider,
  type MetadataProvider,
  type ProviderCandidate,
} from "../../services/providers/types";
import { executeRenamePlan } from "../../services/rename/executor";
import {
  latestUndoableBatch,
  markBatchUndone,
  recordRenameBatch,
  type RenameLogRecord,
} from "../../services/rename/log";
import { buildRenamePlan, type RenamePlan } from "../../services/rename/plan";
import { undoRenameBatch } from "../../services/rename/undo";
import { loadSettings, saveSettings, type AppSettings } from "../../services/settings";

export interface Progress {
  readonly active: boolean;
  readonly label: string;
  readonly done: number;
  readonly total: number;
  readonly current: string;
}

const IDLE_PROGRESS: Progress = { active: false, label: "", done: 0, total: 0, current: "" };

export const useRenamerState = () => {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [items, setItems] = useState<readonly MediaItem[]>([]);
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState<string | undefined>(undefined);
  const [existingNames, setExistingNames] = useState<readonly string[]>([]);
  const [progress, setProgress] = useState<Progress>(IDLE_PROGRESS);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoable, setUndoable] = useState<RenameLogRecord | undefined>(() =>
    latestUndoableBatch(),
  );

  const abortRef = useRef<AbortController | null>(null);

  const provider = useMemo<MetadataProvider>(
    () =>
      settings.tmdbApiKey.trim().length > 0
        ? createTmdbProvider({ key: settings.tmdbApiKey })
        : nullMetadataProvider,
    [settings.tmdbApiKey],
  );

  const updateSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
    setItems((current) => current.map((item) => recomputeName(item, next)));
  }, []);

  const patchItem = useCallback((id: string, patch: (item: MediaItem) => MediaItem) => {
    setItems((current) => current.map((item) => (item.id === id ? patch(item) : item)));
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(IDLE_PROGRESS);
  }, []);

  /** Análisis técnico + identificación, con concurrencia limitada y cancelable. */
  const processItems = useCallback(
    async (targets: readonly MediaItem[], currentSettings: AppSettings) => {
      if (targets.length === 0) return;

      const controller = new AbortController();
      abortRef.current = controller;
      setProgress({
        active: true,
        label: "Analizando",
        done: 0,
        total: targets.length,
        current: "",
      });

      await runWithConcurrency(
        targets,
        async (item) => {
          const analyzed = await analyzeMediaItem(item, currentSettings, controller.signal);
          patchItem(item.id, (current) => preserveUserEdits(current, analyzed, currentSettings));

          const identified = await identifyMediaItem(
            analyzed,
            provider,
            currentSettings,
            controller.signal,
          );
          patchItem(item.id, (current) => preserveUserEdits(current, identified, currentSettings));
          return identified;
        },
        {
          concurrency: currentSettings.analysisConcurrency,
          signal: controller.signal,
          onProgress: (done, total) => {
            setProgress((previous) => ({ ...previous, done, total }));
          },
        },
      );

      abortRef.current = null;
      setProgress(IDLE_PROGRESS);
    },
    [patchItem, provider],
  );

  const addFiles = useCallback(
    async (picked: readonly PickedFile[], replace: boolean) => {
      if (picked.length === 0) {
        setNotice("No se encontraron archivos de vídeo compatibles.");
        return;
      }
      const created = picked.map((file) => createMediaItem(file, settings));
      setItems((current) => (replace ? created : [...current, ...created]));
      await processItems(created, settings);
    },
    [processItems, settings],
  );

  const removeItem = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  /**
   * Vuelve a pedir los archivos con el selector del navegador para obtener el
   * acceso de escritura que arrastrar y soltar no siempre concede. Los empareja
   * por nombre y conserva el análisis ya hecho.
   */
  const grantAccess = useCallback(async () => {
    const picked = await openFilesPicker();
    if (picked === null || picked.length === 0) return;

    const byName = new Map(picked.map((file) => [file.name, file]));
    let attached = 0;
    setItems((current) =>
      current.map((item) => {
        if (item.handle !== undefined) return item;
        const match = byName.get(item.currentName);
        if (match?.handle === undefined) return item;
        attached += 1;
        return { ...item, handle: match.handle };
      }),
    );

    setNotice(
      attached > 0
        ? `Acceso concedido a ${String(attached)} archivo(s).`
        : "Ninguno de los archivos elegidos coincide con los de la lista.",
    );
  }, []);

  const clearAll = useCallback(() => {
    cancel();
    setItems([]);
    setDirectory(null);
    setFolderName(undefined);
    setExistingNames([]);
  }, [cancel]);

  const setNameOverride = useCallback(
    (id: string, value: string | undefined) => {
      patchItem(id, (item) => ({ ...item, nameOverride: value }));
    },
    [patchItem],
  );

  /**
   * Búsqueda manual en el proveedor. Es la salida cuando el nombre del archivo
   * está tan destrozado que la búsqueda automática no encuentra nada.
   */
  const searchWork = useCallback(
    async (query: string, kind: "movie" | "series"): Promise<readonly ProviderCandidate[]> => {
      if (!provider.available) {
        setNotice("Añade tu clave de TMDb en la configuración para poder buscar.");
        return [];
      }
      try {
        return await provider.search({ title: query, kind });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "No se pudo buscar en TMDb.");
        return [];
      }
    },
    [provider],
  );

  /** Aplica el resultado elegido a mano: título oficial, año y título de episodio. */
  const chooseCandidate = useCallback(
    async (id: string, candidate: ProviderCandidate) => {
      const item = items.find((entry) => entry.id === id);
      if (item === undefined) return;

      const identification = await applyCandidate(item.identification, candidate, provider, {
        score: 100,
        band: "high",
        components: [
          { code: "previous-correction", points: 100, explanation: "Elegido a mano: +100" },
        ],
        alternatives: [],
      });
      // Elegir una obra es una decisión más reciente que cualquier nombre escrito
      // antes a mano: se descarta ese texto para que la propuesta se regenere.
      patchItem(id, (current) => ({
        ...withIdentification(current, identification, settings),
        nameOverride: undefined,
      }));
      setNotice(`Datos aplicados: ${candidate.spanishTitle} (${String(candidate.year ?? "—")}).`);
    },
    [items, patchItem, provider, settings],
  );

  /** Corrección manual de título, año, temporada o episodio. */
  const editIdentification = useCallback(
    (id: string, field: EditableIdentificationField, value: string | number | undefined) => {
      patchItem(id, (item) =>
        withIdentification(item, applyUserCorrection(item.identification, field, value), settings),
      );
    },
    [patchItem, settings],
  );

  /** Cambia entre película y serie a mano. */
  const setKind = useCallback(
    (id: string, kind: "movie" | "series") => {
      patchItem(id, (item) => ({
        ...withIdentification(item, setContentKind(item.identification, kind), settings),
        kindLocked: true,
      }));
    },
    [patchItem, settings],
  );

  /** Fuente y REMUX a mano: el archivo nunca puede confirmarlos por sí solo. */
  const setSource = useCallback(
    (id: string, media: SourceMedia | undefined, type: SourceType | undefined) => {
      patchItem(id, (item) =>
        withSource(item, { media, ...(type === undefined ? {} : { type }) }, settings),
      );
    },
    [patchItem, settings],
  );

  /** Solo con una carpeta abierta se puede comprobar si el destino ya existe. */
  const canCheckDestination = directory !== null;

  const planFor = useCallback(
    (source: readonly MediaItem[]): RenamePlan =>
      buildRenamePlan(
        source.map((item) => ({
          id: item.id,
          currentName: item.currentName,
          proposedName: effectiveName(item),
          hasHandle: item.handle !== undefined,
        })),
        { existingNames, requireHandles: true },
      ),
    [existingNames],
  );

  /** Plan mostrado en pantalla. La ejecución recalcula con el estado más fresco. */
  const plan = useMemo<RenamePlan>(() => planFor(items), [items, planFor]);

  const portFor = useCallback(() => {
    const handles = new Map<string, FileSystemFileHandle>();
    for (const item of items) {
      if (item.handle !== undefined) handles.set(item.id, item.handle);
    }
    return directory === null
      ? createHandleRenamePort(handles)
      : createDirectoryRenamePort(directory, handles);
  }, [directory, items]);

  const renameAll = useCallback(async () => {
    // El plan se recalcula a partir del estado actual justo antes de ejecutar.
    const freshPlan = planFor(items);
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({
      active: true,
      label: "Renombrando",
      done: 0,
      total: freshPlan.readyCount,
      current: "",
    });

    const result = await executeRenamePlan(freshPlan, portFor(), {
      dryRun: false,
      signal: controller.signal,
      onProgress: (done, total, current) => {
        setProgress({ active: true, label: "Renombrando", done, total, current });
      },
    });

    abortRef.current = null;
    setProgress(IDLE_PROGRESS);

    if (result.renamed > 0) {
      setUndoable(
        recordRenameBatch(result, { batchId: `batch-${Date.now().toString(36)}`, folderName }),
      );

      const renamedById = new Map(
        result.entries
          .filter((entry) => entry.outcome === "renamed")
          .map((entry) => [entry.id, entry.to]),
      );
      setItems((current) =>
        current.map((item) => {
          const newName = renamedById.get(item.id);
          return newName === undefined
            ? item
            : {
                ...item,
                currentName: newName,
                status: "renamed" as const,
                nameOverride: undefined,
              };
        }),
      );
      setExistingNames((current) => [
        ...current.filter((name) => !renamedById.has(name)),
        ...renamedById.values(),
      ]);
    }

    const firstError = result.entries.find((entry) => entry.outcome === "failed")?.error;
    setNotice(
      result.failed === 0
        ? `Renombrados ${String(result.renamed)} archivo(s).`
        : `Renombrados ${String(result.renamed)}; ${String(result.failed)} con error: ${firstError ?? "desconocido"}`,
    );
  }, [folderName, items, planFor, portFor]);

  const undoLast = useCallback(async () => {
    if (undoable === undefined) {
      setNotice("No hay ningún renombrado que deshacer.");
      return;
    }

    const result = await undoRenameBatch(undoable, portFor(), { existingNames, dryRun: false });

    if (result.renamed > 0) {
      markBatchUndone(undoable.batchId);
      setUndoable(latestUndoableBatch());
      const restored = new Map(
        result.entries
          .filter((entry) => entry.outcome === "renamed")
          .map((entry) => [entry.id, entry.to]),
      );
      setItems((current) =>
        current.map((item) => {
          const name = restored.get(item.id);
          return name === undefined
            ? item
            : { ...item, currentName: name, status: "ready" as const };
        }),
      );
    }

    setNotice(
      `Deshacer: ${String(result.renamed)} restaurados, ${String(result.failed)} con error.`,
    );
  }, [existingNames, portFor, undoable]);

  return {
    settings,
    updateSettings,
    items,
    plan,
    canCheckDestination,
    progress,
    notice,
    setNotice,
    undoable,
    provider,
    folderName,
    setDirectory,
    setFolderName,
    setExistingNames,
    addFiles,
    cancel,
    removeItem,
    grantAccess,
    clearAll,
    setNameOverride,
    searchWork,
    chooseCandidate,
    editIdentification,
    setKind,
    setSource,
    renameAll,
    undoLast,
  };
};

export type RenamerState = ReturnType<typeof useRenamerState>;
