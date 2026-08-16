# Renombrador Inteligente

Aplicación **web** para analizar archivos de vídeo, identificar la obra y proponer un nombre de
archivo consistente y profesional. Se ejecuta íntegramente en el navegador: no hay servidor, no se
sube ningún archivo a ningún sitio y el vídeo nunca sale del equipo.

> Nota: hasta el 16 de agosto de 2026 la documentación describía una aplicación de escritorio
> «CineVault» con Tauri 2, Rust, SQLite y ffprobe. **Ese código no existe en este repositorio.** Los
> documentos afectados están corregidos o marcados como obsoletos.

## Qué hace

1. Carga archivos de vídeo (MKV, MP4, M4V, AVI…): elígelos, arrástralos o abre una carpeta.
2. Lee las **cabeceras reales** del contenedor con [MediaInfo](https://mediaarea.net/) compilado a
   WebAssembly: resolución, códec, profundidad de bits, HDR, Dolby Vision, pistas de audio y
   subtítulos, idiomas y banderas.
3. Identifica la película, la serie o el episodio consultando TMDb con localización española
   (`language=es-ES`, `region=ES`) para obtener el **título oficial usado en España**.
4. Muestra el nombre actual y el propuesto, editable directamente.
5. Renombra en disco con un botón, y permite deshacer.

## Principio: exactitud por encima de cantidad

Cada dato lleva su confianza y su procedencia:

| Confianza        | Significado                                            |
| ---------------- | ------------------------------------------------------ |
| `CONFIRMED`      | Leído del fichero o devuelto por el proveedor          |
| `INFERRED`       | Deducido del nombre original o de la carpeta           |
| `USER_CONFIRMED` | Corregido a mano; gana siempre                         |
| `UNKNOWN`        | No se puede determinar; **no se escribe en el nombre** |

Consecuencias prácticas:

- La resolución, el códec, la profundidad de bits, el HDR, Atmos y DTS:X **solo** salen del stream.
  Que el nombre diga `2160p.DV.Atmos` no cuenta como prueba de nada.
- La fuente (`UHD Blu-ray`, `WEB-DL`, `REMUX`…) no puede confirmarse técnicamente: se extrae del
  nombre y queda marcada como inferida, nunca como confirmada.
- `spa` no es castellano. Sin una subetiqueta de región (`es-ES`, `es-419`) o un título de pista
  explícito, el idioma se muestra como «Español — región desconocida» y no se escribe `ESP`.

## Formato del nombre

```text
Título España (Año) [CALIDAD/FUENTE · CÓDEC/BITS · HDR] [AUDIO PRINCIPAL · Otros idiomas].ext
```

Ejemplos reales generados por las pruebas:

```text
Dune Parte Dos (2024) [4K UHD REMUX · HEVC 10-bit · Dolby Vision + HDR10] [ESP TrueHD Atmos 7.1 · Otros ENG+FRA].mkv
Heat (1995) [Full HD REMUX · AVC 8-bit] [ESP DTS-HD MA 5.1 · Otros ENG].mkv
The Batman (2022) [4K UHD WEB-DL · HEVC 10-bit · Dolby Vision] [ESP Dolby Digital Plus 5.1 · Otros ENG].mkv
Alien (1979) [4K UHD · HEVC 10-bit · HDR10] [ESP DTS-HD MA 5.1 · Otros ENG].mkv
The Last of Us (2023) - S01E03 - Mucho mucho tiempo [4K UHD WEB-DL · HEVC 10-bit · Dolby Vision] [ESP Dolby Digital Plus 5.1 · Otros ENG].mkv
```

La calidad se presenta en clases legibles (`8K UHD`, `4K UHD`, `DCI 4K`, `QHD`, `Full HD`, `HD`,
`SD`) calculadas por dimensiones, no por la altura: un UHD recortado a `3840×1608` sigue siendo
`4K UHD`.

**Separador de idiomas:** la especificación pedía `/`, pero la barra es un separador de rutas y en
Windows es un carácter prohibido en nombres de archivo. Se usa `+`, que es legal en todos los
sistemas; el separador es configurable desde el dominio (`languageSeparator`).

## Presets

`Profesional` (por defecto), `Compacto`, `Media server` (Plex/Jellyfin/Emby), `Técnico` y
`Personalizado` con plantillas libres. Tokens disponibles: `{title}`, `{originalTitle}`, `{year}`,
`{episode}`, `{episodeTitle}`, `{quality}`, `{source}`, `{qualitySource}`, `{videoCodec}`,
`{bitDepth}`, `{videoCodecBitDepth}`, `{hdr}`, `{hdrShort}`, `{exactResolution}`, `{frameRate}`,
`{container}`, `{edition}`, `{primaryAudio}`, `{primaryAudioShort}`, `{otherLanguages}`,
`{otherLanguagesShort}`, `{subtitleLanguages}`, `{providerIdTag}`, `{providerIdBrace}`.

## Seguridad del renombrado

- El análisis **nunca** renombra: hay que pulsar el botón.
- Preflight completo: caracteres y nombres reservados de Windows, longitud, extensión preservada,
  duplicados dentro del lote, destino ya existente y cambios de solo mayúsculas.
- Solo se usa `FileSystemFileHandle.move()`. **No se copia y borra**: eso podría destruir el archivo
  de destino y duplicar decenas de gigabytes.
- Con una carpeta abierta, antes de cada movimiento se revalida que el destino siga libre. Con
  archivos sueltos el navegador no deja listar la carpeta, así que esa comprobación no es posible y
  la aplicación lo advierte.
- Un fallo individual no detiene el lote y se informa por archivo.
- Registro persistente y deshacer del último lote, con revalidación completa.

## Requisitos

- Navegador basado en Chromium (Chrome, Edge, Brave…): la File System Access API con `move()` no
  está disponible en Firefox ni Safari. En esos navegadores se puede analizar y ver los nombres
  propuestos, pero no renombrar.
- Node.js 20+ y pnpm.

## Puesta en marcha

```powershell
pnpm install
pnpm dev
```

Verificación completa:

```powershell
pnpm check   # format:check + lint + test + build
```

## TMDb

La aplicación funciona sin clave: en ese caso el título y el año se deducen del nombre y quedan
marcados como inferidos. Para obtener títulos oficiales españoles, introduce una clave v3 o un token
de lectura v4 en **Configuración**.

Al ser una aplicación de navegador sin backend, **la clave se guarda en este equipo y viaja en las
peticiones**: no hay forma de ocultarla. No uses una clave compartida ni la introduzcas en un
ordenador ajeno. `.env.example` no contiene secretos.

Este producto usa la API de TMDb, pero no está avalado ni certificado por TMDb.

## Estructura

```text
src/
├── app/            # shell y branding
├── domain/         # lógica pura, sin React ni navegador
│   ├── identification/  # pistas del nombre, modelo de identificación
│   ├── matching/        # puntuación auditable de candidatos
│   ├── media/           # modelo normalizado, trazabilidad y normalizadores
│   └── naming/          # plantillas, presets, construcción y reglas de Windows
├── features/renamer/    # interfaz y estado de la pantalla
├── services/
│   ├── analysis/        # cliente MediaInfo WASM y cola con concurrencia
│   ├── providers/       # contrato de proveedor y cliente TMDb
│   └── rename/          # preflight, ejecución, deshacer y registro
└── styles/
```

## Límites conocidos

- Sin clave de TMDb no hay títulos oficiales españoles.
- El renombrado directo depende de `FileSystemFileHandle.move()`, hoy solo en Chromium.
- No hay biblioteca persistente, nube, streaming, remux ni transcodificación: la herramienta
  **analiza y renombra**, y no toca el contenido de los archivos.
