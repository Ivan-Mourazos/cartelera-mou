# Verificación del hito 1

Fecha: 2026-08-02  
Plataforma: Windows, Rust `1.97.1`, Node `24.14.0` del runtime local.

## Verificación automatizada

| Comando                                                    | Resultado                                   |
| ---------------------------------------------------------- | ------------------------------------------- |
| `pnpm format:check`                                        | correcto                                    |
| `pnpm lint`                                                | 0 errores y 0 avisos                        |
| `pnpm test`                                                | 6 archivos, 32 pruebas TypeScript superadas |
| `pnpm build`                                               | build Vite de producción correcto           |
| `cargo fmt --all -- --check`                               | correcto                                    |
| `cargo check --all-targets`                                | correcto                                    |
| `cargo clippy --all-targets --all-features -- -D warnings` | correcto                                    |
| `cargo test --all-targets`                                 | 35 pruebas Rust superadas                   |
| `tauri build --no-bundle --ci`                             | ejecutable release generado correctamente   |
| `tauri build --bundles msi,nsis --ci --no-sign`            | MSI y NSIS x64 generados correctamente      |

Las pruebas Rust de filesystem crean exclusivamente archivos dummy dentro de `tempfile::TempDir`. Cubren conflicto sin distinguir mayúsculas, rename, undo, fallo inyectado a mitad de lote y rollback.

## QA interactivo

La aplicación se ejecutó en modo demo contra el build local y se recorrieron estos flujos:

1. Biblioteca con ocho películas, búsqueda, filtros y acceso a ficha.
2. Importación de 84 filas simuladas con progreso por fases y render virtualizado.
3. Selección de 75 propuestas seguras, exclusión automática de un conflicto y preflight.
4. Confirmación explícita, ejecución del lote y actualización de estados.
5. Historial con rutas anterior/nueva, confirmación de deshacer y bloqueo de un segundo undo.
6. Ajustes y créditos TMDB con logotipo aprobado y aviso requerido.
7. Arranque controlado del ejecutable release; permaneció activo y se cerró después de la comprobación.

Capturas:

- [Biblioteca premium](../output/playwright/library-premium.png)
- [Importación y preflight](../output/playwright/import-premium.png)
- [Ajustes y créditos](../output/playwright/settings-premium.png)

## Cobertura condicionada por el entorno

- `ffprobe` no estaba instalado en `PATH`: se verificaron detección ausente, validación de ruta y parsing mediante fixtures; no se ejecutó sobre un vídeo real.
- No se proporcionó un token TMDB: se verificaron modo offline, mocks, scoring, contratos y protección del secreto; no se hizo una consulta viva.
- Los instaladores MSI y NSIS se generaron sin firma de código. El warning de `__TAURI_BUNDLE_TYPE` afecta al plugin de actualización, que no forma parte de este hito; no impidió producir ambos paquetes.
- El ejecutable release se recompiló después de retirar un botón inerte de la ficha. La regeneración posterior de los bundles quedó bloqueada al agotarse la autorización del host para ejecutar WiX/NSIS; los instaladores existentes corresponden al build inmediatamente anterior y el `.exe` suelto sí contiene la fuente final.

## Artefactos Windows

- `src-tauri/target/release/cinevault-desktop.exe`
- `src-tauri/target/release/bundle/msi/CineVault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/CineVault_0.1.0_x64-setup.exe`
