(() => {
  if (window.__wikiStyleVisualEditor) return;
  window.__wikiStyleVisualEditor = true;

  let lastCell = null;

  document.addEventListener('mousedown', (event) => {
    const cell = event.target.closest('.ve-ce-tableCellNode');
    if (cell) lastCell = cell;
  }, true);

  document.addEventListener('wikistyle:open-visual-editor', () => {
    const surface = getSurface();
    if (!surface) {
      showMessage('El Editor Visual todavía se está cargando. Espera unos segundos y vuelve a intentarlo.');
      return;
    }
    showPanel();
  });

  function getSurface() {
    const target = window.mw?.libs?.ve?.target || window.ve?.init?.target;
    return target?.getSurface?.() || null;
  }

  function activeCell() {
    if (lastCell?.isConnected) return lastCell;
    return document.querySelector(
      '.ve-ce-tableCellNode-active, .ve-ce-tableCellNode.ve-ce-tableCellNode-selected'
    );
  }

  function showMessage(message) {
    document.querySelector('#wikistyle-editor')?.remove();
    const panel = document.createElement('section');
    panel.id = 'wikistyle-editor';
    panel.innerHTML = `
      <div class="ws-head"><strong>WikiStyle</strong><button class="ws-close" aria-label="Cerrar">×</button></div>
      <p>${message}</p>`;
    document.documentElement.append(panel);
    panel.querySelector('.ws-close').addEventListener('click', () => panel.remove());
  }

  function showPanel() {
    document.querySelector('#wikistyle-editor')?.remove();
    const panel = document.createElement('section');
    panel.id = 'wikistyle-editor';
    panel.setAttribute('aria-label', 'WikiStyle para el Editor Visual');
    panel.innerHTML = `
      <div class="ws-head"><strong>Editar tabla</strong><button class="ws-close" aria-label="Cerrar">×</button></div>
      <p class="ws-note ws-intro">Selecciona primero una celda dentro del Editor Visual.</p>
      <label>Aplicar a</label>
      <div class="ws-scope">
        <button data-scope="cell" aria-pressed="true">Celda</button>
        <button data-scope="row" aria-pressed="false">Fila</button>
        <button data-scope="column" aria-pressed="false">Columna</button>
      </div>
      <label>Alineación</label>
      <div class="ws-align">
        <button data-align="left" aria-pressed="false">Izquierda</button>
        <button data-align="center" aria-pressed="false">Centro</button>
        <button data-align="right" aria-pressed="false">Derecha</button>
      </div>
      <label for="ws-ve-background">Color de fondo</label>
      <input id="ws-ve-background" type="color" value="#ffffff">
      <label for="ws-ve-text">Color del texto</label>
      <input id="ws-ve-text" type="color" value="#202122">
      <div class="ws-actions">
        <button class="ws-clear">Quitar estilo</button>
        <button class="ws-save">Aplicar</button>
      </div>
      <p class="ws-note ws-status" role="status">Después podrás revisar y publicar los cambios desde Wikipedia.</p>`;
    document.documentElement.append(panel);

    let scope = 'cell';
    let alignment = '';

    panel.querySelector('.ws-close').addEventListener('click', () => panel.remove());
    panel.querySelectorAll('[data-scope]').forEach((button) => {
      button.addEventListener('click', () => {
        scope = button.dataset.scope;
        panel.querySelectorAll('[data-scope]').forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button))
        );
      });
    });
    panel.querySelectorAll('[data-align]').forEach((button) => {
      button.addEventListener('click', () => {
        alignment = button.dataset.align;
        panel.querySelectorAll('[data-align]').forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button))
        );
      });
    });
    panel.querySelector('.ws-save').addEventListener('click', () => {
      applyToVisualEditor(panel, scope, {
        textAlign: alignment,
        backgroundColor: panel.querySelector('#ws-ve-background').value,
        color: panel.querySelector('#ws-ve-text').value
      });
    });
    panel.querySelector('.ws-clear').addEventListener('click', () => {
      applyToVisualEditor(panel, scope, {
        textAlign: '', backgroundColor: '', color: ''
      });
    });
  }

  function cellsForScope(cell, scope) {
    if (scope === 'cell') return [cell];
    if (scope === 'row') {
      return [...cell.parentElement.children].filter((item) =>
        item.classList.contains('ve-ce-tableCellNode')
      );
    }

    const table = cell.closest('.ve-ce-tableNode');
    const tableElement = table?.matches('table') ? table : table?.querySelector(':scope > table');
    if (!tableElement) return [cell];
    const rows = [...tableElement.rows];
    const grid = [];
    let selectedColumns = [];
    rows.forEach((row, rowIndex) => {
      grid[rowIndex] ||= [];
      let columnIndex = 0;
      [...row.children].filter((item) => item.matches('td, th')).forEach((item) => {
        while (grid[rowIndex][columnIndex]) columnIndex += 1;
        const rowSpan = Math.max(1, Number(item.getAttribute('rowspan')) || 1);
        const columnSpan = Math.max(1, Number(item.getAttribute('colspan')) || 1);
        if (item === cell) {
          selectedColumns = Array.from({ length: columnSpan }, (_, index) => columnIndex + index);
        }
        for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
          grid[rowIndex + rowOffset] ||= [];
          for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
            grid[rowIndex + rowOffset][columnIndex + columnOffset] = item;
          }
        }
        columnIndex += columnSpan;
      });
    });
    return [...new Set(grid.flatMap((row) => selectedColumns.map((column) => row[column]).filter(Boolean)))];
  }

  function viewForCell(cell) {
    return window.jQuery?.(cell).data('view') || cell.__veView || null;
  }

  function updateStyle(styleText, values) {
    const holder = document.createElement('span');
    holder.setAttribute('style', styleText || '');
    for (const [property, value] of Object.entries({
      'text-align': values.textAlign,
      'background-color': values.backgroundColor,
      color: values.color
    })) {
      if (value) holder.style.setProperty(property, value);
      else holder.style.removeProperty(property);
    }
    return holder.getAttribute('style') || '';
  }

  function applyToVisualEditor(panel, scope, values) {
    const status = panel.querySelector('.ws-status');
    const cell = activeCell();
    const surface = getSurface();
    if (!cell || !surface) {
      status.textContent = 'Selecciona una celda de la tabla y vuelve a pulsar Aplicar.';
      return;
    }

    const surfaceModel = surface.getModel();
    const documentModel = surfaceModel.getDocument();
    const cells = cellsForScope(cell, scope);
    let applied = 0;

    for (const cellElement of cells) {
      const view = viewForCell(cellElement);
      const node = view?.getModel?.();
      const offset = node?.getOuterRange?.().start;
      if (!node || !Number.isInteger(offset)) continue;

      const style = updateStyle(node.getAttribute?.('style'), values);
      const transaction = window.ve.dm.TransactionBuilder.static.newFromAttributeChanges(
        documentModel,
        offset,
        { style }
      );
      surfaceModel.change(transaction);
      applied += 1;
    }

    status.textContent = applied
      ? `Estilo aplicado a ${applied} ${applied === 1 ? 'celda' : 'celdas'}. Revisa y publica los cambios en Wikipedia.`
      : 'No se pudo vincular esta tabla con el modelo de edición. Puede proceder de una plantilla.';
  }
})();
