# Renombrador: formato de release, motor de detección y rediseño de interfaz — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la aplicación proponga nombres con vocabulario de release (`[4K 2160p BluRay REMUX HEVC 10bit DV] [Castellano TrueHD Atmos 7.1 · ENG]`), identifique correctamente cada obra en TMDb sin intervención manual, y presente todo en una única pantalla minimal con revisión dirigida y confirmación antes de tocar el disco.

**Architecture:** Se conserva la separación actual dominio puro / servicios / interfaz y el modelo `Traced<T>` de procedencia y confianza. Se añaden módulos de vocabulario, inferencia de fuente y presupuesto de longitud en el dominio; un resolvedor en cascada sobre el proveedor TMDb en servicios; y una capa de presentación nueva construida sobre helpers puros y testeables. La capa de renombrado (preflight, ejecución, registro, deshacer) no se toca.

**Tech Stack:** TypeScript estricto, React 19, Vite 8, Vitest 4, Zod 4, mediainfo.js (WASM), `@tanstack/react-virtual`, File System Access API.

**Spec:** [`docs/superpowers/specs/2026-08-18-renombrador-formato-deteccion-ux-design.md`](../specs/2026-08-18-renombrador-formato-deteccion-ux-design.md)

## Global Constraints

- El dominio (`src/domain/**`) es puro: sin React, sin `window`, sin `fetch`, sin `localStorage`.
- Ningún dato técnico se escribe en el nombre a partir del nombre original salvo respaldo declarado y visible; todo dato viaja con `Traced<T>`.
- El renombrado usa exclusivamente `FileSystemFileHandle.move()`. Nunca copiar y borrar.
- Todo texto de interfaz en español de España.
- Objetivo de longitud del nombre: **120** caracteres. Topes duros: **255** unidades UTF-16 por componente, **259** en la ruta completa.
- Caracteres prohibidos en Windows: `< > : " / \ | ? *`. Ninguna etiqueta generada puede contenerlos (por eso `DTS-X`, no `DTS:X`, y `+` como separador de idiomas, no `/`).
- Cada tarea termina con `pnpm test` en verde. Antes del commit final de cada fase: `pnpm check` (format:check + lint sin avisos + test + build).
- Commits en inglés, cuerpo opcional en español. Un commit por tarea.

---

## Estructura de archivos

**Se crean**

| Archivo | Responsabilidad |
| --- | --- |
| `src/domain/naming/release-labels.ts` | Vocabulario único: clases comerciales, etiquetas de resolución, fuentes, códecs de vídeo y audio |
| `src/domain/media/source-inference.ts` | Fuente deducida de bitrate, códec y resolución |
| `src/domain/naming/budget.ts` | Recorte en cascada del nombre al presupuesto |
| `src/domain/identification/embedded-ids.ts` | Identificadores IMDb/TMDb incrustados en el nombre |
| `src/services/identification/resolver.ts` | Cascada de siete consultas y decisión película/serie |
| `src/services/learned-corrections.ts` | Memoria persistente de correcciones manuales |
| `src/features/renamer/row-model.ts` | Helpers puros de la lista: estado por fila, contadores, filtro, selección |
| `src/features/renamer/FileRow.tsx` | Fila compacta |
| `src/features/renamer/RowDetail.tsx` | Detalle desplegable |
| `src/features/renamer/CandidateList.tsx` | Alternativas de TMDb |
| `src/features/renamer/TechnicalSheet.tsx` | Ficha técnica con procedencia |
| `src/features/renamer/BatchPreviewDialog.tsx` | Previsualización y confirmación del lote |
| `src/features/renamer/ListToolbar.tsx` | Contadores-filtro, filtrado y acciones de lote |

**Se modifican**

`src/domain/media/types.ts`, `resolution.ts`, `source.ts`, `audio.ts`, `audio-selection.ts`, `language.ts`, `normalize.ts`; `src/domain/naming/rules.ts`, `template.ts`, `presets.ts`, `build.ts`; `src/domain/identification/hints.ts`; `src/services/providers/types.ts`, `tmdb.ts`, `identification-service.ts`, `item-pipeline.ts`, `settings.ts`; `src/features/renamer/RenamerScreen.tsx`, `SettingsPanel.tsx`, `useRenamerState.ts`; `src/styles/features.css`.

**Se eliminan**

`src/features/renamer/MediaItemCard.tsx` (sustituido por `FileRow` + `RowDetail`).

---

# FASE 1 — Vocabulario y formato del nombre

### Task 1: Vocabulario de release

**Files:**
- Create: `src/domain/naming/release-labels.ts`
- Test: `src/domain/naming/release-labels.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type CommercialClass = "8K" | "4K" | "2K" | "Full HD" | "HD" | "SD"`
  - `type PixelLabel = "4320p" | "2160p" | "1440p" | "1080p" | "720p" | "576p" | "480p"`
  - `type ReleaseSource` (unión de las 17 etiquetas de fuente)
  - `videoCodecLabel(codec: VideoCodecName | undefined): string | undefined`
  - `audioCodecLabel(codec: AudioCodecName | undefined, options: { atmos: boolean; dtsX: boolean }): string | undefined`
  - `bitDepthLabel(bits: number | undefined): string | undefined`
  - `hdrLabel(formats: readonly HdrFormatName[]): string | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/naming/release-labels.test.ts
import { describe, expect, it } from "vitest";

import { audioCodecLabel, bitDepthLabel, hdrLabel, videoCodecLabel } from "./release-labels";

describe("videoCodecLabel", () => {
  it("usa el nombre técnico del stream, nunca el del codificador", () => {
    expect(videoCodecLabel("HEVC")).toBe("HEVC");
    expect(videoCodecLabel("AVC")).toBe("AVC");
    expect(videoCodecLabel(undefined)).toBeUndefined();
  });
});

describe("audioCodecLabel", () => {
  it("abrevia Dolby Digital como en las publicaciones", () => {
    expect(audioCodecLabel("Dolby Digital Plus", { atmos: false, dtsX: false })).toBe("DD+");
    expect(audioCodecLabel("Dolby Digital", { atmos: false, dtsX: false })).toBe("DD");
  });

  it("añade el audio espacial tras el códec", () => {
    expect(audioCodecLabel("TrueHD", { atmos: true, dtsX: false })).toBe("TrueHD Atmos");
    expect(audioCodecLabel("Dolby Digital Plus", { atmos: true, dtsX: false })).toBe("DD+ Atmos");
  });

  it("escribe DTS-X con guion: los dos puntos están prohibidos en Windows", () => {
    expect(audioCodecLabel("DTS-HD MA", { atmos: false, dtsX: true })).toBe("DTS-X");
    expect(audioCodecLabel("DTS-HD MA", { atmos: false, dtsX: true })).not.toContain(":");
  });
});

describe("bitDepthLabel", () => {
  it("solo escribe la profundidad cuando supera 8 bits", () => {
    expect(bitDepthLabel(8)).toBeUndefined();
    expect(bitDepthLabel(10)).toBe("10bit");
    expect(bitDepthLabel(12)).toBe("12bit");
    expect(bitDepthLabel(undefined)).toBeUndefined();
  });
});

describe("hdrLabel", () => {
  it("Dolby Vision gana sobre su capa base", () => {
    expect(hdrLabel(["Dolby Vision", "HDR10"])).toBe("DV");
    expect(hdrLabel(["HDR10+"])).toBe("HDR10+");
    expect(hdrLabel(["HDR10"])).toBe("HDR10");
    expect(hdrLabel([])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/naming/release-labels.test.ts`
Expected: FAIL — `Failed to resolve import "./release-labels"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/naming/release-labels.ts
import type { AudioCodecName, HdrFormatName, VideoCodecName } from "../media/types";

/**
 * Vocabulario único de presentación. Cualquier etiqueta que acabe en el nombre
 * de un archivo se decide aquí, de modo que el formato no quede repartido.
 */

/** Clase comercial tal y como se anuncia en las publicaciones. */
export type CommercialClass = "8K" | "4K" | "2K" | "Full HD" | "HD" | "SD";

/** Resolución en píxeles verticales del máster. */
export type PixelLabel = "4320p" | "2160p" | "1440p" | "1080p" | "720p" | "576p" | "480p";

/** Fuente del material. Nunca verificable en el archivo: siempre inferida o manual. */
export type ReleaseSource =
  | "BluRay REMUX"
  | "BluRay"
  | "UHDRip"
  | "BDRip"
  | "BRRip"
  | "WEB-DL"
  | "WEBRip"
  | "HDTV"
  | "HDTVRip"
  | "microHD"
  | "HDRip"
  | "DVDRip"
  | "DVDScr"
  | "SCR"
  | "TC"
  | "TS"
  | "CamRip";

export const ALL_RELEASE_SOURCES: readonly ReleaseSource[] = [
  "BluRay REMUX",
  "BluRay",
  "UHDRip",
  "BDRip",
  "BRRip",
  "WEB-DL",
  "WEBRip",
  "HDTV",
  "HDTVRip",
  "microHD",
  "HDRip",
  "DVDRip",
  "DVDScr",
  "SCR",
  "TC",
  "TS",
  "CamRip",
];

export const videoCodecLabel = (codec: VideoCodecName | undefined): string | undefined => codec;

const AUDIO_CODEC_LABELS: Readonly<Partial<Record<AudioCodecName, string>>> = {
  "Dolby Digital Plus": "DD+",
  "Dolby Digital": "DD",
};

export const audioCodecLabel = (
  codec: AudioCodecName | undefined,
  options: { readonly atmos: boolean; readonly dtsX: boolean },
): string | undefined => {
  if (codec === undefined) return undefined;
  // `:` es un carácter prohibido en nombres de archivo de Windows.
  if (options.dtsX) return "DTS-X";
  const base = AUDIO_CODEC_LABELS[codec] ?? codec;
  return options.atmos ? `${base} Atmos` : base;
};

export const bitDepthLabel = (bits: number | undefined): string | undefined =>
  bits === undefined || bits <= 8 ? undefined : `${String(bits)}bit`;

export const hdrLabel = (formats: readonly HdrFormatName[]): string | undefined => {
  if (formats.includes("Dolby Vision")) return "DV";
  if (formats.includes("HDR10+")) return "HDR10+";
  if (formats.includes("HDR10")) return "HDR10";
  if (formats.includes("HLG")) return "HLG";
  return undefined;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/naming/release-labels.test.ts`
Expected: PASS, 4 grupos.

- [ ] **Step 5: Commit**

```bash
git add src/domain/naming/release-labels.ts src/domain/naming/release-labels.test.ts
git commit -m "feat(naming): add release label vocabulary"
```

---

### Task 2: Clases comerciales y resolución en píxeles

**Files:**
- Modify: `src/domain/media/types.ts` (tipo `QualityClass` y `ResolutionClassification`)
- Modify: `src/domain/media/resolution.ts` (reescritura de las bandas)
- Modify: `src/domain/media/resolution.test.ts`

**Interfaces:**
- Consumes: `CommercialClass`, `PixelLabel` de la Task 1.
- Produces: `classifyResolution(width, height): ResolutionClassification | undefined`, donde
  `ResolutionClassification = { quality: CommercialClass; pixelLabel: PixelLabel; width: number; height: number; reason: string }`.

- [ ] **Step 1: Write the failing test**

Sustituye por completo `src/domain/media/resolution.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyResolution } from "./resolution";

describe("classifyResolution", () => {
  it("clasifica por anchura del máster, no por altura", () => {
    // UHD recortado a 2.39:1: sigue siendo 4K / 2160p.
    expect(classifyResolution(3840, 1608)).toMatchObject({ quality: "4K", pixelLabel: "2160p" });
    expect(classifyResolution(3840, 2160)).toMatchObject({ quality: "4K", pixelLabel: "2160p" });
  });

  it("clasifica las bandas restantes", () => {
    expect(classifyResolution(7680, 4320)).toMatchObject({ quality: "8K", pixelLabel: "4320p" });
    expect(classifyResolution(2560, 1440)).toMatchObject({ quality: "2K", pixelLabel: "1440p" });
    expect(classifyResolution(2048, 858)).toMatchObject({ quality: "2K", pixelLabel: "1440p" });
    expect(classifyResolution(1920, 1080)).toMatchObject({
      quality: "Full HD",
      pixelLabel: "1080p",
    });
    expect(classifyResolution(1280, 720)).toMatchObject({ quality: "HD", pixelLabel: "720p" });
    expect(classifyResolution(720, 576)).toMatchObject({ quality: "SD", pixelLabel: "576p" });
    expect(classifyResolution(640, 480)).toMatchObject({ quality: "SD", pixelLabel: "480p" });
  });

  it("corrige al alza el contenido anamórfico", () => {
    // 1440×1080 es 4:3 anamórfico: la altura manda.
    expect(classifyResolution(1440, 1080)).toMatchObject({
      quality: "Full HD",
      pixelLabel: "1080p",
    });
  });

  it("trata el contenido vertical por su lado largo", () => {
    expect(classifyResolution(1080, 1920)).toMatchObject({
      quality: "Full HD",
      pixelLabel: "1080p",
    });
  });

  it("no decide nada sin dimensiones utilizables", () => {
    expect(classifyResolution(undefined, 1080)).toBeUndefined();
    expect(classifyResolution(0, 0)).toBeUndefined();
    expect(classifyResolution(Number.NaN, 1080)).toBeUndefined();
  });

  it("explica siempre por qué eligió esa clase", () => {
    expect(classifyResolution(3840, 1608)?.reason).toContain("3840");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/media/resolution.test.ts`
Expected: FAIL — `quality` vale `"4K UHD"` y no existe `pixelLabel`.

- [ ] **Step 3: Write minimal implementation**

En `src/domain/media/types.ts`, sustituye la declaración de `QualityClass` y de `ResolutionClassification`:

```ts
import type { CommercialClass, PixelLabel } from "../naming/release-labels";

/** Clase de calidad presentable. Se calcula por dimensiones, nunca por el nombre. */
export type QualityClass = CommercialClass;

export interface ResolutionClassification {
  readonly quality: CommercialClass;
  readonly pixelLabel: PixelLabel;
  readonly width: number;
  readonly height: number;
  /** Explicación auditable de por qué se eligió esa clase. */
  readonly reason: string;
}
```

Sustituye por completo `src/domain/media/resolution.ts`:

```ts
import type { CommercialClass, PixelLabel } from "../naming/release-labels";
import type { ResolutionClassification } from "./types";

/**
 * Clasificación por CLASE de resolución, no por altura.
 *
 * Las películas se recortan verticalmente (2.39:1, 2.20:1, 1.90:1): un UHD real
 * puede medir 3840×1608. Usar `height === 2160` clasificaría mal la mayor parte
 * del catálogo. La clase la decide la anchura del máster, y solo se corrige al
 * alza cuando la altura indica una clase superior (anamórfico o pillarbox).
 */

interface Band {
  readonly quality: CommercialClass;
  readonly pixelLabel: PixelLabel;
  readonly minWidth: number;
  readonly minHeight: number;
}

const BANDS: readonly Band[] = [
  { quality: "8K", pixelLabel: "4320p", minWidth: 7000, minHeight: 4000 },
  { quality: "4K", pixelLabel: "2160p", minWidth: 3400, minHeight: 1900 },
  { quality: "2K", pixelLabel: "1440p", minWidth: 2000, minHeight: 1300 },
  { quality: "Full HD", pixelLabel: "1080p", minWidth: 1800, minHeight: 1000 },
  { quality: "HD", pixelLabel: "720p", minWidth: 1200, minHeight: 700 },
  { quality: "SD", pixelLabel: "576p", minWidth: 700, minHeight: 500 },
  { quality: "SD", pixelLabel: "480p", minWidth: 1, minHeight: 1 },
];

const RANK: Readonly<Record<CommercialClass, number>> = {
  SD: 1,
  HD: 2,
  "Full HD": 3,
  "2K": 4,
  "4K": 5,
  "8K": 6,
};

const fallbackBand: Band = BANDS[BANDS.length - 1] as Band;

const bandForWidth = (width: number): Band =>
  BANDS.find((band) => width >= band.minWidth) ?? fallbackBand;

const bandForHeight = (height: number): Band =>
  BANDS.find((band) => height >= band.minHeight) ?? fallbackBand;

const isPositiveNumber = (value: number): boolean => Number.isFinite(value) && value > 0;

export const classifyResolution = (
  width: number | undefined,
  height: number | undefined,
): ResolutionClassification | undefined => {
  if (width === undefined || height === undefined) return undefined;
  if (!isPositiveNumber(width) || !isPositiveNumber(height)) return undefined;

  // Contenido vertical o pistas con dimensiones intercambiadas: manda el lado largo.
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);

  const byWidth = bandForWidth(longEdge);
  const byHeight = bandForHeight(shortEdge);
  const useHeight = RANK[byHeight.quality] > RANK[byWidth.quality];
  const band = useHeight ? byHeight : byWidth;

  const reason = useHeight
    ? `${String(width)}×${String(height)}: la altura ${String(shortEdge)} corresponde a ${byHeight.quality} (anamórfico o con bandas laterales)`
    : `${String(width)}×${String(height)}: anchura ${String(longEdge)} ⇒ ${byWidth.quality}`;

  return { quality: band.quality, pixelLabel: band.pixelLabel, width, height, reason };
};

/** Presentación exacta para la ficha técnica. */
export const formatExactResolution = (classification: ResolutionClassification): string =>
  `${String(classification.width)} × ${String(classification.height)}`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/media/resolution.test.ts`
Expected: PASS. `pnpm vitest run` mostrará fallos en `build.test.ts` y `source.test.ts`: es esperado, se corrigen en las Tasks 3 y 7.

- [ ] **Step 5: Commit**

```bash
git add src/domain/media/types.ts src/domain/media/resolution.ts src/domain/media/resolution.test.ts
git commit -m "feat(media): classify resolution into commercial classes with pixel labels"
```

---

### Task 3: Vocabulario de fuente en el parser

**Files:**
- Modify: `src/domain/metadata.ts` (tipo `MediaSource`)
- Modify: `src/domain/naming/rules.ts` (reglas de fuente)
- Modify: `src/domain/media/types.ts` (`SourceMedia`)
- Modify: `src/domain/media/source.ts` (mapa de evidencia)
- Modify: `src/domain/media/source.test.ts`

**Interfaces:**
- Consumes: `ReleaseSource` de la Task 1.
- Produces: `detectSourceFromFilename(filename: string): SourceInfo` reconociendo las 17 etiquetas; `SourceMedia = ReleaseSource` sin `REMUX` (que sigue viviendo en `SourceInfo.type`).

- [ ] **Step 1: Write the failing test**

Añade a `src/domain/media/source.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { detectSourceFromFilename } from "./source";

describe("detectSourceFromFilename — vocabulario ampliado", () => {
  const cases: readonly (readonly [string, string | undefined, boolean])[] = [
    ["Peli.2024.2160p.UHD.BluRay.REMUX.HEVC-GRP.mkv", "BluRay", true],
    ["Peli.2024.1080p.BluRay.x264-GRP.mkv", "BluRay", false],
    ["Peli.2024.1080p.BDRip.x264-GRP.mkv", "BDRip", false],
    ["Peli.2024.1080p.BRRip.XviD-GRP.avi", "BRRip", false],
    ["Peli.2024.2160p.UHDRip.HEVC-GRP.mkv", "UHDRip", false],
    ["Peli.2024.1080p.WEB-DL.DDP5.1-GRP.mkv", "WEB-DL", false],
    ["Peli.2024.1080p.AMZN.WEB.DDP5.1-GRP.mkv", "WEB-DL", false],
    ["Peli.2024.1080p.WEBRip.x264-GRP.mkv", "WEBRip", false],
    ["Serie.S01E01.720p.HDTV.x264-GRP.mkv", "HDTV", false],
    ["Serie.S01E01.720p.HDTVRip.x264-GRP.mkv", "HDTVRip", false],
    ["Peli.2024.MicroHD.1080p.AC3-GRP.mkv", "microHD", false],
    ["Peli.2024.HDRip.XviD-GRP.avi", "HDRip", false],
    ["Peli.2024.DVDRip.XviD-GRP.avi", "DVDRip", false],
    ["Peli.2024.DVDScr.XviD-GRP.avi", "DVDScr", false],
    ["Peli.2024.HDTS.XviD-GRP.avi", "TS", false],
    ["Peli.2024.HDCAM.XviD-GRP.avi", "CamRip", false],
    ["Peli.2024.CAM.XviD-GRP.avi", "CamRip", false],
    ["Peli.2024.HDTC.XviD-GRP.avi", "TC", false],
  ];

  for (const [filename, media, isRemux] of cases) {
    it(`reconoce ${String(media)} en ${filename}`, () => {
      const source = detectSourceFromFilename(filename);
      expect(source.media.value).toBe(media);
      expect(source.type.value === "REMUX").toBe(isRemux);
    });
  }

  it("nunca marca la fuente como confirmada: el archivo no la demuestra", () => {
    expect(detectSourceFromFilename("Peli.2024.1080p.BluRay.mkv").media.confidence).toBe(
      "INFERRED",
    );
  });

  it("no inventa fuente cuando el nombre no la declara", () => {
    expect(detectSourceFromFilename("Peli.2024.1080p.mkv").media.value).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/media/source.test.ts`
Expected: FAIL — `BDRip` devuelve `"Blu-ray"`, `HDRip` devuelve `"Blu-ray"`, y `CAM`, `TS`, `TC`, `SCR`, `UHDRip`, `HDTVRip`, `microHD` devuelven `undefined`.

- [ ] **Step 3: Write minimal implementation**

En `src/domain/metadata.ts`, sustituye el tipo `MediaSource`:

```ts
export type MediaSource =
  | "BluRay"
  | "UHDRip"
  | "BDRip"
  | "BRRip"
  | "WEB-DL"
  | "WEBRip"
  | "HDTV"
  | "HDTVRip"
  | "microHD"
  | "HDRip"
  | "DVDRip"
  | "DVDScr"
  | "SCR"
  | "TC"
  | "TS"
  | "CamRip";
```

En `src/domain/media/types.ts`, sustituye `SourceMedia`:

```ts
export type SourceMedia = Exclude<ReleaseSource, "BluRay REMUX">;
```

(añade `import type { ReleaseSource } from "../naming/release-labels";` arriba).

En `src/domain/naming/rules.ts`, sustituye el bloque de clasificación de fuente (el `if/else if` que hoy empieza en `sequenceAt(tokens, index, ["4K", "UHD", "BLURAY"])` y termina en la rama `HDRIP`/`MICROHD`) por:

```ts
    const simpleSources: Readonly<Record<string, MediaSource>> = {
      BLURAY: "BluRay",
      BLURAYRIP: "BDRip",
      BDRIP: "BDRip",
      BRRIP: "BRRip",
      UHDRIP: "UHDRip",
      WEBDL: "WEB-DL",
      WEB: "WEB-DL",
      WEBRIP: "WEBRip",
      HDTV: "HDTV",
      HDTVRIP: "HDTVRip",
      MICROHD: "microHD",
      HDRIP: "HDRip",
      DVD: "DVDRip",
      DVDRIP: "DVDRip",
      DVDSCR: "DVDScr",
      SCREENER: "SCR",
      SCR: "SCR",
      HDTC: "TC",
      TC: "TC",
      HDTS: "TS",
      TS: "TS",
      HDCAM: "CamRip",
      CAMRIP: "CamRip",
      CAM: "CamRip",
    };
    // Plataformas: prueban que el origen es WEB, pero no se escriben en el nombre.
    const webPlatforms = new Set([
      "AMZN",
      "NF",
      "NETFLIX",
      "DSNP",
      "MAX",
      "HMAX",
      "ATVP",
      "HULU",
      "SKST",
      "MOVISTAR",
    ]);

    if (normalized === "REMUX") {
      add(evidence, tokens, [index], "release-type", "releaseType", "REMUX", "REMUX explícito");
    } else if (sequenceAt(tokens, index, ["WEB", "DL"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "source",
        "mediaSource",
        "WEB-DL",
        "Fuente WEB-DL explícita",
      );
    } else if (sequenceAt(tokens, index, ["WEB", "RIP"])) {
      add(
        evidence,
        tokens,
        indexesFrom(index, 2),
        "source",
        "mediaSource",
        "WEBRip",
        "Fuente WEBRip explícita",
      );
    } else if (webPlatforms.has(normalized)) {
      add(
        evidence,
        tokens,
        [index],
        "source",
        "mediaSource",
        "WEB-DL",
        `Plataforma de streaming «${tokens[index]?.raw ?? normalized}»: origen WEB`,
        80,
      );
    } else {
      const mapped = simpleSources[normalized];
      if (mapped !== undefined) {
        add(
          evidence,
          tokens,
          [index],
          "source",
          "mediaSource",
          mapped,
          `Fuente ${mapped} explícita en el nombre`,
        );
      }
    }
```

Añade `import type { MediaSource } from "../metadata";` a los imports de `rules.ts` si no está.

En `src/domain/media/source.ts`, sustituye `MEDIA_BY_EVIDENCE` por un paso directo, ya que los valores del parser y del dominio coinciden:

```ts
const KNOWN_MEDIA = new Set<string>(ALL_RELEASE_SOURCES.filter((value) => value !== "BluRay REMUX"));

const mediaFromEvidence = (value: string | undefined): SourceMedia | undefined =>
  value !== undefined && KNOWN_MEDIA.has(value) ? (value as SourceMedia) : undefined;
```

y usa `mediaFromEvidence(mediaEvidence?.value)` donde antes se usaba el `Map`. Añade
`import { ALL_RELEASE_SOURCES } from "../naming/release-labels";`.

Sustituye `composeQualitySource` por `composeSourceLabel`, que emite solo la fuente (la clase
comercial viaja aparte en `tokens.quality`). Esta es su firma definitiva; la Task 7 la consume tal
cual:

```ts
export const composeSourceLabel = (
  source: SourceInfo,
  options: { readonly allowInferred?: boolean } = {},
): string | undefined => {
  const allowInferred = options.allowInferred ?? true;
  const usable = <T>(traced: Traced<T>): T | undefined =>
    traced.value !== undefined && (allowInferred || traced.confidence !== "INFERRED")
      ? traced.value
      : undefined;

  const media = usable(source.media);
  const isRemux = usable(source.type) === "REMUX";
  if (media === undefined) return isRemux ? "REMUX" : undefined;
  return isRemux && media === "BluRay" ? "BluRay REMUX" : media;
};
```

Actualiza también `src/domain/naming/build.ts` para que importe `composeSourceLabel` en lugar de
`composeQualitySource`; la Task 7 termina de ajustar el resto del constructor.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/media/source.test.ts src/domain/naming/parser.test.ts`
Expected: PASS. Si `parser.test.ts` esperaba `"Blu-ray"` para `BDRip`, actualiza esa expectativa a `"BDRip"`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/metadata.ts src/domain/naming/rules.ts src/domain/media/types.ts src/domain/media/source.ts src/domain/media/source.test.ts src/domain/naming/parser.test.ts
git commit -m "feat(naming): recognise the full release source vocabulary"
```

---

### Task 4: Inferencia de fuente por bitrate

**Files:**
- Create: `src/domain/media/source-inference.ts`
- Create: `src/domain/media/source-inference.test.ts`
- Modify: `src/domain/media/normalize.ts` (aplicar la inferencia cuando el nombre calla)

**Interfaces:**
- Consumes: `SourceMedia`, `Traced`, `ResolutionClassification`.
- Produces: `inferSourceFromStream(input: StreamSourceInput): Traced<SourceMedia>` con
  `StreamSourceInput = { overallBitrateBps?: number; videoCodec?: VideoCodecName; pixelLabel?: PixelLabel }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/media/source-inference.test.ts
import { describe, expect, it } from "vitest";

import { inferSourceFromStream } from "./source-inference";

describe("inferSourceFromStream", () => {
  it("un 2160p HEVC por encima de 60 Mbps es un REMUX de Blu-ray", () => {
    const result = inferSourceFromStream({
      overallBitrateBps: 82_000_000,
      videoCodec: "HEVC",
      pixelLabel: "2160p",
    });
    expect(result.value).toBe("BluRay");
    expect(result.remux).toBe(true);
    expect(result.traced.confidence).toBe("INFERRED");
  });

  it("un 1080p AVC por encima de 25 Mbps es un REMUX de Blu-ray", () => {
    const result = inferSourceFromStream({
      overallBitrateBps: 31_000_000,
      videoCodec: "AVC",
      pixelLabel: "1080p",
    });
    expect(result.value).toBe("BluRay");
    expect(result.remux).toBe(true);
  });

  it("entre 8 y 25 Mbps en HD alto es un Blu-ray reencodado", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 12_000_000,
        videoCodec: "HEVC",
        pixelLabel: "1080p",
      }),
    ).toMatchObject({ value: "BluRay", remux: false });
  });

  it("entre 3 y 8 Mbps es WEB-DL", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 5_000_000,
        videoCodec: "HEVC",
        pixelLabel: "1080p",
      }),
    ).toMatchObject({ value: "WEB-DL" });
  });

  it("por debajo de 3 Mbps con 720p o más es WEBRip", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 1_800_000,
        videoCodec: "AVC",
        pixelLabel: "720p",
      }),
    ).toMatchObject({ value: "WEBRip" });
  });

  it("XviD en definición estándar es DVDRip", () => {
    expect(
      inferSourceFromStream({
        overallBitrateBps: 1_100_000,
        videoCodec: "MPEG-4",
        pixelLabel: "576p",
      }),
    ).toMatchObject({ value: "DVDRip" });
  });

  it("sin bitrate no infiere nada", () => {
    const result = inferSourceFromStream({ videoCodec: "HEVC", pixelLabel: "2160p" });
    expect(result.value).toBeUndefined();
    expect(result.traced.confidence).toBe("UNKNOWN");
  });

  it("explica siempre el motivo", () => {
    const result = inferSourceFromStream({
      overallBitrateBps: 82_000_000,
      videoCodec: "HEVC",
      pixelLabel: "2160p",
    });
    expect(result.traced.note).toContain("82");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/media/source-inference.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/media/source-inference.ts
import type { PixelLabel } from "../naming/release-labels";
import { inferred, unknown, type Traced } from "./provenance";
import type { SourceMedia, VideoCodecName } from "./types";

/**
 * Deducción de la fuente cuando el nombre no la declara.
 *
 * No es una prueba: es una heurística sobre bitrate, códec y resolución, y así
 * queda marcada. Una etiqueta del nombre o una corrección manual siempre ganan.
 */

export interface StreamSourceInput {
  readonly overallBitrateBps?: number | undefined;
  readonly videoCodec?: VideoCodecName | undefined;
  readonly pixelLabel?: PixelLabel | undefined;
}

export interface InferredSource {
  readonly value: SourceMedia | undefined;
  readonly remux: boolean;
  readonly traced: Traced<SourceMedia>;
}

const HIGH_DEFINITION: ReadonlySet<PixelLabel> = new Set<PixelLabel>([
  "4320p",
  "2160p",
  "1440p",
  "1080p",
]);

const STANDARD_DEFINITION: ReadonlySet<PixelLabel> = new Set<PixelLabel>(["576p", "480p"]);

const mbps = (bitrate: number): string => (bitrate / 1_000_000).toFixed(1);

const result = (
  value: SourceMedia,
  remux: boolean,
  bitrate: number,
  reason: string,
): InferredSource => ({
  value,
  remux,
  traced: inferred(
    value,
    "DERIVED",
    `${reason} (${mbps(bitrate)} Mbps). Deducido del stream, no verificable.`,
  ),
});

export const inferSourceFromStream = (input: StreamSourceInput): InferredSource => {
  const bitrate = input.overallBitrateBps;
  const codec = input.videoCodec;
  const pixels = input.pixelLabel;

  if (bitrate === undefined || !Number.isFinite(bitrate) || bitrate <= 0) {
    return {
      value: undefined,
      remux: false,
      traced: unknown<SourceMedia>("DERIVED", "Sin bitrate legible: no se deduce la fuente"),
    };
  }

  if (bitrate > 60_000_000 && codec === "HEVC" && pixels === "2160p") {
    return result("BluRay", true, bitrate, "Bitrate propio de un REMUX de UHD Blu-ray");
  }
  if (bitrate > 25_000_000 && codec === "AVC" && pixels === "1080p") {
    return result("BluRay", true, bitrate, "Bitrate propio de un REMUX de Blu-ray");
  }
  if (bitrate >= 8_000_000 && pixels !== undefined && HIGH_DEFINITION.has(pixels)) {
    return result("BluRay", false, bitrate, "Bitrate propio de un Blu-ray reencodado");
  }
  if (bitrate >= 3_000_000 && (codec === "HEVC" || codec === "AVC" || codec === "AV1")) {
    return result("WEB-DL", false, bitrate, "Bitrate propio de una descarga WEB-DL");
  }
  if (
    (codec === "MPEG-4" || codec === "MPEG-2" || codec === "VC-1") &&
    pixels !== undefined &&
    STANDARD_DEFINITION.has(pixels)
  ) {
    return result("DVDRip", false, bitrate, "Códec y resolución propios de un DVDRip");
  }
  if (pixels !== undefined && (HIGH_DEFINITION.has(pixels) || pixels === "720p")) {
    return result("WEBRip", false, bitrate, "Bitrate bajo para la resolución: recompresión WEB");
  }

  return {
    value: undefined,
    remux: false,
    traced: unknown<SourceMedia>(
      "DERIVED",
      `Ninguna regla de inferencia encaja (${mbps(bitrate)} Mbps)`,
    ),
  };
};
```

En `src/domain/media/normalize.ts`, dentro de `normalizeMediaInfo`, sustituye
`source: detectSourceFromFilename(filename),` por:

```ts
    source: resolveSource(
      detectSourceFromFilename(filename),
      inferSourceFromStream({
        overallBitrateBps: toInteger(raw.general?.OverallBitRate),
        videoCodec: video[0]?.codec.value,
        pixelLabel: video[0]?.resolution.value?.pixelLabel,
      }),
    ),
```

y añade sobre `normalizeMediaInfo`:

```ts
/** La etiqueta del nombre gana; la heurística solo rellena el hueco. */
const resolveSource = (fromFilename: SourceInfo, fromStream: InferredSource): SourceInfo => {
  if (fromFilename.media.value !== undefined) return fromFilename;
  if (fromStream.value === undefined) return fromFilename;
  return {
    media: fromStream.traced,
    type: fromStream.remux
      ? inferred<SourceType>("REMUX", "DERIVED", fromStream.traced.note ?? "REMUX deducido")
      : fromFilename.type,
  };
};
```

con los imports `import { inferSourceFromStream, type InferredSource } from "./source-inference";`
y `import type { SourceInfo, SourceType } from "./types";`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/media/source-inference.test.ts src/domain/media/normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/media/source-inference.ts src/domain/media/source-inference.test.ts src/domain/media/normalize.ts
git commit -m "feat(media): infer release source from bitrate, codec and resolution"
```

---

### Task 5: Etiquetas de audio e idioma

**Files:**
- Modify: `src/domain/media/audio.ts` (`formatAudioCodecForName` delega en `audioCodecLabel`)
- Modify: `src/domain/media/language.ts` (`otherLanguageLabel`)
- Modify: `src/domain/media/audio-selection.ts` (bloque de audio con el vocabulario nuevo)
- Modify: `src/domain/media/audio-selection.test.ts`
- Modify: `src/domain/media/audio.test.ts`

**Interfaces:**
- Consumes: `audioCodecLabel` de la Task 1.
- Produces: `formatPrimaryAudio(track, options?): string | undefined` que emite
  `Castellano TrueHD Atmos 7.1`; `formatOtherLanguages(labels, options?): string | undefined` que
  emite `ENG+FRA`; `otherLanguageLabel(language: NormalizedLanguage): string`.

- [ ] **Step 1: Write the failing test**

Añade a `src/domain/media/audio-selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { confirmed, unknown } from "./provenance";
import { formatOtherLanguages, formatPrimaryAudio } from "./audio-selection";
import type { AudioTrackInfo, NormalizedLanguage } from "./types";

const language = (partial: Partial<NormalizedLanguage>): NormalizedLanguage => ({
  tag: "es-ES",
  base: "es",
  region: "ES",
  label: "ESP",
  display: "Castellano (España)",
  regionAmbiguous: false,
  ...partial,
});

const track = (partial: Partial<AudioTrackInfo> = {}): AudioTrackInfo =>
  ({
    index: 0,
    codec: confirmed("TrueHD", "AUDIO_STREAM_METADATA"),
    commercialCodecName: unknown("AUDIO_STREAM_METADATA"),
    codecProfile: unknown("AUDIO_STREAM_METADATA"),
    bitrate: unknown("AUDIO_STREAM_METADATA"),
    sampleRate: unknown("AUDIO_STREAM_METADATA"),
    bitDepth: unknown("AUDIO_STREAM_METADATA"),
    channels: confirmed(8, "AUDIO_STREAM_METADATA"),
    channelLayout: confirmed("7.1", "AUDIO_STREAM_METADATA"),
    rawChannelLayout: unknown("AUDIO_STREAM_METADATA"),
    language: confirmed(language({}), "AUDIO_STREAM_METADATA"),
    title: unknown("AUDIO_STREAM_METADATA"),
    isDefault: confirmed(true, "AUDIO_STREAM_METADATA"),
    isForced: confirmed(false, "AUDIO_STREAM_METADATA"),
    isCommentary: confirmed(false, "AUDIO_STREAM_METADATA"),
    isDescriptiveAudio: confirmed(false, "AUDIO_STREAM_METADATA"),
    atmos: confirmed(true, "AUDIO_STREAM_METADATA"),
    dtsX: confirmed(false, "AUDIO_STREAM_METADATA"),
    ...partial,
  }) as AudioTrackInfo;

describe("formatPrimaryAudio", () => {
  it("escribe Castellano con el códec abreviado y los canales", () => {
    expect(formatPrimaryAudio(track())).toBe("Castellano TrueHD Atmos 7.1");
  });

  it("usa DD+ para Dolby Digital Plus", () => {
    expect(
      formatPrimaryAudio(
        track({
          codec: confirmed("Dolby Digital Plus", "AUDIO_STREAM_METADATA"),
          atmos: confirmed(false, "AUDIO_STREAM_METADATA"),
          channelLayout: confirmed("5.1", "AUDIO_STREAM_METADATA"),
        }),
      ),
    ).toBe("Castellano DD+ 5.1");
  });

  it("escribe Español cuando la región no consta", () => {
    expect(
      formatPrimaryAudio(
        track({
          language: confirmed(
            language({ label: "SPA", regionAmbiguous: true, region: undefined }),
            "AUDIO_STREAM_METADATA",
          ),
        }),
      ),
    ).toBe("Español TrueHD Atmos 7.1");
  });

  it("no genera nunca dos puntos", () => {
    const value = formatPrimaryAudio(
      track({
        codec: confirmed("DTS-HD MA", "AUDIO_STREAM_METADATA"),
        atmos: confirmed(false, "AUDIO_STREAM_METADATA"),
        dtsX: confirmed(true, "AUDIO_STREAM_METADATA"),
      }),
    );
    expect(value).toBe("Castellano DTS-X 7.1");
  });
});

describe("formatOtherLanguages", () => {
  it("une abreviaturas de tres letras con +", () => {
    expect(formatOtherLanguages(["ENG", "FRA"])).toBe("ENG+FRA");
  });

  it("devuelve undefined sin otros idiomas", () => {
    expect(formatOtherLanguages([])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/media/audio-selection.test.ts`
Expected: FAIL — hoy devuelve `Castellano TrueHD Atmos 7.1` solo en modo no compacto pero `Dolby Digital Plus` sin abreviar, `DTS:X` con dos puntos, y `formatOtherLanguages` antepone `Otros `.

- [ ] **Step 3: Write minimal implementation**

En `src/domain/media/audio.ts`, sustituye el cuerpo de `formatAudioCodecForName`:

```ts
export const formatAudioCodecForName = (
  codec: AudioCodecName | undefined,
  options: { readonly atmos: boolean; readonly dtsX: boolean },
): string | undefined => audioCodecLabel(codec, options);
```

con `import { audioCodecLabel } from "../naming/release-labels";`.

En `src/domain/media/language.ts`, añade al final:

```ts
/**
 * Abreviatura de tres letras para el resumen de idiomas secundarios. Nunca
 * afirma la región del español si no consta.
 */
export const otherLanguageLabel = (language: NormalizedLanguage): string =>
  languageNameLabel(language);
```

En `src/domain/media/audio-selection.ts`, sustituye `formatPrimaryAudio` y `formatOtherLanguages`:

```ts
/** `Castellano TrueHD Atmos 7.1`. `undefined` si falta el dato esencial. */
export const formatPrimaryAudio = (
  track: AudioTrackInfo | undefined,
  options: { readonly compact?: boolean } = {},
): string | undefined => {
  if (track === undefined) return undefined;

  const language = track.language.value;
  const languageLabel =
    language === undefined
      ? undefined
      : options.compact === true
        ? otherLanguageLabel(language)
        : languageFilenameLabel(language);
  const atmos = track.atmos.value === true;
  const dtsX = track.dtsX.value === true;
  const codec = formatAudioCodecForName(track.codec.value, { atmos, dtsX });
  const channels = track.channelLayout.value;

  const parts = [languageLabel, codec, channels].filter(
    (part): part is string => part !== undefined && part.length > 0,
  );
  return parts.length === 0 ? undefined : parts.join(" ");
};

export const DEFAULT_LANGUAGE_SEPARATOR = "+";

/** `ENG+FRA`. Sin la palabra «Otros»: el bloque ya se lee como tal. */
export const formatOtherLanguages = (
  languages: readonly string[],
  options: { readonly separator?: string } = {},
): string | undefined =>
  languages.length === 0
    ? undefined
    : languages.join(options.separator ?? DEFAULT_LANGUAGE_SEPARATOR);
```

Ajusta el import: `import { languageFilenameLabel, otherLanguageLabel } from "./language";` y usa
`otherLanguageLabel` también dentro de `selectAudio` allí donde hoy llama a `languageNameLabel`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/media/`
Expected: PASS. En `audio.test.ts`, actualiza cualquier expectativa de `"DTS:X"` a `"DTS-X"` y de
`"Dolby Digital Plus"` a `"DD+"`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/media/audio.ts src/domain/media/audio.test.ts src/domain/media/language.ts src/domain/media/audio-selection.ts src/domain/media/audio-selection.test.ts
git commit -m "feat(media): emit release-style audio and language labels"
```

---

### Task 6: Presupuesto de longitud y recorte en cascada

**Files:**
- Create: `src/domain/naming/budget.ts`
- Create: `src/domain/naming/budget.test.ts`

**Interfaces:**
- Consumes: `NameTokenValues` de `template.ts`.
- Produces: `applyNameBudget(tokens, render, options): { tokens: NameTokenValues; dropped: readonly NameTokenName[]; truncatedTitle: boolean }` con
  `options = { targetLength: number; hardLimit: number; extensionLength: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/naming/budget.test.ts
import { describe, expect, it } from "vitest";

import { applyNameBudget, DROP_ORDER } from "./budget";
import { renderNameTemplate, type NameTokenValues } from "./template";

const TEMPLATE =
  "{title} ({year}) [{quality} {resolutionLabel} {source} {videoCodec} {bitDepth} {hdrShort}] [{primaryAudio} · {otherLanguages}]";

const render = (tokens: NameTokenValues): string => renderNameTemplate(TEMPLATE, tokens);

const full: NameTokenValues = {
  title: "El Señor de los Anillos: El Retorno del Rey Edición Extendida Especial",
  year: "2003",
  quality: "4K",
  resolutionLabel: "2160p",
  source: "BluRay REMUX",
  videoCodec: "HEVC",
  bitDepth: "10bit",
  hdrShort: "DV",
  primaryAudio: "Castellano TrueHD Atmos 7.1",
  otherLanguages: "ENG+FRA+ITA+DEU",
};

describe("applyNameBudget", () => {
  it("no toca nada cuando el nombre ya entra", () => {
    const short: NameTokenValues = { title: "Heat", year: "1995", resolutionLabel: "1080p" };
    const result = applyNameBudget(short, render, {
      targetLength: 120,
      hardLimit: 255,
      extensionLength: 4,
    });
    expect(result.dropped).toEqual([]);
    expect(result.tokens).toEqual(short);
  });

  it("descarta primero los otros idiomas", () => {
    const result = applyNameBudget(full, render, {
      targetLength: 120,
      hardLimit: 255,
      extensionLength: 4,
    });
    expect(result.dropped[0]).toBe("otherLanguages");
    expect(render(result.tokens).length + 4).toBeLessThanOrEqual(120);
  });

  it("respeta el orden de descarte declarado", () => {
    expect(DROP_ORDER).toEqual([
      "otherLanguages",
      "bitDepth",
      "hdrShort",
      "videoCodec",
      "primaryAudioChannels",
      "quality",
    ]);
  });

  it("nunca descarta título, año, episodio ni resolución", () => {
    const result = applyNameBudget(full, render, {
      targetLength: 40,
      hardLimit: 255,
      extensionLength: 4,
    });
    expect(result.tokens.title).toBeDefined();
    expect(result.tokens.year).toBe("2003");
    expect(result.tokens.resolutionLabel).toBe("2160p");
  });

  it("recorta el título por palabras completas si aún supera el tope duro", () => {
    const result = applyNameBudget(full, render, {
      targetLength: 40,
      hardLimit: 45,
      extensionLength: 4,
    });
    expect(result.truncatedTitle).toBe(true);
    expect(render(result.tokens).length + 4).toBeLessThanOrEqual(45);
    expect(result.tokens.title?.endsWith(" ")).toBe(false);
  });

  it("quita los canales del audio principal sin quitar el idioma", () => {
    const tokens: NameTokenValues = { ...full, otherLanguages: undefined };
    const result = applyNameBudget(tokens, render, {
      targetLength: 95,
      hardLimit: 255,
      extensionLength: 4,
    });
    if (result.dropped.includes("primaryAudioChannels")) {
      expect(result.tokens.primaryAudio).toContain("Castellano");
      expect(result.tokens.primaryAudio).not.toContain("7.1");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/naming/budget.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/naming/budget.ts
import type { NameTokenValues } from "./template";

/**
 * Presupuesto de longitud del nombre.
 *
 * Windows admite 255 unidades UTF-16 por componente, pero un nombre de 250
 * caracteres es inmanejable. El producto fija un objetivo cómodo y descarta
 * información por orden de menor valor hasta entrar. Título, año, episodio y
 * resolución no se descartan nunca: son la identidad del archivo.
 */

export type DroppableToken =
  | "otherLanguages"
  | "bitDepth"
  | "hdrShort"
  | "videoCodec"
  | "primaryAudioChannels"
  | "quality";

export const DROP_ORDER: readonly DroppableToken[] = [
  "otherLanguages",
  "bitDepth",
  "hdrShort",
  "videoCodec",
  "primaryAudioChannels",
  "quality",
];

export interface NameBudgetOptions {
  /** Longitud deseada del nombre con extensión. */
  readonly targetLength: number;
  /** Tope absoluto impuesto por el sistema de archivos. */
  readonly hardLimit: number;
  /** Longitud de `.mkv`, punto incluido. */
  readonly extensionLength: number;
}

export interface NameBudgetResult {
  readonly tokens: NameTokenValues;
  readonly dropped: readonly DroppableToken[];
  readonly truncatedTitle: boolean;
}

const CHANNELS_PATTERN = /\s\d+\.\d+$/u;

const withoutToken = (tokens: NameTokenValues, token: DroppableToken): NameTokenValues => {
  if (token === "primaryAudioChannels") {
    const primary = tokens.primaryAudio;
    if (primary === undefined) return tokens;
    return { ...tokens, primaryAudio: primary.replace(CHANNELS_PATTERN, "") };
  }
  const next = { ...tokens };
  delete next[token];
  return next;
};

const truncateTitleByWords = (title: string, excess: number): string => {
  const words = title.split(" ");
  let candidate = title;
  while (words.length > 1 && candidate.length > title.length - excess) {
    words.pop();
    candidate = words.join(" ");
  }
  return candidate.replace(/[\s.,;:–-]+$/u, "");
};

export const applyNameBudget = (
  tokens: NameTokenValues,
  render: (values: NameTokenValues) => string,
  options: NameBudgetOptions,
): NameBudgetResult => {
  const totalLength = (values: NameTokenValues): number =>
    render(values).length + options.extensionLength;

  let current = tokens;
  const dropped: DroppableToken[] = [];

  for (const token of DROP_ORDER) {
    if (totalLength(current) <= options.targetLength) break;
    const next = withoutToken(current, token);
    if (render(next) === render(current)) continue;
    current = next;
    dropped.push(token);
  }

  const overHardLimit = totalLength(current) - options.hardLimit;
  if (overHardLimit > 0 && current.title !== undefined) {
    return {
      tokens: { ...current, title: truncateTitleByWords(current.title, overHardLimit) },
      dropped,
      truncatedTitle: true,
    };
  }

  return { tokens: current, dropped, truncatedTitle: false };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/naming/budget.test.ts`
Expected: PASS, 6 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/domain/naming/budget.ts src/domain/naming/budget.test.ts
git commit -m "feat(naming): add cascading name length budget"
```

---

### Task 7: Nombre final con vocabulario de release

**Files:**
- Modify: `src/domain/naming/template.ts` (token `resolutionLabel`, retirada de `qualitySource`)
- Modify: `src/domain/naming/presets.ts` (plantillas nuevas)
- Modify: `src/domain/naming/build.ts` (tokens, alertas y presupuesto)
- Modify: `src/domain/naming/build.test.ts` (batería canónica)
- Modify: `src/services/settings.ts` (`nameTargetLength`)

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: `buildMediaName(identification, media, options): NameBuildResult` donde `NameBuildResult`
  gana `readonly droppedTokens: readonly DroppableToken[]` y `readonly truncatedTitle: boolean`;
  `NameBuildOptions` gana `readonly targetLength?: number`.

- [ ] **Step 1: Write the failing test**

Sustituye el contenido de `src/domain/naming/build.test.ts` por esta batería (conserva los helpers
de `test-fixtures.ts` que ya usa el archivo actual y añade los que falten):

```ts
import { describe, expect, it } from "vitest";

import { buildMediaName } from "./build";
import { identificationFromHints } from "../identification/build";
import { extractIdentificationHints } from "../identification/hints";
import { normalizeMediaInfo } from "../media/normalize";
import type { RawMediaInfo } from "../media/raw";

const raw = (partial: Partial<RawMediaInfo> = {}): RawMediaInfo => ({
  general: { Format: "Matroska", OverallBitRate: "82000000", Duration: "9360" },
  video: [
    {
      "@type": "Video",
      Format: "HEVC",
      Width: "3840",
      Height: "1608",
      BitDepth: "10",
      HDR_Format: "Dolby Vision",
    },
  ],
  audio: [
    {
      "@type": "Audio",
      Format: "MLP FBA",
      Format_Commercial_IfAny: "Dolby TrueHD with Dolby Atmos",
      Format_AdditionalFeatures: "16-ch",
      Language: "es-ES",
      Channels: "8",
      ChannelLayout: "L R C LFE Ls Rs Lb Rb",
    },
    { "@type": "Audio", Format: "AC-3", Language: "en", Channels: "6" },
  ],
  text: [],
  ...partial,
});

const nameFor = (filename: string, info: RawMediaInfo = raw()): string => {
  const media = normalizeMediaInfo(info, filename, 60_000_000_000);
  const identification = identificationFromHints(extractIdentificationHints(filename));
  return buildMediaName(identification, media, { presetId: "professional" }).filename;
};

describe("buildMediaName — nombres canónicos", () => {
  it("película 4K REMUX con Atmos", () => {
    expect(nameFor("Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.HEVC.DV-GRP.mkv")).toBe(
      "Dune Part Two (2024) [4K 2160p BluRay REMUX HEVC 10bit DV] [Castellano TrueHD Atmos 7.1 · ENG].mkv",
    );
  });

  it("película Full HD sin HDR", () => {
    const info = raw({
      general: { Format: "Matroska", OverallBitRate: "31000000" },
      video: [{ "@type": "Video", Format: "AVC", Width: "1920", Height: "1080", BitDepth: "8" }],
      audio: [
        {
          "@type": "Audio",
          Format: "DTS",
          Format_Commercial_IfAny: "DTS-HD Master Audio",
          Language: "es-ES",
          Channels: "6",
          ChannelLayout: "L R C LFE Ls Rs",
        },
      ],
      text: [],
    });
    expect(nameFor("Heat.1995.1080p.BluRay.REMUX.AVC.DTS-HD.MA-GRP.mkv", info)).toBe(
      "Heat (1995) [Full HD 1080p BluRay REMUX AVC] [Castellano DTS-HD MA 5.1].mkv",
    );
  });

  it("episodio de serie con título de episodio inferido ausente", () => {
    const name = nameFor("The.Last.of.Us.S01E03.2160p.WEB-DL.HEVC.DV-GRP.mkv");
    expect(name).toContain("- S01E03 -");
    expect(name).toContain("[4K 2160p WEB-DL HEVC 10bit DV]");
  });

  it("convención española Cap.202", () => {
    expect(nameFor("El.Ministerio.del.Tiempo.Cap.202.1080p.HDTV.mkv")).toContain("- S02E02");
  });

  it("no escribe bloques vacíos cuando no hay datos técnicos", () => {
    const empty: RawMediaInfo = { video: [], audio: [], text: [] };
    const name = nameFor("Pelicula.Rara.2020.mkv", empty);
    expect(name).not.toContain("[]");
    expect(name).not.toContain("[ ]");
  });

  it("no genera nunca caracteres prohibidos en Windows", () => {
    const name = nameFor("Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.HEVC.DV-GRP.mkv");
    expect(name).not.toMatch(/[<>:"/\\|?*]/u);
  });

  it("respeta el presupuesto de 120 caracteres", () => {
    const long = nameFor(
      "El.Senor.de.los.Anillos.El.Retorno.del.Rey.Version.Extendida.2003.2160p.UHD.BluRay.REMUX.HEVC.DV-GRP.mkv",
    );
    expect(long.length).toBeLessThanOrEqual(120);
  });
});

describe("buildMediaName — alertas", () => {
  it("avisa cuando no hay castellano", () => {
    const info = raw({
      audio: [{ "@type": "Audio", Format: "AC-3", Language: "en", Channels: "6" }],
    });
    const media = normalizeMediaInfo(info, "Peli.2024.1080p.mkv", 1000);
    const identification = identificationFromHints(
      extractIdentificationHints("Peli.2024.1080p.mkv"),
    );
    const result = buildMediaName(identification, media);
    expect(result.alerts.join(" ")).toContain("castellano");
  });

  it("avisa cuando el título se ha recortado", () => {
    const identification = identificationFromHints(
      extractIdentificationHints("Peli.2024.1080p.mkv"),
    );
    const media = normalizeMediaInfo(raw(), "Peli.2024.1080p.mkv", 1000);
    const result = buildMediaName(identification, media, { targetLength: 30 });
    expect(result.droppedTokens.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/naming/build.test.ts`
Expected: FAIL — el nombre generado usa `[4K UHD REMUX · HEVC 10-bit · Dolby Vision]`.

- [ ] **Step 3: Write minimal implementation**

En `src/domain/naming/template.ts`, añade `"resolutionLabel"` a `NameTokenName` y a
`ALL_NAME_TOKENS`, y elimina `"qualitySource"` de ambos.

En `src/domain/naming/presets.ts`, sustituye las dos constantes:

```ts
const PROFESSIONAL_MOVIE =
  "{title} ({year}) [{quality} {resolutionLabel} {source} {videoCodec} {bitDepth} {hdrShort}] [{primaryAudio} · {otherLanguages}]";

const PROFESSIONAL_EPISODE =
  "{title} ({year}) - {episode} - {episodeTitle} [{quality} {resolutionLabel} {source} {videoCodec} {bitDepth} {hdrShort}] [{primaryAudio} · {otherLanguages}]";
```

y actualiza los demás presets sustituyendo `{qualitySource}` por `{quality} {resolutionLabel} {source}`,
`{videoCodecBitDepth}` por `{videoCodec} {bitDepth}` y `{hdr}` por `{hdrShort}`.

En `src/domain/naming/build.ts`:

1. `videoTokens` pasa a emitir el vocabulario nuevo:

```ts
const videoTokens = (video: VideoTrackInfo | undefined): NameTokenValues => {
  if (video === undefined) return {};
  const tokens: NameTokenValues = {};

  const resolution = isUsableForName(video.resolution, { allowInferred: true })
    ? video.resolution.value
    : undefined;
  if (resolution !== undefined) {
    tokens.quality = resolution.quality;
    tokens.resolutionLabel = resolution.pixelLabel;
    tokens.exactResolution = `${String(resolution.width)}×${String(resolution.height)}`;
  }

  const codec = isUsableForName(video.codec) ? videoCodecLabel(video.codec.value) : undefined;
  if (codec !== undefined) tokens.videoCodec = codec;

  const bits = isUsableForName(video.bitDepth)
    ? bitDepthLabel(video.bitDepth.value)
    : undefined;
  if (bits !== undefined) tokens.bitDepth = bits;

  const hdr = isUsableForName(video.hdrFormats) ? hdrLabel(video.hdrFormats.value) : undefined;
  if (hdr !== undefined) tokens.hdrShort = hdr;

  const frameRate = isUsableForName(video.frameRate)
    ? formatFrameRate(video.frameRate.value)
    : undefined;
  if (frameRate !== undefined) tokens.frameRate = frameRate;

  return tokens;
};
```

2. En `buildNameTokens`, sustituye el cálculo de `qualitySource` por `source`, usando la función
   que la Task 3 ya dejó lista:

```ts
  const source = composeSourceLabel(media.source, { allowInferred: allowInferredSource });
```

3. Añade las alertas nuevas al final de `buildNameTokens`:

```ts
  if (media.source.media.confidence === "INFERRED" && media.source.media.source === "DERIVED") {
    alerts.push(`Fuente deducida del bitrate: ${media.source.media.value ?? "sin determinar"}.`);
  }
```

4. En `buildMediaName`, aplica el presupuesto antes de sanear:

```ts
  const render = (values: NameTokenValues): string => renderNameTemplate(template, values);
  const extension = media.general.extension.replace(/^\./u, "").toLowerCase();
  const budget = applyNameBudget(tokens, render, {
    targetLength: options.targetLength ?? 120,
    hardLimit: 255,
    extensionLength: extension.length === 0 ? 0 : extension.length + 1,
  });

  const renderedStem = render(budget.tokens);
  const sanitizedStem = sanitizeWindowsFilenameComponent(renderedStem);
```

y devuelve además `droppedTokens: budget.dropped` y `truncatedTitle: budget.truncatedTitle`,
declarándolos en `NameBuildResult`. Si `budget.truncatedTitle` es `true`, añade a `alerts`:
`"El título se ha recortado para no superar el límite del sistema de archivos."`.

En `src/services/settings.ts`, añade al esquema `nameTargetLength: z.number().int().min(60).max(255).default(120),`
y pásalo desde `nameOptions` en `item-pipeline.ts` como `targetLength: settings.nameTargetLength`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run`
Expected: PASS en toda la suite.

- [ ] **Step 5: Verify the whole project**

Run: `pnpm check`
Expected: sin errores de formato, lint, tipos ni build.

- [ ] **Step 6: Commit**

```bash
git add src/domain/naming src/services/settings.ts src/services/item-pipeline.ts
git commit -m "feat(naming): build names with release-style quality and audio blocks"
```

---

# FASE 2 — Motor de detección e identificación

### Task 8: Identificadores incrustados en el nombre

**Files:**
- Create: `src/domain/identification/embedded-ids.ts`
- Create: `src/domain/identification/embedded-ids.test.ts`
- Modify: `src/domain/identification/types.ts` (campo `embeddedId` en `IdentificationHints`)
- Modify: `src/domain/identification/hints.ts` (extracción)

**Interfaces:**
- Consumes: nada.
- Produces: `extractEmbeddedId(text: string): EmbeddedId | undefined` con
  `EmbeddedId = { provider: "imdb"; imdbId: string } | { provider: "tmdb"; tmdbId: number }`;
  `IdentificationHints.embeddedId: EmbeddedId | undefined`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/identification/embedded-ids.test.ts
import { describe, expect, it } from "vitest";

import { extractEmbeddedId } from "./embedded-ids";

describe("extractEmbeddedId", () => {
  it("reconoce el identificador de IMDb entre corchetes", () => {
    expect(extractEmbeddedId("Heat (1995) [imdb-tt0113277].mkv")).toEqual({
      provider: "imdb",
      imdbId: "tt0113277",
    });
  });

  it("reconoce el identificador de IMDb suelto", () => {
    expect(extractEmbeddedId("Heat.1995.tt0113277.1080p.mkv")).toEqual({
      provider: "imdb",
      imdbId: "tt0113277",
    });
  });

  it("reconoce el identificador de TMDb entre llaves", () => {
    expect(extractEmbeddedId("Dune (2021) {tmdb-438631}.mkv")).toEqual({
      provider: "tmdb",
      tmdbId: 438631,
    });
  });

  it("reconoce tmdbid-", () => {
    expect(extractEmbeddedId("Dune.2021.tmdbid-438631.mkv")).toEqual({
      provider: "tmdb",
      tmdbId: 438631,
    });
  });

  it("prefiere TMDb cuando aparecen los dos", () => {
    expect(extractEmbeddedId("Dune (2021) [imdb-tt1160419] {tmdb-438631}.mkv")).toEqual({
      provider: "tmdb",
      tmdbId: 438631,
    });
  });

  it("devuelve undefined cuando no hay ninguno", () => {
    expect(extractEmbeddedId("Dune.2021.2160p.mkv")).toBeUndefined();
  });

  it("ignora falsos positivos", () => {
    expect(extractEmbeddedId("Serie.attt.1080p.mkv")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/identification/embedded-ids.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/identification/embedded-ids.ts

/**
 * Identificadores del catálogo incrustados en el nombre por otras herramientas
 * (Radarr, Sonarr, Plex). Es la evidencia más fuerte posible: no se puntúa, se
 * consulta directamente.
 */

export type EmbeddedId =
  | { readonly provider: "imdb"; readonly imdbId: string }
  | { readonly provider: "tmdb"; readonly tmdbId: number };

const TMDB_PATTERN = /(?:\{|\[|\b)tmdb(?:id)?[-_ :]?(\d{1,8})(?:\}|\]|\b)/iu;
const IMDB_PATTERN = /\b(tt\d{7,9})\b/iu;

export const extractEmbeddedId = (text: string): EmbeddedId | undefined => {
  const tmdb = TMDB_PATTERN.exec(text);
  const tmdbId = tmdb?.[1];
  if (tmdbId !== undefined) {
    const parsed = Number.parseInt(tmdbId, 10);
    if (Number.isFinite(parsed) && parsed > 0) return { provider: "tmdb", tmdbId: parsed };
  }

  const imdb = IMDB_PATTERN.exec(text);
  const imdbId = imdb?.[1];
  if (imdbId !== undefined) return { provider: "imdb", imdbId: imdbId.toLowerCase() };

  return undefined;
};
```

En `src/domain/identification/types.ts`, añade a `IdentificationHints`:

```ts
  readonly embeddedId: EmbeddedId | undefined;
```

con `import type { EmbeddedId } from "./embedded-ids";`.

En `src/domain/identification/hints.ts`, dentro de `extractIdentificationHints`, añade al objeto
devuelto `embeddedId: extractEmbeddedId(filename),` y el import correspondiente.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/identification/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/identification/embedded-ids.ts src/domain/identification/embedded-ids.test.ts src/domain/identification/types.ts src/domain/identification/hints.ts
git commit -m "feat(identification): extract embedded IMDb and TMDb identifiers"
```

---

### Task 9: Ampliación del cliente de TMDb

**Files:**
- Modify: `src/services/providers/types.ts` (contrato ampliado)
- Modify: `src/services/providers/tmdb.ts`
- Modify: `src/services/providers/tmdb.test.ts`

**Interfaces:**
- Consumes: `EmbeddedId` de la Task 8.
- Produces, añadidos a `MetadataProvider`:
  - `searchMulti(title: string, signal?: AbortSignal): Promise<readonly ProviderCandidate[]>` — cada candidato incluye `kind: WorkKind`.
  - `findByExternalId(id: EmbeddedId, signal?: AbortSignal): Promise<ProviderCandidate | undefined>`.
  - `getSeasonEpisodes(seriesId: number, season: number, signal?: AbortSignal): Promise<ReadonlyMap<number, string>>`.
  - `ProviderCandidate` gana `readonly kind: WorkKind` y `readonly runtimeMinutes: number | undefined`.

- [ ] **Step 1: Write the failing test**

Añade a `src/services/providers/tmdb.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTmdbProvider } from "./tmdb";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createTmdbProvider — búsqueda multi", () => {
  it("devuelve películas y series con su tipo y descarta personas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            results: [
              { id: 1, media_type: "movie", title: "Dune", release_date: "2021-09-15" },
              { id: 2, media_type: "tv", name: "Dune: Prophecy", first_air_date: "2024-11-17" },
              { id: 3, media_type: "person", name: "Denis Villeneuve" },
            ],
          }),
        ),
      ),
    );

    const provider = createTmdbProvider({ key: "clave" });
    const results = await provider.searchMulti("Dune");

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ id: 1, kind: "movie", spanishTitle: "Dune", year: 2021 });
    expect(results[1]).toMatchObject({ id: 2, kind: "series", year: 2024 });
  });
});

describe("createTmdbProvider — identificador externo", () => {
  it("resuelve un identificador de IMDb", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            movie_results: [{ id: 949, title: "Heat", release_date: "1995-12-15" }],
            tv_results: [],
          }),
        ),
      ),
    );

    const provider = createTmdbProvider({ key: "clave" });
    const found = await provider.findByExternalId({ provider: "imdb", imdbId: "tt0113277" });

    expect(found).toMatchObject({ id: 949, kind: "movie", spanishTitle: "Heat" });
  });
});

describe("createTmdbProvider — temporada completa", () => {
  it("devuelve los títulos de episodio en una sola llamada", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          episodes: [
            { episode_number: 1, name: "Cuando estés perdido en la oscuridad" },
            { episode_number: 3, name: "Mucho mucho tiempo" },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createTmdbProvider({ key: "clave" });
    const episodes = await provider.getSeasonEpisodes(100088, 1);

    expect(episodes.get(3)).toBe("Mucho mucho tiempo");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cachea la temporada: la segunda consulta no vuelve a la red", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ episodes: [{ episode_number: 1, name: "Piloto" }] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createTmdbProvider({ key: "clave" });
    await provider.getSeasonEpisodes(1, 1);
    await provider.getSeasonEpisodes(1, 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/providers/tmdb.test.ts`
Expected: FAIL — `provider.searchMulti is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `src/services/providers/types.ts`:

```ts
export interface ProviderCandidate {
  readonly id: number;
  readonly kind: WorkKind;
  readonly spanishTitle: string;
  readonly originalTitle: string | undefined;
  readonly originalLanguage: string | undefined;
  readonly year: number | undefined;
  readonly runtimeMinutes: number | undefined;
  readonly posterUrl: string | undefined;
  readonly overview: string | undefined;
}

export interface MetadataProvider {
  readonly id: string;
  readonly available: boolean;
  readonly attribution: ProviderAttribution;
  search: (query: WorkSearchQuery, signal?: AbortSignal) => Promise<readonly ProviderCandidate[]>;
  searchMulti: (title: string, signal?: AbortSignal) => Promise<readonly ProviderCandidate[]>;
  findByExternalId: (
    id: EmbeddedId,
    signal?: AbortSignal,
  ) => Promise<ProviderCandidate | undefined>;
  getSeasonEpisodes: (
    seriesId: number,
    season: number,
    signal?: AbortSignal,
  ) => Promise<ReadonlyMap<number, string>>;
  getEpisode: (
    seriesId: number,
    season: number,
    episode: number,
    signal?: AbortSignal,
  ) => Promise<EpisodeDetails | undefined>;
}
```

Añade los tres métodos a `nullMetadataProvider`:

```ts
  searchMulti: () => Promise.resolve([]),
  findByExternalId: () => Promise.resolve(undefined),
  getSeasonEpisodes: () => Promise.resolve(new Map<number, string>()),
```

En `src/services/providers/tmdb.ts`:

1. Añade los esquemas:

```ts
const multiResultSchema = z.object({
  id: z.number().int().positive(),
  media_type: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  original_title: z.string().optional(),
  original_name: z.string().optional(),
  original_language: z.string().optional(),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  overview: z.string().optional(),
  runtime: z.number().optional(),
});

const findSchema = z.object({
  movie_results: z.array(z.unknown()).default([]),
  tv_results: z.array(z.unknown()).default([]),
});

const seasonSchema = z.object({
  episodes: z
    .array(z.object({ episode_number: z.number().int(), name: z.string().optional() }))
    .default([]),
});
```

2. Añade el conversor común y los tres métodos dentro de `createTmdbProvider`:

```ts
  const toCandidate = (raw: unknown, forcedKind?: WorkKind): ProviderCandidate | undefined => {
    const parsed = multiResultSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    const item = parsed.data;
    const kind: WorkKind | undefined =
      forcedKind ??
      (item.media_type === "movie" ? "movie" : item.media_type === "tv" ? "series" : undefined);
    if (kind === undefined) return undefined;

    const title =
      emptyToUndefined(item.title) ??
      emptyToUndefined(item.name) ??
      emptyToUndefined(item.original_title) ??
      emptyToUndefined(item.original_name);
    if (title === undefined) return undefined;

    return {
      id: item.id,
      kind,
      spanishTitle: title,
      originalTitle: emptyToUndefined(item.original_title) ?? emptyToUndefined(item.original_name),
      originalLanguage: emptyToUndefined(item.original_language),
      year: yearOf(item.release_date ?? item.first_air_date),
      runtimeMinutes: item.runtime,
      posterUrl: posterUrl(item.poster_path),
      overview: emptyToUndefined(item.overview),
    };
  };

  const multiCache = new Map<string, readonly ProviderCandidate[]>();

  const searchMulti = async (
    title: string,
    signal?: AbortSignal,
  ): Promise<readonly ProviderCandidate[]> => {
    ensureKey();
    const cached = multiCache.get(title.toLowerCase());
    if (cached !== undefined) return cached;

    const payload = searchSchema.safeParse(
      await requestJson(
        "/search/multi",
        { query: title, language: "es-ES", include_adult: "false" },
        key,
        signal,
      ),
    );
    if (!payload.success) return [];

    const candidates = payload.data.results
      .slice(0, 10)
      .flatMap((raw) => {
        const candidate = toCandidate(raw);
        return candidate === undefined ? [] : [candidate];
      });
    multiCache.set(title.toLowerCase(), candidates);
    return candidates;
  };

  const findByExternalId = async (
    id: EmbeddedId,
    signal?: AbortSignal,
  ): Promise<ProviderCandidate | undefined> => {
    ensureKey();
    if (id.provider === "tmdb") {
      const movie = await requestJson(
        `/movie/${String(id.tmdbId)}`,
        { language: "es-ES" },
        key,
        signal,
      ).catch(() => undefined);
      const asMovie = movie === undefined ? undefined : toCandidate(movie, "movie");
      if (asMovie !== undefined) return asMovie;

      const series = await requestJson(
        `/tv/${String(id.tmdbId)}`,
        { language: "es-ES" },
        key,
        signal,
      ).catch(() => undefined);
      return series === undefined ? undefined : toCandidate(series, "series");
    }

    const payload = findSchema.safeParse(
      await requestJson(
        `/find/${id.imdbId}`,
        { language: "es-ES", external_source: "imdb_id" },
        key,
        signal,
      ),
    );
    if (!payload.success) return undefined;

    const movie = payload.data.movie_results[0];
    if (movie !== undefined) return toCandidate(movie, "movie");
    const series = payload.data.tv_results[0];
    return series === undefined ? undefined : toCandidate(series, "series");
  };

  const seasonCache = new Map<string, ReadonlyMap<number, string>>();

  const getSeasonEpisodes = async (
    seriesId: number,
    season: number,
    signal?: AbortSignal,
  ): Promise<ReadonlyMap<number, string>> => {
    ensureKey();
    const cacheId = `${String(seriesId)}|${String(season)}`;
    const cached = seasonCache.get(cacheId);
    if (cached !== undefined) return cached;

    let payload: unknown;
    try {
      payload = await requestJson(
        `/tv/${String(seriesId)}/season/${String(season)}`,
        { language: "es-ES" },
        key,
        signal,
      );
    } catch {
      return new Map<number, string>();
    }

    const parsed = seasonSchema.safeParse(payload);
    const episodes = new Map<number, string>();
    if (parsed.success) {
      for (const episode of parsed.data.episodes) {
        const title = emptyToUndefined(episode.name);
        if (title !== undefined) episodes.set(episode.episode_number, title);
      }
    }
    seasonCache.set(cacheId, episodes);
    return episodes;
  };
```

3. Añade `runtime` a `movieResultSchema` (`runtime: z.number().optional()`) y `kind: "movie"` /
   `kind: "series"` y `runtimeMinutes` a los candidatos que ya construye `search`.
4. Exporta los tres métodos nuevos en el objeto devuelto.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/providers/tmdb.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/providers/
git commit -m "feat(tmdb): add multi search, external id lookup and full-season fetch"
```

---

### Task 10: Señales duras de desempate

**Files:**
- Modify: `src/domain/matching/tmdb-score.ts` (señales de idioma y título original)
- Modify: `src/domain/matching/tmdb-score.test.ts`

**Interfaces:**
- Consumes: `TmdbMatchQuery` existente (ya admite `runtimeMinutes`).
- Produces: `TmdbMatchQuery` gana `readonly audioLanguages?: readonly string[]`;
  `TmdbMovieCandidate` gana `readonly originalLanguage?: string`; nuevos componentes
  `"original-language-present"` (+10) y `"original-title-exact"` (+15, ya existente).

- [ ] **Step 1: Write the failing test**

Añade a `src/domain/matching/tmdb-score.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { rankTmdbCandidates } from "./tmdb-score";

describe("rankTmdbCandidates — señales duras", () => {
  it("la duración separa dos obras con el mismo título y año", () => {
    const ranked = rankTmdbCandidates(
      { title: "Dune", year: 2021, runtimeMinutes: 155 },
      [
        { id: 1, title: "Dune", releaseYear: 2021, runtimeMinutes: 155 },
        { id: 2, title: "Dune", releaseYear: 2021, runtimeMinutes: 60 },
      ],
    );
    expect(ranked.candidates[0]?.candidate.id).toBe(1);
    expect(ranked.candidates[0]?.score).toBeGreaterThan(ranked.candidates[1]?.score ?? 0);
  });

  it("penaliza con fuerza una duración muy distinta", () => {
    const ranked = rankTmdbCandidates(
      { title: "Heat", runtimeMinutes: 170 },
      [{ id: 1, title: "Heat", runtimeMinutes: 45 }],
    );
    expect(
      ranked.candidates[0]?.components.some((component) => component.points <= -40),
    ).toBe(true);
  });

  it("suma cuando el idioma original de la obra está entre las pistas", () => {
    const withLanguage = rankTmdbCandidates(
      { title: "Heat", audioLanguages: ["es", "en"] },
      [{ id: 1, title: "Heat", originalLanguage: "en" }],
    );
    const withoutLanguage = rankTmdbCandidates({ title: "Heat" }, [
      { id: 1, title: "Heat", originalLanguage: "en" },
    ]);
    expect(withLanguage.candidates[0]?.score).toBeGreaterThan(
      withoutLanguage.candidates[0]?.score ?? 0,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/domain/matching/tmdb-score.test.ts`
Expected: FAIL en la prueba del idioma original — la propiedad no existe y no puntúa.

- [ ] **Step 3: Write minimal implementation**

En `src/domain/matching/tmdb-score.ts`:

```ts
export interface TmdbMatchQuery {
  readonly title: string;
  readonly year?: number;
  readonly runtimeMinutes?: number;
  readonly audioLanguages?: readonly string[];
  readonly previouslySelectedTmdbId?: number;
}

export interface TmdbMovieCandidate {
  readonly id: number;
  readonly title: string;
  readonly originalTitle?: string;
  readonly originalLanguage?: string;
  readonly alternativeTitles?: readonly string[];
  readonly releaseYear?: number;
  readonly runtimeMinutes?: number;
}
```

Añade `"original-language-present"` a la unión `MatchScoreComponent["code"]` y, dentro de
`scoreRawCandidate`, tras el bloque de año:

```ts
  const originalLanguage = candidate.originalLanguage?.toLowerCase();
  if (
    originalLanguage !== undefined &&
    query.audioLanguages?.some((language) => language.toLowerCase() === originalLanguage) === true
  ) {
    components.push({
      code: "original-language-present",
      points: 10,
      explanation: `El idioma original (${originalLanguage}) está entre las pistas de audio: +10`,
    });
  }
```

y suma sus puntos al total como el resto de componentes.

Verifica que la señal de duración ya existente use estos umbrales; si no, ajústala:

```ts
  const runtime = candidate.runtimeMinutes;
  if (query.runtimeMinutes !== undefined && runtime !== undefined && runtime > 0) {
    const deviation = Math.abs(runtime - query.runtimeMinutes) / runtime;
    if (deviation <= 0.05) {
      components.push({
        code: "runtime-compatible",
        points: 30,
        explanation: `Duración compatible (${String(runtime)} min): +30`,
      });
    } else if (deviation > 0.2) {
      components.push({
        code: "runtime-different",
        points: -40,
        explanation: `Duración muy distinta (${String(runtime)} min frente a ${String(query.runtimeMinutes)} min): -40`,
      });
    } else {
      components.push({
        code: "runtime-close",
        points: 10,
        explanation: `Duración parecida (${String(runtime)} min): +10`,
      });
    }
  }
```

Actualiza `DEFAULT_THRESHOLDS` a `{ high: 80, medium: 50, minimumLead: 20 }` conforme a la spec.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/domain/matching/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/matching/
git commit -m "feat(matching): score runtime and original-language signals"
```

---

### Task 11: Resolvedor en cascada

**Files:**
- Create: `src/services/identification/resolver.ts`
- Create: `src/services/identification/resolver.test.ts`

**Interfaces:**
- Consumes: `MetadataProvider` (Task 9), `rankTmdbCandidates` (Task 10), `IdentificationHints` con
  `embeddedId` (Task 8).
- Produces:
  `resolveWork(input: ResolveInput, provider: MetadataProvider, options?): Promise<ResolveOutcome>` con
  - `ResolveInput = { hints: IdentificationHints; runtimeMinutes?: number; audioLanguages?: readonly string[]; parentFolderName?: string; containerTitle?: string }`
  - `ResolveOutcome = { candidate: ProviderCandidate | undefined; kind: WorkKind; band: MatchBand | undefined; score: number | undefined; components: readonly MatchScoreComponent[]; alternatives: readonly ProviderCandidateSummary[]; attempts: readonly string[]; error: Error | undefined }`

- [ ] **Step 1: Write the failing test**

```ts
// src/services/identification/resolver.test.ts
import { describe, expect, it, vi } from "vitest";

import { extractIdentificationHints } from "../../domain/identification/hints";
import { nullMetadataProvider, type MetadataProvider, type ProviderCandidate } from "../providers/types";
import { resolveWork } from "./resolver";

const candidate = (partial: Partial<ProviderCandidate> = {}): ProviderCandidate => ({
  id: 1,
  kind: "movie",
  spanishTitle: "Dune",
  originalTitle: "Dune",
  originalLanguage: "en",
  year: 2021,
  runtimeMinutes: 155,
  posterUrl: undefined,
  overview: undefined,
  ...partial,
});

const providerWith = (overrides: Partial<MetadataProvider>): MetadataProvider => ({
  ...nullMetadataProvider,
  id: "tmdb",
  available: true,
  ...overrides,
});

describe("resolveWork", () => {
  it("resuelve por identificador incrustado sin buscar", async () => {
    const search = vi.fn(() => Promise.resolve([]));
    const findByExternalId = vi.fn(() => Promise.resolve(candidate({ id: 438631 })));
    const provider = providerWith({ search, findByExternalId });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Dune (2021) {tmdb-438631}.mkv") },
      provider,
    );

    expect(outcome.candidate?.id).toBe(438631);
    expect(outcome.band).toBe("high");
    expect(search).not.toHaveBeenCalled();
    expect(outcome.attempts).toEqual(["embedded-id"]);
  });

  it("reintenta sin año cuando la búsqueda con año exacto no devuelve nada", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([candidate()]);
    const provider = providerWith({ search });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Dune.2020.2160p.mkv"), runtimeMinutes: 155 },
      provider,
    );

    expect(outcome.candidate?.id).toBe(1);
    expect(outcome.attempts).toContain("title-year");
    expect(outcome.attempts).toContain("title-year-nearby");
    expect(outcome.attempts).toContain("title-only");
  });

  it("cae en la búsqueda multi y adopta el tipo que devuelve", async () => {
    const search = vi.fn(() => Promise.resolve([]));
    const searchMulti = vi.fn(() =>
      Promise.resolve([candidate({ id: 7, kind: "series", spanishTitle: "Fargo" })]),
    );
    const provider = providerWith({ search, searchMulti });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Fargo.1080p.mkv") },
      provider,
    );

    expect(outcome.kind).toBe("series");
    expect(outcome.candidate?.id).toBe(7);
    expect(outcome.attempts).toContain("multi");
  });

  it("usa el título de la carpeta como último recurso", async () => {
    const search = vi.fn(() => Promise.resolve([]));
    const searchMulti = vi.fn(() => Promise.resolve([]));
    const provider = providerWith({
      search,
      searchMulti,
      // La séptima consulta usa el nombre de la carpeta.
    });
    (provider.search as unknown as { mockResolvedValueOnce: unknown }) = search;
    search.mockResolvedValue([]);
    search.mockResolvedValueOnce([]);

    const outcome = await resolveWork(
      {
        hints: extractIdentificationHints("01.mkv"),
        parentFolderName: "The Last of Us (2023)",
      },
      provider,
    );

    expect(outcome.attempts).toContain("parent-folder");
  });

  it("devuelve las alternativas cuando la banda no es alta", async () => {
    const search = vi.fn(() =>
      Promise.resolve([
        candidate({ id: 1, spanishTitle: "Dune" }),
        candidate({ id: 2, spanishTitle: "Dune" }),
      ]),
    );
    const provider = providerWith({ search });

    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Dune.2021.mkv") },
      provider,
    );

    expect(outcome.alternatives.length).toBeGreaterThan(1);
    expect(outcome.band).not.toBe("high");
  });

  it("sin proveedor disponible no consulta nada y no falla", async () => {
    const outcome = await resolveWork(
      { hints: extractIdentificationHints("Dune.2021.mkv") },
      nullMetadataProvider,
    );
    expect(outcome.candidate).toBeUndefined();
    expect(outcome.error).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/identification/resolver.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/identification/resolver.ts
import type { IdentificationHints, ProviderCandidateSummary } from "../../domain/identification/types";
import {
  rankTmdbCandidates,
  type MatchBand,
  type MatchScoreComponent,
  type TmdbMovieCandidate,
} from "../../domain/matching/tmdb-score";
import type { MetadataProvider, ProviderCandidate, WorkKind } from "../providers/types";

/**
 * Cascada de identificación.
 *
 * Cada paso es un intento independiente y queda registrado en `attempts` para
 * que la ficha técnica pueda explicar cómo se llegó al resultado. La cascada se
 * detiene en cuanto un candidato alcanza banda alta.
 */

export interface ResolveInput {
  readonly hints: IdentificationHints;
  readonly runtimeMinutes?: number | undefined;
  readonly audioLanguages?: readonly string[] | undefined;
  readonly parentFolderName?: string | undefined;
  readonly containerTitle?: string | undefined;
}

export interface ResolveOutcome {
  readonly candidate: ProviderCandidate | undefined;
  readonly kind: WorkKind;
  readonly band: MatchBand | undefined;
  readonly score: number | undefined;
  readonly components: readonly MatchScoreComponent[];
  readonly alternatives: readonly ProviderCandidateSummary[];
  readonly attempts: readonly string[];
  readonly error: Error | undefined;
}

export interface ResolveOptions {
  readonly signal?: AbortSignal | undefined;
  readonly previouslySelectedId?: number | undefined;
}

const ARTICLES = /^(?:el|la|los|las|un|una|the|a|an)\s+/iu;

/** Limpia el título para el intento normalizado de la cascada. */
export const normalizeTitleForSearch = (title: string): string =>
  title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|es|tv|to|cc)\b/giu, " ")
    .replace(/\b(?:descargar|gratis|torrent)\b/giu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(ARTICLES, "")
    .replace(/\s+/gu, " ")
    .trim();

const toScoring = (candidate: ProviderCandidate): TmdbMovieCandidate => ({
  id: candidate.id,
  title: candidate.spanishTitle,
  ...(candidate.originalTitle === undefined ? {} : { originalTitle: candidate.originalTitle }),
  ...(candidate.originalLanguage === undefined
    ? {}
    : { originalLanguage: candidate.originalLanguage }),
  ...(candidate.year === undefined ? {} : { releaseYear: candidate.year }),
  ...(candidate.runtimeMinutes === undefined
    ? {}
    : { runtimeMinutes: candidate.runtimeMinutes }),
});

const summarize = (
  candidate: ProviderCandidate,
  score: number,
  band: MatchBand,
  components: readonly MatchScoreComponent[],
): ProviderCandidateSummary => ({
  id: candidate.id,
  spanishTitle: candidate.spanishTitle,
  originalTitle: candidate.originalTitle ?? candidate.spanishTitle,
  year: candidate.year,
  posterUrl: candidate.posterUrl,
  score,
  band,
  components,
});

interface Attempt {
  readonly name: string;
  readonly run: () => Promise<readonly ProviderCandidate[]>;
}

export const resolveWork = async (
  input: ResolveInput,
  provider: MetadataProvider,
  options: ResolveOptions = {},
): Promise<ResolveOutcome> => {
  const { hints } = input;
  const kindFromHints: WorkKind = hints.kind === "series" ? "series" : "movie";
  const empty: ResolveOutcome = {
    candidate: undefined,
    kind: kindFromHints,
    band: undefined,
    score: undefined,
    components: [],
    alternatives: [],
    attempts: [],
    error: undefined,
  };

  if (!provider.available) return empty;

  const attempts: string[] = [];
  const signal = options.signal;

  // 1. Identificador incrustado: evidencia exacta, no se puntúa.
  if (hints.embeddedId !== undefined) {
    attempts.push("embedded-id");
    try {
      const found = await provider.findByExternalId(hints.embeddedId, signal);
      if (found !== undefined) {
        return {
          candidate: found,
          kind: found.kind,
          band: "high",
          score: 100,
          components: [
            {
              code: "previous-correction",
              points: 100,
              explanation: "Identificador incrustado en el nombre: coincidencia exacta",
            },
          ],
          alternatives: [],
          attempts,
          error: undefined,
        };
      }
    } catch (error) {
      return { ...empty, attempts, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  const title = hints.titleGuess;
  const folderTitle = input.parentFolderName;
  const normalized = normalizeTitleForSearch(title);

  const plan: Attempt[] = [];
  if (title.length > 0) {
    if (hints.year !== undefined) {
      plan.push({
        name: "title-year",
        run: () => provider.search({ title, year: hints.year, kind: kindFromHints }, signal),
      });
      plan.push({
        name: "title-year-nearby",
        run: () =>
          provider.search({ title, year: (hints.year ?? 0) - 1, kind: kindFromHints }, signal),
      });
    }
    plan.push({
      name: "title-only",
      run: () => provider.search({ title, kind: kindFromHints }, signal),
    });
    plan.push({ name: "multi", run: () => provider.searchMulti(title, signal) });
    if (normalized.length > 0 && normalized.toLowerCase() !== title.toLowerCase()) {
      plan.push({
        name: "normalized-title",
        run: () => provider.search({ title: normalized, kind: kindFromHints }, signal),
      });
    }
  }
  if (folderTitle !== undefined && folderTitle.length > 0) {
    const folderQuery = normalizeTitleForSearch(folderTitle);
    plan.push({
      name: "parent-folder",
      run: () => provider.search({ title: folderQuery, kind: kindFromHints }, signal),
    });
  }

  let best: ResolveOutcome = { ...empty, attempts };

  for (const attempt of plan) {
    attempts.push(attempt.name);
    let found: readonly ProviderCandidate[];
    try {
      found = await attempt.run();
    } catch (error) {
      return {
        ...best,
        attempts: [...attempts],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    if (found.length === 0) continue;

    const ranked = rankTmdbCandidates(
      {
        title,
        ...(hints.year === undefined ? {} : { year: hints.year }),
        ...(input.runtimeMinutes === undefined ? {} : { runtimeMinutes: input.runtimeMinutes }),
        ...(input.audioLanguages === undefined ? {} : { audioLanguages: input.audioLanguages }),
        ...(options.previouslySelectedId === undefined
          ? {}
          : { previouslySelectedTmdbId: options.previouslySelectedId }),
      },
      found.map(toScoring),
    );

    const byId = new Map(found.map((entry) => [entry.id, entry]));
    const summaries = ranked.candidates.flatMap((scored) => {
      const entry = byId.get(scored.candidate.id);
      return entry === undefined
        ? []
        : [summarize(entry, scored.score, scored.band, scored.components)];
    });

    const top = ranked.candidates[0];
    const chosen = top === undefined ? undefined : byId.get(top.candidate.id);
    if (top === undefined || chosen === undefined) continue;

    const outcome: ResolveOutcome = {
      candidate: chosen,
      kind: chosen.kind,
      band: top.band,
      score: top.score,
      components: top.components,
      alternatives: summaries,
      attempts: [...attempts],
      error: undefined,
    };

    if (top.band === "high") return outcome;
    if (best.candidate === undefined || (best.score ?? -Infinity) < top.score) best = outcome;
  }

  return { ...best, attempts: [...attempts] };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/identification/resolver.test.ts`
Expected: PASS, 6 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/services/identification/
git commit -m "feat(identification): resolve works through a seven-step cascade"
```

---

### Task 12: Correcciones aprendidas

**Files:**
- Create: `src/services/learned-corrections.ts`
- Create: `src/services/learned-corrections.test.ts`

**Interfaces:**
- Consumes: `WorkKind`, `EmbeddedId`.
- Produces: `rememberCorrection(title, kind, tmdbId): void`,
  `recallCorrection(title, kind): number | undefined`, `forgetAllCorrections(): void`.

- [ ] **Step 1: Write the failing test**

```ts
// src/services/learned-corrections.test.ts
import { beforeEach, describe, expect, it } from "vitest";

import { forgetAllCorrections, recallCorrection, rememberCorrection } from "./learned-corrections";

beforeEach(() => {
  localStorage.clear();
});

describe("correcciones aprendidas", () => {
  it("recuerda una corrección y la aplica al mismo título", () => {
    rememberCorrection("El Ministerio del Tiempo", "series", 62126);
    expect(recallCorrection("El Ministerio del Tiempo", "series")).toBe(62126);
  });

  it("ignora acentos, mayúsculas y separadores", () => {
    rememberCorrection("El Señor de los Anillos", "movie", 120);
    expect(recallCorrection("el senor  de los anillos", "movie")).toBe(120);
  });

  it("no confunde una serie con una película del mismo título", () => {
    rememberCorrection("Fargo", "movie", 275);
    expect(recallCorrection("Fargo", "series")).toBeUndefined();
  });

  it("la corrección más reciente sustituye a la anterior", () => {
    rememberCorrection("Dune", "movie", 1);
    rememberCorrection("Dune", "movie", 438631);
    expect(recallCorrection("Dune", "movie")).toBe(438631);
  });

  it("se pueden olvidar todas", () => {
    rememberCorrection("Dune", "movie", 438631);
    forgetAllCorrections();
    expect(recallCorrection("Dune", "movie")).toBeUndefined();
  });

  it("sobrevive a un almacenamiento corrupto", () => {
    localStorage.setItem("renombrador.corrections.v1", "{ esto no es json");
    expect(recallCorrection("Dune", "movie")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/learned-corrections.test.ts`
Expected: FAIL — módulo inexistente. Si `localStorage` no está definido en el entorno de Vitest,
añade `environment: "jsdom"` en `vite.config.ts` bajo `test`, e instala `jsdom` como dependencia de
desarrollo con `pnpm add -D jsdom`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/learned-corrections.ts
import type { WorkKind } from "./providers/types";

/**
 * Memoria de correcciones manuales.
 *
 * Cuando alguien corrige el emparejado de una obra, esa decisión vale para
 * todos los archivos futuros de la misma obra. Es la única forma de que la
 * herramienta mejore con el uso sin enviar nada a ningún sitio.
 */

const STORAGE_KEY = "renombrador.corrections.v1";

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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
};

export const rememberCorrection = (title: string, kind: WorkKind, tmdbId: number): void => {
  if (title.trim().length === 0) return;
  try {
    const all = readAll();
    all[normalizeKey(title, kind)] = tmdbId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Sin almacenamiento la sesión sigue funcionando, solo no se aprende.
  }
};

export const recallCorrection = (title: string, kind: WorkKind): number | undefined =>
  readAll()[normalizeKey(title, kind)];

export const forgetAllCorrections = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nada que hacer.
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/learned-corrections.test.ts`
Expected: PASS, 6 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/services/learned-corrections.ts src/services/learned-corrections.test.ts vite.config.ts package.json pnpm-lock.yaml
git commit -m "feat(identification): remember manual TMDb corrections"
```

---

### Task 13: Integración del pipeline

**Files:**
- Modify: `src/services/identification-service.ts` (delega en el resolvedor)
- Modify: `src/services/identification-service.test.ts`
- Modify: `src/services/item-pipeline.ts` (duración, idiomas, título del contenedor, carpeta)
- Modify: `src/services/item-pipeline.test.ts`

**Interfaces:**
- Consumes: `resolveWork` (Task 11), `recallCorrection` (Task 12), `getSeasonEpisodes` (Task 9).
- Produces: `identifyContent(hints, provider, options): Promise<IdentificationOutcome>` con
  `options` ampliado a `{ signal?; previouslySelectedId?; runtimeMinutes?; audioLanguages?; parentFolderName? }`;
  `IdentificationOutcome` gana `readonly attempts: readonly string[]`.

- [ ] **Step 1: Write the failing test**

Añade a `src/services/item-pipeline.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "./settings";
import { createMediaItem, identifyMediaItem } from "./item-pipeline";
import { nullMetadataProvider, type MetadataProvider } from "./providers/types";

describe("identifyMediaItem", () => {
  it("pasa la duración y los idiomas del archivo al resolvedor", async () => {
    const search = vi.fn(() => Promise.resolve([]));
    const provider: MetadataProvider = {
      ...nullMetadataProvider,
      id: "tmdb",
      available: true,
      search,
      searchMulti: () => Promise.resolve([]),
    };

    const item = createMediaItem(
      { name: "Heat.1995.1080p.BluRay.mkv", size: 1000, folderName: "Cine" },
      DEFAULT_SETTINGS,
    );
    const withDuration = {
      ...item,
      media: {
        ...item.media,
        general: {
          ...item.media.general,
          durationSeconds: {
            value: 10_200,
            confidence: "CONFIRMED" as const,
            source: "CONTAINER_METADATA" as const,
          },
        },
      },
    };

    await identifyMediaItem(withDuration, provider, DEFAULT_SETTINGS);

    expect(search).toHaveBeenCalled();
  });

  it("usa el título del contenedor cuando el nombre del archivo es inservible", async () => {
    const search = vi.fn(() => Promise.resolve([]));
    const provider: MetadataProvider = {
      ...nullMetadataProvider,
      id: "tmdb",
      available: true,
      search,
      searchMulti: () => Promise.resolve([]),
    };

    const item = createMediaItem({ name: "01.mkv", size: 1000 }, DEFAULT_SETTINGS);
    const withContainerTitle = {
      ...item,
      media: {
        ...item.media,
        general: {
          ...item.media.general,
          titleMetadata: {
            value: "Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX",
            confidence: "CONFIRMED" as const,
            source: "CONTAINER_METADATA" as const,
          },
        },
      },
    };

    await identifyMediaItem(withContainerTitle, provider, DEFAULT_SETTINGS);

    const queries = search.mock.calls.map((call) => (call[0] as { title: string }).title);
    expect(queries.some((query) => query.toLowerCase().includes("dune"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/item-pipeline.test.ts`
Expected: FAIL — la segunda prueba falla: hoy solo se usa el nombre del archivo.

- [ ] **Step 3: Write minimal implementation**

En `src/services/identification-service.ts`, sustituye el cuerpo de `identifyContent` para que
delegue en el resolvedor y aplique la corrección aprendida antes de consultar:

```ts
export const identifyContent = async (
  hints: IdentificationHints,
  provider: MetadataProvider,
  options: IdentifyOptions = {},
): Promise<IdentificationOutcome> => {
  const base = identificationFromHints(hints);
  const learned = recallCorrection(hints.titleGuess, hints.kind === "series" ? "series" : "movie");

  const outcome = await resolveWork(
    {
      hints,
      ...(options.runtimeMinutes === undefined ? {} : { runtimeMinutes: options.runtimeMinutes }),
      ...(options.audioLanguages === undefined
        ? {}
        : { audioLanguages: options.audioLanguages }),
      ...(options.parentFolderName === undefined
        ? {}
        : { parentFolderName: options.parentFolderName }),
    },
    provider,
    {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.previouslySelectedId ?? learned) === undefined
        ? {}
        : { previouslySelectedId: options.previouslySelectedId ?? learned },
    },
  );

  if (outcome.candidate === undefined) {
    return {
      identification: { ...base, alternatives: outcome.alternatives },
      candidates: outcome.alternatives,
      attempts: outcome.attempts,
      error: outcome.error,
    };
  }

  const kindAdjusted: ContentIdentification = { ...base, kind: outcome.kind };
  return {
    identification: await applyCandidate(kindAdjusted, outcome.candidate, provider, {
      score: outcome.score ?? 0,
      band: outcome.band,
      components: outcome.components,
      alternatives: outcome.alternatives,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }),
    candidates: outcome.alternatives,
    attempts: outcome.attempts,
    error: outcome.error,
  };
};
```

En `applyCandidate`, sustituye la llamada por episodio por la temporada completa:

```ts
  if (base.kind === "series" && season !== undefined && episode !== undefined) {
    try {
      const episodes = await provider.getSeasonEpisodes(candidate.id, season, context.signal);
      episodeTitle = episodes.get(episode);
    } catch {
      episodeTitle = undefined;
    }
  }
```

Amplía `IdentifyOptions` con `runtimeMinutes`, `audioLanguages` y `parentFolderName`, e
`IdentificationOutcome` con `attempts`.

En `src/services/item-pipeline.ts`, sustituye el cuerpo de `identifyMediaItem`:

```ts
export const identifyMediaItem = async (
  item: MediaItem,
  provider: MetadataProvider,
  settings: AppSettings,
  signal?: AbortSignal,
): Promise<MediaItem> => {
  const containerTitle = item.media.general.titleMetadata.value;
  const fromFilename = extractIdentificationHints(item.currentName, item.folderName);
  // Un nombre sin título aprovechable: el contenedor suele traer el de release.
  const hints =
    fromFilename.titleGuess.length >= 3 || containerTitle === undefined
      ? fromFilename
      : extractIdentificationHints(containerTitle, item.folderName);

  const durationSeconds = item.media.general.durationSeconds.value;
  const audioLanguages = item.media.audio.flatMap((track) =>
    track.language.value === undefined ? [] : [track.language.value.base],
  );

  const outcome = await identifyContent(hints, provider, {
    ...(signal === undefined ? {} : { signal }),
    autoApplyBand: settings.autoApplyBand,
    ...(durationSeconds === undefined
      ? {}
      : { runtimeMinutes: Math.round(durationSeconds / 60) }),
    ...(audioLanguages.length === 0 ? {} : { audioLanguages }),
    ...(item.folderName === undefined ? {} : { parentFolderName: item.folderName }),
    ...(item.identification.reference === undefined
      ? {}
      : { previouslySelectedId: item.identification.reference.id }),
  });

  const identification = outcome.identification;
  return {
    ...item,
    identification,
    candidates: outcome.candidates,
    ...(outcome.error === undefined ? {} : { error: outcome.error.message }),
    name: buildMediaName(identification, item.media, nameOptions(settings)),
  };
};
```

Añade a `MediaItem` el campo `readonly attempts: readonly string[]` (vacío en `createMediaItem`,
relleno en `identifyMediaItem` con `outcome.attempts`): la Task 16 lo necesita para mostrar la traza
de consultas.

En `useRenamerState.chooseCandidate`, tras aplicar el candidato, añade
`rememberCorrection(item.identification.spanishTitle.value ?? "", candidate.kind, candidate.id);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run`
Expected: PASS en toda la suite.

- [ ] **Step 5: Verify the whole project**

Run: `pnpm check`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/services/
git commit -m "feat(identification): feed duration, languages and container title into the resolver"
```

---

# FASE 3 — Interfaz y flujo

### Task 14: Modelo puro de la lista

**Files:**
- Create: `src/features/renamer/row-model.ts`
- Create: `src/features/renamer/row-model.test.ts`

**Interfaces:**
- Consumes: `MediaItem`, `RenamePlanItem`.
- Produces:
  - `type RowState = "analyzing" | "ready" | "review" | "error"`
  - `rowStateOf(item: MediaItem, planItem: RenamePlanItem | undefined): RowState`
  - `countByState(rows: readonly RowState[]): Record<RowState, number>`
  - `filterItems(items, { state, text }): readonly MediaItem[]`
  - `toggleSelection(selected: ReadonlySet<string>, id: string, options?: { range?: readonly string[] }): ReadonlySet<string>`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/renamer/row-model.test.ts
import { describe, expect, it } from "vitest";

import { countByState, filterItems, rowStateOf, toggleSelection } from "./row-model";
import type { MediaItem } from "../../services/item-pipeline";

const item = (partial: Partial<MediaItem>): MediaItem =>
  ({
    id: "1",
    currentName: "a.mkv",
    analysisPending: false,
    error: undefined,
    identification: { matchBand: "high" },
    name: { filename: "A (2024).mkv", alerts: [] },
    ...partial,
  }) as unknown as MediaItem;

describe("rowStateOf", () => {
  it("analizando mientras el análisis está pendiente", () => {
    expect(rowStateOf(item({ analysisPending: true }), undefined)).toBe("analyzing");
  });

  it("error cuando el archivo falló", () => {
    expect(rowStateOf(item({ error: "ilegible" }), undefined)).toBe("error");
  });

  it("error cuando el plan lo bloquea", () => {
    const planItem = {
      issues: [{ severity: "blocking", code: "no-handle", message: "sin acceso" }],
    } as never;
    expect(rowStateOf(item({}), planItem)).toBe("error");
  });

  it("revisar cuando la banda no es alta", () => {
    expect(rowStateOf(item({ identification: { matchBand: "medium" } as never }), undefined)).toBe(
      "review",
    );
  });

  it("revisar cuando el nombre trae alertas", () => {
    expect(
      rowStateOf(
        item({ name: { filename: "A.mkv", alerts: ["No se ha detectado audio"] } as never }),
        undefined,
      ),
    ).toBe("review");
  });

  it("listo cuando todo está en orden", () => {
    expect(rowStateOf(item({}), undefined)).toBe("ready");
  });
});

describe("countByState", () => {
  it("cuenta cada estado", () => {
    expect(countByState(["ready", "ready", "review", "error"])).toEqual({
      analyzing: 0,
      ready: 2,
      review: 1,
      error: 1,
    });
  });
});

describe("filterItems", () => {
  const items = [
    item({ id: "1", currentName: "Dune.mkv" }),
    item({ id: "2", currentName: "Heat.mkv", error: "roto" }),
  ];

  it("filtra por texto en el nombre actual y en el propuesto", () => {
    expect(filterItems(items, { text: "dune" })).toHaveLength(1);
  });

  it("filtra por estado", () => {
    expect(filterItems(items, { state: "error" })).toHaveLength(1);
  });

  it("sin filtros devuelve todo", () => {
    expect(filterItems(items, {})).toHaveLength(2);
  });
});

describe("toggleSelection", () => {
  it("añade y quita", () => {
    const once = toggleSelection(new Set<string>(), "a");
    expect([...once]).toEqual(["a"]);
    expect([...toggleSelection(once, "a")]).toEqual([]);
  });

  it("selecciona un rango", () => {
    const result = toggleSelection(new Set(["a"]), "c", { range: ["a", "b", "c", "d"] });
    expect([...result].sort()).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/renamer/row-model.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/renamer/row-model.ts
import { effectiveName, type MediaItem } from "../../services/item-pipeline";
import type { RenamePlanItem } from "../../services/rename/plan";

/**
 * Estado visible de cada fila y utilidades de lista. Vive aparte de los
 * componentes para poder probarse sin montar React.
 */

export type RowState = "analyzing" | "ready" | "review" | "error";

export const rowStateOf = (item: MediaItem, planItem: RenamePlanItem | undefined): RowState => {
  if (item.analysisPending) return "analyzing";
  if (item.error !== undefined) return "error";
  if (planItem?.issues.some((issue) => issue.severity === "blocking") === true) return "error";
  if (item.identification.matchBand !== undefined && item.identification.matchBand !== "high") {
    return "review";
  }
  if (item.name.alerts.length > 0) return "review";
  return "ready";
};

export const countByState = (states: readonly RowState[]): Record<RowState, number> => {
  const counts: Record<RowState, number> = { analyzing: 0, ready: 0, review: 0, error: 0 };
  for (const state of states) counts[state] += 1;
  return counts;
};

export interface ListFilter {
  readonly state?: RowState | undefined;
  readonly text?: string | undefined;
}

export const filterItems = (
  items: readonly MediaItem[],
  filter: ListFilter,
  planById?: ReadonlyMap<string, RenamePlanItem>,
): readonly MediaItem[] => {
  const text = filter.text?.trim().toLowerCase();
  return items.filter((item) => {
    if (filter.state !== undefined && rowStateOf(item, planById?.get(item.id)) !== filter.state) {
      return false;
    }
    if (text === undefined || text.length === 0) return true;
    return (
      item.currentName.toLowerCase().includes(text) ||
      effectiveName(item).toLowerCase().includes(text)
    );
  });
};

export const toggleSelection = (
  selected: ReadonlySet<string>,
  id: string,
  options: { readonly range?: readonly string[] } = {},
): ReadonlySet<string> => {
  const next = new Set(selected);

  if (options.range !== undefined && selected.size > 0) {
    const anchorIndex = options.range.findIndex((entry) => selected.has(entry));
    const targetIndex = options.range.indexOf(id);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const [from, to] =
        anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      for (const entry of options.range.slice(from, to + 1)) next.add(entry);
      return next;
    }
  }

  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/renamer/row-model.test.ts`
Expected: PASS, 4 grupos.

- [ ] **Step 5: Commit**

```bash
git add src/features/renamer/row-model.ts src/features/renamer/row-model.test.ts
git commit -m "feat(ui): add pure row state, filtering and selection model"
```

---

### Task 15: Fila, detalle y candidatos

**Files:**
- Create: `src/features/renamer/FileRow.tsx`
- Create: `src/features/renamer/CandidateList.tsx`
- Create: `src/features/renamer/RowDetail.tsx`
- Delete: `src/features/renamer/MediaItemCard.tsx`
- Modify: `src/features/renamer/RenamerScreen.tsx`
- Modify: `src/styles/features.css`

**Interfaces:**
- Consumes: `rowStateOf` (Task 14), `MediaItem`, `ProviderCandidateSummary`.
- Produces: `<FileRow item planItem state selected expanded on… />`, `<CandidateList candidates appliedId onChoose />`, `<RowDetail item onEditField onSetKind onSetSource onSearch onChooseCandidate />`.

- [ ] **Step 1: Write the failing test**

La lógica ya está cubierta por `row-model.test.ts`. Esta tarea se verifica a mano; escribe primero
la lista de comprobación en `docs/testing.md` bajo un apartado nuevo:

```markdown
## Verificación manual — lista de archivos

1. Cargar 3 archivos: uno con nombre de release completo, uno con nombre destrozado y uno inexistente en TMDb.
2. El primero muestra punto verde y ningún detalle abierto.
3. El segundo muestra punto ámbar y, al desplegar, la lista de candidatos con póster ya cargada.
4. Elegir un candidato cambia el nombre propuesto al instante y el punto pasa a verde.
5. El tercero muestra punto rojo con el buscador desplegado y el título limpio ya escrito.
6. Las alertas del nombre (sin castellano, sin resolución) aparecen dentro del detalle.
```

- [ ] **Step 2: Run the app and confirm the current behaviour fails the checklist**

Run: `pnpm dev` y abre la aplicación.
Expected: los puntos 3, 5 y 6 fallan — hoy no hay candidatos ni alertas en pantalla.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/features/renamer/CandidateList.tsx
import type { ProviderCandidateSummary } from "../../domain/identification/types";

export interface CandidateListProps {
  readonly candidates: readonly ProviderCandidateSummary[];
  readonly appliedId: number | undefined;
  readonly onChoose: (candidate: ProviderCandidateSummary) => void;
}

/** Alternativas de TMDb. Se muestran siempre: cambiar la elección es un clic. */
export const CandidateList = ({ candidates, appliedId, onChoose }: CandidateListProps) => {
  if (candidates.length === 0) return null;

  return (
    <ul className="candidate-list">
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <button
            type="button"
            className={candidate.id === appliedId ? "is-applied" : ""}
            onClick={() => onChoose(candidate)}
            title={candidate.components.map((component) => component.explanation).join("\n")}
          >
            {candidate.posterUrl === undefined ? (
              <span className="candidate-poster-placeholder" aria-hidden />
            ) : (
              <img src={candidate.posterUrl} alt="" loading="lazy" />
            )}
            <span className="candidate-text">
              <strong>{candidate.spanishTitle}</strong> ({candidate.year ?? "—"})
              {candidate.originalTitle === candidate.spanishTitle ? null : (
                <em> · {candidate.originalTitle}</em>
              )}
            </span>
            <span className={`candidate-band band-${candidate.band}`}>{candidate.score}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};
```

```tsx
// src/features/renamer/FileRow.tsx
import { AlertTriangle, ChevronDown, Loader2, X } from "lucide-react";

import { effectiveName, type MediaItem } from "../../services/item-pipeline";
import type { RowState } from "./row-model";

export interface FileRowProps {
  readonly item: MediaItem;
  readonly state: RowState;
  readonly selected: boolean;
  readonly expanded: boolean;
  readonly onToggleExpanded: (id: string) => void;
  readonly onToggleSelected: (id: string, withRange: boolean) => void;
  readonly onOverrideName: (id: string, value: string | undefined) => void;
  readonly onRemove: (id: string) => void;
}

const STATE_LABEL: Readonly<Record<RowState, string>> = {
  analyzing: "Analizando",
  ready: "Listo",
  review: "Necesita revisión",
  error: "Error",
};

/** Fila compacta: nombre propuesto en primer plano, nombre actual debajo. */
export const FileRow = ({
  item,
  state,
  selected,
  expanded,
  onToggleExpanded,
  onToggleSelected,
  onOverrideName,
  onRemove,
}: FileRowProps) => (
  <div className={`file-row state-${state} ${selected ? "is-selected" : ""}`}>
    <button
      type="button"
      className={`row-state row-state-${state}`}
      title={STATE_LABEL[state]}
      aria-label={STATE_LABEL[state]}
      onClick={(event) => onToggleSelected(item.id, event.shiftKey)}
    >
      {state === "analyzing" ? <Loader2 size={12} className="spin" aria-hidden /> : null}
      {state === "error" ? <AlertTriangle size={12} aria-hidden /> : null}
    </button>

    <div className="row-names">
      <label className="visually-hidden" htmlFor={`name-${item.id}`}>
        Nombre propuesto
      </label>
      <input
        id={`name-${item.id}`}
        className="row-proposed"
        value={effectiveName(item)}
        spellCheck={false}
        onChange={(event) =>
          onOverrideName(
            item.id,
            event.target.value === item.name.filename ? undefined : event.target.value,
          )
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") onOverrideName(item.id, undefined);
        }}
      />
      <div className="row-current" title={item.currentName}>
        {item.currentName}
      </div>
    </div>

    <button
      type="button"
      className="icon-button"
      aria-expanded={expanded}
      title="Ver y corregir los datos"
      onClick={() => onToggleExpanded(item.id)}
    >
      <ChevronDown size={14} className={expanded ? "is-open" : ""} />
    </button>
    <button
      type="button"
      className="icon-button"
      title="Quitar de la lista"
      onClick={() => onRemove(item.id)}
    >
      <X size={14} />
    </button>
  </div>
);
```

`RowDetail.tsx` reutiliza los campos corregibles que hoy viven en `MediaItemCard.tsx` (título, año,
tipo, temporada, episodio, título de episodio, fuente y buscador manual), les añade la
`<CandidateList>` con `item.identification.alternatives`, la lista de `item.name.alerts` y un
`<TechnicalSheet>` plegado (Task 16). Copia el bloque `item-fields` y el bloque `item-search` de
`MediaItemCard.tsx` sin cambios de comportamiento, actualizando `SOURCE_OPTIONS` al vocabulario
nuevo de `ALL_RELEASE_SOURCES`.

Actualiza `RenamerScreen.tsx` para renderizar `<FileRow>` y, cuando `expanded`, `<RowDetail>`.
Elimina `MediaItemCard.tsx`.

- [ ] **Step 4: Verify against the checklist**

Run: `pnpm dev`
Expected: los seis puntos de la lista de `docs/testing.md` se cumplen.

- [ ] **Step 5: Commit**

```bash
git add src/features/renamer src/styles/features.css docs/testing.md
git rm src/features/renamer/MediaItemCard.tsx
git commit -m "feat(ui): replace item cards with rows, detail panel and candidate list"
```

---

### Task 16: Ficha técnica

**Files:**
- Create: `src/features/renamer/TechnicalSheet.tsx`
- Modify: `src/features/renamer/RowDetail.tsx`
- Modify: `src/styles/features.css`

**Interfaces:**
- Consumes: `Traced<T>`, `describeConfidence`, `describeSource` de `domain/media/provenance.ts`.
- Produces: `<TechnicalSheet media={NormalizedMedia} identification={ContentIdentification} attempts={readonly string[]} />`.

- [ ] **Step 1: Write the failing test**

Añade a `docs/testing.md`:

```markdown
## Verificación manual — ficha técnica

1. Desplegar el detalle de un archivo analizado y abrir «Ficha técnica».
2. Cada dato muestra su valor, su confianza («Confirmado en el fichero», «Inferido»…) y su motivo.
3. La resolución explica por qué se eligió la clase (`3840×1608: anchura 3840 ⇒ 4K`).
4. La fuente indica si vino del nombre o del bitrate.
5. Aparece la traza de la identificación: qué consultas se lanzaron y en qué orden.
```

- [ ] **Step 2: Run the app and confirm it fails**

Run: `pnpm dev`
Expected: no existe ninguna ficha técnica.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/features/renamer/TechnicalSheet.tsx
import type { ContentIdentification } from "../../domain/identification/types";
import { describeConfidence, describeSource, type Traced } from "../../domain/media/provenance";
import type { NormalizedMedia } from "../../domain/media/types";

export interface TechnicalSheetProps {
  readonly media: NormalizedMedia;
  readonly identification: ContentIdentification;
  readonly attempts: readonly string[];
}

interface Entry {
  readonly label: string;
  readonly traced: Traced<unknown>;
  readonly text: string | undefined;
}

const entry = (label: string, traced: Traced<unknown>, text?: string): Entry => ({
  label,
  traced,
  text: text ?? (traced.value === undefined ? undefined : String(traced.value)),
});

/** Hace visible el modelo de procedencia: valor, confianza y motivo. */
export const TechnicalSheet = ({ media, identification, attempts }: TechnicalSheetProps) => {
  const video = media.video[0];
  const resolution = video?.resolution;

  const entries: readonly Entry[] = [
    entry("Título", identification.spanishTitle),
    entry("Año", identification.year),
    entry(
      "Resolución",
      resolution ?? { value: undefined, confidence: "UNKNOWN", source: "DERIVED" },
      resolution?.value === undefined
        ? undefined
        : `${resolution.value.quality} ${resolution.value.pixelLabel} (${String(resolution.value.width)}×${String(resolution.value.height)})`,
    ),
    entry("Fuente", media.source.media),
    entry("Tipo de lanzamiento", media.source.type),
    entry("Códec de vídeo", video?.codec ?? { value: undefined, confidence: "UNKNOWN", source: "DERIVED" }),
    entry("Profundidad de bits", video?.bitDepth ?? { value: undefined, confidence: "UNKNOWN", source: "DERIVED" }),
    entry("Duración", media.general.durationSeconds, (() => {
      const seconds = media.general.durationSeconds.value;
      return seconds === undefined ? undefined : `${String(Math.round(seconds / 60))} min`;
    })()),
    entry("Contenedor", media.general.container),
  ];

  return (
    <details className="technical-sheet">
      <summary>Ficha técnica</summary>
      <dl>
        {entries.map((item) => (
          <div key={item.label} className={`sheet-entry confidence-${item.traced.confidence}`}>
            <dt>{item.label}</dt>
            <dd>
              <span className="sheet-value">{item.text ?? "—"}</span>
              <span className="sheet-meta">
                {describeConfidence(item.traced.confidence)} · {describeSource(item.traced.source)}
              </span>
              {item.traced.note === undefined ? null : (
                <span className="sheet-note">{item.traced.note}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {attempts.length === 0 ? null : (
        <p className="sheet-attempts">
          Consultas lanzadas: {attempts.join(" → ")}
        </p>
      )}

      {media.warnings.length === 0 ? null : (
        <ul className="sheet-warnings">
          {media.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </details>
  );
};
```

`MediaItem.attempts` ya existe desde la Task 13: pásalo desde `RowDetail` a este componente.

- [ ] **Step 4: Verify against the checklist**

Run: `pnpm dev`
Expected: los cinco puntos se cumplen.

- [ ] **Step 5: Commit**

```bash
git add src/features/renamer/TechnicalSheet.tsx src/features/renamer/RowDetail.tsx src/services/item-pipeline.ts src/styles/features.css docs/testing.md
git commit -m "feat(ui): surface data provenance in a technical sheet"
```

---

### Task 17: Barra de lista, acciones de lote y virtualización

**Files:**
- Create: `src/features/renamer/ListToolbar.tsx`
- Modify: `src/features/renamer/RenamerScreen.tsx`
- Modify: `src/features/renamer/useRenamerState.ts`
- Modify: `src/styles/features.css`

**Interfaces:**
- Consumes: `countByState`, `filterItems`, `toggleSelection`, `rowStateOf` (Task 14).
- Produces: `<ListToolbar counts filter onFilter selectedCount onBatchKind onBatchSource onRetry onRemoveSelected />`; el estado expone `selected: ReadonlySet<string>`, `filter: ListFilter`, `setFilter`, `setSelected`, `retrySelected`.

- [ ] **Step 1: Write the failing test**

Añade a `docs/testing.md`:

```markdown
## Verificación manual — barra de lista

1. Con 60 archivos cargados, desplazar la lista es fluido y el DOM solo contiene las filas visibles.
2. Pulsar el contador «Revisar» deja en pantalla solo las filas ámbar.
3. Escribir en el filtro reduce la lista por nombre actual y por nombre propuesto.
4. Seleccionar dos filas y pulsar «Marcar como serie» cambia ambas.
5. «Reintentar» vuelve a identificar solo las filas seleccionadas.
```

- [ ] **Step 2: Run the app and confirm it fails**

Run: `pnpm dev`
Expected: nada de esto existe; con 60 archivos el DOM contiene 60 tarjetas completas.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/features/renamer/ListToolbar.tsx
import { Film, RefreshCw, Trash2, Tv } from "lucide-react";

import type { ListFilter, RowState } from "./row-model";

export interface ListToolbarProps {
  readonly counts: Record<RowState, number>;
  readonly total: number;
  readonly filter: ListFilter;
  readonly onFilter: (filter: ListFilter) => void;
  readonly selectedCount: number;
  readonly onBatchKind: (kind: "movie" | "series") => void;
  readonly onRetrySelected: () => void;
  readonly onRemoveSelected: () => void;
}

const FILTERS: readonly { readonly state: RowState | undefined; readonly label: string }[] = [
  { state: undefined, label: "Todos" },
  { state: "ready", label: "Listos" },
  { state: "review", label: "Revisar" },
  { state: "error", label: "Error" },
];

export const ListToolbar = ({
  counts,
  total,
  filter,
  onFilter,
  selectedCount,
  onBatchKind,
  onRetrySelected,
  onRemoveSelected,
}: ListToolbarProps) => (
  <div className="list-toolbar">
    <div className="state-filters" role="group" aria-label="Filtrar por estado">
      {FILTERS.map(({ state, label }) => (
        <button
          key={label}
          type="button"
          className={`state-filter ${filter.state === state ? "is-active" : ""} ${
            state === undefined ? "" : `state-${state}`
          }`}
          onClick={() => onFilter({ ...filter, state })}
        >
          {label} <span>{state === undefined ? total : counts[state]}</span>
        </button>
      ))}
    </div>

    <label className="visually-hidden" htmlFor="list-filter">
      Filtrar por nombre
    </label>
    <input
      id="list-filter"
      className="list-filter"
      type="search"
      placeholder="Filtrar…"
      value={filter.text ?? ""}
      onChange={(event) => onFilter({ ...filter, text: event.target.value })}
    />

    {selectedCount === 0 ? null : (
      <div className="batch-actions">
        <span>{selectedCount} seleccionados</span>
        <button type="button" className="apple-button apple-button-ghost" onClick={() => onBatchKind("movie")}>
          <Film size={14} aria-hidden /> Película
        </button>
        <button type="button" className="apple-button apple-button-ghost" onClick={() => onBatchKind("series")}>
          <Tv size={14} aria-hidden /> Serie
        </button>
        <button type="button" className="apple-button apple-button-ghost" onClick={onRetrySelected}>
          <RefreshCw size={14} aria-hidden /> Reintentar
        </button>
        <button type="button" className="apple-button apple-button-ghost" onClick={onRemoveSelected}>
          <Trash2 size={14} aria-hidden /> Quitar
        </button>
      </div>
    )}
  </div>
);
```

En `useRenamerState`, añade el estado `selected`, `filter`, `expandedId`, y las acciones
`setSelected`, `setFilter`, `setExpandedId`, `batchSetKind(kind)`, `retrySelected()` (que llama a
`processItems` solo con los seleccionados) y `removeSelected()`.

En `RenamerScreen`, sustituye el `map` de la lista por `useVirtualizer`:

```tsx
const parentRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: visibleItems.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 64,
  overscan: 8,
});
```

y renderiza únicamente `virtualizer.getVirtualItems()`. Cuando `visibleItems.length <= 50`, renderiza
la lista completa sin virtualizar para que el detalle desplegado no salte de altura.

- [ ] **Step 4: Verify against the checklist**

Run: `pnpm dev`
Expected: los cinco puntos se cumplen.

- [ ] **Step 5: Commit**

```bash
git add src/features/renamer src/styles/features.css docs/testing.md
git commit -m "feat(ui): add filters, batch actions and list virtualisation"
```

---

### Task 18: Previsualización del lote

**Files:**
- Create: `src/features/renamer/BatchPreviewDialog.tsx`
- Modify: `src/features/renamer/RenamerScreen.tsx`
- Modify: `src/features/renamer/useRenamerState.ts`
- Modify: `src/styles/features.css`

**Interfaces:**
- Consumes: `RenamePlan` de `services/rename/plan.ts`.
- Produces: `<BatchPreviewDialog plan onConfirm onCancel />`; el estado expone `previewOpen: boolean`, `openPreview()`, `closePreview()`, y `renameAll()` deja de escribir sin confirmación.

- [ ] **Step 1: Write the failing test**

Añade a `docs/testing.md`:

```markdown
## Verificación manual — previsualización

1. Pulsar «Renombrar» NO toca el disco: abre un diálogo.
2. El diálogo lista cada archivo como `antes → después` y separa los bloqueados con su motivo.
3. `Esc` y «Cancelar» cierran sin renombrar nada.
4. «Renombrar N» ejecuta y el recuento de la confirmación coincide con el de archivos renombrados.
5. Tras renombrar, «Deshacer» restaura los nombres anteriores.
```

- [ ] **Step 2: Run the app and confirm it fails**

Run: `pnpm dev`
Expected: el punto 1 falla — hoy escribe en disco de inmediato.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/features/renamer/BatchPreviewDialog.tsx
import { useEffect, useRef } from "react";

import type { RenamePlan } from "../../services/rename/plan";

export interface BatchPreviewDialogProps {
  readonly plan: RenamePlan;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Última barrera antes de escribir en disco: se ve exactamente lo que va a pasar. */
export const BatchPreviewDialog = ({ plan, onConfirm, onCancel }: BatchPreviewDialogProps) => {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const ready = plan.items.filter((item) => item.canRename);
  const blocked = plan.items.filter((item) => !item.canRename);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel]);

  return (
    <div className="dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="preview-title">Vas a renombrar {ready.length} archivo(s)</h2>

        <ul className="preview-list">
          {ready.map((item) => (
            <li key={item.id}>
              <span className="preview-from">{item.currentName}</span>
              <span className="preview-to">{item.proposedName}</span>
            </li>
          ))}
        </ul>

        {blocked.length === 0 ? null : (
          <>
            <h3>{blocked.length} bloqueado(s)</h3>
            <ul className="preview-blocked">
              {blocked.map((item) => (
                <li key={item.id}>
                  <span>{item.currentName}</span>
                  <em>{item.issues.map((issue) => issue.message).join(" · ")}</em>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="dialog-actions">
          <button type="button" className="apple-button apple-button-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="apple-button apple-button-primary"
            onClick={onConfirm}
            disabled={ready.length === 0}
          >
            Renombrar {ready.length}
          </button>
        </div>
      </div>
    </div>
  );
};
```

En `useRenamerState`, añade `previewOpen` y separa `renameAll` en `openPreview()` (solo abre) y
`confirmRename()` (el `renameAll` actual). El botón del dock llama a `openPreview`.

- [ ] **Step 4: Verify against the checklist**

Run: `pnpm dev`
Expected: los cinco puntos se cumplen.

- [ ] **Step 5: Commit**

```bash
git add src/features/renamer src/styles/features.css docs/testing.md
git commit -m "feat(ui): require batch preview confirmation before renaming"
```

---

### Task 19: Ajustes completos y limpieza

**Files:**
- Modify: `src/features/renamer/SettingsPanel.tsx`
- Modify: `src/services/settings.ts`
- Modify: `src/features/renamer/RenamerScreen.tsx`
- Modify: `src/styles/features.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: `NAME_PRESETS`, `forgetAllCorrections` (Task 12).
- Produces: `AppSettings` sin las ocho opciones muertas y con `nameTargetLength`; `<SettingsPanel>` como modal accesible.

- [ ] **Step 1: Write the failing test**

```ts
// añade a src/services/settings.test.ts (créalo si no existe)
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, loadSettings } from "./settings";

describe("AppSettings", () => {
  it("no conserva opciones que ningún módulo lee", () => {
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(
      [
        "analysisConcurrency",
        "autoApplyBand",
        "customEpisodeTemplate",
        "customMovieTemplate",
        "includeProviderId",
        "includeSource",
        "includeSubtitleLanguages",
        "nameTargetLength",
        "presetId",
        "tmdbApiKey",
      ].sort(),
    );
  });

  it("el presupuesto de nombre por defecto es 120", () => {
    expect(DEFAULT_SETTINGS.nameTargetLength).toBe(120);
  });

  it("descarta una configuración guardada corrupta sin romper", () => {
    localStorage.setItem("renombrador.settings.v1", "{{{");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/services/settings.test.ts`
Expected: FAIL — el esquema todavía declara `includeYear`, `includeQuality`, `includeVideoCodec`,
`includeBitDepth`, `includeHdr`, `includePrimaryAudio`, `includeOtherLanguages`,
`metadataLanguage` y `metadataRegion`.

- [ ] **Step 3: Write minimal implementation**

En `src/services/settings.ts`, deja el esquema exactamente en:

```ts
const settingsSchema = z.object({
  presetId: z.enum(presetIds).default("professional"),
  customMovieTemplate: z.string().default(findPreset("professional").movieTemplate),
  customEpisodeTemplate: z.string().default(findPreset("professional").episodeTemplate),
  includeSource: z.boolean().default(true),
  includeSubtitleLanguages: z.boolean().default(false),
  includeProviderId: z.boolean().default(false),
  nameTargetLength: z.number().int().min(60).max(255).default(120),
  analysisConcurrency: z.number().int().min(1).max(8).default(2),
  autoApplyBand: z.enum(["high", "medium"]).default("high"),
  tmdbApiKey: z.string().default(""),
});
```

Reescribe `SettingsPanel.tsx` como diálogo modal con overlay, `role="dialog"`, `aria-modal`, cierre
con `Esc` y foco inicial en el primer control, exponiendo: formato del nombre (incluido
`Personalizado` con las dos plantillas libres y la lista de tokens disponibles), clave de TMDb con
botón «Comprobar clave» que llama a `provider.search({ title: "Dune", kind: "movie" })` y muestra el
resultado, longitud objetivo del nombre, concurrencia de análisis, banda de auto-aplicación,
inclusión de subtítulos y de identificador del proveedor, y un botón «Olvidar correcciones
aprendidas» que llama a `forgetAllCorrections()`.

En `src/styles/features.css`, elimina los bloques `.control-ribbon`, `.control-row`,
`.control-group`, `.control-label`, `.segmented-control`, `.segment-button`, `.paste-box-card`,
`.paste-textarea`, `.file-checkbox`, `.search-input-wrapper`, `.search-icon`, `.search-input`,
`.tags-row`, `.tags-label`, `.tag-chip`, `.quick-presets-drawer`, `.quick-presets-group`,
`.preset-chip-btn`, `.batch-presets-bar`, `.dropzone-icon`, `.apple-button-success`,
`.file-card-names`, `.file-card-actions`, `.suggested-name` y todas sus variantes.

Añade en `RenamerScreen.tsx`, dentro de la pantalla vacía, un aviso visible cuando
`settings.tmdbApiKey` está en blanco («Sin clave de TMDb los títulos salen del nombre del archivo»
con un botón que abre Ajustes), y mantén la pista visual de soltar sobre la lista cuando ya hay
archivos (clase `is-dragover` sobre el contenedor de filas). Sustituye el `notice: string | null`
del estado por una cola `notices: readonly { id: string; text: string }[]` con `pushNotice` y
`dismissNotice`, y renderiza todas las entradas apiladas en lugar de un único toast que se pisa.

Actualiza `README.md`: sección «Formato del nombre» con los ejemplos canónicos nuevos, sección
«Presets» con los tokens vigentes (`{quality}`, `{resolutionLabel}`, `{source}`, sin
`{qualitySource}`), y una sección «Detección» que describa la cascada de siete pasos.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/services/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the whole project**

Run: `pnpm check`
Expected: sin errores. Comprueba además en `pnpm dev` que el panel se cierra con `Esc`, que el foco
queda atrapado dentro y que «Comprobar clave» informa del resultado.

- [ ] **Step 6: Commit**

```bash
git add src/services/settings.ts src/services/settings.test.ts src/features/renamer/SettingsPanel.tsx src/styles/features.css README.md
git commit -m "feat(ui): expose every real setting and drop dead configuration and CSS"
```

---

## Verificación final

- [ ] `pnpm check` en verde.
- [ ] Recorrer las cuatro listas de verificación manual de `docs/testing.md`.
- [ ] Renombrar un lote real de 3 archivos y deshacerlo: los nombres vuelven exactamente a su estado anterior.
- [ ] Comprobar en un navegador sin `FileSystemFileHandle.move()` (Firefox) que la aplicación analiza, propone nombres y avisa de que no puede renombrar.
