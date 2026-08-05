# Sistema visual — CineVault Premium

CineVault adopta una estética premium y minimalista inspirada en la claridad, el ritmo y el acabado del mejor software de consumo de Apple, sin copiar componentes propietarios ni convertir la aplicación en una imitación de macOS. La ventana conserva el marco y los controles nativos de Windows; no se añaden “traffic lights”, barras de título falsas ni gestos ajenos a la plataforma.

La identidad propia sigue siendo la de un archivo cinematográfico profesional: pósteres como plancha de contactos, datos técnicos sobrios y una banda de montaje que permite auditar cada nombre propuesto.

## Principios

1. **Jerarquía antes que decoración.** Tamaño, espacio y peso tipográfico organizan la interfaz; los bordes y acentos se usan solo cuando explican estado o interacción.
2. **Profundidad tranquila.** Negro y carbón separan canvas, navegación y contenido mediante cambios pequeños de luminancia, realces interiores y sombras amplias de baja opacidad.
3. **Una firma cinematográfica funcional.** La banda de montaje conserva la comparación actual/propuesto y la procedencia de cada etiqueta, ahora como superficie oscura refinada.
4. **Acción precisa.** Los botones expresan un verbo y, en operaciones de archivos, la cantidad exacta. Ninguna mutación se ejecuta sin preflight y confirmación.
5. **Windows primero.** Se respetan marco nativo, teclado, escalado, contraste forzado y patrones de selección de archivos de Windows.

## Paleta

| Token     | Valor     | Uso                                   |
| --------- | --------- | ------------------------------------- |
| Vault     | `#08090B` | Canvas oscuro principal               |
| Slate     | `#15171B` | Superficies de trabajo                |
| Celluloid | `#F5F5F7` | Texto principal y modo claro          |
| Patina    | `#78CEC2` | Acción primaria, foco y verificado    |
| Cue       | `#D6AC72` | Progreso y revisión                   |
| Splice    | `#FF7D87` | Conflicto, error y acción destructiva |

Los niveles intermedios son `#101216`, `#1B1E23` y `#23262C`. El texto secundario deriva de Celluloid al 67 % y el terciario al 44 %. Los bordes usan entre 9 % y 16 %; nunca deben dominar la jerarquía.

El tema claro usa canvas `#F5F5F7`, superficie `#FFFFFF`, superficie secundaria `#EEEFF2` y texto `#1D1D1F`. Los acentos se oscurecen al usarse como texto para mantener WCAG AA.

## Tipografía

- Display, títulos y navegación: `Segoe UI Variable Display`, `Segoe UI`, `system-ui`.
- Texto de interfaz: `Segoe UI Variable Text`, `Segoe UI`, `system-ui`.
- Archivos, rutas y cifras técnicas: `Cascadia Mono`, `Consolas`, `ui-monospace`.
- Títulos con tracking de `-0.032em` a `-0.047em`, peso 600–620 y line-height compacto.
- Texto de interfaz de 13–15 px, con line-height mínimo de 1.45.
- Cifras técnicas tabulares.

No se descargan fuentes ni recursos tipográficos en tiempo de ejecución.

## Geometría y espaciado

- Radio pequeño: 11 px para botones, campos y navegación.
- Radio medio: 16 px para paneles, filas de historial y banda de montaje.
- Radio grande: 22 px para ficha de película, workbench y diálogos.
- Objetivos interactivos: mínimo 40×40 px; botón estándar de 42 px.
- Sidebar: 224 px, contraída a 72 px.
- Barra contextual: 58 px.
- Pantallas: 40×42 px de margen en escritorio; la densidad se reduce de forma progresiva.

Las sombras son amplias y suaves. Solo modal, ficha, pósteres, workbench y barra de confirmación pueden usar elevación visible. El blur se reserva para navegación, modal y barra flotante; no se aplica a cada tarjeta.

## Componentes

### Navegación

La navegación activa usa una superficie ligeramente más clara, un realce interior y una marca Patina de 2 px. No utiliza grandes cápsulas coloreadas. La topbar solo contiene contexto local y estado de ejecución; no añade cuentas, campanas ni KPIs ficticios.

### Biblioteca

La cuadrícula se comporta como una plancha de contactos con pósteres 2:3, radio de 17 px y metadatos discretos. El hover eleva cuatro píxeles y escala un máximo de 1,012. Todas las acciones siguen disponibles por teclado.

### Banda de montaje

La “Vista previa del nombre” es una superficie carbón con tres niveles:

1. Nombre actual atenuado.
2. Separador de corte.
3. Nombre propuesto destacado y piezas con origen textual: Nombre, ffprobe, TMDb o Manual.

No usa perforaciones ni textura de película decorativa. Una corrección manual conserva la marca “Editado”.

### Importación segura

El workbench une lista virtualizada e inspector en una superficie de 22 px. La selección activa usa un velo Patina muy tenue. La barra final flota sobre el contenido, pero mantiene alto contraste y comunica selección, bloqueos y acción exacta. Preflight y confirmación siguen siendo obligatorios.

### Historial y ajustes

Historial usa entradas carbón con una marca de estado corta, no una línea ornamental completa. Ajustes limita el ancho de lectura, agrupa controles por propósito y conserva botones explícitos para reordenar etiquetas sin depender de arrastrar.

## Movimiento

- Transición base: 170 ms, curva `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- No hay rebotes, parallax, flicker de proyector ni animación ambiental.
- El progreso es continuo y basado en datos reales.
- `prefers-reduced-motion` reduce todas las transiciones a una duración prácticamente nula.

## Accesibilidad

- Contraste WCAG AA y foco Patina de 2 px con separación.
- Estado expresado mediante icono, color y texto.
- Flujo completo por teclado y atajos documentados.
- Progreso en región `aria-live="polite"`; errores críticos en `role="alert"`.
- Lista virtualizada con `aria-rowcount` y `aria-rowindex` estables.
- Rutas y archivos seleccionables, aislados con `<bdi>` y visibles íntegramente en el inspector.
- Compatibilidad con zoom al 200 %, `forced-colors` y temas claro, oscuro o del sistema.

## Responsive

- `≥1280 px`: sidebar completa, lista e inspector simultáneos.
- `960–1279 px`: rail de 72 px, cuadrícula compacta e inspector adaptado.
- `720–959 px`: workbench apilado y formularios a una columna.
- `<720 px`: navegación inferior para resistir ventanas estrechas; no se considera una experiencia móvil primaria.

Ventana mínima admitida: 1024×700 px.
