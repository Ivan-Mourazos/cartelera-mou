# Auditoría técnica — Renombrador Inteligente (aplicación web)

**Fecha:** 2026-08-16
**Alcance:** repositorio completo `cartelera-de-mou`
**Método:** lectura del árbol real + ejecución de las comprobaciones del proyecto.

## 0. Estado real del proyecto (contrastado, no documental)

Lo primero que hay que decir es que **la documentación del repositorio no describe este proyecto**.

`docs/architecture.md` y `docs/reviews/opus-initial-review.md` describen una aplicación de escritorio
llamada «CineVault» construida con Tauri 2, Rust, SQLite y ffprobe, e incluso afirman haber ejecutado
`cargo test` con «35 / 35 pruebas superadas» y ficheros como `src-tauri/capabilities/main.json`,
`001_initial.sql` o `src/services/naming-bridge.test.ts`.

Comprobación real:

| Búsqueda                                                     | Resultado  |
| ------------------------------------------------------------ | ---------- |
| `**/Cargo.toml`, `**/*.rs`, `**/*.sql`, `**/tauri.conf.json` | 0 ficheros |
| `src-tauri/`                                                 | no existe  |
| `src/services/naming-bridge.test.ts`                         | no existe  |

**Este proyecto es una SPA de navegador**: Vite 8 + React 19 + TypeScript estricto, sin backend,
sin proceso local, sin base de datos y sin ffprobe. El análisis multimedia real se hace con
**mediainfo.js (WebAssembly)** en el propio navegador, y el acceso a disco con la
**File System Access API**. Toda la documentación anterior debe considerarse ficción y queda
marcada como obsoleta.

### Comprobaciones ejecutadas (estado inicial, sin tocar código)

| Comando                         | Resultado real                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npx vitest run`                | ✅ 6 ficheros, 39 pruebas superadas                                                               |
| `npx tsc -b`                    | ✅ sin errores                                                                                    |
| `npx eslint . --max-warnings 0` | ❌ 1 error (`@typescript-eslint/prefer-nullish-coalescing`, `src/services/renamer-engine.ts:355`) |

### Inventario de código fuente (29 ficheros en `src/`)

| Módulo                               | Función                                            | Veredicto                                    |
| ------------------------------------ | -------------------------------------------------- | -------------------------------------------- |
| `domain/naming/tokenizer.ts`         | tokenización del filename con posiciones           | **CONSERVAR**                                |
| `domain/naming/rules.ts`             | reglas independientes por familia sobre tokens     | **REFACTORIZAR**                             |
| `domain/naming/parser.ts`            | ensamblado de título/año/evidencias                | **REFACTORIZAR**                             |
| `domain/naming/windows-filename.ts`  | saneado y validación Windows                       | **CONSERVAR**                                |
| `domain/metadata.ts`                 | modelo de evidencias con origen/fuerza/confianza   | **CONSERVAR** (infrautilizado)               |
| `domain/matching/tmdb-score.ts`      | puntuación explicable y auditable                  | **CONSERVAR** (hoy código muerto)            |
| `domain/naming/generator.ts`         | generador «un corchete por etiqueta»               | **SUSTITUIR** (formato objetivo distinto)    |
| `services/media-metadata.ts`         | lectura MediaInfo → etiquetas planas               | **SUSTITUIR**                                |
| `services/renamer-engine.ts`         | title case + tags + nombre sugerido                | **SUSTITUIR**                                |
| `services/renamer-types.ts`          | `RenamerItem` con `DetectedTag[]` sin trazabilidad | **SUSTITUIR**                                |
| `services/file-system.ts`            | selección, renombrado, scripts                     | **REFACTORIZAR** (con correcciones críticas) |
| `features/renamer/RenamerScreen.tsx` | 1341 líneas: todo el producto                      | **REFACTORIZAR** (descomponer)               |

---

## 1. Hallazgos críticos

### C1 — Copia-y-borra como fallback de renombrado: riesgo de pérdida de datos

**Fichero:** `src/services/file-system.ts:346-361`

```ts
const targetHandle = await dirHandle.getFileHandle(item.suggestedName, { create: true });
const writable = await targetHandle.createWritable();
await writable.write(sourceFile);
await writable.close();
await dirHandle.removeEntry(item.originalName);
```

**Impacto real:**

1. `getFileHandle(name, { create: true })` **abre un fichero existente si ya existe**. Si el nombre
   propuesto coincide con otro vídeo de la carpeta, ese vídeo se sobrescribe entero, sin aviso, y
   acto seguido se borra el original. Es destrucción silenciosa de dos ficheros a la vez.
2. Copia el contenido completo. Con un REMUX de 60–100 GB significa duplicar el fichero en disco y
   tardar minutos; si la pestaña se cierra a mitad queda un destino truncado.
3. `removeEntry` se ejecuta aunque la escritura haya sido parcial en algunos motores.

**Reproducción:** carpeta con `A.mkv` y `Pelicula (2024).mkv`; proponer para `A.mkv` el nombre
`Pelicula (2024).mkv`; ejecutar renombrado directo en un navegador donde `move()` no esté disponible.

**Solución:** eliminar la ruta copia-y-borra. Renombrar solo mediante `FileSystemFileHandle.move()`;
si no está disponible, no renombrar y ofrecer el script. Antes de mover, comprobar que el destino no
existe.

### C2 — No hay detección de conflictos ni de duplicados dentro del lote

**Ficheros:** `src/services/file-system.ts:281-375`, `src/features/renamer/RenamerScreen.tsx:412-504`

No se comprueba: (a) que el destino ya exista en la carpeta, (b) que dos elementos del lote generen
el mismo nombre propuesto, (c) que el nombre solo cambie de mayúsculas. Dos películas del mismo
título y año con distinta pista de audio producen exactamente el mismo nombre.

**Solución:** fase de _preflight_ obligatoria antes de tocar disco: validación Windows, colisión con
el directorio, colisión intra-lote, cambio solo de capitalización, extensión preservada.

### C3 — Inyección de comandos en los scripts generados

**Fichero:** `src/services/file-system.ts:410-435` (PowerShell) y `:384-408` (batch)

```ts
lines.push(`    Write-Host "[OK] ${item.originalName} -> ${item.suggestedName}" ...`);
```

PowerShell **interpola** dentro de comillas dobles. Un fichero llamado
`x$(Remove-Item -Recurse -Force $HOME).mkv` genera un `.ps1` que ejecuta ese comando cuando el
usuario lo lanza. En `.bat`, `%VAR%` se expande y unas comillas en el nombre rompen la línea.
El nombre del fichero es un dato no confiable: viene del disco del usuario.

**Solución:** comillas simples con escapado `''` en PowerShell, rechazo o escapado de `%` y `"` en
batch, comillas simples con escapado `'\''` en sh.

### C4 — La interfaz da por renombrados ficheros que fallaron

**Fichero:** `src/features/renamer/RenamerScreen.tsx:481-497`

Tras la ejecución, si `result.succeeded > 0` se marcan como `renamed` **todos** los elementos cuyo
`originalName` estaba en el lote, incluidos los que fallaron. Además la correspondencia se hace por
`originalName`, no por `id`: dos ficheros homónimos en subcarpetas distintas se marcan ambos.

**Solución:** que el ejecutor devuelva un resultado por `id` y que la UI aplique exactamente ese
resultado.

### C5 — Renombrado en disco sin confirmación explícita

**Fichero:** `src/features/renamer/RenamerScreen.tsx:412` y `:1230`

Un solo clic en «Renombrar N en Disco» modifica el disco. No hay diálogo de confirmación con el
recuento, ni resumen de conflictos, ni simulación previa.

---

## 2. Hallazgos altos

| ID  | Fichero:línea                               | Problema                                                                                                                                                         | Impacto                                                                                                                                                                                     |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `services/media-metadata.ts:62-70`          | La clase de calidad se decide solo por altura                                                                                                                    | `3840×1608` → «1440p», `1920×800` → «720p», `1280×536` → «480p». Todos los crops cinematográficos se clasifican mal                                                                         |
| A2  | `services/media-metadata.ts:32,279-285`     | Lee `Format_Commercial`; MediaInfo expone `Format_Commercial_IfAny`, y Atmos/DTS:X viven además en `Format_AdditionalFeatures` (`JOC`, `XLL X`)                  | Atmos y DTS:X prácticamente nunca se detectan desde el stream                                                                                                                               |
| A3  | `services/media-metadata.ts:90`             | `f === "DTS" && format.includes("XLL")` con `f = format.toUpperCase()` es una condición imposible                                                                | DTS-HD MA nunca se reconoce desde el fichero real                                                                                                                                           |
| A4  | `services/media-metadata.ts:114-123`        | `startsWith("es")` → `ES`                                                                                                                                        | `es-419` (latino) se presenta como castellano; `est` (estonio) también. Contradice el requisito de no inventar región                                                                       |
| A5  | `services/media-metadata.ts:252-258`        | `transfer.includes("PQ")` ⇒ HDR10                                                                                                                                | Un Dolby Vision perfil 5 (sin capa HDR10) se etiqueta como HDR10                                                                                                                            |
| A6  | `services/media-metadata.ts:103-112`        | Canales por número, ignorando `ChannelLayout`                                                                                                                    | 6 canales `C L R Ls Rs LFE` y 6.0 se muestran igual                                                                                                                                         |
| A7  | `services/renamer-engine.ts:265-292`        | `keptFilenameOnly` filtra por `filenameOnlyKinds.has(kind) && realKinds.has(kind)`: siempre vacío. La deduplicación final por `label` puede eliminar el tag real | Código muerto + posible pérdida del dato confirmado                                                                                                                                         |
| A8  | todo el proyecto                            | No existe integración con ningún proveedor de metadata                                                                                                           | El título sale de un _title case_ del filename (`renamer-engine.ts:44-83`). El requisito «título oficial en España» no se cumple en absoluto. `domain/matching/tmdb-score.ts` está sin usar |
| A9  | `domain/naming/generator.ts:210`            | Formato «un corchete por etiqueta»                                                                                                                               | El formato objetivo es `[4K UHD REMUX · HEVC 10-bit · Dolby Vision]`                                                                                                                        |
| A10 | `services/renamer-engine.ts:103-105`        | `seasonEpisode` acaba como un corchete más                                                                                                                       | Las series producen `Serie (2023) [105] …` en vez de `Serie (2023) - S01E05 - Título …`                                                                                                     |
| A11 | —                                           | No hay _dry run_, ni registro de operaciones, ni deshacer                                                                                                        | Requisitos 58-60 sin cubrir                                                                                                                                                                 |
| A12 | `domain/naming/rules.ts:344-372`            | Cualquier número de 3 cifras se interpreta como episodio                                                                                                         | `300 (2006)` se convierte en «temporada 3 episodio 00»                                                                                                                                      |
| A13 | `features/renamer/RenamerScreen.tsx`        | 1341 líneas con selección de ficheros, análisis, edición, generación de nombre, ejecución y presentación                                                         | Inmantenible; imposible probar por unidades                                                                                                                                                 |
| A14 | `features/renamer/RenamerScreen.tsx:74-120` | El efecto de análisis depende de `items` y hace `setItems` dentro; análisis estrictamente secuencial, sin cancelación ni límite de concurrencia                  | Re-ejecuciones continuas y bloqueo del flujo con lotes grandes                                                                                                                              |
| A15 | `package.json:17`                           | `@tanstack/react-virtual` instalado y no usado; la lista renderiza todos los elementos                                                                           | Sin virtualización con 1000 ficheros                                                                                                                                                        |

---

## 3. Hallazgos medios

- **M1** `services/file-system.ts:16-49` — `MEDIA_EXTENSIONS` incluye `.iso` y trece formatos de audio
  en una herramienta de vídeo; MediaInfo no puede analizar un `.iso` desde el navegador.
- **M2** `services/renamer-engine.ts:44-83` — el _title case_ castellaniza el título original
  («The Dark Knight» → «The Dark Knight», pero «EL LABERINTO DEL FAUNO» → «El Laberinto del Fauno»),
  destruye acrónimos y aplica reglas inglesas a títulos españoles.
- **M3** `services/renamer-types.ts` — `DetectedTag` no guarda ni confianza ni procedencia: la UI no
  puede distinguir un dato leído del stream de uno adivinado del nombre.
- **M4** `features/renamer/RenamerScreen.tsx:876-961` — accesibilidad: el título se edita con un
  `onClick` sobre un `<span>`, la zona de arrastre es un `<div>` clicable, sin roles ni foco.
- **M5** `services/renamer-engine.ts:243` — el `id` mezcla nombre + timestamp + aleatorio, y el
  renombrado casa elementos por `originalName`.

## 4. Hallazgos bajos

- **B1** `services/renamer-engine.ts:355` — `eslint` falla (`prefer-nullish-coalescing`).
- **B2** `zod` se usa solo en `app/branding.ts`; `@tanstack/react-virtual` no se usa.
- **B3** `SAMPLE_FILENAMES` presenta datos técnicos inventados como si fueran reales.

## 5. Aspectos correctamente implementados (verificados)

- La elección de **mediainfo.js (WASM)** es la correcta para esta arquitectura: es la única forma de
  leer cabeceras reales de MKV/MP4 en el navegador, y expone campos que ffprobe no da tan directos
  (`HDR_Format`, `HDR_Format_Compatibility`, `Format_AdditionalFeatures`). Se conserva.
- El **tokenizador** (`domain/naming/tokenizer.ts`) conserva posiciones y no usa una regex gigante.
- La **validación y saneado de nombres Windows** (`domain/naming/windows-filename.ts`) es sólida:
  caracteres inválidos, nombres reservados, puntos/espacios finales, longitud UTF-16, y
  deliberadamente **no trunca** en silencio.
- El **modelo de evidencias** (`domain/metadata.ts`) y la **puntuación auditable**
  (`domain/matching/tmdb-score.ts`) ya expresan lo que el producto necesita; el problema es que
  ninguno de los dos está conectado al flujo real.
- `tsc -b` en modo estricto pasa sin errores y las 39 pruebas existentes pasan.

## 6. Decisiones de la reestructuración

1. **Motor de análisis:** se mantiene mediainfo.js. No se añade ffprobe (imposible en navegador sin
   backend) ni FFmpeg WASM (descarga de decenas de MB para un dato que MediaInfo ya da).
2. **Trazabilidad obligatoria:** todo dato relevante viaja como `Traced<T>` con
   `CONFIRMED | INFERRED | UNKNOWN | USER_CONFIRMED` y su origen. El nombre solo puede usar datos
   técnicos `CONFIRMED`; `source`/`REMUX` se admite `INFERRED` porque no hay forma técnica de
   confirmarlos, y la interfaz lo marca.
3. **Proveedor de metadata:** interfaz `MetadataProvider` + implementación TMDb con `language=es-ES`
   y `region=ES`, más un proveedor nulo para modo sin clave. La clave la introduce el usuario y se
   guarda en `localStorage`; **en una SPA no existe forma de ocultarla**, y así se advierte en la UI.
4. **Renombrado:** solo `FileSystemFileHandle.move()`, con preflight, _dry run_, registro y deshacer
   del último lote. Se elimina la ruta copia-y-borra.
5. Se conserva la arquitectura de carpetas (`domain` / `services` / `features`) y el sistema visual.
