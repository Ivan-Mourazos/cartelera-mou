# CineVault

CineVault es una aplicación de escritorio local-first para Windows que cataloga películas, inspecciona sus pistas con `ffprobe`, propone nombres auditables y solo modifica archivos después de un preflight y una confirmación explícita.

El hito actual implementa una vertical real con Tauri 2, React, TypeScript estricto, Rust y SQLite. Nube, reproducción, remux y transcodificación quedan fuera de alcance por diseño.

## Funciones incluidas

- Escaneo recursivo de formatos de vídeo compatibles con progreso por fases.
- Parser determinista y generador con una característica por corchete.
- Análisis JSON de `ffprobe`, tolerante a datos incompletos.
- Búsqueda TMDB desacoplada, puntuación explicable y modo demo sin credencial.
- Previsualización y edición del nombre antes de cualquier cambio.
- Preflight de duplicados, caracteres Windows, extensiones, rutas y destinos existentes.
- Renombrado en dos fases sin overwrite, journal durable, rollback y recuperación al arrancar.
- Historial SQLite y deshacer con revalidación del archivo.
- Biblioteca local, ficha técnica y ajustes de análisis/nomenclatura/apariencia.
- Interfaz oscura minimalista en negro carbón, con componentes accesibles y lista virtualizada.

## Arquitectura

React nunca recibe acceso genérico al filesystem, SQLite, HTTP o procesos. La única excepción de plugin es el selector nativo de carpetas. Los comandos Rust vuelven a validar todas las mutaciones y mantienen la base de datos, `ffprobe`, TMDB y el journal detrás de una frontera IPC tipada.

Consulta [architecture.md](docs/architecture.md), [roadmap.md](docs/roadmap.md) y el [registro de decisiones](docs/decisions/README.md).

```text
.
├── branding.json              # fuente única del nombre y textos de marca
├── docs/                      # arquitectura, diseño, roadmap y ADR
├── public/                    # marca y atribución TMDB
├── scripts/                   # sincronización de branding
├── src/
│   ├── app/                   # composición y navegación
│   ├── components/            # componentes accesibles compartidos
│   ├── domain/                # parser, naming, matching y contratos futuros
│   ├── features/              # Biblioteca, Importar, Historial y Ajustes
│   ├── services/              # gateway Tauri, gateway demo y validación Zod
│   └── styles/                # tokens y sistema visual
└── src-tauri/
    ├── capabilities/          # ACL mínima de la ventana principal
    ├── migrations/            # esquema SQLite versionado
    ├── src/                   # comandos, DB, ffprobe, TMDB, scan y rename
    └── icons/                 # recursos nativos de Windows
```

## Requisitos de desarrollo

- Windows 10 u 11 con WebView2.
- Visual Studio Build Tools con “Desarrollo para el escritorio con C++” y Windows SDK.
- Rust estable mediante `rustup`.
- Node.js 24 LTS y pnpm 11.9.0.
- `ffprobe` en `PATH` o una ruta configurada en Ajustes. El MVP no lo distribuye todavía.
- Token de lectura de TMDB opcional. Sin él, la aplicación local y el modo demo siguen funcionando.

## Instalar y ejecutar

```powershell
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm desktop:dev
```

Para revisar solo la interfaz con datos de prueba:

```powershell
pnpm dev
```

La credencial puede introducirse en Ajustes y permanece únicamente en memoria durante la sesión. Como alternativa de desarrollo, puede heredarse desde la consola antes de iniciar Tauri:

```powershell
$env:TMDB_READ_ACCESS_TOKEN = "tu_read_access_token"
pnpm desktop:dev
```

No uses un prefijo `VITE_`: expondría la variable al WebView.

## Verificar

```powershell
pnpm check

Set-Location src-tauri
cargo fmt --all -- --check
cargo check --all-targets
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
```

Para generar instaladores Windows:

```powershell
pnpm desktop:build
```

Los artefactos se crean en `src-tauri/target/release/bundle/msi/` y `src-tauri/target/release/bundle/nsis/`.

## Configuración local

`.env.example` documenta los nombres admitidos, pero no contiene secretos. La ruta de `ffprobe`, las preferencias y la configuración no secreta se guardan localmente. El token TMDB no se persiste en SQLite ni se devuelve al frontend.

La base de datos vive en el directorio de datos de la aplicación, separada de los vídeos. Las pruebas destructivas usan únicamente directorios temporales y archivos dummy.

## Estado y límites conocidos

- No se incluye todavía un binario `ffprobe`; debe instalarse y validarse desde Ajustes.
- La credencial TMDB es de sesión hasta integrar Windows Credential Manager.
- Sin una credencial real no se puede verificar una consulta viva a TMDB; el cliente, contratos y modo offline sí están implementados.
- El escaneo no consulta TMDB en lote: la búsqueda y la autoaplicación de confianza alta se inician al revisar un archivo.
- El scoring TMDB real previo a elegir usa título localizado/original, similitud, año y ambigüedad; duración, títulos alternativos y aprendizaje de correcciones quedan para el siguiente endurecimiento.
- El recorrido y `ffprobe` son secuenciales y el preflight prioriza seguridad sobre rendimiento; antes de validar bibliotecas de miles de archivos debe añadirse concurrencia acotada e indexación por directorio.
- No hay almacenamiento remoto, streaming, reproducción, remux ni transcodificación.
- Firma de código, instalador firmado, actualizaciones y caché local de imágenes pertenecen al hito 1.1.

Los resultados reproducibles de esta entrega están en [testing.md](docs/testing.md).
