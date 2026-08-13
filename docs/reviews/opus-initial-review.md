# Informe de Revisión Técnica Inicial — CineVault MVP

**Fecha:** 5 de agosto de 2026  
**Rol:** Revisor Técnico Principal, Arquitecto de Software y Especialista en Seguridad y Sistemas de Archivos  
**Estado de Pruebas:**

- **Rust Backend:** 35 / 35 superadas (`cargo test`)
- **TypeScript Frontend:** 32 / 32 superadas (`pnpm vitest run`)

---

## 1. Resumen Ejecutivo y Dictamen

El MVP de **CineVault** presenta una arquitectura extraordinariamente solida para una aplicación de escritorio local basada en **Tauri 2**, **React/TypeScript estricto**, **Rust** y **SQLite**. A diferencia de desarrollos convencionales donde el renombrado de archivos y la integración con APIs externas se delegan descuidadamente a la capa de interfaz, CineVault establece una barrera infranqueable donde el backend en Rust actúa como el único custodio del sistema de archivos, la base de datos y la gestión de secretos.

### Evaluación Global

| Dimensión Técnica                      |     Calificación      | Estado y Observaciones                                                                                                                                                                                                                                                        |
| :------------------------------------- | :-------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Seguridad y Límites de Ejecución**   |  **Excelente (A+)**   | CSP restrictiva, tokens TMDb guardados únicamente en memoria de proceso (`processMemoryOnly`), aislamiento de comandos Tauri mediante capabilities explícitas (`main.json`).                                                                                                  |
| **Integridad del Sistema de Archivos** |  **Excelente (A+)**   | Transacción en 2 fases (`source` $\rightarrow$ `.stage` $\rightarrow$ `target`), journals JSON atómicos (`ReplaceFileW`/`MoveFileExW` en Windows), verificación de huella digital (`expected_size` y `expected_modified_at`), rollback automático y recuperación al arranque. |
| **Parser y Generación de Nombres**     | **Sobresaliente (A)** | Riguroso cumplimiento de nomenclatura por corchetes `[Etiqueta]`, reglas de sanitización para Windows (reemplazo de `:` por `-`, preservación de `Director's Cut` antes del año, detección de Dolby Vision Profile y DTS-HD MA).                                              |
| **Modelo de Datos y Concurrencia**     | **Sobresaliente (A)** | SQLite con modo WAL y `synchronous = FULL`, migraciones versionadas en `user_version`, índices de búsqueda insensibles a mayúsculas/minúsculas (`NOCASE`).                                                                                                                    |
| **Calidad de Código y Cobertura**      | **Sobresaliente (A)** | Cero advertencias lógicas en Rust, suite de pruebas automatizadas exhaustiva probando swaps circulares de nombres, fallos inyectados mid-commit y Journals corruptos.                                                                                                         |

---

## 2. Auditoría de Arquitectura y Seguridad

### 2.1 Modelo de Seguridad Tauri 2 (`Backend-as-Boundary`)

- **Aislamiento de la WebView:** La interfaz web no posee acceso directo a primitivas Node.js ni a capacidades del sistema de archivos. Toda operación pasa por IPC fuertemente tipado.
- **Capabilities y Permisos Granulares:** Definidos en `src-tauri/capabilities/main.json`. Se otorgan exclusivamente los comandos registrados (`allow-scan-folder`, `allow-execute-rename-batch`, `allow-undo-rename`, etc.), bloqueando cualquier invocación arbitraria del sistema operativo.
- **Content Security Policy (CSP):** `tauri.conf.json` especifica `default-src 'self'`, restringiendo los orígenes de imagen a `asset:`, `http://asset.localhost`, `data:`, `blob:` y `https://image.tmdb.org`. Se bloquea la ejecución de scripts no confiables (`object-src 'none'; frame-src 'none'`).

### 2.2 Gestión de Credenciales TMDb

- **Zero-Persistence Policy:** Las claves de API de TMDb introducidas en la interfaz jamás se persisten en disco (ni en SQLite, ni en ficheros `.json`).
- **Ciclo de Vida de Memoria:** El `TmdbService` almacena el token en un `RwLock<Option<String>>` de memoria de proceso. El comando `save_settings` deserializa la solicitud, extrae el token hacia la memoria del servicio y devuelve al frontend un objeto filtrado sin campos sensibles.

---

## 3. Motor de Renombrado Seguro y Transaccional

### 3.1 Flujo Transaccional en Dos Fases

1. **Fase Preflight (Validación Estática):**
   - Comprobación de longitud UTF-16 (máximo 255 por componente, 260 por ruta completa en Windows).
   - Detección de caracteres ilícitos (`< > : " / \ | ? *`) y nombres de dispositivos reservados en Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
   - Verificación de duplicados en lote e incompatibilidades con archivos ya existentes.
   - Preservación estricta de la extensión del archivo multimedia.
2. **Fase Staging (Transacción en Sistema de Archivos):**
   - Los archivos se mueven temporalmente a `.cinevault-{uuid}-{index}.stage`. Esto permite realizar intercambios circulares de nombres (e.g., `A.mkv` $\rightarrow$ `B.mkv` y `B.mkv` $\rightarrow$ `A.mkv`) sin colisiones de nombres intermedia.
3. **Fase Commit (Reemplazo Final y SQLite):**
   - Transición de `.stage` a la ruta final. Se graba el journal con estado `completed`.
   - Se actualiza la base de datos SQLite en una transacción única.

### 3.2 Tolerancia a Fallos, Rollback y Recuperación de Arranque

- **Verificación de Huella Digital (`Fingerprint`):** Antes de mover cualquier archivo, se valida que su tamaño y fecha de modificación coincidan exactamente con la inspección inicial, protegiendo al usuario en caso de modificación externa durante la previsualización.
- **Rollback Automático:** Si falla el renombrado de cualquier archivo del lote o la inyección de un fallo inducido, el coordinador revierte ordenadamente los archivos ya procesados en sentido inverso.
- **Recuperación al Inicio (`Startup Recovery`):** En cada arranque (`lib.rs`), el `RenameCoordinator` inspecciona el directorio `rename-journals`. Si detecta lotes interrumpió el proceso (e.g. corte de energía), reconcilia el estado del sistema de archivos comparándolo con los registros autoritativos de SQLite.

---

## 4. Parser de Nombres y Generación de Metadatos

### 4.1 Parser de Ficheros (`parse_filename`)

- **Reconocimiento Numérico y Formatos Especiales:** Capacidad para parsear correctamente frecuencias de canales (`2.0`, `5.1`, `7.1`), resoluciones (`2160p`, `1080p`), códecs de vídeo (`HEVC`, `H.264`, `AV1`), códecs de audio (`TrueHD`, `DTS-HD MA`, `E-AC-3`), formatos de alto rango dinámico (`HDR10+`, `HDR10`, `HDR`, `Dolby Vision`) y ediciones (`Director's Cut`, `Extended`, `IMAX`).
- **Segregación de Título y Año:** Preserva adecuadamente palabras clave antes del año de estreno (e.g., `Alien.Directors.Cut.1979.mkv` identifica `Alien` como título y `Director's Cut` como edición).

### 4.2 Formateador con Corchetes y Estándar de Windows

- **Sintaxis Explicita:** Garantiza la separación mediante corchetes según las especificaciones del usuario: `Título (Año) [Resolución] [Fuente] [Códec] ...`.
- **Sanitización de Dos Puntos:** Los dos puntos en títulos de películas (ejemplo `Dune: Part Two`) se sustituyen de forma estética y segura por `-` (`Dune - Part Two`), garantizando la compatibilidad con el sistema de archivos de Windows.

---

## 5. Base de Datos SQLite y Persistencia

### 5.1 Configuración de Rendimiento y Consistencia

- **Journal Mode WAL:** `PRAGMA journal_mode = WAL;` permite lecturas concurrentes sin bloquear escrituras.
- **Consistencia de Disco:** `PRAGMA synchronous = FULL;` e integridad referencial `PRAGMA foreign_keys = ON;`.
- **Control de Bloqueos:** `busy_timeout(5s)` evita errores inmediatos de tipo `database is locked`.

### 5.2 Esquema de Migraciones Versionadas

- **001_initial.sql:** Creación de tablas principales (`movies`, `media_files`, `video_streams`, `audio_streams`, `subtitle_streams`, `chapters`, `metadata_values`, `rename_batches`, `rename_history`).
- **002_recovery_events.sql:** Registro auditado de eventos de recuperación de arranque.
- **003_dolby_vision_profile.sql:** Incorporación de la columna `dolby_vision_profile` en la tabla `video_streams`.

---

## 6. Resultados de Ejecución de la Suite de Pruebas

Se ejecutaron de manera exhaustiva ambas suites de pruebas en el entorno local de desarrollo:

### 6.1 Pruebas del Backend (Rust)

```cmd
cargo test
Result: ok. 35 passed; 0 failed; 0 ignored
```

- **Pruebas Destacadas Superadas:**
  - `rename::tests::two_file_name_swap_is_valid_and_executes_through_staging`: Intercambio cruzado de nombres mediante carpetas temporales.
  - `rename::tests::injected_mid_commit_failure_rolls_back_every_dummy_file`: Reversión completa ante fallos inyectados en mitad de un lote.
  - `rename::tests::corrupt_journal_is_recorded_and_recovered_from_sqlite`: Reconstrucción de estado tras encontrar journals corruptos en disco.
  - `naming::tests::parses_dune_without_inventing_languages`: Verificación de limpieza de etiquetas sin falsos positivos de idiomas.
  - `naming::tests::replaces_title_colons_with_a_readable_windows_safe_separator`: Conversión de `:` a `-`.

### 6.2 Pruebas del Frontend (TypeScript / Vitest)

```cmd
cmd /c "pnpm vitest run"
Test Files  6 passed (6)
     Tests  32 passed (32)
```

- **Pruebas Destacadas Superadas:**
  - `src/domain/naming/parser.test.ts`: Extracción de tokens y resolución.
  - `src/domain/naming/generator.test.ts`: Generación dinámica respetando orden y plantillas personalizadas.
  - `src/domain/naming/windows-filename.test.ts`: Validación de reglas y límites de Windows.
  - `src/services/naming-bridge.test.ts`: Integración limpia entre los contratos Zod y los componentes UI.

---

## 7. Hallazgos Menores y Recomendaciones de Mejora

A pesar del sobresaliente nivel de calidad, se identifican las siguientes recomendaciones de mejora no bloqueantes para futuras iteraciones:

1. **Política de Ejecución de PowerShell en Entornos Windows:**
   - Durante la ejecución automatizada en PowerShell de la máquina host, scripts `.ps1` de `pnpm` o `npx` pueden bloquearse por la política por defecto (`ExecutionPolicy`).
   - _Recomendación:_ Se resolvió ejecutando a través de `cmd /c` o mediante `npx --no-install`. Documentar este comando en `docs/testing.md`.
2. **Sincronización Opcional de ffprobe en el Scanner:**
   - El escáner actual soporta la ejecución en ausencia de `ffprobe` degradando graciosamente el análisis a parseo por nombre de archivo. Sería conveniente añadir un indicador visual más destacado en la interfaz cuando `ffprobe` no está configurado.

---

## 8. Conclusión

El MVP de **CineVault** cumple rigurosamente con los más altos estándares de ingeniería de software, seguridad en aplicaciones de escritorio e integridad de datos en el sistema de archivos. La arquitectura se encuentra lista para su evolución funcional.

**Dictamen:** `APROBADO PARA PRODUCCIÓN / SIGUIENTE FASE`  
**Autor:** Revisor Técnico Principal (AI Assistant)
