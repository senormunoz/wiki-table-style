# Wiki Table Style

Extensión de Chrome para editar el aspecto de las tablas de Wikipedia desde el
Editor Visual y conservar los cambios en el wikicódigo al publicar el artículo.

## Funciones

- Selección de una celda, una fila, una columna o un grupo de celdas mediante los
  controles de tabla del Editor Visual.
- Alineación horizontal a la izquierda, al centro o a la derecha.
- Alineación vertical arriba, al centro o abajo.
- Color de fondo y color de texto con selector visual o valor hexadecimal.
- Vista previa inmediata sobre la tabla mientras se edita.
- Dos colores alternos por filas para una tabla completa, manteniendo el formato
  de las filas de encabezado.
- Contorno exterior y bordes interiores configurables por separado.
- Grosor independiente para los cuatro lados, o un único valor para todos.
- Estilos de borde sólido, discontinuo, punteado, doble o sin borde, con un color
  común para los cuatro lados.
- Padding superior, derecho, inferior e izquierdo, conjunto o independiente.
- Ancho porcentual de una columna completa entre `1%` y `100%`.
- Aplicación independiente de contorno, bordes y padding para evitar escribir
  valores que no se hayan solicitado.
- Restablecimiento de bordes y padding en la selección actual.
- Reseteo total de todos los estilos de una tabla sin borrar su contenido,
  `rowspan` ni `colspan`.
- Compatibilidad con las acciones Deshacer y Rehacer de VisualEditor.

## Funcionamiento en el Editor Visual

Cuando el Editor Visual de Wikipedia está abierto, Wiki Table Style usa la selección
actual del propio editor. Puedes seleccionar una celda o usar los controles de la
tabla de Wikipedia para seleccionar una fila, una columna o un grupo de celdas. Los
cambios se previsualizan y aplican inmediatamente al modelo de edición, por lo que
pasan al wikicódigo al revisar y publicar. La extensión nunca pulsa **Publicar
cambios** automáticamente.

Wiki Table Style guarda el formato como atributos del nodo de celda de VisualEditor. No
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
fondo existente, Wiki Table Style elimina `background-color` de `style` para evitar que
ambas declaraciones entren en conflicto. La alineación horizontal se guarda con
`align="left"`, `align="center"` o `align="right"` en las celdas de datos. En los
encabezados se utiliza `text-align` porque el estilo predeterminado de Wikipedia
tiene prioridad sobre el atributo `align`. El color del texto se guarda en
`style`, ya que las celdas de wikicódigo no disponen de un atributo HTML equivalente
para el color.

La alineación vertical ofrece **Arriba**, **Centro** y **Abajo**, y se guarda en
el wikicódigo mediante `valign="top"`, `valign="middle"` o `valign="bottom"`.

El panel **Contorno, bordes y padding** permite configurar por separado el
contorno exterior y los bordes interiores de la selección. Cada grupo admite grosores para
arriba, derecha, abajo e izquierda, vinculados o independientes; estilos sólido,
discontinuo, punteado, doble o sin borde; y un color común. El padding ofrece los
cuatro valores en píxeles y se aplica a las celdas seleccionadas.

El ancho de columna tiene una pantalla independiente. Al seleccionar una única
columna completa se puede asignar un ancho entre 1% y 100% mediante el atributo de
wikicódigo `width="N%"`. La extensión recorre el índice lógico exacto de esa
columna y no modifica las demás; las celdas con `colspan` se omiten.

En la pantalla de contorno, bordes y padding cada bloque dispone de su propio
botón **Aplicar**, de modo que los valores predeterminados de los demás bloques no
se escriben accidentalmente. **Restablecer bordes y padding** recupera esos valores
originales en la selección actual.

La pantalla principal incluye **Resetear tabla**, disponible al seleccionar la
tabla completa. Es un borrado total de formato: elimina `class`, `style`,
`bgcolor`, `width`, `height`, `align`, `valign`, `border`, `bordercolor`,
`cellpadding`, `cellspacing`, `rules` y `frame` de la tabla, sus secciones, filas,
encabezado y celdas. Conserva contenido y estructura, incluidos `rowspan` y
`colspan`.

La limpieza se repite después de la restauración interna de atributos de
VisualEditor y elimina también cualquier atributo vacío `style=""`.
Si se aplica un formato nuevo después del reseteo, se escribe sobre esa base
limpia y permanece al guardar sin recuperar atributos antiguos.

## Instalar y probar la extensión

1. Abre `chrome://extensions` en Chrome.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige esta carpeta.
4. Abre una página de Wikipedia y pulsa el icono de Wiki Table Style.
5. Abre **Editar** en Wikipedia para entrar en el Editor Visual.
6. Selecciona una celda, fila, columna o tabla completa.
7. Pulsa **Editar selección** en Wiki Table Style y aplica el formato.
8. Revisa y publica el artículo mediante los controles normales de Wikipedia.

Fuera del Editor Visual, el modo de personalización de página guarda sus ajustes
en `chrome.storage.local`; esos ajustes solo se ven en el navegador actual y
**Restablecer esta página** los elimina. Dentro del Editor Visual, los cambios de
tabla se incorporan al modelo de Wikipedia y permanecen en el artículo cuando el
usuario completa manualmente la publicación.
