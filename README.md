# WikiStyle

Extensión de Chrome para personalizar visualmente páginas de Wikipedia. Permite
seleccionar cualquier elemento, cambiar su alineación y color de fondo, y guardar
los ajustes de forma local para cada artículo.

## Probar la extensión

1. Abre `chrome://extensions` en Chrome.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige esta carpeta.
4. Abre una página de Wikipedia y pulsa el icono de WikiStyle.
5. Pulsa **Seleccionar un elemento**, elige una parte de la página y edítala.

Los cambios se guardan con `chrome.storage.local`; no editan Wikipedia ni se
sincronizan con otros navegadores. **Restablecer esta página** elimina todos los
ajustes locales del artículo actual.
