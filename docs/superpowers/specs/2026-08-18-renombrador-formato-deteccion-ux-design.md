# Diseño — formato de nombre, motor de detección y rediseño de la interfaz

**Fecha:** 2026-08-18
**Proyecto:** Renombrador Inteligente (SPA de navegador, `cartelera-de-mou`)
**Estado:** aprobado por el propietario del producto

---

## 1. Objetivo

Que la aplicación identifique correctamente **el 100 % de los archivos** que se le den y proponga un
nombre con la estructura idónea, tanto en películas como en series, usando el vocabulario de calidad
que se ve en las webs de descarga. Todo lo automatizable se automatiza; la persona usuaria solo
interviene donde la aplicación le avisa, y siempre puede cambiar cualquier decisión.

## 2. Decisiones cerradas

| Decisión                                          | Valor acordado                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Bloque de vídeo                                   | Híbrido: clase comercial + resolución en píxeles + fuente + códec + bits + HDR                |
| Bloque de audio                                   | Idioma principal + códec + canales, y después el resto de idiomas                             |
| Etiqueta del audio principal en español de España | `Castellano` (palabra completa)                                                               |
| Otros idiomas                                     | Abreviatura de tres letras (`ENG`, `FRA`, `ITA`)                                              |
| Estructura de serie                               | `Serie (Año) - SxxExx - Título [vídeo] [audio]`                                               |
| Fuente (BluRay/WEB-DL/DVDRip…)                    | Se confía en la etiqueta del nombre; si no la hay, se infiere por bitrate, códec y resolución |
| Emparejado TMDb                                   | Se aplica siempre el mejor candidato; las alternativas quedan visibles para cambiarlo         |
| Alcance                                           | Solo renombrar archivos: no se crean ni se mueven carpetas                                    |
| Interfaz                                          | Una sola pantalla, minimal, con todas las funciones accesibles                                |
| Longitud objetivo del nombre                      | 120 caracteres, con recorte en cascada                                                        |
| Antes de escribir en disco                        | Previsualización del lote y confirmación explícita                                            |
| Clave de TMDb                                     | Ya configurada por la persona usuaria                                                         |

## 3. Formato del nombre

### 3.1 Gramática

```text
PELÍCULA  ::= Título ( Año ) [ VÍDEO ] [ AUDIO ] . ext
EPISODIO  ::= Título ( Año ) - SxxExx - TítuloEpisodio [ VÍDEO ] [ AUDIO ] . ext

VÍDEO     ::= Clase Resolución Fuente Códec [Bits] [HDR]
AUDIO     ::= Principal [ · Otros ]
Principal ::= Idioma Códec [Espacial] Canales
Otros     ::= ABR (+ ABR)*
```

Los bloques cuyo contenido no se puede determinar **no se escriben**, y sus delimitadores tampoco:
un archivo sin pistas de audio legibles produce `Título (Año) [VÍDEO].ext`, nunca corchetes vacíos.

### 3.2 Clase comercial y resolución

La clase se decide por la **anchura del máster**, no por la altura: las películas se recortan
verticalmente (2.39:1, 2.20:1) y un UHD real puede medir `3840×1608`. Se corrige al alza cuando la
altura indica una clase superior (contenido anamórfico o con bandas laterales, p. ej. `1440×1080`).

| Clase     | Anchura del lado largo | Resolución escrita                      |
| --------- | ---------------------- | --------------------------------------- |
| `8K`      | ≥ 7000                 | `4320p`                                 |
| `4K`      | ≥ 3400                 | `2160p`                                 |
| `2K`      | 2000 – 3399            | `1440p`                                 |
| `Full HD` | 1800 – 1999            | `1080p`                                 |
| `HD`      | 1200 – 1799            | `720p`                                  |
| `SD`      | < 1200                 | `576p` si la altura ≥ 500, si no `480p` |

Cuando MediaInfo no devuelve dimensiones utilizables no se inventa nada: se recurre al token de
resolución del nombre si existe, marcado como inferido; si tampoco lo hay, el bloque de vídeo se
omite y la fila queda marcada para revisión.

### 3.3 Vocabulario de fuente

Valores admitidos:

`BluRay REMUX` · `BluRay` · `UHDRip` · `BDRip` · `BRRip` · `WEB-DL` · `WEBRip` · `HDTV` ·
`HDTVRip` · `microHD` · `HDRip` · `DVDRip` · `DVDScr` · `SCR` · `TC` · `TS` · `CamRip`

`REMUX` es un modificador que solo puede acompañar a `BluRay`. `UHDRip` se reserva para material
2160p reencodado a partir de un UHD Blu-ray.

### 3.4 Inferencia de fuente cuando el nombre no la declara

La fuente **no es verificable** leyendo el archivo. Se escribe igualmente, y la ficha técnica declara
siempre que el dato es inferido y por qué. Reglas, evaluadas en orden:

| Condición                                 | Fuente inferida                           |
| ----------------------------------------- | ----------------------------------------- |
| Bitrate total > 60 Mbps, HEVC, 2160p      | `BluRay REMUX`                            |
| Bitrate total > 25 Mbps, AVC, 1080p       | `BluRay REMUX`                            |
| Bitrate total 8 – 25 Mbps, 1080p o 2160p  | `BluRay`                                  |
| Bitrate total 3 – 8 Mbps, HEVC o AVC      | `WEB-DL`                                  |
| Bitrate total < 3 Mbps, resolución ≥ 720p | `WEBRip`                                  |
| Códec XviD o DivX y resolución ≤ 576p     | `DVDRip`                                  |
| Cualquier otro caso                       | sin fuente: el bloque se escribe sin ella |

Precedencia: **corrección manual > etiqueta explícita del nombre > inferencia**.

### 3.5 Códecs

Vídeo: se escribe el nombre técnico leído del stream (`HEVC`, `AVC`, `AV1`, `VP9`, `VC-1`, `MPEG-2`,
`XviD`, `DivX`). No se escribe `x264` ni `x265`: identifican al codificador, no al códec, y no son
verificables desde el archivo.

Profundidad de bits: se escribe `10bit` o `12bit` únicamente cuando supera 8.

HDR: `DV` (Dolby Vision, con o sin capa base HDR10), `HDR10+`, `HDR10`, `HLG`.

Audio: `TrueHD`, `DTS-HD MA`, `DTS-HD HRA`, `DTS-ES`, `DTS`, `DD+` (Dolby Digital Plus), `DD`
(Dolby Digital), `AAC`, `FLAC`, `PCM`, `Opus`, `MP3`. El audio espacial se añade tras el códec:
`TrueHD Atmos`, `DD+ Atmos`, `DTS-X`.

### 3.6 Idiomas

- Pista principal: `Castellano` cuando hay evidencia de español de España (`es-ES`, o título de
  pista explícito). Si es español sin región determinable se escribe `Español` y la fila se marca
  para revisión. Si es latinoamericano (`es-419`, `es-MX`, título explícito), `Latino`.
- Resto de idiomas: abreviatura de tres letras en mayúsculas, separadas por `+` (`ENG+FRA+ITA`). La
  barra `/` que pedía la especificación original es un carácter prohibido en nombres de archivo de
  Windows.
- Los comentarios y la audiodescripción nunca son pista principal ni cuentan como idioma presente.

### 3.7 Selección de la pista principal

Orden de preferencia: castellano → cualquier español → idioma original de la obra según TMDb →
pista marcada como predeterminada en el contenedor → primera pista utilizable.

### 3.8 Presupuesto de longitud y recorte en cascada

Windows admite 255 unidades UTF-16 por componente de nombre y 259 en la ruta completa clásica. El
objetivo del producto es **120 caracteres** para el nombre con extensión; los límites del sistema son
el tope duro y se validan con la ruta real de la carpeta cuando se conoce.

Si el nombre supera el objetivo, se eliminan elementos en este orden hasta entrar:

1. Otros idiomas (`· ENG+FRA`)
2. Profundidad de bits (`10bit`)
3. HDR (`DV`)
4. Códec de vídeo (`HEVC`)
5. Canales del audio principal (`7.1`)
6. Clase comercial (`4K`), conservando la resolución en píxeles

Nunca se eliminan: título, año, código de episodio, título de episodio ni resolución. Si tras agotar
la cascada el nombre sigue superando el tope duro del sistema, se trunca el título por palabras
completas y la fila avisa de ello.

### 3.9 Ejemplos canónicos

```text
Dune Parte Dos (2024) [4K 2160p BluRay REMUX HEVC 10bit DV] [Castellano TrueHD Atmos 7.1 · ENG+FRA].mkv
Heat (1995) [Full HD 1080p BluRay REMUX AVC] [Castellano DTS-HD MA 5.1 · ENG].mkv
The Batman (2022) [4K 2160p WEB-DL HEVC 10bit DV] [Castellano DD+ 5.1 · ENG].mkv
Rec (2007) [HD 720p HDTV AVC] [Castellano DD 5.1].mkv
La Cosa (1982) [SD 480p DVDRip XviD] [Castellano DD 2.0 · ENG].avi
The Last of Us (2023) - S01E03 - Mucho mucho tiempo [4K 2160p WEB-DL HEVC 10bit DV] [Castellano DD+ 5.1 · ENG].mkv
El Ministerio del Tiempo (2015) - S03E08 - Separadas por el tiempo [Full HD 1080p HDTV AVC] [Castellano DD 2.0].mkv
```

### 3.10 Presets

Se conservan cinco presets. `Profesional` pasa a ser el formato descrito arriba y sigue siendo el
predeterminado. `Compacto` omite clase comercial y otros idiomas. `Media server` añade el
identificador del proveedor entre llaves para Plex, Jellyfin y Emby. `Técnico` añade resolución
exacta, fotogramas por segundo, edición e identificador. `Personalizado` acepta plantillas libres y
pasa a ser accesible desde la interfaz, cosa que hoy no ocurre.

## 4. Motor de detección e identificación

### 4.1 Fuentes de señal

| Fuente                         | Aporta                                                            | Estado actual           |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------- |
| Nombre del archivo             | título, año, `SxxExx`, fuente, edición, grupo, idiomas declarados | única usada             |
| `General/Title` del contenedor | nombre de release completo incrustado en el MKV                   | leído y descartado      |
| Duración real del archivo      | desempate contra `runtime` de TMDb                                | leído y descartado      |
| Carpeta padre y carpeta abuela | título de la serie y número de temporada                          | solo la carpeta directa |

Cuando el nombre del archivo es inservible (`01.mkv`, `pelicula.mkv`, `video_final.mkv`), las pistas
se extraen del `General/Title` y de las carpetas, en ese orden.

### 4.2 Cascada de consulta a TMDb

Se detiene en cuanto un candidato alcanza banda alta:

1. **Identificador incrustado** en el nombre (`[tt1234567]`, `{tmdb-603}`, `tmdbid-603`,
   `[imdb-tt0110912]`): consulta directa por `/find` o `/movie/{id}` / `/tv/{id}`. No se puntúa:
   es evidencia exacta.
2. Título + año exacto.
3. Título + año ±1: el año del nombre suele ser el del lanzamiento en vídeo, no el del estreno.
4. Título sin año.
5. `/search/multi`: resuelve por sí mismo si es película o serie.
6. Título normalizado: sin acentos, sin artículo inicial, sin dominios (`wolfmax4k.com`, `www.`),
   sin sufijos de grupo, con numeración romana convertida a arábiga.
7. Título de la carpeta padre.

Cada intento registra en la traza por qué se lanzó y qué devolvió, para que la ficha técnica pueda
explicar el resultado.

### 4.3 Puntuación y desempate

Sobre la puntuación existente (`domain/matching/tmdb-score.ts`) se añaden señales duras:

| Señal                                                         | Puntos                                  |
| ------------------------------------------------------------- | --------------------------------------- |
| Duración del archivo dentro del ±5 % del `runtime` de TMDb    | +30                                     |
| Desviación de duración > 20 %                                 | −40                                     |
| Año coincidente                                               | +25                                     |
| Año con diferencia de 1                                       | +10                                     |
| Idioma original de la obra presente entre las pistas de audio | +10                                     |
| Coincide también el título original, no solo el español       | +15                                     |
| Popularidad de TMDb                                           | solo como desempate final entre iguales |

Bandas: **alta** ≥ 80 puntos con al menos 20 de margen sobre el segundo; **media** ≥ 50; **baja** por
debajo. La duración solo puntúa cuando TMDb devuelve `runtime` y el archivo tiene duración legible;
su ausencia no penaliza.

### 4.4 Decisión película / serie

Se evalúa en este orden y la primera señal concluyente gana:

1. Bloqueo manual de la persona usuaria.
2. Marcador de episodio en el nombre (`S01E03`, `T01E03`, `1x03`, `Cap.202`, `Capítulo 3`).
3. Carpeta que declara temporada (`Temporada 1`, `Season 1`, `T01`).
4. `/search/multi` devuelve un resultado de tipo `tv` en banda alta.
5. Duración inferior a 75 minutos sin año coincidente: señal débil hacia serie; marca la fila para
   revisión en lugar de decidir sola.

### 4.5 Series: coste y precisión

La serie se resuelve **una sola vez** por título normalizado. Los títulos de episodio se obtienen con
`/tv/{id}/season/{n}`, una llamada por temporada, en lugar de una por episodio. Hoy una temporada de
24 capítulos genera 24 búsquedas más 24 consultas de episodio.

### 4.6 Correcciones aprendidas

Cuando la persona usuaria corrige el emparejado de una fila, se guarda en `localStorage` la
asociación `título normalizado + tipo → identificador de TMDb`. En cargas posteriores esa asociación
se aplica antes de consultar y se marca como evidencia de corrección previa. Es reversible desde
Ajustes («olvidar correcciones aprendidas»).

### 4.7 Vocabulario del parser

Se amplían las reglas del tokenizador para reconocer, además de lo actual:

- **Fuente:** `CAM`, `CamRip`, `HDCAM`, `TS`, `HDTS`, `TC`, `HDTC`, `SCR`, `DVDScr`, `BDRip`,
  `BRRip`, `HDRip`, `microHD`, `UHDRip`, `HDTVRip`, `WEB` a secas.
- **Plataforma:** `AMZN`, `NF`, `DSNP`, `MAX`, `HMAX`, `ATVP`, `HULU`, `SKST` — se usan como
  evidencia de `WEB-DL` pero no se escriben en el nombre.
- **Idioma declarado:** `Castellano`, `Latino`, `VOSE`, `VOS`, `Dual`, `MULTi`, `Subs`.
- **Estructura:** `Temporada Completa`, `Saga Completa`, `Parte 1` / `Part 1`, `CD1` / `CD2`,
  patrones de anime `[Grupo] Serie - 12 [1080p]`.
- **Ruido:** dominios completos, `descargar`, `gratis`, `torrent`, prefijos `www.`.

Los tokens de resolución que ya se detectaban (`1080p`, `720p`, `2160p`) pasan a usarse como respaldo
cuando MediaInfo no devuelve dimensiones, marcados como inferidos.

### 4.8 Aplicación del resultado

Siempre se aplica el mejor candidato disponible, sea cual sea su banda. La fila muestra la banda y
las alternativas ya cargadas con póster, de modo que cambiar la elección es un clic. Si la cascada
no devuelve nada, la fila queda en estado de error con el buscador desplegado y el título limpio ya
escrito en la caja de búsqueda.

## 5. Interfaz y flujo

### 5.1 Flujo objetivo

Soltar archivos → análisis e identificación automáticos con progreso → la barra superior resume
`N listos · N revisar · N error` → se revisan solo las filas marcadas → `Renombrar` →
previsualización del lote → confirmación → resultado con `Deshacer` disponible.

No hay ningún paso obligatorio entre soltar y renombrar cuando todo se identifica con banda alta.

### 5.2 Estados por fila

| Símbolo | Estado     | Significado                                                                                                 |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| ○ gris  | analizando | MediaInfo o TMDb en curso                                                                                   |
| ● verde | listo      | banda alta, sin alertas                                                                                     |
| ▲ ámbar | revisar    | banda media, español de región ambigua, sin resolución, episodio sin `SxxExx`, fuente inferida sin etiqueta |
| ✕ rojo  | error      | sin resultados, archivo ilegible, sin acceso de escritura, conflicto de destino                             |

### 5.3 Componentes

- **Cabecera**: marca, resumen de estados, acceso a Ajustes, conmutador de tema.
- **Barra de lista**: contadores por estado que funcionan como filtros, campo de filtrado por texto
  y acciones de lote cuando hay selección.
- **Fila**: nombre propuesto en primer plano y nombre actual debajo en tono secundario; punto de
  estado a la izquierda; edición del nombre en línea.
- **Detalle desplegable**: póster, título, año, duración comparada con TMDb, alternativas con
  póster, campos corregibles (título, año, tipo, temporada, episodio, título de episodio, fuente) y
  ficha técnica plegable con valor, confianza y motivo de cada dato.
- **Acciones de lote**: marcar como serie o película, fijar fuente, reintentar identificación,
  quitar de la lista.
- **Dock inferior**: `Renombrar N` y `Deshacer`.
- **Diálogo de previsualización**: lista antes → después, bloqueados aparte con su motivo, recuento
  y confirmación explícita.
- **Ajustes en modal**: overlay, foco atrapado, cierre con `Esc`. Expone preset y plantillas libres,
  clave de TMDb con validación en vivo, límite de caracteres, concurrencia de análisis, banda de
  auto-aplicación, inclusión de subtítulos y de identificador del proveedor, y el borrado de las
  correcciones aprendidas.

### 5.4 Rendimiento

Las filas se virtualizan con `@tanstack/react-virtual` —ya presente en `dependencies` y hoy sin
usar— a partir de 50 elementos. El caso habitual son pocos archivos; el caso de biblioteca completa
debe seguir siendo fluido.

### 5.5 Teclado y accesibilidad

`↑` `↓` mover el foco entre filas · `Enter` desplegar el detalle · `Espacio` seleccionar ·
`Mayús+clic` seleccionar rango · `Supr` quitar · `Esc` cerrar diálogo o descartar la edición del
nombre. Foco siempre visible, `aria-live` en el progreso y en los avisos, etiquetas en español en
toda la interfaz, y cola de avisos en lugar de un único toast que se pisa.

### 5.6 Limpieza

Se elimina el CSS huérfano (`.tag-chip`, `.quick-presets-drawer`, `.batch-presets-bar`,
`.segmented-control`, `.paste-box-card`, `.file-checkbox`, `.search-input-wrapper`,
`.control-ribbon`, `.dropzone-icon`, `.apple-button-success`) y las opciones de configuración que no
lee ningún módulo: `includeYear`, `includeQuality`, `includeVideoCodec`, `includeBitDepth`,
`includeHdr`, `includePrimaryAudio`, `includeOtherLanguages`, `metadataLanguage`, `metadataRegion`.

## 6. Arquitectura

### 6.1 Módulos nuevos

| Módulo                                    | Responsabilidad                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `domain/naming/release-labels.ts`         | Vocabulario: clases comerciales, resoluciones, fuentes, códecs de audio y vídeo |
| `domain/media/source-inference.ts`        | Heurística de fuente por bitrate, códec y resolución, con motivo                |
| `domain/naming/budget.ts`                 | Recorte en cascada al objetivo de 120 y a los topes de Windows                  |
| `domain/identification/signals.ts`        | Señales duras de desempate: duración, año, idioma, título original              |
| `domain/identification/embedded-ids.ts`   | Extracción de identificadores IMDb y TMDb del nombre                            |
| `services/identification/resolver.ts`     | Cascada de siete consultas y decisión de tipo                                   |
| `services/learned-corrections.ts`         | Memoria persistente de correcciones manuales                                    |
| `features/renamer/FileRow.tsx`            | Fila compacta con estado y edición en línea                                     |
| `features/renamer/RowDetail.tsx`          | Detalle desplegable con correcciones                                            |
| `features/renamer/CandidateList.tsx`      | Alternativas de TMDb con póster                                                 |
| `features/renamer/TechnicalSheet.tsx`     | Ficha técnica con procedencia y confianza                                       |
| `features/renamer/BatchPreviewDialog.tsx` | Previsualización y confirmación del lote                                        |
| `features/renamer/ListToolbar.tsx`        | Contadores-filtro, filtrado y acciones de lote                                  |

### 6.2 Módulos reescritos

`domain/naming/build.ts` (bloques nuevos y presupuesto), `domain/naming/presets.ts`,
`domain/media/source.ts` (vocabulario ampliado y confianza), `domain/media/resolution.ts` (clases
comerciales), `domain/naming/rules.ts` (vocabulario del parser),
`services/providers/tmdb.ts` (`/search/multi`, `/find`, temporada completa),
`services/identification-service.ts` (delega en el resolvedor),
`features/renamer/RenamerScreen.tsx`, `features/renamer/SettingsPanel.tsx`, `styles/features.css`.

### 6.3 Invariantes que se conservan

- El dominio sigue siendo puro: sin React, sin acceso al navegador, sin red.
- Todo dato conserva procedencia y confianza (`Traced<T>`); ningún dato técnico se toma del nombre
  del archivo salvo como respaldo declarado y visible.
- El renombrado sigue usando exclusivamente `FileSystemFileHandle.move()`: nunca copiar y borrar.
- El preflight completo de Windows (caracteres y nombres reservados, longitud, extensión,
  duplicados del lote, destino existente, cambios de solo mayúsculas) se mantiene intacto.
- El registro persistente y el deshacer del último lote se mantienen.

## 7. Mapa de defectos corregidos

| Id  | Defecto detectado en la auditoría                                         | Corrección en este diseño                        |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| U1  | Los candidatos puntuados de TMDb se calculan y se descartan sin mostrarse | `CandidateList` en cada fila, siempre disponible |
| U2  | Las alertas del constructor de nombres nunca se pintan                    | Estado por fila y lista de alertas en el detalle |
| U3  | El renombrado escribe en disco sin confirmación                           | `BatchPreviewDialog` obligatorio                 |
| U4  | El modelo de procedencia y confianza es invisible                         | `TechnicalSheet`                                 |
| U5  | No hay selección múltiple ni acciones de lote                             | `ListToolbar` con acciones sobre la selección    |
| U6  | `@tanstack/react-virtual` instalado y sin usar                            | Virtualización a partir de 50 filas              |
| U7  | Sin filtro ni orden                                                       | Contadores-filtro y filtrado por texto           |
| U8  | Ajustes expone 2 de 15 opciones; el preset `custom` es inalcanzable       | Ajustes completos, con plantillas libres         |
| U9  | Ocho opciones de configuración que no lee nadie                           | Eliminadas                                       |
| U10 | Panel sin overlay, sin foco atrapado, sin `Esc`; toast que se pisa        | Modal accesible y cola de avisos                 |
| U11 | Sin aviso de clave de TMDb en la pantalla inicial                         | Aviso y validación en vivo                       |
| U12 | La zona de soltar desaparece al haber archivos                            | La lista mantiene la pista visual de soltar      |
| D1  | Búsqueda con año estricto y sin reintento                                 | Cascada con año ±1 y sin año                     |
| D2  | Sin `/search/multi`: todo se asume película                               | Paso 5 de la cascada                             |
| D3  | La duración del archivo se lee y se descarta                              | Señal de desempate de +30 / −40 puntos           |
| D4  | Identificadores incrustados en el nombre ignorados                        | Paso 1 de la cascada                             |
| D5  | La identificación reextrae pistas y pisa correcciones                     | El resolvedor recibe la identificación vigente   |
| D6  | Lógica de auto-aplicación ambigua en banda media                          | Bandas explícitas con margen mínimo              |
| D7  | Una búsqueda y una consulta por episodio                                  | Serie resuelta una vez, temporada en una llamada |
| D8  | Vocabulario del parser incompleto                                         | Vocabulario ampliado                             |
| D9  | Los tokens de resolución detectados nunca se usan                         | Respaldo declarado cuando falta MediaInfo        |
| D10 | La doctrina de fuente impedía escribir etiquetas de release               | Se escribe con inferencia y procedencia visible  |

## 8. Pruebas

Desarrollo dirigido por pruebas, módulo a módulo. Cobertura mínima exigida:

- **Nombres canónicos**: una batería de nombres reales (scene internacional, español con `Cap.202`,
  releases con dominio incrustado, anime, DVDRip, CAM, `microHD`) con el nombre final exacto
  esperado. Es la prueba que define el producto.
- **Clases de resolución**: material recortado (`3840×1608`), anamórfico (`1440×1080`), vertical,
  DCI 2K y 4K, y ausencia de dimensiones.
- **Inferencia de fuente**: un caso por regla, más la precedencia corrección manual > etiqueta >
  inferencia.
- **Recorte**: títulos largos con y sin episodio, comprobando el orden de descarte y que nunca se
  pierde título, año, episodio ni resolución.
- **Cascada de TMDb**: respuestas simuladas que fuerzan cada uno de los siete pasos, incluida la
  parada temprana por identificador incrustado.
- **Señales de desempate**: dos candidatos idénticos salvo duración; dos remakes con el mismo
  título y distinto año.
- **Correcciones aprendidas**: se guardan, se aplican en la carga siguiente y se pueden olvidar.
- **Seguridad del renombrado**: se mantienen todas las pruebas actuales de preflight, ejecución,
  registro y deshacer, y se añade que la previsualización refleja exactamente lo que se ejecuta.

Todo debe pasar `pnpm check` (formato, lint sin avisos, pruebas y compilación).

## 9. Fuera de alcance

- Crear o mover carpetas y estructuras de biblioteca (decisión explícita del propietario).
- Reproducción, remux, transcodificación, checksums y detección de duplicados por contenido.
- Cualquier backend, servidor o sincronización: la aplicación sigue siendo íntegramente local.
- Proveedores de metadata distintos de TMDb.

## 10. Riesgos y mitigaciones

| Riesgo                                                              | Mitigación                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| La inferencia de fuente por bitrate se equivoca en material atípico | La etiqueta del nombre siempre gana; la ficha declara el motivo; corrección manual en un clic |
| `/search/multi` devuelve resultados de tipo `person` o ruido        | Se filtran los tipos no admitidos antes de puntuar                                            |
| La duración no está disponible en algunos contenedores              | La señal solo puntúa cuando existe; su ausencia no penaliza                                   |
| El recorte del nombre elimina información que se quería conservar   | El límite es configurable y el orden de descarte está documentado en Ajustes                  |
| El rediseño de la interfaz introduce regresiones en el renombrado   | La capa de renombrado y su preflight no se tocan; sus pruebas se mantienen intactas           |
