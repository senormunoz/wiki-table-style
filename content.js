(() => {
  const bridge = document.createElement('script');
  bridge.src = chrome.runtime.getURL('visual-editor.js');
  bridge.dataset.wikistyleBridge = 'true';
  bridge.addEventListener('load', () => bridge.remove());
  (document.head || document.documentElement).append(bridge);

  const STORE_PREFIX = 'wikistyle:';
  const pageKey = `${STORE_PREFIX}${location.origin}${location.pathname}`;
  let selecting = false;
  let hovered = null;
  let selected = null;
  let targets = [];
  let drafts = new Map();

  function escapeCss(value) {
    return CSS.escape(value);
  }

  function selectorFor(element) {
    if (element.id) return `#${escapeCss(element.id)}`;

    const path = [];
    let current = element;
    while (current && current !== document.body) {
      let part = current.tagName.toLowerCase();
      const stableClass = [...current.classList].find(
        (name) => !name.startsWith('wikistyle-') && !/^(mw-|ve-)/.test(name)
      );
      if (stableClass) part += `.${escapeCss(stableClass)}`;

      const siblings = [...current.parentElement.children].filter(
        (item) => item.tagName === current.tagName
      );
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      path.unshift(part);

      const candidate = path.join(' > ');
      if (document.querySelectorAll(candidate).length === 1) return candidate;
      current = current.parentElement;
    }
    return `body > ${path.join(' > ')}`;
  }

  async function getChanges() {
    const stored = await chrome.storage.local.get(pageKey);
    return stored[pageKey] || {};
  }

  async function setChanges(changes) {
    await chrome.storage.local.set({ [pageKey]: changes });
  }

  function applyStyle(element, style) {
    element.style.setProperty('text-align', style.textAlign || '');
    element.style.setProperty('background-color', style.backgroundColor || '');
    element.style.setProperty('color', style.color || '');
    if (style.color) {
      element.style.setProperty('--wikistyle-text-color', style.color);
      element.classList.add('wikistyle-text-color');
    } else {
      element.style.removeProperty('--wikistyle-text-color');
      element.classList.remove('wikistyle-text-color');
    }
  }

  async function restorePage() {
    const changes = await getChanges();
    for (const [selector, style] of Object.entries(changes)) {
      try {
        const element = document.querySelector(selector);
        if (element) applyStyle(element, style);
      } catch {
        // A Wikipedia redesign can invalidate an old selector; other edits still load.
      }
    }
  }

  function stopSelecting() {
    selecting = false;
    document.removeEventListener('mouseover', onHover, true);
    document.removeEventListener('click', onSelect, true);
    hovered?.classList.remove('wikistyle-hover');
    hovered = null;
  }

  function onHover(event) {
    if (event.target.closest('#wikistyle-editor')) return;
    hovered?.classList.remove('wikistyle-hover');
    hovered = event.target;
    hovered.classList.add('wikistyle-hover');
  }

  function onSelect(event) {
    if (event.target.closest('#wikistyle-editor')) return;
    event.preventDefault();
    event.stopPropagation();
    selected = event.target.closest('td, th') || event.target;
    selected.classList.remove('wikistyle-hover');
    stopSelecting();
    showEditor();
  }

  function startSelecting() {
    closeEditor(false);
    if (document.querySelector('.ve-ui-surface')) {
      document.dispatchEvent(new CustomEvent('wikistyle:open-visual-editor'));
      return;
    }
    if (selecting) return;
    selecting = true;
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('click', onSelect, true);
  }

  function closeEditor(revert = true) {
    if (revert) restoreDrafts();
    document.querySelector('#wikistyle-editor')?.remove();
    selected = null;
    targets = [];
    drafts = new Map();
  }

  function restoreDrafts() {
    drafts.forEach((style, element) => applyStyle(element, style));
  }

  function setTargets(scope) {
    restoreDrafts();
    const cell = selected.closest('td, th');
    if (!cell || scope === 'cell') {
      targets = [selected];
    } else if (scope === 'row') {
      targets = [...cell.parentElement.cells];
    } else {
      targets = cellsInColumn(cell);
    }
    drafts = new Map(targets.map((element) => [element, {
      textAlign: element.style.textAlign,
      backgroundColor: element.style.backgroundColor,
      color: element.style.color
    }]));
  }

  function cellsInColumn(selectedCell) {
    const table = selectedCell.closest('table');
    if (!table) return [selectedCell];

    const rows = [...table.rows];
    const grid = [];
    let selectedColumns = [];

    rows.forEach((row, rowIndex) => {
      grid[rowIndex] ||= [];
      let columnIndex = 0;
      [...row.cells].forEach((cell) => {
        while (grid[rowIndex][columnIndex]) columnIndex += 1;
        const rowSpan = Math.max(1, cell.rowSpan || 1);
        const columnSpan = Math.max(1, cell.colSpan || 1);

        if (cell === selectedCell) {
          selectedColumns = Array.from({ length: columnSpan }, (_, index) => columnIndex + index);
        }

        for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
          grid[rowIndex + rowOffset] ||= [];
          for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
            grid[rowIndex + rowOffset][columnIndex + columnOffset] = cell;
          }
        }
        columnIndex += columnSpan;
      });
    });

    return [...new Set(grid.flatMap((row) => selectedColumns.map((column) => row[column]).filter(Boolean)))];
  }

  function showEditor() {
    document.querySelector('#wikistyle-editor')?.remove();
    setTargets('cell');

    const computed = getComputedStyle(selected);
    const isTableCell = selected.matches('td, th');
    const panel = document.createElement('section');
    panel.id = 'wikistyle-editor';
    panel.setAttribute('aria-label', 'Editor de estilo de WikiStyle');
    panel.innerHTML = `
      <div class="ws-head"><strong>Editar elemento</strong><button class="ws-close" aria-label="Cerrar">×</button></div>
      ${isTableCell ? `
        <label>Aplicar a</label>
        <div class="ws-scope">
          <button data-scope="cell" aria-pressed="true">Celda</button>
          <button data-scope="row" aria-pressed="false">Fila</button>
          <button data-scope="column" aria-pressed="false">Columna</button>
        </div>` : ''}
      <label>Alineación</label>
      <div class="ws-align">
        <button data-align="left">Izquierda</button>
        <button data-align="center">Centro</button>
        <button data-align="right">Derecha</button>
      </div>
      <label for="ws-color">Color de fondo</label>
      <input id="ws-color" type="color" value="${rgbToHex(computed.backgroundColor)}">
      <label for="ws-text-color">Color del texto</label>
      <input id="ws-text-color" type="color" value="${rgbToHex(computed.color)}">
      <div class="ws-actions">
        <button class="ws-clear">Quitar estilo</button>
        <button class="ws-save">Guardar</button>
      </div>
      <p class="ws-note">Los cambios solo se guardan en este navegador.</p>`;
    document.documentElement.append(panel);

    panel.querySelectorAll('[data-scope]').forEach((button) => {
      button.addEventListener('click', () => {
        setTargets(button.dataset.scope);
        panel.querySelectorAll('[data-scope]').forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button))
        );
        syncControls();
      });
    });

    panel.querySelectorAll('[data-align]').forEach((button) => {
      button.addEventListener('click', () => {
        targets.forEach((element) => { element.style.textAlign = button.dataset.align; });
        panel.querySelectorAll('[data-align]').forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button))
        );
      });
    });
    panel.querySelector('#ws-color').addEventListener('input', (event) => {
      targets.forEach((element) => { element.style.backgroundColor = event.target.value; });
    });
    panel.querySelector('#ws-text-color').addEventListener('input', (event) => {
      targets.forEach((element) => applyStyle(element, {
        textAlign: element.style.textAlign,
        backgroundColor: element.style.backgroundColor,
        color: event.target.value
      }));
    });
    panel.querySelector('.ws-close').addEventListener('click', () => closeEditor());
    panel.querySelector('.ws-clear').addEventListener('click', clearSelected);
    panel.querySelector('.ws-save').addEventListener('click', saveSelected);

    function syncControls() {
      const current = getComputedStyle(targets[0]);
      panel.querySelectorAll('[data-align]').forEach((button) =>
        button.setAttribute('aria-pressed', String(current.textAlign === button.dataset.align))
      );
      panel.querySelector('#ws-color').value = rgbToHex(current.backgroundColor);
      panel.querySelector('#ws-text-color').value = rgbToHex(current.color);
    }

    syncControls();
  }

  function rgbToHex(color) {
    const values = color.match(/\d+/g);
    if (!values || values.length < 3 || Number(values[3]) === 0) return '#ffffff';
    return `#${values.slice(0, 3).map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`;
  }

  async function saveSelected() {
    const changes = await getChanges();
    targets.forEach((element) => {
      changes[selectorFor(element)] = {
        textAlign: element.style.textAlign,
        backgroundColor: element.style.backgroundColor,
        color: element.style.color
      };
    });
    await setChanges(changes);
    closeEditor(false);
  }

  async function clearSelected() {
    const changes = await getChanges();
    targets.forEach((element) => {
      applyStyle(element, { textAlign: '', backgroundColor: '', color: '' });
      delete changes[selectorFor(element)];
    });
    await setChanges(changes);
    closeEditor(false);
  }

  async function resetPage() {
    const changes = await getChanges();
    for (const selector of Object.keys(changes)) {
      try {
        const element = document.querySelector(selector);
        if (element) applyStyle(element, { textAlign: '', backgroundColor: '', color: '' });
      } catch { /* Ignore selectors invalidated by page changes. */ }
    }
    await chrome.storage.local.remove(pageKey);
    closeEditor(false);
    stopSelecting();
    return Object.keys(changes).length;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'START_SELECTING') {
      startSelecting();
      sendResponse({ ok: true });
    }
    if (message.type === 'RESET_PAGE') {
      resetPage().then((count) => sendResponse({ count }));
      return true;
    }
    return false;
  });

  restorePage();
})();
