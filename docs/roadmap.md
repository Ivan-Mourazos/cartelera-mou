# Roadmap de CineVault

## Hito 1 — vertical local funcional

- [x] Definir arquitectura, límites de seguridad y diseño visual.
- [x] Scaffold Tauri 2, React, TypeScript estricto y Vite.
- [x] Seleccionar y escanear carpetas con progreso.
- [x] Parser determinista y generador de nombres auditables.
- [x] Análisis ffprobe configurable y tolerante a datos incompletos.
- [x] Persistencia SQLite con migraciones.
- [x] Preflight, confirmación, rename sin overwrite, historial y undo.
- [x] Biblioteca local y ficha técnica básica.
- [x] Ajustes y proveedor TMDb real/mocks sin secreto en el repositorio.
- [x] Pruebas TS y de integración Rust, ejecución y QA visual.

## Hito 1.1 — endurecimiento y distribución

- Cancelación y reanudación de escaneos grandes.
- Cola de ffprobe con concurrencia configurable y telemetría exclusivamente local.
- Caché local de imágenes TMDb, política de actualización y atribución completa.
- Credencial TMDb en Windows Credential Manager o vault equivalente.
- Importación incremental con watcher opcional.
- Firma de código, instalador NSIS/MSI y estrategia de actualización.
- Auditoría de licencia del build de ffprobe antes de distribuirlo como sidecar.

## Hito 2 — biblioteca enriquecida

- Ficha editorial completa, colecciones y títulos alternativos.
- Correcciones aprendidas por el resolvedor determinista.
- Reglas y plantillas de nombres configurables con previsualización.
- Checksums opcionales en segundo plano y detección de duplicados por contenido.
- Accesibilidad y pruebas end-to-end de todos los flujos.

## Hito 3 — almacenamiento independiente del proveedor

- Implementar un primer `StorageProvider` compatible con S3 detrás del contrato existente.
- Estados de transferencia, reintentos, integridad y reconciliación local/remota.
- Caché y descarga bajo demanda.
- Sincronización entre dispositivos con resolución explícita de conflictos.

## Hito 4 — reproducción y procesamiento

- Evaluación de `PlaybackCapability` por dispositivo y archivo.
- Reproducción directa local/remota.
- Remux y, únicamente cuando sea necesario, transcodificación con colas recuperables.
- Progreso de reproducción sincronizable.

Nube, streaming, remux y transcodificación quedan deliberadamente fuera del hito 1.
