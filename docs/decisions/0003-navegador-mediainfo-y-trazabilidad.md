# ADR-0003: aplicación de navegador, MediaInfo WASM y trazabilidad obligatoria

Estado: aceptada
Fecha: 2026-08-16

## Contexto

El repositorio es una SPA de navegador, no la aplicación de escritorio que describían los ADR-0001 y
ADR-0002. La auditoría de 2026-08-16 encontró que los datos técnicos se leían con MediaInfo pero se
mezclaban sin distinción con etiquetas deducidas del nombre del archivo, y que el renombrado podía
copiar y borrar, con riesgo real de destruir ficheros.

## Decisión

1. **Motor de análisis: MediaInfo compilado a WebAssembly.** No se puede lanzar `ffprobe` desde un
   navegador y `ffmpeg.wasm` costaría decenas de megabytes para dar menos información de contenedor.
   MediaInfo publica `HDR_Format`, `HDR_Format_Compatibility`, `Format_Commercial_IfAny` y
   `Format_AdditionalFeatures`, que son precisamente los campos que permiten distinguir Dolby Vision
   de HDR10, Atmos de TrueHD y DTS:X de DTS-HD MA.
2. **Trazabilidad obligatoria.** Todo dato relevante viaja como `Traced<T>` con
   `CONFIRMED | INFERRED | UNKNOWN | USER_CONFIRMED` y su procedencia. Los datos técnicos solo
   pueden ser `CONFIRMED`; la fuente y el REMUX se admiten `INFERRED` porque no existe forma técnica
   de confirmarlos; la corrección manual gana siempre.
3. **Proveedor de metadata abstracto.** `MetadataProvider` con implementación TMDb localizada a
   España y proveedor nulo para el modo sin clave. Las respuestas se validan con Zod.
4. **Renombrado solo con `move()`.** Se elimina la ruta copia-y-borra. Preflight, simulación,
   revalidación previa al movimiento, registro y deshacer.
5. **Separador de idiomas `+` en lugar de `/`.** La especificación funcional pedía `/`, pero es un
   separador de rutas y un carácter prohibido en Windows. Se conserva el objetivo (idiomas
   agrupados y legibles) con un carácter legal, y el separador es configurable.

## Consecuencias

- El renombrado directo requiere un navegador Chromium (`FileSystemFileHandle.move()`); en el resto
  la aplicación analiza y ofrece un script.
- La clave de TMDb no puede ocultarse en una aplicación sin backend: se guarda en el equipo y la
  interfaz lo advierte. Si esto resulta inaceptable, el paso siguiente es un backend mínimo que
  actúe de proxy, y esa decisión no está tomada.
- Los ADR-0001 y ADR-0002 quedan obsoletos en todo lo referido a Tauri, Rust, SQLite y ffprobe.
