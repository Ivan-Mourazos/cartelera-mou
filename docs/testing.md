# Verificación

Fecha: 2026-08-16
Plataforma: Windows 11, Node 20+, pnpm 10.33.2, Vite 8.2.0, Vitest 4.1.10.

Sustituye a la versión anterior de este documento, que informaba de pruebas `cargo`, builds de Tauri
e instaladores MSI/NSIS que no pueden ejecutarse en este repositorio: aquí no hay código Rust.

## Comandos y resultados reales

| Comando                            | Resultado                                   |
| ---------------------------------- | ------------------------------------------- |
| `npx tsc -b --force`               | 0 errores                                   |
| `npx eslint . --max-warnings 0`    | 0 errores, 0 avisos                         |
| `npx prettier --check .`           | correcto                                    |
| `npx vitest run`                   | 17 archivos, 250 pruebas superadas          |
| `npx vite build`                   | build de producción correcta (~7 s)         |
| `npx vite preview` + petición HTTP | HTTP 200; `index.html` y bundle JS servidos |

Nota de entorno: en esta máquina `vite preview` responde en `http://[::1]:<puerto>` y no en
`127.0.0.1`.

## Qué cubren las pruebas

| Archivo                                   | Cobertura                                                                                                                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/media/resolution.test.ts`         | 15 clases de resolución, crops cinematográficos (`3840×1608`, `1920×800`, `1280×536`), DCI 4K frente a UHD y contenido anamórfico                                                                                                      |
| `domain/media/video.test.ts`              | códecs, profundidad de bits, SDR/HDR10/HDR10+/Dolby Vision/HLG, perfil y nivel de Dolby Vision, y que PQ por sí sola no implica HDR10                                                                                                  |
| `domain/media/audio.test.ts`              | códecs (AC-3, E-AC-3, TrueHD, DTS, DTS-HD MA/HRA, AAC, FLAC, PCM, Opus), Atmos solo con JOC/16-ch/nombre comercial, DTS:X solo con XLL X, canales por layout, comentarios y audiodescripción                                           |
| `domain/media/language.test.ts`           | ISO 639-1/2, `spa` ambiguo, `es-ES`, `es-419`, `es-MX`, y títulos de pista `Castellano`, `Español`, `Español Latino`, `Spanish`, `Director Commentary`                                                                                 |
| `domain/media/source.test.ts`             | fuentes del nombre siempre `INFERRED` y tabla completa de `qualitySource`                                                                                                                                                              |
| `domain/media/normalize.test.ts`          | ningún dato técnico procede del nombre; avisos de idioma y de pistas ausentes                                                                                                                                                          |
| `domain/identification/hints.test.ts`     | título/año, años internos (`Blade Runner 2049`), ediciones, grupo de lanzamiento, `S01E03`, `S00E01`, `S01E01-E02`, `1x05`, `T03E12`, `Temporada 2 Capitulo 4`, `cap03` con carpeta                                                    |
| `domain/naming/build.test.ts`             | los cinco formatos de referencia del encargo, bloques vacíos, sin castellano, solo castellano, idiomas repetidos, comentarios, `:` en el título, inyección de rutas, extensión preservada, ID oculto por defecto, series y los presets |
| `services/rename/rename.test.ts`          | preflight (destino existente, duplicado en lote, solo mayúsculas, extensión, nombre reservado, longitud), renombrado real, TOCTOU, fallo parcial, cancelación, intercambio circular y deshacer con revalidación                        |
| `services/file-system.test.ts`            | filtrado de contenedores de vídeo y extensión                                                                                                                                                                                          |
| `services/rename-port.test.ts`            | regresión del renombrado: permiso de escritura solicitado, renombrado sin carpeta abierta, navegador sin `move()` y comprobación de destino con carpeta                                                                                |
| `services/providers/tmdb.test.ts`         | localización `es-ES`/`ES`, auth v3 y v4, validación Zod, rechazo de URLs de imagen ajenas, 401/429/red, caché, título de episodio y modo sin clave                                                                                     |
| `services/identification-service.test.ts` | autoaplicación solo con confianza alta, coincidencia ambigua no aplicada, remakes por año, puntuación explicable y error del proveedor no bloqueante                                                                                   |

Se conservan las pruebas heredadas de `domain/naming/parser.test.ts`,
`domain/naming/windows-filename.test.ts`, `domain/metadata.test.ts` y
`domain/matching/tmdb-score.test.ts`.

Las pruebas de renombrado usan un sistema de archivos en memoria (`RenameFileSystemPort`): no crean
ni modifican archivos reales.

## Qué NO está verificado automáticamente

- Recorrido interactivo en un navegador real: selección de carpeta, concesión de permisos y `move()`
  sobre disco. Requiere intervención humana con archivos propios.
- Consulta viva a TMDb: el cliente se prueba con `fetch` simulado, no con una clave real.
- Análisis de un MKV real con MediaInfo WASM: los normalizadores se prueban con fixtures que
  reproducen la salida documentada de MediaInfo.
- Rendimiento con bibliotecas de miles de archivos.
