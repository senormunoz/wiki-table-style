const status = document.querySelector('#status');

async function send(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('wikipedia.org/')) {
    throw new Error('Abre una página de Wikipedia para usar Wiki Table Style.');
  }
  return chrome.tabs.sendMessage(tab.id, message);
}

document.querySelector('#select').addEventListener('click', async () => {
  try {
    await send({ type: 'START_SELECTING' });
    window.close();
  } catch (error) {
    status.textContent = error.message;
  }
});

document.querySelector('#reset').addEventListener('click', async () => {
  try {
    const result = await send({ type: 'RESET_PAGE' });
    status.textContent = result?.count
      ? `Se han restablecido ${result.count} cambios.`
      : 'Esta página no tenía cambios.';
  } catch (error) {
    status.textContent = error.message;
  }
});
