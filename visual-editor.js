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

    statusTimer = setInterval(refreshSelectionStatus, 250);
    refreshSelectionStatus();
  }

  function bindLiveColor(pickerSelector, hexSelector, property) {
    const picker = panel.querySelector(pickerSelector);
    const hex = panel.querySelector(hexSelector);

    function previewAndSchedule(color) {
      const change = { [property]: color };
      previewSelection(change);
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => commitSelection(change), 250);
    }

    picker.addEventListener('input', () => {
      hex.value = picker.value.toUpperCase();
      hex.setAttribute('aria-invalid', 'false');
      previewAndSchedule(picker.value);
    });
    picker.addEventListener('change', () => {
      clearTimeout(commitTimer);
      commitSelection({ [property]: picker.value });
    });
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
      commitSelection({ [property]: color });
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
