(() => {
  if (window.__wikiStyleVisualEditor) return;
  window.__wikiStyleVisualEditor = true;

  let panel = null;
  let statusTimer = null;
  let commitTimer = null;
  const managedStyles = {
    wikistyleBorderTop: 'border-top',
    wikistyleBorderRight: 'border-right',
    wikistyleBorderBottom: 'border-bottom',
    wikistyleBorderLeft: 'border-left',
    wikistylePaddingTop: 'padding-top',
    wikistylePaddingRight: 'padding-right',
    wikistylePaddingBottom: 'padding-bottom',
    wikistylePaddingLeft: 'padding-left'
  };

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
    const converterClass = window.ve?.dm?.DomFromModelConverter;
    if (!dmClass || !ceClass || !converterClass || dmClass.static.__wikiStylePatched) return;

    const originalToDataElement = dmClass.static.toDataElement;
    dmClass.static.toDataElement = function (domElements, ...args) {
      const dataElement = originalToDataElement.call(this, domElements, ...args);
      const style = domElements[0]?.style;
      const backgroundColor = domElements[0]?.getAttribute('bgcolor') || style?.backgroundColor;
      if (backgroundColor) {
        dataElement.attributes.wikistyleBackgroundColor = backgroundToHex(backgroundColor);
      }
      if (style?.color) {
        dataElement.attributes.wikistyleColor = style.color;
      }
      for (const [attribute, property] of Object.entries(managedStyles)) {
        const value = style?.getPropertyValue(property);
        if (value) dataElement.attributes[attribute] = value;
      }
      const width = domElements[0]?.getAttribute('width');
      if (width) dataElement.attributes.wikistyleWidth = width;
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
      if (dataElement.attributes?.wikistyleNukeStyles) nukeSerializedElement(domCell);
      return domElements;
    };

    [
      window.ve.dm.TableNode,
      window.ve.dm.TableSectionNode,
      window.ve.dm.TableRowNode,
      window.ve.dm.TableCaptionNode
    ].filter(Boolean).forEach((nodeClass) => {
      const originalToDom = nodeClass.static.toDomElements;
      if (typeof originalToDom !== 'function' || nodeClass.static.__wikiStyleNukePatched) return;
      nodeClass.static.toDomElements = function (dataElement, doc, ...args) {
        const elements = originalToDom.call(this, dataElement, doc, ...args);
        if (dataElement.attributes?.wikistyleNukeStyles) {
          elements.forEach(nukeSerializedElement);
        }
        return elements;
      };
      nodeClass.static.__wikiStyleNukePatched = true;
    });

    const originalUpdateStyles = ceClass.static.updateStyles;
    ceClass.static.updateStyles = function ($element, model) {
      originalUpdateStyles.call(this, $element, model);
      const backgroundColor = model.getAttribute('wikistyleBackgroundColor');
      const color = model.getAttribute('wikistyleColor');
      if (backgroundColor !== undefined) setCellBackground($element[0], backgroundColor);
      if (color !== undefined) setStyle($element[0], 'color', color);
      for (const [attribute, property] of Object.entries(managedStyles)) {
        const value = model.getAttribute(attribute);
        if (value !== undefined) setManagedStyle($element[0], property, value);
      }
      const width = model.getAttribute('wikistyleWidth');
      if (width !== undefined) setCellWidth($element[0], width);
    };

    const originalAttributeChange = ceClass.prototype.onAttributeChange;
    ceClass.prototype.onAttributeChange = function (key, from, to) {
      originalAttributeChange.call(this, key, from, to);
      const original = to === undefined ? this.model.getOriginalDomElements?.()[0] : null;
      if (key === 'wikistyleBackgroundColor') {
        if (original) restoreBackground(this.$element[0], original);
        else setCellBackground(this.$element[0], to);
      }
      if (key === 'wikistyleColor') {
        setStyle(this.$element[0], 'color', original?.style?.color || to);
      }
      if (managedStyles[key]) {
        setManagedStyle(this.$element[0], managedStyles[key], original?.style?.getPropertyValue(managedStyles[key]) || to);
      }
      if (key === 'wikistyleWidth') {
        setCellWidth(this.$element[0], original?.getAttribute?.('width') || to);
      }
    };

    const originalRenderAttributes = converterClass.static.renderHtmlAttributeList;
    converterClass.static.renderHtmlAttributeList = function (originalElements, targetElements, ...args) {
      const preparedOriginals = Array.from(originalElements, (original, index) => {
        const target = targetElements[index];
        const properties = target?.__wikiStyleHandledProperties || [];
        if (
          !target?.__wikiStyleBackgroundHandled &&
          !target?.__wikiStyleWidthHandled &&
          !target?.__wikiStyleNukeStyles &&
          !properties.length
        ) {
          return original;
        }
        const clone = original.cloneNode(true);
        if (target.__wikiStyleNukeStyles) nukeSerializedElement(clone);
        if (target.__wikiStyleBackgroundHandled) {
          clone.removeAttribute?.('bgcolor');
          clone.style?.removeProperty('background-color');
        }
        if (target.__wikiStyleWidthHandled) clone.removeAttribute?.('width');
        properties.forEach((property) => clone.style?.removeProperty(property));
        if (clone.style && !clone.getAttribute('style')) clone.removeAttribute('style');
        return clone;
      });
      const result = originalRenderAttributes.call(this, preparedOriginals, targetElements, ...args);
      Array.from(targetElements).forEach((target) => {
        if (target.__wikiStyleNukeStyles) nukeSerializedElement(target);
        if (target.getAttribute?.('style')?.trim() === '') target.removeAttribute('style');
      });
      return result;
    };

    dmClass.static.__wikiStylePatched = true;
  }

  function applyModelStyle(element, attributes) {
    if (Object.hasOwn(attributes, 'wikistyleBackgroundColor')) {
      setCellBackground(element, attributes.wikistyleBackgroundColor);
    }
    if (Object.hasOwn(attributes, 'wikistyleColor')) {
      setStyle(element, 'color', attributes.wikistyleColor);
    }
    for (const [attribute, property] of Object.entries(managedStyles)) {
      if (Object.hasOwn(attributes, attribute)) setManagedStyle(element, property, attributes[attribute]);
    }
    if (Object.hasOwn(attributes, 'wikistyleWidth')) {
      setCellWidth(element, attributes.wikistyleWidth);
    }
  }

  function nukeSerializedElement(element) {
    [
      'style', 'class', 'bgcolor', 'width', 'height', 'align', 'valign',
      'border', 'bordercolor', 'cellpadding', 'cellspacing', 'rules', 'frame'
    ].forEach((attribute) => element.removeAttribute?.(attribute));
    element.__wikiStyleNukeStyles = true;
  }

  function setManagedStyle(element, property, value) {
    element.__wikiStyleHandledProperties ||= [];
    if (!element.__wikiStyleHandledProperties.includes(property)) {
      element.__wikiStyleHandledProperties.push(property);
    }
    setStyle(element, property, value);
  }

  function setCellWidth(element, value) {
    element.__wikiStyleWidthHandled = true;
    if (value) element.setAttribute('width', value);
    else element.removeAttribute('width');
  }

  function setCellBackground(element, value) {
    element.__wikiStyleBackgroundHandled = true;
    element.style.removeProperty('background-color');
    if (!element.getAttribute('style')) element.removeAttribute('style');
    const hex = backgroundToHex(value);
    if (hex) element.setAttribute('bgcolor', hex);
    else element.removeAttribute('bgcolor');
  }

  function restoreBackground(element, original) {
    element.style.removeProperty('background-color');
    element.removeAttribute('bgcolor');
    if (original.style?.backgroundColor) {
      element.style.backgroundColor = original.style.backgroundColor;
    }
    if (original.hasAttribute?.('bgcolor')) {
      element.setAttribute('bgcolor', original.getAttribute('bgcolor'));
    }
    if (!element.getAttribute('style')) element.removeAttribute('style');
  }

  function backgroundToHex(value) {
    if (!value) return null;
    const normalized = normalizeHex(String(value));
    if (normalized) return normalized.toUpperCase();
    const channels = String(value).match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
    if (!channels) return null;
    return `#${channels.slice(1, 4).map((channel) =>
      Math.min(255, Number(channel)).toString(16).padStart(2, '0')
    ).join('')}`.toUpperCase();
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
      <label>Alineación vertical</label>
      <div class="ws-align ws-vertical-align">
        <button data-valign="top" aria-pressed="false">Arriba</button>
        <button data-valign="middle" aria-pressed="false">Centro</button>
        <button data-valign="bottom" aria-pressed="false">Abajo</button>
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
      <button class="ws-layout-open" disabled>Contorno, bordes y padding…</button>
      <button class="ws-width-open" disabled>Ancho de columna…</button>
      <button class="ws-reset-table" disabled>Resetear tabla</button>
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
    panel.querySelectorAll('[data-valign]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.valign;
        previewSelection({ verticalAlign: value });
        commitSelection({ verticalAlign: value });
        panel.querySelectorAll('[data-valign]').forEach((item) =>
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
    panel.querySelector('.ws-layout-open').addEventListener('click', showLayoutDialog);
    panel.querySelector('.ws-width-open').addEventListener('click', showWidthDialog);
    panel.querySelector('.ws-reset-table').addEventListener('click', resetWholeTable);

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

  function getSelectedColumnCells() {
    const surface = getSurface();
    if (!surface || !window.ve?.dm) return [];
    const surfaceModel = surface.getModel();
    const documentModel = surfaceModel.getDocument();
    const selection = surfaceModel.getSelection();
    if (
      !(selection instanceof window.ve.dm.TableSelection) ||
      !selection.isFullCol(documentModel) ||
      selection.getColCount() !== 1
    ) {
      return [];
    }
    const matrix = selection.getTableNode(documentModel).getMatrix();
    const columnIndex = selection.startCol;
    const cells = [];
    const nodes = new Set();
    for (let rowIndex = 0; rowIndex < matrix.getRowCount(); rowIndex += 1) {
      const cell = matrix.getCell(rowIndex, columnIndex);
      if (
        !cell ||
        cell.isPlaceholder?.() ||
        cell.node.getColspan() !== 1 ||
        nodes.has(cell.node)
      ) {
        continue;
      }
      nodes.add(cell.node);
      cells.push(cell);
    }
    return cells;
  }

  function showLayoutDialog() {
    const cells = getSelectedCells();
    const status = panel?.querySelector('.ws-status');
    if (!cells.length) {
      if (status) status.textContent = 'Selecciona celdas de una tabla para editar su formato.';
      return;
    }

    panel.querySelector('.ws-layout-dialog')?.remove();
    const dialog = document.createElement('section');
    dialog.className = 'ws-layout-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Contorno, bordes y padding');
    dialog.innerHTML = `
      <div class="ws-head"><strong>Bordes y espacio</strong><button class="ws-close" aria-label="Cerrar">×</button></div>
      ${borderControls('outer', 'Contorno exterior')}
      ${borderControls('inner', 'Bordes interiores')}
      <fieldset class="ws-format-group ws-padding-group">
        <legend>Padding de las celdas</legend>
        ${sideInputs('padding', 0)}
        <label class="ws-link-sides"><input type="checkbox" data-link="padding" checked> Mismo valor en los cuatro lados</label>
        <button class="ws-section-apply" data-apply-section="padding">Aplicar padding</button>
      </fieldset>
      <div class="ws-actions">
        <button class="ws-layout-close">Cerrar</button>
        <button class="ws-reset-layout">Restablecer bordes y padding</button>
      </div>`;
    panel.append(dialog);

    ['outer', 'inner'].forEach((prefix) => {
      bindDialogColor(dialog, `#ws-${prefix}-color`, `#ws-${prefix}-color-hex`);
      bindSideLink(dialog, prefix);
    });
    bindSideLink(dialog, 'padding');

    const close = () => dialog.remove();
    dialog.querySelector('.ws-close').addEventListener('click', close);
    dialog.querySelector('.ws-layout-close').addEventListener('click', close);
    dialog.querySelector('[data-apply-section="outer"]').addEventListener('click', () => {
      applyBorderSection(cells, readBorder(dialog, 'outer'), 'outer');
    });
    dialog.querySelector('[data-apply-section="inner"]').addEventListener('click', () => {
      applyBorderSection(cells, readBorder(dialog, 'inner'), 'inner');
    });
    dialog.querySelector('[data-apply-section="padding"]').addEventListener('click', () => {
      applyPaddingSection(cells, readSides(dialog, 'padding'));
    });
    dialog.querySelector('.ws-reset-layout').addEventListener('click', () => {
      resetLayoutStyles(cells);
      close();
    });
  }

  function showWidthDialog() {
    const cells = getSelectedColumnCells();
    const status = panel?.querySelector('.ws-status');
    if (!cells.length) {
      if (status) status.textContent = 'Selecciona una única columna completa para establecer su ancho.';
      return;
    }

    panel.querySelector('.ws-width-dialog')?.remove();
    const dialog = document.createElement('section');
    dialog.className = 'ws-width-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Ancho de columna');
    dialog.innerHTML = `
      <div class="ws-head"><strong>Ancho de columna</strong><button class="ws-close" aria-label="Cerrar">×</button></div>
      <p class="ws-note">El ancho se aplicará únicamente a la columna seleccionada. Las celdas con colspan se omiten.</p>
      <label for="ws-column-width">Ancho</label>
      <div class="ws-width-row">
        <input id="ws-column-width" class="ws-number" type="number" min="1" max="100" step="0.1" placeholder="10" data-column-width>
        <span>%</span>
      </div>
      <div class="ws-actions">
        <button class="ws-width-cancel">Cancelar</button>
        <button class="ws-save ws-column-apply">Aplicar ancho</button>
      </div>`;
    panel.append(dialog);

    const close = () => dialog.remove();
    dialog.querySelector('.ws-close').addEventListener('click', close);
    dialog.querySelector('.ws-width-cancel').addEventListener('click', close);
    dialog.querySelector('.ws-column-apply').addEventListener('click', () => {
      const input = dialog.querySelector('[data-column-width]');
      const width = Number(input.value);
      if (!Number.isFinite(width) || width < 1 || width > 100) {
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      input.setAttribute('aria-invalid', 'false');
      applyColumnWidth(cells, width);
      close();
    });
  }

  function borderControls(prefix, title) {
    return `
      <fieldset class="ws-format-group">
        <legend>${title}</legend>
        ${sideInputs(prefix, 1)}
        <label class="ws-link-sides"><input type="checkbox" data-link="${prefix}" checked> Mismo grosor en los cuatro lados</label>
        <label for="ws-${prefix}-style">Estilo</label>
        <select id="ws-${prefix}-style" class="ws-select">
          <option value="solid">Sólido</option>
          <option value="dashed">Discontinuo</option>
          <option value="dotted">Punteado</option>
          <option value="double">Doble</option>
          <option value="none">Sin borde</option>
        </select>
        <label for="ws-${prefix}-color">Color</label>
        <div class="ws-color-row">
          <input id="ws-${prefix}-color" type="color" value="#a2a9b1">
          <input id="ws-${prefix}-color-hex" class="ws-hex" type="text" value="#A2A9B1" maxlength="7" spellcheck="false" aria-label="Color hexadecimal de ${title.toLowerCase()}">
        </div>
        <button class="ws-section-apply" data-apply-section="${prefix}">Aplicar ${prefix === 'outer' ? 'contorno' : 'bordes interiores'}</button>
      </fieldset>`;
  }

  function sideInputs(prefix, initialValue) {
    return `
      <div class="ws-four-sides">
        ${['top', 'right', 'bottom', 'left'].map((side) => `
          <label>${{ top: 'Arriba', right: 'Derecha', bottom: 'Abajo', left: 'Izquierda' }[side]}
            <span><input class="ws-number" type="number" min="0" step="0.1" value="${initialValue}" data-side-group="${prefix}" data-side="${side}"> px</span>
          </label>`).join('')}
      </div>`;
  }

  function bindSideLink(dialog, prefix) {
    const inputs = [...dialog.querySelectorAll(`[data-side-group="${prefix}"]`)];
    const link = dialog.querySelector(`[data-link="${prefix}"]`);
    inputs.forEach((input) => {
      input.addEventListener('input', () => {
        if (link.checked) inputs.forEach((item) => { if (item !== input) item.value = input.value; });
      });
    });
  }

  function readSides(dialog, prefix) {
    return Object.fromEntries(['top', 'right', 'bottom', 'left'].map((side) => {
      const value = Number(dialog.querySelector(`[data-side-group="${prefix}"][data-side="${side}"]`).value);
      return [side, Number.isFinite(value) && value >= 0 ? value : 0];
    }));
  }

  function readBorder(dialog, prefix) {
    return {
      widths: readSides(dialog, prefix),
      style: dialog.querySelector(`#ws-${prefix}-style`).value,
      color: dialog.querySelector(`#ws-${prefix}-color`).value.toUpperCase()
    };
  }

  function getCellGeometry(cells) {
    const rows = cells.map((cell) => ({
      cell,
      top: cell.row,
      right: cell.col + cell.node.getColspan() - 1,
      bottom: cell.row + cell.node.getRowspan() - 1,
      left: cell.col
    }));
    const bounds = {
      top: Math.min(...rows.map((item) => item.top)),
      right: Math.max(...rows.map((item) => item.right)),
      bottom: Math.max(...rows.map((item) => item.bottom)),
      left: Math.min(...rows.map((item) => item.left))
    };
    return { rows, bounds };
  }

  function applyBorderSection(cells, border, mode) {
    const { rows, bounds } = getCellGeometry(cells);
    const entries = rows.map((item) => {
      const attributes = {};
      ['top', 'right', 'bottom', 'left'].forEach((side) => {
        const isOuter = item[side] === bounds[side];
        if ((mode === 'outer') !== isOuter) return;
        const name = `wikistyleBorder${side[0].toUpperCase()}${side.slice(1)}`;
        attributes[name] = `${border.widths[side]}px ${border.style} ${border.color}`;
      });
      return { cell: item.cell, attributes };
    }).filter((entry) => Object.keys(entry.attributes).length);
    const label = mode === 'outer' ? 'Contorno exterior' : 'Bordes interiores';
    commitCellAttributes(entries, `${label} aplicado a la selección.`);
  }

  function applyPaddingSection(cells, padding) {
    const entries = cells.map((cell) => ({
      cell,
      attributes: Object.fromEntries(['top', 'right', 'bottom', 'left'].map((side) => [
        `wikistylePadding${side[0].toUpperCase()}${side.slice(1)}`,
        `${padding[side]}px`
      ]))
    }));
    commitCellAttributes(entries, `Padding aplicado a ${cells.length} ${cells.length === 1 ? 'celda' : 'celdas'}.`);
  }

  function resetLayoutStyles(cells) {
    const attributes = Object.fromEntries(Object.keys(managedStyles).map((name) => [name, undefined]));
    const entries = cells.map((cell) => ({ cell, attributes }));
    commitCellAttributes(entries, 'Contorno, bordes y padding restablecidos.');
    restoreManagedPreview(cells);
  }

  function restoreManagedPreview(cells) {
    cells.forEach((cell) => {
      const element = viewElementForNode(cell.node);
      const original = cell.node.getOriginalDomElements?.()[0];
      if (!element) return;
      Object.values(managedStyles).forEach((property) => {
        setStyle(element, property, original?.style?.getPropertyValue(property) || '');
      });
    });
  }

  function resetWholeTable() {
    const table = getWholeTableRows();
    const surface = getSurface();
    const status = panel?.querySelector('.ws-status');
    if (!table || !surface) {
      if (status) status.textContent = 'Selecciona la tabla completa para restablecerla.';
      return;
    }
    const surfaceModel = surface.getModel();
    const documentModel = surfaceModel.getDocument();
    const selection = surfaceModel.getSelection();
    const nodes = [];
    const collect = (node) => {
      nodes.push(node);
      if (node instanceof window.ve.dm.TableCellNode) return;
      (node.children || node.getChildren?.() || []).forEach(collect);
    };
    collect(selection.getTableNode(documentModel));

    const entries = nodes.map((node) => ({
      node,
      attributes: node instanceof window.ve.dm.TableCellNode
        ? {
          ...Object.fromEntries(Object.keys(managedStyles).map((name) => [name, undefined])),
          wikistyleBackgroundColor: undefined,
          wikistyleColor: undefined,
          wikistyleWidth: undefined,
          wikistyleNukeStyles: true,
          align: undefined,
          valign: undefined,
          textAlign: undefined,
          verticalAlign: undefined
        }
        : { wikistyleNukeStyles: true }
    }));
    commitModelAttributes(entries, 'Tabla completamente desprovista de estilos.');
    nodes.forEach((node) => nukeViewElement(viewElementForModelNode(node)));
  }

  function nukeViewElement(element) {
    if (!element) return;
    element.removeAttribute('style');
    [
      'bgcolor', 'width', 'height', 'align', 'valign', 'border', 'bordercolor',
      'cellpadding', 'cellspacing', 'rules', 'frame'
    ].forEach((attribute) => element.removeAttribute(attribute));
    const interfaceClasses = [...element.classList].filter(
      (name) => name.startsWith('ve-') || name.startsWith('oo-ui-')
    );
    element.className = interfaceClasses.join(' ');
  }

  function applyColumnWidth(cells, width) {
    const entries = cells.map((cell) => ({ cell, attributes: { wikistyleWidth: `${width}%` } }));
    commitCellAttributes(entries, `Ancho del ${width}% aplicado a ${cells.length} ${cells.length === 1 ? 'celda' : 'celdas'} de la columna.`);
  }

  function commitCellAttributes(entries, message) {
    commitModelAttributes(
      entries.map(({ cell, attributes }) => ({ node: cell.node, attributes })),
      message
    );
  }

  function commitModelAttributes(entries, message) {
    const surface = getSurface();
    const status = panel?.querySelector('.ws-status');
    if (!surface || !entries.length) return;
    const surfaceModel = surface.getModel();
    const documentModel = surfaceModel.getDocument();
    const transactions = entries.map(({ node, attributes }) =>
      window.ve.dm.TransactionBuilder.static.newFromAttributeChanges(
        documentModel,
        node.getOuterRange().start,
        attributes
      )
    );
    try {
      surfaceModel.change(transactions);
      surfaceModel.breakpoint();
      if (status) status.textContent = `${message} Puedes deshacerlo con Ctrl+Z.`;
    } catch (error) {
      if (status) status.textContent = `No se pudo aplicar el formato: ${error.message}`;
    }
  }

  function refreshSelectionStatus() {
    if (!panel) return;
    const cells = getSelectedCells();
    panel.querySelector('.ws-selection').textContent = cells.length
      ? `${cells.length} ${cells.length === 1 ? 'celda seleccionada' : 'celdas seleccionadas'}`
      : 'Selecciona una celda, fila o columna en la tabla.';
    panel.querySelector('.ws-stripes-open').disabled = !getWholeTableRows();
    panel.querySelector('.ws-layout-open').disabled = !cells.length;
    panel.querySelector('.ws-width-open').disabled = !getSelectedColumnCells().length;
    panel.querySelector('.ws-reset-table').disabled = !getWholeTableRows();
  }

  function viewElementForNode(node) {
    for (const element of document.querySelectorAll('.ve-ce-tableCellNode')) {
      if (window.jQuery?.(element).data('view')?.getModel?.() === node) return element;
    }
    return null;
  }

  function viewElementForModelNode(node) {
    for (const element of document.querySelectorAll(
      '.ve-ce-tableNode, .ve-ce-tableSectionNode, .ve-ce-tableRowNode, .ve-ce-tableCaptionNode, .ve-ce-tableCellNode'
    )) {
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
      if (Object.hasOwn(changes, 'verticalAlign')) {
        attributes.valign = changes.verticalAlign || undefined;
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
