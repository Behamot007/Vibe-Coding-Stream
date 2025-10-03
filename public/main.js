function setStatus(element, message, tone = 'info') {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.dataset.tone = tone;
}

async function fetchConfig() {
  const response = await fetch('/api/config');
  if (!response.ok) {
    throw new Error('Konfiguration konnte nicht geladen werden');
  }
  return response.json();
}

async function saveSection(endpoint, data) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: 'Unbekannter Fehler' }));
    throw new Error(payload.message || 'Fehler beim Speichern');
  }

  return response.json();
}

async function testConnection(endpoint) {
  const response = await fetch(endpoint);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: 'Unbekannter Fehler' }));
    throw new Error(payload.message || 'Verbindungstest fehlgeschlagen');
  }
  return response.json();
}

function fillForm(form, data) {
  Object.entries(data).forEach(([key, value]) => {
    if (form.elements[key]) {
      form.elements[key].value = value ?? '';
    }
  });
}

function renderMappings(mappings) {
  const tbody = document.querySelector('#command-table tbody');
  const template = document.querySelector('#command-row-template');
  const status = document.getElementById('command-status');
  tbody.innerHTML = '';
  mappings.forEach(mapping => {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector('.command').textContent = mapping.command;
    fragment.querySelector('.script').textContent = mapping.scriptName;
    fragment.querySelector('.description').textContent = mapping.description || '';
    fragment.querySelector('.delete').addEventListener('click', async () => {
      try {
        await fetch(`/api/config/commands/${encodeURIComponent(mapping.command)}`, {
          method: 'DELETE'
        });
        const config = await fetchConfig();
        renderMappings(config.commandMappings);
        setStatus(status, `Mapping ${mapping.command} entfernt.`, 'success');
      } catch (error) {
        setStatus(status, error.message, 'error');
      }
    });
    tbody.appendChild(fragment);
  });
}

async function init() {
  const twitchStatus = document.getElementById('twitch-status');
  const minecraftStatus = document.getElementById('minecraft-status');
  const commandStatus = document.getElementById('command-status');

  try {
    const config = await fetchConfig();
    fillForm(document.getElementById('twitch-form'), config.twitch);
    fillForm(document.getElementById('minecraft-form'), config.minecraft);
    renderMappings(config.commandMappings);
  } catch (error) {
    setStatus(twitchStatus, error.message, 'error');
    setStatus(minecraftStatus, error.message, 'error');
    setStatus(commandStatus, error.message, 'error');
  }

  const usernameField = document.getElementById('twitch-username');
  const channelField = document.getElementById('twitch-channel');
  usernameField.addEventListener('blur', () => {
    const username = usernameField.value.trim();
    if (username && !channelField.value.trim()) {
      channelField.value = username.toLowerCase();
    }
  });

  document.getElementById('twitch-oauth-button').addEventListener('click', () => {
    setStatus(twitchStatus, 'Öffne offizielles Twitch OAuth Tool …', 'info');
    window.open('https://twitchapps.com/tmi/', '_blank', 'noopener');
  });

  document.getElementById('twitch-token-generator-button').addEventListener('click', () => {
    setStatus(twitchStatus, 'Öffne Twitch Token Generator zum Testen …', 'info');
    window.open('https://twitchtokengenerator.com', '_blank', 'noopener');
  });

  document.getElementById('twitch-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      setStatus(twitchStatus, 'Speichere Twitch Einstellungen …', 'info');
      await saveSection('/api/config/twitch', data);
      setStatus(twitchStatus, 'Twitch Konfiguration gespeichert.', 'success');
    } catch (error) {
      setStatus(twitchStatus, error.message, 'error');
    }
  });

  document.getElementById('twitch-test').addEventListener('click', async () => {
    setStatus(twitchStatus, 'Prüfe Verbindung …', 'info');
    try {
      const result = await testConnection('/api/test/twitch');
      const timeLabel = new Date(result.timestamp).toLocaleTimeString();
      const details = result.message ? ` – ${result.message}` : '';
      const statusLabel = (result.status || 'unbekannt').toUpperCase();
      const toneMap = {
        ok: 'success',
        connected: 'success',
        offline: 'warning',
        unconfigured: 'warning',
        error: 'error'
      };
      const tone = toneMap[result.status] || 'info';
      setStatus(
        twitchStatus,
        `${result.service}: ${statusLabel} (${timeLabel})${details}`,
        tone
      );
    } catch (error) {
      setStatus(twitchStatus, error.message, 'error');
    }
  });

  document.getElementById('minecraft-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.rconPort) {
      data.rconPort = Number(data.rconPort);
    }
    try {
      setStatus(minecraftStatus, 'Speichere Minecraft Einstellungen …', 'info');
      await saveSection('/api/config/minecraft', data);
      setStatus(minecraftStatus, 'Minecraft Konfiguration gespeichert.', 'success');
    } catch (error) {
      setStatus(minecraftStatus, error.message, 'error');
    }
  });

  document.getElementById('minecraft-test').addEventListener('click', async () => {
    setStatus(minecraftStatus, 'Prüfe Verbindung …', 'info');
    try {
      const result = await testConnection('/api/test/minecraft');
      setStatus(
        minecraftStatus,
        `${result.service}: ${result.status.toUpperCase()} (${new Date(result.timestamp).toLocaleTimeString()})`,
        'success'
      );
    } catch (error) {
      setStatus(minecraftStatus, error.message, 'error');
    }
  });

  document.getElementById('command-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      setStatus(commandStatus, 'Speichere Mapping …', 'info');
      await saveSection('/api/config/commands', data);
      form.reset();
      const config = await fetchConfig();
      renderMappings(config.commandMappings);
      setStatus(commandStatus, 'Mapping gespeichert.', 'success');
    } catch (error) {
      setStatus(commandStatus, error.message, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
