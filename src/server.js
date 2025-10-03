const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'settings.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const defaultConfig = {
  twitch: {
    username: '',
    clientId: '',
    clientSecret: '',
    oauthToken: '',
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
