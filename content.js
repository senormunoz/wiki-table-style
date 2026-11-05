(() => {
  const STORE_PREFIX = 'wikistyle:';
  const pageKey = `${STORE_PREFIX}${location.origin}${location.pathname}`;
  let selecting = false;
  let hovered = null;
  let selected = null;
  let draft = null;

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
    selected = event.target;
    selected.classList.remove('wikistyle-hover');
    stopSelecting();
    showEditor();
  }

  function startSelecting() {
    closeEditor(false);
    if (selecting) return;
    selecting = true;
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('click', onSelect, true);
  }

  function closeEditor(revert = true) {
    if (revert && selected && draft) applyStyle(selected, draft);
    document.querySelector('#wikistyle-editor')?.remove();
    selected = null;
    draft = null;
  }

  function showEditor() {
    document.querySelector('#wikistyle-editor')?.remove();
    draft = {
      textAlign: selected.style.textAlign,
      backgroundColor: selected.style.backgroundColor
    };

    const computed = getComputedStyle(selected);
    const panel = document.createElement('section');
    panel.id = 'wikistyle-editor';
    panel.setAttribute('aria-label', 'Editor de estilo de WikiStyle');
    panel.innerHTML = `
      <div class="ws-head"><strong>Editar elemento</strong><button class="ws-close" aria-label="Cerrar">×</button></div>
      <label>Alineación</label>
      <div class="ws-align">
        <button data-align="left">Izquierda</button>
        <button data-align="center">Centro</button>
        <button data-align="right">Derecha</button>
      </div>
      <label for="ws-color">Color de fondo</label>
      <input id="ws-color" type="color" value="${rgbToHex(computed.backgroundColor)}">
      <div class="ws-actions">
        <button class="ws-clear">Quitar estilo</button>
        <button class="ws-save">Guardar</button>
      </div>
      <p class="ws-note">Los cambios solo se guardan en este navegador.</p>`;
    document.documentElement.append(panel);

    panel.querySelectorAll('[data-align]').forEach((button) => {
      button.setAttribute('aria-pressed', String(computed.textAlign === button.dataset.align));
      button.addEventListener('click', () => {
        selected.style.textAlign = button.dataset.align;
        panel.querySelectorAll('[data-align]').forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button))
        );
      });
    });
    panel.querySelector('#ws-color').addEventListener('input', (event) => {
      selected.style.backgroundColor = event.target.value;
    });
    panel.querySelector('.ws-close').addEventListener('click', () => closeEditor());
    panel.querySelector('.ws-clear').addEventListener('click', clearSelected);
    panel.querySelector('.ws-save').addEventListener('click', saveSelected);
  }

  function rgbToHex(color) {
    const values = color.match(/\d+/g);
    if (!values || values.length < 3 || Number(values[3]) === 0) return '#ffffff';
    return `#${values.slice(0, 3).map((value) => Number(value).toString(16).padStart(2, '0')).join('')}`;
  }

  async function saveSelected() {
    const changes = await getChanges();
    changes[selectorFor(selected)] = {
      textAlign: selected.style.textAlign,
      backgroundColor: selected.style.backgroundColor
    };
    await setChanges(changes);
    closeEditor(false);
  }

  async function clearSelected() {
    const selector = selectorFor(selected);
    applyStyle(selected, { textAlign: '', backgroundColor: '' });
    const changes = await getChanges();
    delete changes[selector];
    await setChanges(changes);
    closeEditor(false);
  }

  async function resetPage() {
    const changes = await getChanges();
    for (const selector of Object.keys(changes)) {
      try {
        const element = document.querySelector(selector);
        if (element) applyStyle(element, { textAlign: '', backgroundColor: '' });
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
