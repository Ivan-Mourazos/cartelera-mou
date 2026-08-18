import type { WorkKind } from "./providers/types";

/**
 * Memoria de correcciones manuales.
 *
 * Cuando alguien corrige el emparejado de una obra, esa decisión vale para
 * todos los archivos futuros de la misma obra. Es la única forma de que la
 * herramienta mejore con el uso sin enviar nada a ningún sitio.
 */

const STORAGE_KEY = "renombrador.corrections.v1";

/**
 * Almacén mínimo. Se resuelve en cada llamada en lugar de capturarse al cargar
 * el módulo: así funciona igual en el navegador, en las pruebas y en cualquier
 * entorno sin `localStorage`, sin arrastrar una dependencia de DOM.
 */
interface KeyValueStore {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const memoryStore = new Map<string, string>();

const fallbackStore: KeyValueStore = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, value) => {
    memoryStore.set(key, value);
  },
  removeItem: (key) => {
    memoryStore.delete(key);
  },
};

const store = (): KeyValueStore => {
  try {
    // Se comprueba en tiempo de ejecución: los tipos del DOM lo dan por presente,
    // pero fuera del navegador no existe.
    const candidate: unknown = (globalThis as { localStorage?: unknown }).localStorage;
    return candidate === undefined || candidate === null
      ? fallbackStore
      : (candidate as KeyValueStore);
  } catch {
    // Algunos navegadores lanzan al leer `localStorage` con las cookies bloqueadas.
    return fallbackStore;
  }
};

const normalizeKey = (title: string, kind: WorkKind): string =>
  `${kind}|${title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ")}`;

const readAll = (): Record<string, number> => {
  try {
    const raw = store().getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  } catch {
    return {};
  }
};

export const rememberCorrection = (title: string, kind: WorkKind, tmdbId: number): void => {
  if (title.trim().length === 0) return;
  try {
    const all = readAll();
    all[normalizeKey(title, kind)] = tmdbId;
    store().setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Sin almacenamiento la sesión sigue funcionando: solo no se aprende.
  }
};

export const recallCorrection = (title: string, kind: WorkKind): number | undefined =>
  readAll()[normalizeKey(title, kind)];

export const forgetAllCorrections = (): void => {
  try {
    store().removeItem(STORAGE_KEY);
  } catch {
    // Nada que hacer.
  }
};
