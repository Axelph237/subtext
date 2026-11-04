// Runs in the isolated world, because the MAIN-world script cannot reach chrome.runtime.
import { TAG } from './protocol.js';

function reply(id, result) {
  window.postMessage({ tag: TAG, id, result }, location.origin);
}

async function forward(request) {
  let result;
  try {
    result = await chrome.runtime.sendMessage(request);
  } catch (error) {
    result = { ok: false, error: `SubTeXt is unavailable (${error.message}). Reload the page.` };
  }
  reply(request.id, result);
}

window.addEventListener('message', (event) => {
  const request = event.data;
  if (event.source !== window || request?.tag !== TAG || typeof request.method !== 'string') return;
  forward(request);
  // A settings request stays subscribed, so a delimiter changed in the options page applies without a reload.
  if (request.method === 'settings') chrome.storage.onChanged.addListener(() => forward(request));
});
