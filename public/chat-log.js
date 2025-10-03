const consoleElement = document.getElementById('chat-console');
const statusElement = document.getElementById('chat-status');
const connectionChip = document.getElementById('chat-connection-chip');
const sendForm = document.getElementById('chat-send-form');
const messageInput = document.getElementById('chat-message');
const usernameInput = document.getElementById('chat-username');
const sendButton = document.getElementById('send-button');
const reloadIdentityButton = document.getElementById('reload-identity');
const clearButton = document.getElementById('clear-log');
const previewButton = document.getElementById('preview-test');
const identityLabel = document.getElementById('chat-identity');

const seenEntryIds = new Set();
let emptyStateElement = null;
let currentIdentity = '';
let eventSource = null;
let connectionState = 'disconnected';

const timeFormatter = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

function ensureEmptyState() {
  if (!consoleElement) {
    return;
  }

  if (!consoleElement.childElementCount) {
    if (!emptyStateElement) {
      emptyStateElement = document.createElement('p');
      emptyStateElement.className = 'console-empty-state';
      emptyStateElement.textContent = 'Warte auf eingehende Nachrichten …';
    }
    consoleElement.appendChild(emptyStateElement);
  } else if (emptyStateElement && emptyStateElement.parentElement === consoleElement) {
    consoleElement.removeChild(emptyStateElement);
  }
}

function setStatus(message, tone = 'info') {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message;
  statusElement.dataset.tone = tone;
}

function updateConnectionChip(state) {
  connectionState = state;
  const classList = connectionChip.classList;
  classList.remove('status-chip--connected', 'status-chip--reconnecting', 'status-chip--disconnected');

  switch (state) {
    case 'connected':
      classList.add('status-chip--connected');
      connectionChip.textContent = 'Live';
      consoleElement?.setAttribute('aria-busy', 'false');
      break;
    case 'reconnecting':
      classList.add('status-chip--reconnecting');
      connectionChip.textContent = 'Neu verbinden…';
      consoleElement?.setAttribute('aria-busy', 'true');
      break;
    default:
      classList.add('status-chip--disconnected');
      connectionChip.textContent = 'Offline';
      consoleElement?.setAttribute('aria-busy', 'true');
  }
}

function renderEntry(entry) {
  if (!entry || !entry.id || seenEntryIds.has(entry.id)) {
    return;
  }

  seenEntryIds.add(entry.id);
  if (emptyStateElement?.parentElement === consoleElement) {
    consoleElement.removeChild(emptyStateElement);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'console-line';
  if (entry.direction) {
    wrapper.classList.add(`console-line--${entry.direction}`);
  }

  const meta = document.createElement('span');
  meta.className = 'console-line__meta';
  const icon = entry.direction === 'outgoing' ? '⇢' : entry.direction === 'incoming' ? '⇠' : '•';
  const transportLabel = entry.transport ? `@${entry.transport}` : '';
  meta.textContent = `[${timeFormatter.format(new Date(entry.timestamp))}] ${icon} ${
    entry.username || 'Unbekannt'
  } ${transportLabel}`.trim();

  const message = document.createElement('span');
  message.className = 'console-line__message';
  message.textContent = entry.message || '';

  wrapper.append(meta, message);
  consoleElement.appendChild(wrapper);
  consoleElement.scrollTo({ top: consoleElement.scrollHeight, behavior: 'smooth' });
}

async function loadIdentity() {
  try {
    setStatus('Lade Twitch Konfiguration …', 'info');
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error('Konfiguration nicht erreichbar');
    }
    const config = await response.json();
    const username = config?.twitch?.username?.trim();
    currentIdentity = username || '';
    usernameInput.value = currentIdentity;

    if (currentIdentity) {
      identityLabel.textContent = currentIdentity;
      sendButton.disabled = false;
      messageInput.disabled = false;
      setStatus(`Sende als ${currentIdentity}.`, 'success');
    } else {
      identityLabel.textContent = 'Bitte Benutzername in der Konfiguration hinterlegen';
      sendButton.disabled = true;
      messageInput.disabled = true;
      setStatus('Kein Twitch Benutzer gefunden. Bitte Konfiguration prüfen.', 'error');
    }
  } catch (error) {
    console.error('Failed to load identity', error);
    identityLabel.textContent = 'Konfiguration konnte nicht geladen werden';
    sendButton.disabled = true;
    messageInput.disabled = true;
    setStatus(`Konfiguration konnte nicht geladen werden: ${error.message}`, 'error');
  }
}

function connectToStream() {
  if (eventSource) {
    eventSource.close();
  }

  ensureEmptyState();
  updateConnectionChip('reconnecting');
  setStatus('Verbinde mit dem Chat Stream …', 'info');

  eventSource = new EventSource('/api/chat/stream');

  eventSource.onopen = () => {
    const wasConnected = connectionState === 'connected';
    updateConnectionChip('connected');
    if (!wasConnected) {
      setStatus('Mit dem Chat Stream verbunden.', 'success');
    }
  };

  eventSource.addEventListener('message', event => {
    try {
      const payload = JSON.parse(event.data);
      renderEntry(payload);
    } catch (error) {
      console.error('Failed to parse chat entry', error);
    }
  });

  eventSource.addEventListener('clear', () => {
    seenEntryIds.clear();
    consoleElement.innerHTML = '';
    ensureEmptyState();
    setStatus('Konsole geleert.', 'info');
  });

  eventSource.onerror = () => {
    updateConnectionChip('reconnecting');
    setStatus('Verbindung unterbrochen – erneuter Versuch in Kürze …', 'error');
  };
}

async function postChatMessage(payload) {
  const response = await fetch('/api/chat/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ message: 'Unbekannter Fehler' }));
    throw new Error(errorPayload.message || 'Fehler beim Senden');
  }

  return response.json();
}

sendForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentIdentity) {
    setStatus('Bitte konfiguriere zuerst einen Twitch Benutzer.', 'error');
    return;
  }

  const message = messageInput.value.trim();
  if (!message) {
    return;
  }

  try {
    sendButton.disabled = true;
    setStatus('Sende Nachricht …', 'info');
    await postChatMessage({
      username: currentIdentity,
      message,
      direction: 'outgoing',
      transport: 'twitch'
    });
    messageInput.value = '';
    setStatus('Nachricht an den Chat übermittelt (lokales Protokoll).', 'success');
  } catch (error) {
    console.error('Failed to send chat message', error);
    setStatus(`Fehler beim Senden: ${error.message}`, 'error');
  } finally {
    sendButton.disabled = !currentIdentity;
    messageInput.disabled = !currentIdentity;
    if (currentIdentity) {
      messageInput.focus();
    }
  }
});

clearButton.addEventListener('click', async () => {
  try {
    setStatus('Leere Konsole …', 'info');
    const response = await fetch('/api/chat', { method: 'DELETE' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: 'Unbekannter Fehler' }));
      throw new Error(payload.message || 'Fehler beim Bereinigen');
    }
  } catch (error) {
    console.error('Failed to clear chat', error);
    setStatus(`Konsole konnte nicht geleert werden: ${error.message}`, 'error');
  }
});

reloadIdentityButton.addEventListener('click', () => {
  loadIdentity();
});

previewButton.addEventListener('click', async () => {
  const viewerNames = ['pixelpioneer', 'streamqueen', 'craftmaster', 'redstoner'];
  const sampleMessages = [
    'Hey, wann startet das Event?',
    'GG! Das war mega gut!',
    'Kannst du den Seed teilen?',
    'Reminder: Hydration break!'
  ];
  const username = viewerNames[Math.floor(Math.random() * viewerNames.length)];
  const message = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];

  try {
    setStatus('Füge Testeintrag hinzu …', 'info');
    await postChatMessage({
      username,
      message,
      direction: 'incoming',
      transport: 'simulation'
    });
    setStatus('Testeintrag erstellt.', 'success');
  } catch (error) {
    console.error('Failed to create preview entry', error);
    setStatus(`Testeintrag fehlgeschlagen: ${error.message}`, 'error');
  }
});

window.addEventListener('message', event => {
  if (event.origin && event.origin !== window.location.origin) {
    return;
  }
  const data = event.data;
  if (!data || typeof data !== 'object' || data.type !== 'chat-message') {
    return;
  }
  postChatMessage({
    username: data.payload?.username,
    message: data.payload?.message,
    direction: data.payload?.direction || 'incoming',
    transport: data.payload?.transport || 'external'
  }).catch(error => {
    console.error('Failed to post message from window message', error);
  });
});

window.chatLog = {
  addMessage(payload = {}) {
    return postChatMessage({
      username: payload.username,
      message: payload.message,
      direction: payload.direction || 'incoming',
      transport: payload.transport || 'external'
    });
  }
};

ensureEmptyState();
connectToStream();
loadIdentity();
messageInput.focus();
