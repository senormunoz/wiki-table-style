# WikiStyle

Extensión de Chrome para personalizar visualmente páginas de Wikipedia. Permite
seleccionar cualquier elemento, cambiar su alineación, color de fondo y color de
texto, y guardar los ajustes de forma local para cada artículo. En las tablas se
puede aplicar cada cambio a una celda, una fila o una columna completa, incluyendo
tablas con celdas combinadas mediante `rowspan` y `colspan`.

## Probar la extensión

1. Abre `chrome://extensions` en Chrome.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige esta carpeta.
4. Abre una página de Wikipedia y pulsa el icono de WikiStyle.
5. Pulsa **Seleccionar un elemento**, elige una parte de la página y edítala.

Los cambios se guardan con `chrome.storage.local`; no editan Wikipedia ni se
sincronizan con otros navegadores. **Restablecer esta página** elimina todos los
ajustes locales del artículo actual.
