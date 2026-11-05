(() => {
  if (window.__wikiStyleVisualEditor) return;
  window.__wikiStyleVisualEditor = true;

  let panel = null;
  let statusTimer = null;
  let commitTimer = null;

  document.addEventListener('wikistyle:open-visual-editor', () => {
    if (!getSurface()) {
      showMessage('El Editor Visual todavía se está cargando. Espera unos segundos y vuelve a intentarlo.');
      return;
    }
    showPanel();
  });

  function getSurface() {
    const target = window.mw?.libs?.ve?.target || window.ve?.init?.target;
    return target?.getSurface?.() || null;
  }

  function getSelectedCells() {
    const surface = getSurface();
    if (!surface || !window.ve?.dm) return [];
    const surfaceModel = surface.getModel();
    const documentModel = surfaceModel.getDocument();
    const selection = surfaceModel.getSelection();

    if (selection instanceof window.ve.dm.TableSelection) {
      return selection.getMatrixCells(documentModel);
    }
    if (selection instanceof window.ve.dm.LinearSelection) {
      const branchNode = documentModel.getBranchNodeFromOffset(selection.getRange().start);
      const cellNode = branchNode instanceof window.ve.dm.TableCellNode
        ? branchNode
        : branchNode?.findParent(window.ve.dm.TableCellNode);
      const tableNode = cellNode?.findParent(window.ve.dm.TableNode);
      const cell = tableNode?.getMatrix().lookupCell(cellNode);
      return cell ? [cell] : [];
    }
    return [];
  }

  function closePanel() {
    clearInterval(statusTimer);
    clearTimeout(commitTimer);
    panel?.remove();
    panel = null;
  }

  function showMessage(message) {
    closePanel();
    panel = document.createElement('section');
    panel.id = 'wikistyle-editor';
    panel.innerHTML = `
      <div class="ws-head"><strong>WikiStyle</strong><button class="ws-close" aria-label="Cerrar">×</button></div>
      <p>${message}</p>`;
    document.documentElement.append(panel);
    panel.querySelector('.ws-close').addEventListener('click', closePanel);
  }

  function showPanel() {
    closePanel();
    panel = document.createElement('section');
    panel.id = 'wikistyle-editor';
    panel.setAttribute('aria-label', 'WikiStyle para el Editor Visual');
    panel.innerHTML = `
      <div class="ws-head"><strong>Formato de selección</strong><button class="ws-close" aria-label="Cerrar">×</button></div>
      <p class="ws-selection">Selecciona una celda, fila o columna en la tabla.</p>
      <label>Alineación</label>
      <div class="ws-align">
        <button data-align="left" aria-pressed="false">Izquierda</button>
        <button data-align="center" aria-pressed="false">Centro</button>
        <button data-align="right" aria-pressed="false">Derecha</button>
      </div>
      <label for="ws-ve-background">Color de fondo</label>
      <div class="ws-color-row">
        <input id="ws-ve-background" type="color" value="#ffffff">
        <button data-clear="backgroundColor">Sin fondo</button>
      </div>
      <label for="ws-ve-text">Color del texto</label>
      <div class="ws-color-row">
        <input id="ws-ve-text" type="color" value="#202122">
        <button data-clear="color">Original</button>
      </div>
      <p class="ws-note ws-status" role="status">Los cambios se muestran y se aplican inmediatamente a la selección actual.</p>`;
    document.documentElement.append(panel);
    panel.querySelector('.ws-close').addEventListener('click', closePanel);

    panel.querySelectorAll('[data-align]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.align;
        previewSelection({ textAlign: value });
        commitSelection({ textAlign: value });
        panel.querySelectorAll('[data-align]').forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button))
        );
      });
    });
    bindLiveColor('#ws-ve-background', 'backgroundColor');
    bindLiveColor('#ws-ve-text', 'color');
    panel.querySelectorAll('[data-clear]').forEach((button) => {
      button.addEventListener('click', () => {
        const property = button.dataset.clear;
        previewSelection({ [property]: '' });
        commitSelection({ [property]: '' });
      });
    });

    statusTimer = setInterval(refreshSelectionStatus, 250);
    refreshSelectionStatus();
  }

  function bindLiveColor(selector, property) {
    const input = panel.querySelector(selector);
    input.addEventListener('input', () => {
      const change = { [property]: input.value };
      previewSelection(change);
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => commitSelection(change), 250);
    });
    input.addEventListener('change', () => {
      clearTimeout(commitTimer);
      commitSelection({ [property]: input.value });
    });
  }

  function refreshSelectionStatus() {
    if (!panel) return;
    const cells = getSelectedCells();
    panel.querySelector('.ws-selection').textContent = cells.length
      ? `${cells.length} ${cells.length === 1 ? 'celda seleccionada' : 'celdas seleccionadas'}`
      : 'Selecciona una celda, fila o columna en la tabla.';
  }

  function viewElementForNode(node) {
    for (const element of document.querySelectorAll('.ve-ce-tableCellNode')) {
      if (window.jQuery?.(element).data('view')?.getModel?.() === node) return element;
    }
    return null;
  }

  function previewSelection(changes) {
    for (const cell of getSelectedCells()) {
      const element = viewElementForNode(cell.node);
      if (!element) continue;
      for (const [property, value] of Object.entries(changes)) {
        if (value) element.style[property] = value;
        else element.style.removeProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
      }
    }
    refreshSelectionStatus();
  }

  function commitSelection(changes) {
    const surface = getSurface();
    const cells = getSelectedCells();
    const status = panel?.querySelector('.ws-status');
    if (!surface || !cells.length) {
      if (status) status.textContent = 'Selecciona primero una celda, fila o columna de la tabla.';
      return;
    }

    const surfaceModel = surface.getModel();
    const documentModel = surfaceModel.getDocument();
    const store = documentModel.getStore();
    const transactions = [];

    for (const cell of cells) {
      const offset = cell.node.getOuterRange().start;
      const opening = documentModel.getData(new window.ve.Range(offset, offset + 1), true)[0];
      opening.attributes ||= {};
      if (Object.hasOwn(changes, 'textAlign')) {
        if (changes.textAlign) opening.attributes.textAlign = changes.textAlign;
        else delete opening.attributes.textAlign;
      }

      const originals = store.value(opening.originalDomElementsHash);
      if (originals?.length) {
        const domElements = originals.map((element) => element.cloneNode(true));
        const domCell = domElements[0];
        if (Object.hasOwn(changes, 'textAlign')) setStyle(domCell, 'text-align', changes.textAlign);
        if (Object.hasOwn(changes, 'backgroundColor')) setStyle(domCell, 'background-color', changes.backgroundColor);
        if (Object.hasOwn(changes, 'color')) setStyle(domCell, 'color', changes.color);
        opening.originalDomElementsHash = store.hash(
          domElements,
          domElements.map(window.ve.getNodeHtml).join('')
        );
      }

      transactions.push(window.ve.dm.TransactionBuilder.static.newFromReplacement(
        documentModel,
        new window.ve.Range(offset, offset + 1),
        [opening]
      ));
    }

    try {
      surfaceModel.change(transactions);
      surfaceModel.breakpoint();
      if (status) {
        status.textContent = `Formato aplicado a ${cells.length} ${cells.length === 1 ? 'celda' : 'celdas'}. Puedes deshacerlo con Ctrl+Z.`;
      }
    } catch (error) {
      if (status) status.textContent = `No se pudo aplicar el formato: ${error.message}`;
    }
  }

  function setStyle(element, property, value) {
    if (value) element.style.setProperty(property, value);
    else element.style.removeProperty(property);
    if (!element.getAttribute('style')) element.removeAttribute('style');
  }
})();
