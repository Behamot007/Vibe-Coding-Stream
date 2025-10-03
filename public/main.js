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
    const payload = await response.json();
    throw new Error(payload.message || 'Fehler beim Speichern');
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
  tbody.innerHTML = '';
  mappings.forEach(mapping => {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector('.command').textContent = mapping.command;
    fragment.querySelector('.script').textContent = mapping.scriptName;
    fragment.querySelector('.description').textContent = mapping.description || '';
    fragment.querySelector('.delete').addEventListener('click', async () => {
      await fetch(`/api/config/commands/${encodeURIComponent(mapping.command)}`, {
        method: 'DELETE'
      });
      const config = await fetchConfig();
      renderMappings(config.commandMappings);
    });
    tbody.appendChild(fragment);
  });
}

async function init() {
  try {
    const config = await fetchConfig();
    fillForm(document.getElementById('twitch-form'), config.twitch);
    fillForm(document.getElementById('minecraft-form'), config.minecraft);
    renderMappings(config.commandMappings);
  } catch (error) {
    alert(error.message);
  }

  document.getElementById('twitch-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await saveSection('/api/config/twitch', data);
      alert('Twitch Konfiguration gespeichert');
    } catch (error) {
      alert(error.message);
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
      await saveSection('/api/config/minecraft', data);
      alert('Minecraft Konfiguration gespeichert');
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById('command-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await saveSection('/api/config/commands', data);
      form.reset();
      const config = await fetchConfig();
      renderMappings(config.commandMappings);
    } catch (error) {
      alert(error.message);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
