# ADR-0002: dependencias mínimas y CSS con tokens propios

Estado: aceptada  
Fecha: 2026-08-02

## Contexto

El MVP necesita una lista preparada para miles de archivos, iconografía consistente, validación de datos externos, pruebas y una identidad visual precisa. También debe evitar dependencias sin beneficio claro.

## Decisión

Dependencias de producto del frontend:

- React y Tauri API: plataforma de interfaz e IPC elegida por el encargo.
- Plugin oficial de diálogo: selector nativo de directorio con permiso limitado.
- `@tanstack/react-virtual`: virtualización accesible y probada para colecciones grandes.
- `lucide-react`: sistema de iconos coherente, tree-shakeable y sin imágenes remotas.
- `zod`: validación de DTOs externos en la frontera del WebView.

El estilo usa CSS moderno propio con custom properties, capas, grid, container/media queries y archivos por responsabilidad. Es la alternativa equivalente a Tailwind: elimina una dependencia de build y permite expresar directamente una estética premium inspirada en el minimalismo de Apple, con identidad cinematográfica propia y sin imitar componentes de macOS.

Dependencias principales de Rust:

- `rusqlite` (`bundled`) para SQLite embebido y transacciones.
- `serde`/`serde_json` para DTOs y ffprobe.
- `tokio` para procesos con timeout y trabajo asíncrono.
- `walkdir` para recorrido robusto.
- `reqwest` con rustls para TMDb sin depender del WebView.
- `thiserror` para errores estructurados y `tracing` para logs.
- `tempfile` solo en desarrollo para pruebas destructivas aisladas.

Se fijan rangos compatibles en los manifiestos y se versionan `pnpm-lock.yaml` y `Cargo.lock`.

Aunque TypeScript 7 es la rama más reciente consultada, `typescript-eslint` estable declara soporte hasta TypeScript 6.x. El proyecto fija TypeScript 6.0.3, último parche compatible verificado, para conservar lint tipado sin ignorar una incompatibilidad de peer dependencies. Se actualizará cuando el toolchain estable publique soporte conjunto.

## Consecuencias

- El sistema visual es explícito y no requiere descargar fuentes: usa familias disponibles en Windows.
- La lista virtualizada y los esquemas añaden poco API propio y evitan implementaciones frágiles.
- El binario contiene SQLite; aumenta algo su tamaño a cambio de instalación reproducible.
- Cada dependencia nueva deberá documentar qué código propio reemplaza y por qué compensa su coste.
