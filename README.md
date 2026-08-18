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
Título (Año) [CLASE RESOLUCIÓN FUENTE CÓDEC BITS HDR] [Audio principal · Otros idiomas].ext
```

Ejemplos reales generados por las pruebas:

```text
Dune Parte Dos (2024) [4K 2160p BluRay REMUX HEVC 10bit DV] [Castellano TrueHD Atmos 7.1 · ENG].mkv
Heat (1995) [Full HD 1080p BluRay REMUX AVC] [Castellano DTS-HD MA 5.1].mkv
The Batman (2022) [4K 2160p WEB-DL HEVC 10bit DV] [Castellano DD+ 5.1 · ENG].mkv
Rec (2007) [HD 720p HDTV AVC] [Castellano DD 5.1].mkv
La Cosa (1982) [SD 480p DVDRip MPEG-4] [Castellano DD 2.0 · ENG].avi
The Last of Us (2023) - S01E03 - Mucho mucho tiempo [4K 2160p WEB-DL HEVC 10bit DV] [Castellano DD+ 5.1 · ENG].mkv
```

### Clase comercial y resolución

La clase la decide la **anchura del máster**, no la altura: las películas se recortan verticalmente
y un UHD real puede medir `3840×1608`. Dentro de una misma clase, la etiqueta en píxeles la marca la
altura, que es lo que distingue un DVD NTSC (`720×480` ⇒ `480p`) de uno PAL (`720×576` ⇒ `576p`).

| Clase     | Anchura del lado largo | Resolución escrita |
| --------- | ---------------------- | ------------------ |
| `8K`      | ≥ 7000                 | `4320p`            |
| `4K`      | ≥ 3400                 | `2160p`            |
| `2K`      | 2000 – 3399            | `1440p`            |
| `Full HD` | 1800 – 1999            | `1080p`            |
| `HD`      | 1200 – 1799            | `720p`             |
| `SD`      | < 1200                 | `576p` / `480p`    |

### Fuente

`BluRay REMUX` · `BluRay` · `UHDRip` · `BDRip` · `BRRip` · `WEB-DL` · `WEBRip` · `HDTV` · `HDTVRip` ·
`microHD` · `HDRip` · `DVDRip` · `DVDScr` · `SCR` · `TC` · `TS` · `CamRip`

La fuente **no es verificable** leyendo el archivo. Se toma de la etiqueta del nombre y, si el nombre
no la declara, se deduce del bitrate, el códec y la resolución (más de 60 Mbps en HEVC 2160p es un
REMUX; menos de 3 Mbps a 720p es una recompresión WEB). Se escribe igualmente —es lo que se espera
leer— pero la ficha técnica declara siempre de dónde salió, y una corrección manual gana sobre todo.

### Audio

La pista principal se escribe con el idioma en claro (`Castellano`, `Latino`, `Español` cuando la
región no consta), el códec abreviado como en las publicaciones (`DD`, `DD+`, `TrueHD Atmos`,
`DTS-HD MA`, `DTS-X`) y los canales. Los demás idiomas van en abreviatura de tres letras separados
por `+`. Se usa `+` y no `/` porque la barra es un carácter prohibido en nombres de archivo.

### Longitud

Windows admite 255 caracteres por nombre, pero un nombre de 250 es inmanejable. El objetivo del
producto son **120 caracteres**, configurable. Si se pasa, se descartan bloques por orden de menor
valor: otros idiomas → profundidad de bits → HDR → códec → canales → clase comercial. Título, año,
código de episodio y resolución no se descartan nunca.

## Cómo identifica cada obra

Se usan cuatro fuentes de señal, no solo el nombre del archivo:

- El **nombre**: título, año, `SxxExx`, fuente, edición, grupo.
- El **título del contenedor**: los MKV de release suelen traer dentro el nombre completo, lo que
  salva a los archivos llamados `01.mkv` o `pelicula.mkv`.
- La **duración real** del archivo, comparada con la de TMDb.
- El **nombre de la carpeta**, útil en `Serie/Temporada 1/cap03.mkv`.

La consulta se hace en cascada y se detiene en cuanto un candidato es inequívoco:

1. Identificador incrustado en el nombre (`[imdb-tt0113277]`, `{tmdb-438631}`): consulta directa.
2. Título y año exacto.
3. Título y año ±1 — el año del nombre suele ser el del lanzamiento en vídeo, no el del estreno.
4. Título sin año.
5. `/search/multi`, que decide por sí mismo si es película o serie.
6. Título normalizado: sin acentos, sin artículo inicial, sin dominios ni ruido de las webs.
7. Título de la carpeta.

Los candidatos se puntúan de forma auditable. La duración dentro del ±5 % suma 30 puntos y una
desviación mayor del 20 % resta 40: es lo que separa un remake, un corto o un episodio suelto de la
película homónima. Siempre se aplica el mejor candidato, y las alternativas quedan a un clic en la
propia fila. Cuando corriges una obra a mano, la aplicación lo recuerda para los archivos siguientes.

## Seguridad del renombrado

- El análisis **nunca** renombra: hay que pulsar el botón y confirmar la previsualización del
  lote, donde se ve cada `antes → después` y los archivos bloqueados con su motivo.
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
│   ├── identification/  # pistas del nombre, identificadores incrustados, modelo
│   ├── matching/        # puntuación auditable de candidatos
│   ├── media/           # modelo normalizado, trazabilidad y normalizadores
│   └── naming/          # plantillas, presets, construcción y reglas de Windows
├── features/renamer/    # interfaz y estado de la pantalla
├── services/
│   ├── analysis/        # cliente MediaInfo WASM y cola con concurrencia
│   ├── identification/  # resolvedor en cascada
│   ├── providers/       # contrato de proveedor y cliente TMDb
│   └── rename/          # preflight, ejecución, deshacer y registro
└── styles/
```

## Límites conocidos

- Sin clave de TMDb no hay títulos oficiales españoles.
- El renombrado directo depende de `FileSystemFileHandle.move()`, hoy solo en Chromium.
- No hay biblioteca persistente, nube, streaming, remux ni transcodificación: la herramienta
  **analiza y renombra**, y no toca el contenido de los archivos.
