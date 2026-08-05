# ADR-0001: backend Rust como frontera de confianza local

Estado: aceptada  
Fecha: 2026-08-02

## Contexto

El producto opera sobre archivos valiosos del usuario. Tauri permite exponer plugins genéricos al WebView, pero eso ampliaría innecesariamente la superficie de permisos y trasladaría invariantes críticas a TypeScript.

## Decisión

Escaneo, ffprobe, SQLite, TMDb, rename y undo vivirán detrás de comandos Rust tipados y con permisos explícitos. React solo puede abrir el selector de carpeta mediante el plugin oficial de diálogo. No se exponen plugins genéricos de filesystem, shell, SQL ni HTTP.

SQLite se integra con `rusqlite` y feature `bundled`: una única conexión local serializada es suficiente para el MVP, evita SQL arbitrario desde el WebView y reduce la complejidad frente a un pool asíncrono. Las migraciones SQL siguen versionadas y transaccionales.

`ffprobe` se invoca directamente, con argumentos separados, timeout y parsing `serde`; nunca mediante shell.

## Consecuencias

- Las invariantes se prueban sin WebView y no dependen de la UI.
- Añadir un comando exige registrarlo en Rust, `build.rs` y la capability.
- Los DTOs cruzan una frontera explícita y deben mantener compatibilidad.
- Una conexión serializada puede ser insuficiente para procesamiento masivo futuro; se medirá antes de introducir pooling.
