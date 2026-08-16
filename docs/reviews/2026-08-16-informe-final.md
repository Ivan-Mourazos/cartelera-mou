# Informe final — auditoría, refactorización y reestructuración

**Fecha:** 2026-08-16
**Alcance:** aplicación web de análisis y renombrado de archivos multimedia
**Auditoría inicial:** [`2026-08-16-auditoria-web.md`](./2026-08-16-auditoria-web.md)

## 1. Resumen

El proyecto era una SPA de navegador que leía metadatos reales con MediaInfo WASM pero los mezclaba
sin distinción con etiquetas deducidas del nombre del archivo, generaba nombres con un corchete por
etiqueta y podía **destruir archivos** al renombrar. La documentación describía una aplicación de
escritorio con Tauri, Rust y SQLite que no existe en el repositorio.

Se ha reestructurado la aplicación completa conservando lo que estaba bien (tokenizador, reglas del
nombre, validación de nombres Windows, modelo de evidencias, puntuación auditable y la elección de
MediaInfo), y sustituyendo lo que era conceptualmente incorrecto.

## 2. Problemas corregidos

| ID  | Problema                                                                               | Corrección                                                                                                                                |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Renombrado por copia y borrado: podía sobrescribir el destino y duplicar decenas de GB | Eliminada. Solo `FileSystemFileHandle.move()`; si el navegador no lo soporta, se informa y se ofrece el script                            |
| C2  | Sin detección de conflictos ni duplicados de lote                                      | `services/rename/plan.ts`: preflight completo (destino existente, duplicado en lote, extensión, nombres reservados, longitud, mayúsculas) |
| C3  | Inyección de comandos en los scripts `.ps1`/`.bat`                                     | Comillas simples con escape `''` en PowerShell, `%%` en batch, `'\''` en sh, y comprobación de destino en los tres                        |
| C4  | La interfaz daba por renombrados archivos que fallaron                                 | El ejecutor devuelve resultado por `id`; la interfaz aplica exactamente ese resultado                                                     |
| C5  | Renombrado sin confirmación                                                            | Diálogo de confirmación con recuento y aviso de bloqueados, más simulación previa                                                         |
| A1  | Clasificación de calidad por altura (`3840×1608` → «1440p»)                            | `domain/media/resolution.ts`: clases por dimensiones con corrección anamórfica                                                            |
| A2  | Atmos y DTS:X casi nunca detectados (`Format_Commercial` inexistente)                  | `Format_Commercial_IfAny` + `Format_AdditionalFeatures` (`JOC`, `16-ch`, `XLL X`)                                                         |
| A3  | Rama imposible: DTS-HD MA nunca se reconocía                                           | Variante DTS por `Format_Profile`/nombre comercial                                                                                        |
| A4  | `spa` → `ES` (castellano) sin evidencia                                                | `domain/media/language.ts`: BCP-47, `es-ES`/`es-419`, título de pista, y «región desconocida» cuando no hay evidencia                     |
| A5  | PQ ⇒ HDR10 (falso en Dolby Vision perfil 5)                                            | HDR10 exige ST 2086, compatibilidad declarada o mastering display                                                                         |
| A6  | Canales por recuento ignorando el layout                                               | `formatChannels` usa el layout; el recuento es la reserva                                                                                 |
| A7  | Fusión de etiquetas con rama muerta y pérdida del dato real                            | Sustituida por el modelo `Traced<T>`: el dato real no compite con el nombre                                                               |
| A8  | Sin proveedor de metadata: títulos por _title case_ del nombre                         | `MetadataProvider` + cliente TMDb `es-ES`/`ES`, con modo sin clave                                                                        |
| A9  | Formato «un corchete por etiqueta»                                                     | Motor de plantillas con bloques `[… · … · …]` y cinco presets                                                                             |
| A10 | Series convertidas en `[105]`                                                          | `Serie (Año) - S01E03 - Título` con soporte de `S00E01` y `S01E01-E02`                                                                    |
| A11 | Sin dry run, registro ni deshacer                                                      | Los tres implementados y probados                                                                                                         |
| A13 | `RenamerScreen.tsx` de 1341 líneas                                                     | Dividido en `useRenamerState`, `MediaItemCard`, `TechnicalSheet`, `SettingsPanel` y pantalla                                              |
| A14 | Efecto de análisis re-disparado y secuencial                                           | Cola con concurrencia configurable, progreso y cancelación                                                                                |
| M1  | `.iso` y formatos de audio en una herramienta de vídeo                                 | Lista de contenedores de vídeo                                                                                                            |
| M3  | `DetectedTag` sin confianza ni procedencia                                             | `Traced<T>` en todo el modelo y en la ficha técnica                                                                                       |
| B1  | Error de ESLint preexistente                                                           | Resuelto al sustituir el módulo                                                                                                           |
| —   | Documentación que describía otro producto                                              | README, arquitectura y verificación reescritos; ADR-0003 añadida; documentos falsos marcados                                              |

## 3. Desviación técnica sobre lo pedido

**Separador de idiomas.** El encargo pedía `/` (`Otros ENG/FRA/ITA`). La barra es el separador de
rutas en todos los sistemas y en Windows está prohibida en nombres de archivo: cualquier saneado la
eliminaría. Se usa `+` (`Otros ENG+FRA+ITA`), legal en todo sistema de archivos, y el separador es
un parámetro del dominio (`languageSeparator`). El objetivo funcional —idiomas agrupados y
legibles— se mantiene.

## 4. Archivos

**Nuevos (dominio):** `media/{provenance,types,raw,resolution,video,audio,audio-selection,language,subtitles,source,normalize,test-fixtures}.ts`,
`identification/{types,hints,build}.ts`, `naming/{template,presets,build}.ts`.

**Nuevos (servicios):** `analysis/{mediainfo-client,queue}.ts`, `providers/{types,tmdb}.ts`,
`rename/{plan,executor,undo,log}.ts`, `identification-service.ts`, `item-pipeline.ts`,
`settings.ts`.

**Nuevos (interfaz):** `features/renamer/{useRenamerState.ts,MediaItemCard.tsx,TechnicalSheet.tsx,SettingsPanel.tsx}`.

**Reescritos:** `services/file-system.ts`, `features/renamer/RenamerScreen.tsx`, `domain/index.ts`,
`README.md`, `docs/architecture.md`, `docs/testing.md`, `.env.example`, `src/styles/features.css`
(añadidos).

**Eliminados por quedar superados:** `services/{renamer-engine,renamer-types,media-metadata}.ts`,
`domain/naming/generator.ts` y sus pruebas.

**Pruebas nuevas:** `resolution`, `video`, `audio`, `language`, `source`, `normalize`, `hints`,
`naming/build`, `rename`, `file-system`, `tmdb`, `identification-service`.

## 5. Comandos ejecutados y resultado

| Comando                            | Antes                  | Después                      |
| ---------------------------------- | ---------------------- | ---------------------------- |
| `npx tsc -b --force`               | 0 errores              | 0 errores                    |
| `npx eslint . --max-warnings 0`    | **1 error**            | 0 errores, 0 avisos          |
| `npx prettier --check .`           | correcto               | correcto                     |
| `npx vitest run`                   | 6 archivos, 39 pruebas | **16 archivos, 248 pruebas** |
| `npx vite build`                   | —                      | correcta (~7 s)              |
| `npx vite preview` + petición HTTP | —                      | HTTP 200, bundle servido     |

No se ejecutan `cargo` ni `tauri`: no hay código Rust en el proyecto.

## 6. Cobertura frente al encargo

| Requisito                                      | Estado              | Evidencia                                            |
| ---------------------------------------------- | ------------------- | ---------------------------------------------------- |
| Analizar el contenido real (no el nombre)      | Cumple              | `normalize.test.ts`                                  |
| Clasificación de calidad con crops             | Cumple              | `resolution.test.ts` (15 casos)                      |
| Códec, bit depth, HDR, Dolby Vision            | Cumple              | `video.test.ts`                                      |
| Audio completo, Atmos, DTS:X, canales          | Cumple              | `audio.test.ts`                                      |
| Castellano frente a latino                     | Cumple              | `language.test.ts`                                   |
| Fuente/REMUX con niveles de confianza          | Cumple              | `source.test.ts`                                     |
| `qualitySource`                                | Cumple              | `source.test.ts`                                     |
| Título oficial en España                       | Cumple              | `tmdb.test.ts` (`es-ES`/`ES`), sin traducción propia |
| Identificación con confianza y alternativas    | Cumple              | `identification-service.test.ts`                     |
| Series, especiales y episodios múltiples       | Cumple              | `hints.test.ts`, `build.test.ts`                     |
| Plantillas y presets                           | Cumple              | `build.test.ts`, `SettingsPanel`                     |
| Vista previa y edición manual                  | Cumple              | `MediaItemCard`                                      |
| Renombrado seguro, dry run, registro, deshacer | Cumple              | `rename.test.ts`                                     |
| Configuración persistente                      | Cumple              | `services/settings.ts`                               |
| Ficha técnica completa en la interfaz          | Cumple              | `TechnicalSheet.tsx`                                 |
| Lotes con concurrencia, progreso y cancelación | Cumple              | `analysis/queue.ts`, `useRenamerState`               |
| Reintento individual desde la interfaz         | Cumple parcialmente | Hay «volver a analizar» global, no por fila          |
| Virtualización de listas grandes               | No cumple           | `@tanstack/react-virtual` sigue sin usarse           |
| Deshacer más allá del último lote              | No cumple           | Solo el último lote                                  |

## 7. Pendiente y riesgos aceptados

1. **Virtualización.** Con más de ~500 filas la lista se resentirá. La dependencia ya está instalada.
2. **Reintento por archivo** y exclusión rápida de fallidos.
3. **Clave de TMDb en el navegador.** Sin backend no hay forma de ocultarla; la interfaz lo advierte.
   Si el uso deja de ser personal, hace falta un proxy mínimo.
4. **Sin verificación interactiva real.** No se ha ejecutado un recorrido en navegador con archivos
   propios ni una consulta viva a TMDb: ambas requieren intervención humana. El renombrado está
   probado end-to-end contra un sistema de archivos en memoria, no contra NTFS.
5. **Accesibilidad.** Mejorada (botones reales, etiquetas, `aria-live`), sin auditoría formal.
6. `domain/metadata.ts` (modelo de evidencias heredado) solo lo usa el clasificador del nombre;
   convive con `Traced<T>`. Unificarlos es deuda técnica menor.

## 8. Veredicto

**APTO PARA USO LOCAL CON PRECAUCIONES.**

Las operaciones destructivas ya no pueden sobrescribir ni copiar-y-borrar, hay preflight,
simulación, confirmación, registro y deshacer, y todo ello está cubierto por pruebas de integración
sobre un sistema de archivos simulado. No se concede el nivel máximo porque **no se ha ejecutado un
renombrado real en disco en un navegador**: esa validación exige archivos de la persona usuaria.

Recomendación para el siguiente hito: probar con una carpeta de copias desechables en Chrome, usando
primero «Simular», y añadir después virtualización y reintento por archivo.

## 9. Simplificación posterior de la interfaz (mismo día)

A petición expresa: _«no quiero nada ultra elaborado, solo ver el nombre sugerido y poder renombrar
con un botón; me sobran las descargas de ps1 o bat»_.

Retirado de la interfaz **y del código** (no queda código muerto):

- Generación y descarga de scripts `.bat`, `.ps1` y `.sh` (`generateRenameScript`, sus utilidades de
  escapado, `downloadTextFile` y sus 5 pruebas).
- Botón de simulación (_dry run_). El parámetro sigue existiendo en el ejecutor porque es su
  contrato y lo usan las pruebas, pero la interfaz solo ofrece renombrar.
- Descarga del registro, buscador de la lista, botón de reanálisis global, `copyTextToClipboard`,
  `listRenameLog`, `clearRenameLog`, `formatLogRecord`, `hasProposal` y el estado `lastResult`.
- Configuración reducida a dos campos: formato del nombre y clave de TMDb.

La interfaz queda en: abrir carpeta / añadir archivos → lista con **nombre actual → nombre propuesto
editable** → un botón **Renombrar N** (con confirmación) y **Deshacer**.

Lo que **no** se ha tocado, porque es lo que hace que el resultado sea correcto: análisis real con
MediaInfo, trazabilidad, preflight completo, renombrado solo con `move()` sin sobrescribir, registro
y deshacer.

Consecuencia asumida: en Firefox y Safari ya no hay alternativa al renombrado directo; la aplicación
avisa de que hace falta un navegador Chromium.

Verificación tras la simplificación: `pnpm check` correcto — prettier, ESLint 0 errores, `tsc` 0
errores, **243 pruebas** en 16 archivos y build de producción.

## 10. Corrección del renombrado y simplificación final

Informe de la persona usuaria: _«el archivo que cargo no se sobrescribe»_ (el renombrado no llegaba
a aplicarse) y _«quiero la app más simple: cargar archivo, análisis, editar nombre con propuesta y
renombrar»_.

### Causa real del fallo (dos defectos encadenados)

1. **Falta de permiso de escritura.** `showOpenFilePicker` y `getAsFileSystemHandle` (arrastrar y
   soltar) conceden permiso de **solo lectura**. Al no llamar a `requestPermission({ mode:
"readwrite" })`, la llamada posterior a `move()` fallaba con `NotAllowedError`.
   `src/services/file-system.ts` ahora pide escritura al cargar y vuelve a verificarla antes de
   mover.
2. **No existía ruta de renombrado sin carpeta abierta.** `renameSelected` abortaba con un aviso si
   `directory === null`, que es justo el caso de «Elegir archivos» y de arrastrar. Se añade
   `createHandleRenamePort`, que renombra con el handle del propio archivo.

Limitación honesta del caso «archivos sueltos»: el navegador no permite listar la carpeta, así que
**no se puede comprobar si el destino ya existe**. La aplicación lo advierte en pantalla y mantiene
la protección que sí es posible (colisiones dentro del propio lote). Con «Abrir carpeta» sí se
comprueba.

Regresión cubierta por `src/services/rename-port.test.ts` (6 pruebas nuevas).

### Simplificación

La pantalla queda en: cargar → analizar → editar el nombre propuesto → **Renombrar**.

Retirado: casillas de selección y «seleccionar todo», ficha técnica desplegable
(`TechnicalSheet.tsx`), campos de corrección manual de identificación, selector de candidatos,
diálogo de confirmación, modal de progreso (el progreso va en la cabecera) y los helpers que
quedaban sin uso (`applyUserCorrection`, `withIdentification`, `EditableIdentificationField`).

El nombre propuesto es ahora un campo de texto directo en cada fila: se escribe encima y listo;
`Esc` vuelve a la propuesta automática.

Verificación: `pnpm check` correcto — prettier, ESLint 0, `tsc` 0, **250 pruebas** en 17 archivos y
build de producción.
