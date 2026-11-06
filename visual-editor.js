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
    ensureVisualEditorPatches();
    showPanel();
  });

  function ensureVisualEditorPatches() {
    const dmClass = window.ve?.dm?.TableCellNode;
    const ceClass = window.ve?.ce?.TableCellNode;
    if (!dmClass || !ceClass || dmClass.static.__wikiStylePatched) return;

    const originalToDataElement = dmClass.static.toDataElement;
    dmClass.static.toDataElement = function (domElements, ...args) {
      const dataElement = originalToDataElement.call(this, domElements, ...args);
      const style = domElements[0]?.style;
      if (style?.backgroundColor) {
        dataElement.attributes.wikistyleBackgroundColor = style.backgroundColor;
      }
      if (style?.color) {
        dataElement.attributes.wikistyleColor = style.color;
      }
      return dataElement;
    };

    const originalToDomElements = dmClass.static.toDomElements;
    dmClass.static.toDomElements = function (dataElement, doc, converter, ...args) {
      const domElements = originalToDomElements.call(this, dataElement, doc, converter, ...args);
      const domCell = domElements[0];
      const store = converter?.getStore?.();
      const original = store?.value(dataElement.originalDomElementsHash)?.[0];
      if (original?.style?.cssText) domCell.style.cssText = original.style.cssText;
      dmClass.static.applyAlignmentAttributes(dataElement.attributes || {}, domCell);
      applyModelStyle(domCell, dataElement.attributes || {});
      return domElements;
    };

    const originalUpdateStyles = ceClass.static.updateStyles;
    ceClass.static.updateStyles = function ($element, model) {
      originalUpdateStyles.call(this, $element, model);
      const backgroundColor = model.getAttribute('wikistyleBackgroundColor');
      const color = model.getAttribute('wikistyleColor');
      if (backgroundColor !== undefined) setStyle($element[0], 'background-color', backgroundColor);
      if (color !== undefined) setStyle($element[0], 'color', color);
    };

    const originalAttributeChange = ceClass.prototype.onAttributeChange;
    ceClass.prototype.onAttributeChange = function (key, from, to) {
      originalAttributeChange.call(this, key, from, to);
      if (key === 'wikistyleBackgroundColor') setStyle(this.$element[0], 'background-color', to);
      if (key === 'wikistyleColor') setStyle(this.$element[0], 'color', to);
    };

    dmClass.static.__wikiStylePatched = true;
  }

  function applyModelStyle(element, attributes) {
    if (Object.hasOwn(attributes, 'wikistyleBackgroundColor')) {
      setStyle(element, 'background-color', attributes.wikistyleBackgroundColor);
    }
    if (Object.hasOwn(attributes, 'wikistyleColor')) {
      setStyle(element, 'color', attributes.wikistyleColor);
    }
  }

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
        <input id="ws-ve-background-hex" class="ws-hex" type="text" value="#FFFFFF" maxlength="7" spellcheck="false" aria-label="Color de fondo hexadecimal">
        <button data-clear="backgroundColor">Sin fondo</button>
      </div>
      <label for="ws-ve-text">Color del texto</label>
      <div class="ws-color-row">
        <input id="ws-ve-text" type="color" value="#202122">
        <input id="ws-ve-text-hex" class="ws-hex" type="text" value="#202122" maxlength="7" spellcheck="false" aria-label="Color de texto hexadecimal">
        <button data-clear="color">Original</button>
      </div>
      <button class="ws-stripes-open" disabled>Configurar filas alternas…</button>
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
    bindLiveColor('#ws-ve-background', '#ws-ve-background-hex', 'backgroundColor');
    bindLiveColor('#ws-ve-text', '#ws-ve-text-hex', 'color');
    panel.querySelectorAll('[data-clear]').forEach((button) => {
      button.addEventListener('click', () => {
        const property = button.dataset.clear;
        previewSelection({ [property]: '' });
        commitSelection({ [property]: '' });
      });
    });
    panel.querySelector('.ws-stripes-open').addEventListener('click', showStripeDialog);

    statusTimer = setInterval(refreshSelectionStatus, 250);
    refreshSelectionStatus();
  }

  function bindLiveColor(pickerSelector, hexSelector, property) {
    const picker = panel.querySelector(pickerSelector);
    const hex = panel.querySelector(hexSelector);
    let interactionCells = [];

    function captureSelection() {
      interactionCells = getSelectedCells();
    }

    function previewAndSchedule(color) {
      const cells = interactionCells.length ? interactionCells : getSelectedCells();
      const change = { [property]: color };
      previewSelection(change, cells);
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => commitSelection(change, cells), 250);
    }

    picker.addEventListener('pointerdown', captureSelection);
    picker.addEventListener('focus', captureSelection);
    picker.addEventListener('input', () => {
      hex.value = picker.value.toUpperCase();
      hex.setAttribute('aria-invalid', 'false');
      previewAndSchedule(picker.value);
    });
    picker.addEventListener('change', () => {
      clearTimeout(commitTimer);
      commitSelection(
        { [property]: picker.value },
        interactionCells.length ? interactionCells : getSelectedCells()
      );
    });
    hex.addEventListener('pointerdown', captureSelection);
    hex.addEventListener('focus', captureSelection);
    hex.addEventListener('input', () => {
      const color = normalizeHex(hex.value);
      hex.setAttribute('aria-invalid', String(!color));
      if (!color) return;
      picker.value = color;
      previewAndSchedule(color);
    });
    hex.addEventListener('change', () => {
      const color = normalizeHex(hex.value);
      if (!color) return;
      hex.value = color.toUpperCase();
      clearTimeout(commitTimer);
      commitSelection(
        { [property]: color },
        interactionCells.length ? interactionCells : getSelectedCells()
      );
    });
    hex.addEventListener('blur', () => {
      const color = normalizeHex(hex.value);
      hex.value = (color || picker.value).toUpperCase();
      hex.setAttribute('aria-invalid', 'false');
    });
  }

  function normalizeHex(value) {
    const hex = value.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      return `#${[...hex].map((character) => character.repeat(2)).join('')}`.toLowerCase();
    }
    return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
  }

  function getWholeTableRows() {
    const surface = getSurface();
    if (!surface || !window.ve?.dm) return null;
    const surfaceModel = surface.getModel();
    const documentModel = surfaceModel.getDocument();
    const selection = surfaceModel.getSelection();
    if (!(selection instanceof window.ve.dm.TableSelection)) return null;

    const matrix = selection.getTableNode(documentModel).getMatrix();
    const rows = [];
    const allNodes = new Set();
    for (let rowIndex = 0; rowIndex < matrix.getRowCount(); rowIndex += 1) {
      const cells = [];
      const rowNodes = new Set();
      for (let columnIndex = 0; columnIndex < matrix.getColCount(rowIndex); columnIndex += 1) {
        const cell = matrix.getCell(rowIndex, columnIndex);
        if (!cell || cell.isPlaceholder?.() || rowNodes.has(cell.node)) continue;
        rowNodes.add(cell.node);
        allNodes.add(cell.node);
        cells.push(cell);
      }
      rows.push(cells);
    }

    const selectedNodes = new Set(selection.getMatrixCells(documentModel).map((cell) => cell.node));
    if (selectedNodes.size !== allNodes.size || ![...allNodes].every((node) => selectedNodes.has(node))) {
      return null;
    }
    return { rows };
  }

  function showStripeDialog() {
    const table = getWholeTableRows();
    const status = panel?.querySelector('.ws-status');
    if (!table) {
      if (status) status.textContent = 'Selecciona la tabla completa para configurar filas alternas.';
      return;
    }

    panel.querySelector('.ws-stripes-dialog')?.remove();
    const dialog = document.createElement('section');
    dialog.className = 'ws-stripes-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Colores de filas alternas');
    dialog.innerHTML = `
      <div class="ws-head"><strong>Filas alternas</strong><button class="ws-close" aria-label="Cerrar">×</button></div>
      <p class="ws-note">Las filas de encabezado conservarán su color actual.</p>
      <label for="ws-stripe-first">Primer color</label>
      <div class="ws-color-row">
        <input id="ws-stripe-first" type="color" value="#ffffff">
        <input id="ws-stripe-first-hex" class="ws-hex" type="text" value="#FFFFFF" maxlength="7" spellcheck="false" aria-label="Primer color hexadecimal">
      </div>
      <label for="ws-stripe-second">Segundo color</label>
      <div class="ws-color-row">
        <input id="ws-stripe-second" type="color" value="#efefef">
        <input id="ws-stripe-second-hex" class="ws-hex" type="text" value="#EFEFEF" maxlength="7" spellcheck="false" aria-label="Segundo color hexadecimal">
      </div>
      <div class="ws-actions">
        <button class="ws-stripes-cancel">Cancelar</button>
        <button class="ws-save ws-stripes-apply">Aplicar colores alternos</button>
      </div>`;
    panel.append(dialog);

    bindDialogColor(dialog, '#ws-stripe-first', '#ws-stripe-first-hex');
    bindDialogColor(dialog, '#ws-stripe-second', '#ws-stripe-second-hex');
    const close = () => dialog.remove();
    dialog.querySelector('.ws-close').addEventListener('click', close);
    dialog.querySelector('.ws-stripes-cancel').addEventListener('click', close);
    dialog.querySelector('.ws-stripes-apply').addEventListener('click', () => {
      applyAlternatingRows(table.rows, [
        dialog.querySelector('#ws-stripe-first').value,
        dialog.querySelector('#ws-stripe-second').value
      ]);
      close();
    });
  }

  function bindDialogColor(dialog, pickerSelector, hexSelector) {
    const picker = dialog.querySelector(pickerSelector);
    const hex = dialog.querySelector(hexSelector);
    picker.addEventListener('input', () => {
      hex.value = picker.value.toUpperCase();
      hex.setAttribute('aria-invalid', 'false');
    });
    hex.addEventListener('input', () => {
      const color = normalizeHex(hex.value);
      hex.setAttribute('aria-invalid', String(!color));
      if (color) picker.value = color;
    });
    hex.addEventListener('blur', () => {
      const color = normalizeHex(hex.value);
      hex.value = (color || picker.value).toUpperCase();
      hex.setAttribute('aria-invalid', 'false');
    });
  }

  function applyAlternatingRows(rows, colors) {
    const surface = getSurface();
    const status = panel?.querySelector('.ws-status');
    if (!surface) return;
    const surfaceModel = surface.getModel();
    const documentModel = surfaceModel.getDocument();
    const headerNodes = new Set(
      rows
        .filter((cells) => cells.length && cells.every((cell) => cell.node.getAttribute('style') === 'header'))
        .flatMap((cells) => cells.map((cell) => cell.node))
    );
    const dataRows = rows.filter(
      (cells) => cells.length && !cells.every((cell) => cell.node.getAttribute('style') === 'header')
    );
    const formattedNodes = new Set();
    const transactions = [];

    dataRows.forEach((cells, rowIndex) => {
      const color = colors[rowIndex % 2];
      cells.forEach((cell) => {
        if (headerNodes.has(cell.node) || formattedNodes.has(cell.node)) return;
        formattedNodes.add(cell.node);
        previewSelection({ backgroundColor: color }, [cell]);
        transactions.push(window.ve.dm.TransactionBuilder.static.newFromAttributeChanges(
          documentModel,
          cell.node.getOuterRange().start,
          { wikistyleBackgroundColor: color }
        ));
      });
    });

    try {
      surfaceModel.change(transactions);
      surfaceModel.breakpoint();
      if (status) status.textContent = `Colores alternos aplicados a ${dataRows.length} filas. Puedes deshacerlo con Ctrl+Z.`;
    } catch (error) {
      if (status) status.textContent = `No se pudieron aplicar los colores alternos: ${error.message}`;
    }
  }

  function refreshSelectionStatus() {
    if (!panel) return;
    const cells = getSelectedCells();
    panel.querySelector('.ws-selection').textContent = cells.length
      ? `${cells.length} ${cells.length === 1 ? 'celda seleccionada' : 'celdas seleccionadas'}`
      : 'Selecciona una celda, fila o columna en la tabla.';
    panel.querySelector('.ws-stripes-open').disabled = !getWholeTableRows();
  }

  function viewElementForNode(node) {
    for (const element of document.querySelectorAll('.ve-ce-tableCellNode')) {
      if (window.jQuery?.(element).data('view')?.getModel?.() === node) return element;
    }
    return null;
  }

  function previewSelection(changes, cells = getSelectedCells()) {
    for (const cell of cells) {
      const element = viewElementForNode(cell.node);
      if (!element) continue;
      for (const [property, value] of Object.entries(changes)) {
        if (value) element.style[property] = value;
        else element.style.removeProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
      }
    }
    refreshSelectionStatus();
  }

  function commitSelection(changes, cells = getSelectedCells()) {
    const surface = getSurface();
    const status = panel?.querySelector('.ws-status');
    if (!surface || !cells.length) {
      if (status) status.textContent = 'Selecciona primero una celda, fila o columna de la tabla.';
      return;
    }

    const surfaceModel = surface.getModel();
    const documentModel = surfaceModel.getDocument();
    const transactions = [];

    for (const cell of cells) {
      const offset = cell.node.getOuterRange().start;
      const attributes = {};
      if (Object.hasOwn(changes, 'textAlign')) {
        attributes.textAlign = changes.textAlign || undefined;
      }
      if (Object.hasOwn(changes, 'backgroundColor')) {
        attributes.wikistyleBackgroundColor = changes.backgroundColor;
      }
      if (Object.hasOwn(changes, 'color')) {
        attributes.wikistyleColor = changes.color;
      }
      transactions.push(window.ve.dm.TransactionBuilder.static.newFromAttributeChanges(
        documentModel,
        offset,
        attributes
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
