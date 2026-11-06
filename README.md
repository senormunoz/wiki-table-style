# WikiStyle

Extensión de Chrome para personalizar visualmente páginas de Wikipedia. Permite
seleccionar cualquier elemento, cambiar su alineación, color de fondo y color de
texto, y guardar los ajustes de forma local para cada artículo. En las tablas se
puede aplicar cada cambio a una celda, una fila o una columna completa, incluyendo
tablas con celdas combinadas mediante `rowspan` y `colspan`.

Cuando el Editor Visual de Wikipedia está abierto, WikiStyle usa la selección
actual del propio editor. Puedes seleccionar una celda o usar los controles de la
tabla de Wikipedia para seleccionar una fila, columna o grupo de celdas. Los
cambios se previsualizan y aplican inmediatamente al modelo de edición, por lo que
pasan al wikicódigo al revisar y publicar. La extensión nunca pulsa **Publicar
cambios** automáticamente.

WikiStyle guarda el formato como atributos del nodo de celda de VisualEditor. No
reemplaza celdas ni inserta estructuras de tabla nuevas, por lo que el contenido y
la estructura original permanecen intactos.

Los colores pueden elegirse con el selector visual o escribirse como código
hexadecimal. Ambos controles permanecen sincronizados y aceptan `#RRGGBB`,
`RRGGBB` y la forma corta `#RGB`.

Cada cambio de color queda asociado a las celdas seleccionadas al realizarlo. Si
la selección cambia mientras se completa la aplicación, las nuevas celdas no
reciben el formato anterior.

Al seleccionar una tabla completa en el Editor Visual se habilita **Configurar
filas alternas**. Permite elegir dos colores —`#FFFFFF` y `#EFEFEF` por defecto— y
aplicarlos alternadamente a las filas de datos. Las filas compuestas por celdas de
encabezado conservan su formato actual.

Los fondos se guardan en el wikicódigo con `bgcolor="#RRGGBB"`. Al cambiar un
fondo existente, WikiStyle elimina `background-color` de `style` para evitar que
ambas declaraciones entren en conflicto. La alineación y el color del texto
continúan guardándose en `style`.

## Probar la extensión

1. Abre `chrome://extensions` en Chrome.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige esta carpeta.
4. Abre una página de Wikipedia y pulsa el icono de WikiStyle.
5. Pulsa **Editar selección**, elige una parte de la página y edítala.

Para guardar el resultado en Wikipedia, abre primero **Editar** (Editor Visual),
selecciona una celda, fila o columna y abre WikiStyle. Cambia la alineación o los
colores y termina el proceso con la revisión normal de Wikipedia.

Los cambios se guardan con `chrome.storage.local`; no editan Wikipedia ni se
sincronizan con otros navegadores. **Restablecer esta página** elimina todos los
ajustes locales del artículo actual.
