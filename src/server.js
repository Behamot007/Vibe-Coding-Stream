const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { TwitchChatManager } = require('./twitchChatManager');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'settings.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const chatClients = new Set();
const chatHistory = [];
const CHAT_HISTORY_LIMIT = 500;

const defaultConfig = {
  twitch: {
    username: '',
    clientId: '',
    clientSecret: '',
    oauthToken: '',
    accessToken: '',
    refreshToken: '',
    tokenExpiresAt: '',
    channel: ''
  },
  minecraft: {
    host: '',
    rconPort: 25575,
    rconPassword: '',
    scriptBasePath: ''
  },
  commandMappings: []
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...defaultConfig };
  }
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...defaultConfig, ...JSON.parse(data) };
  } catch (error) {
    console.error('Failed to read configuration file:', error);
    return { ...defaultConfig };
  }
}

function saveConfig(config) {
  const safeConfig = {
    ...defaultConfig,
    ...config,
    twitch: { ...defaultConfig.twitch, ...config.twitch },
    minecraft: { ...defaultConfig.minecraft, ...config.minecraft },
    commandMappings: Array.isArray(config.commandMappings)
      ? config.commandMappings
      : defaultConfig.commandMappings
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(safeConfig, null, 2));
  return safeConfig;
}

function persistTwitchConfig(partial = {}) {
  if (!partial || typeof partial !== 'object') {
    return loadConfig().twitch;
  }

  const current = loadConfig();
  const next = {
    ...current,
    twitch: { ...current.twitch, ...partial }
  };

  saveConfig(next);
  return next.twitch;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function handleOptions(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end();
}

function sendEvent(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastEvent(eventName, data) {
  chatClients.forEach(client => {
    try {
      sendEvent(client.res, eventName, data);
    } catch (error) {
      console.error('Failed to push SSE event:', error);
      chatClients.delete(client);
      try {
        client.res.end();
      } catch (endError) {
        console.error('Failed to close SSE client connection:', endError);
      }
    }
  });
}

function createChatEntry({
  username,
  message,
  direction = 'incoming',
  transport = 'twitch',
  timestamp,
  id
}) {
  const normalizedDirection = ['incoming', 'outgoing', 'system'].includes(direction)
    ? direction
    : 'incoming';
  const normalizedTransport = transport || 'twitch';
  const normalizedMessage = message != null ? message.toString() : '';

  return {
    id:
      id || `${Date.now()}-${Math.random().toString(36).slice(2, 8).toLowerCase()}`,
    timestamp: timestamp || new Date().toISOString(),
    username: username || 'Unbekannt',
    message: normalizedMessage,
    direction: normalizedDirection,
    transport: normalizedTransport
  };
}

function pushChatEntry(entry) {
  chatHistory.push(entry);
  if (chatHistory.length > CHAT_HISTORY_LIMIT) {
    chatHistory.shift();
  }
  broadcastEvent('message', entry);
}

const twitchChatManager = new TwitchChatManager({
  loadConfig,
  persistTwitchConfig,
  onChatMessage: ({ username, message }) => {
    pushChatEntry(
      createChatEntry({
        username,
        message,
        direction: 'incoming',
        transport: 'twitch'
      })
    );
  },
  onStatus: statusMessage => {
    pushChatEntry(
      createChatEntry({
        username: 'System',
        message: statusMessage,
        direction: 'system',
        transport: 'twitch'
      })
    );
  }
});

function serveStatic(res, pathname) {
  const filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = parsedUrl;

  if (req.method === 'OPTIONS') {
    handleOptions(res);
    return;
  }

  if (pathname === '/api/chat/stream') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const client = { res };
    chatClients.add(client);

    chatHistory.forEach(entry => {
      sendEvent(res, 'message', entry);
    });

    req.on('close', () => {
      chatClients.delete(client);
    });
    return;
  }

  if (pathname === '/api/chat/message') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }

    try {
      const body = await parseBody(req);
      const message = body.message?.toString().trim();
      if (!message) {
        sendJson(res, 400, { message: 'message is required.' });
        return;
      }

      const config = loadConfig();
      const username = body.username?.toString().trim() || config.twitch.username || 'Unbekannt';
      const direction = body.direction === 'outgoing' ? 'outgoing' : 'incoming';
      const transport = body.transport?.toString().trim() || 'twitch';

      const entry = createChatEntry({ username, message, direction, transport });

      let status = 'stored';
      let note = 'Chatnachricht wurde gespeichert.';
      let followUpEntry = null;

      if (entry.direction === 'outgoing' && entry.transport === 'twitch') {
        try {
          await twitchChatManager.sendMessage(entry.message);
          status = 'sent';
          note = 'Chatnachricht wurde an Twitch übermittelt.';
        } catch (error) {
          console.error('Failed to send Twitch chat message', error);
          status = 'queued';
          note = `Twitch Versand fehlgeschlagen (${error.message}). Nachricht lokal gespeichert.`;
          followUpEntry = createChatEntry({
            username: 'System',
            message: `Twitch Versand fehlgeschlagen: ${error.message}.`,
            direction: 'system',
            transport: 'twitch'
          });
        }
      }

      pushChatEntry(entry);

      if (followUpEntry) {
        pushChatEntry(followUpEntry);
      }

      sendJson(res, 200, {
        status,
        entry,
        note
      });
    } catch (error) {
      console.error('Failed to store chat message', error);
      sendJson(res, 500, { message: 'Failed to store chat message', error: error.message });
    }
    return;
  }

  if (pathname === '/api/chat') {
    if (req.method === 'GET') {
      sendJson(res, 200, { messages: chatHistory });
      return;
    }

    if (req.method === 'DELETE') {
      chatHistory.length = 0;
      broadcastEvent('clear', { timestamp: new Date().toISOString() });
      sendJson(res, 200, { status: 'cleared' });
      return;
    }

    sendJson(res, 405, { message: 'Method not allowed' });
    return;
  }

  if (pathname.startsWith('/api/test/')) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }

    const responsePayload = {
      timestamp: new Date().toISOString()
    };

    if (pathname === '/api/test/twitch') {
      try {
        const result = await twitchChatManager.checkConnectivity();
        sendJson(res, 200, {
          ...responsePayload,
          service: 'twitch',
          status: result.status || 'ok',
          message: result.message
        });
      } catch (error) {
        const errorMessage = error?.message || 'Unbekannter Fehler';
        const status = /konfiguration/i.test(errorMessage)
          ? 'unconfigured'
          : 'offline';
        sendJson(res, 200, {
          ...responsePayload,
          service: 'twitch',
          status,
          message: errorMessage
        });
      }
      return;
    }

    if (pathname === '/api/test/minecraft') {
      sendJson(res, 200, {
        ...responsePayload,
        service: 'minecraft',
        status: 'ok',
        message: 'Minecraft Schnittstelle erreichbar (Simulation)'
      });
      return;
    }

    sendJson(res, 404, { message: 'Test-Schnittstelle nicht gefunden' });
    return;
  }

  if (pathname.startsWith('/api/config')) {
    let config = loadConfig();

    try {
      if (req.method === 'GET' && pathname === '/api/config') {
        sendJson(res, 200, config);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/config/twitch') {
        const body = await parseBody(req);
        config = saveConfig({
          ...config,
          twitch: { ...config.twitch, ...body }
        });
        twitchChatManager.updateConfig(config.twitch);
        sendJson(res, 200, config.twitch);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/config/minecraft') {
        const body = await parseBody(req);
        config = saveConfig({
          ...config,
          minecraft: { ...config.minecraft, ...body }
        });
        sendJson(res, 200, config.minecraft);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/config/commands') {
        const body = await parseBody(req);
        const { command, scriptName, description } = body;
        if (!command || !scriptName) {
          sendJson(res, 400, { message: 'command and scriptName are required.' });
          return;
        }
        const existingIndex = config.commandMappings.findIndex(
          entry => entry.command === command
        );
        if (existingIndex >= 0) {
          config.commandMappings[existingIndex] = {
            ...config.commandMappings[existingIndex],
            scriptName,
            description: description || ''
          };
        } else {
          config.commandMappings.push({
            command,
            scriptName,
            description: description || ''
          });
        }
        saveConfig(config);
        sendJson(res, 200, config.commandMappings);
        return;
      }

      if (req.method === 'DELETE' && pathname.startsWith('/api/config/commands/')) {
        const command = decodeURIComponent(pathname.split('/').pop());
        const newMappings = config.commandMappings.filter(entry => entry.command !== command);
        config.commandMappings = newMappings;
        saveConfig(config);
        sendJson(res, 200, newMappings);
        return;
      }
    } catch (error) {
      console.error('API error', error);
      sendJson(res, 500, { message: 'Internal server error', error: error.message });
      return;
    }

    sendJson(res, 404, { message: 'Not found' });
    return;
  }

  serveStatic(res, pathname);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Configuration service listening on port ${PORT}`);
});

module.exports = { server, loadConfig, saveConfig };
