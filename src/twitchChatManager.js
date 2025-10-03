const EventEmitter = require('events');
let tmi;

try {
  tmi = require('tmi.js');
} catch (error) {
  tmi = null;
}

class TwitchChatManager extends EventEmitter {
  constructor({ loadConfig, onChatMessage, onStatus }) {
    super();
    this.loadConfig = loadConfig;
    this.onChatMessage = onChatMessage;
    this.onStatus = onStatus;
    this.client = null;
    this.connected = false;
    this.activeConfig = null;
    this.pendingConnection = false;

    this.updateConfig(this.loadConfig().twitch || {});
    this.ensureConnected();
  }

  hasValidConfig(config) {
    if (!config) {
      return false;
    }
    return Boolean(
      config.username &&
        config.oauthToken &&
        config.channel &&
        typeof config.username === 'string' &&
        typeof config.oauthToken === 'string' &&
        typeof config.channel === 'string'
    );
  }

  sanitizeChannel(channel) {
    if (!channel) {
      return null;
    }
    return channel.startsWith('#') ? channel : `#${channel}`;
  }

  sanitizeToken(token) {
    if (!token) {
      return null;
    }
    return token.startsWith('oauth:') ? token : `oauth:${token}`;
  }

  configsEqual(a = {}, b = {}) {
    return (
      a.username === b.username &&
      a.oauthToken === b.oauthToken &&
      a.channel === b.channel
    );
  }

  disconnect(reason) {
    this.connected = false;
    this.pendingConnection = false;
    if (this.client) {
      try {
        this.client.removeAllListeners();
        const disconnectPromise = this.client.disconnect();
        if (disconnectPromise && typeof disconnectPromise.catch === 'function') {
          disconnectPromise.catch(() => {});
        }
      } catch (error) {
        // ignore disconnect errors
      }
      this.client = null;
    }
    if (reason) {
      this.emitStatus(reason);
    }
  }

  emitStatus(message) {
    if (typeof this.onStatus === 'function' && message) {
      this.onStatus(message);
    }
  }

  updateConfig(nextConfig) {
    const twitchConfig = nextConfig || {};
    if (!tmi) {
      this.emitStatus('tmi.js konnte nicht geladen werden. Twitch-Chat ist deaktiviert.');
      return;
    }

    if (!this.hasValidConfig(twitchConfig)) {
      this.disconnect('Twitch-Chat Konfiguration unvollständig.');
      this.activeConfig = null;
      return;
    }

    if (this.activeConfig && this.configsEqual(this.activeConfig, twitchConfig)) {
      return;
    }

    this.activeConfig = { ...twitchConfig };
    this.ensureConnected(true);
  }

  ensureConnected(force = false) {
    if (!tmi || !this.activeConfig) {
      return;
    }

    if (!force && (this.connected || this.pendingConnection)) {
      return;
    }

    this.connect();
  }

  connect() {
    if (!tmi || !this.activeConfig) {
      return;
    }

    this.disconnect();
    this.pendingConnection = true;

    const channel = this.sanitizeChannel(this.activeConfig.channel);
    const token = this.sanitizeToken(this.activeConfig.oauthToken);

    this.client = new tmi.Client({
      options: { debug: false },
      identity: {
        username: this.activeConfig.username,
        password: token
      },
      channels: [channel],
      connection: { reconnect: true, secure: true }
    });

    this.client.on('connected', () => {
      this.connected = true;
      this.pendingConnection = false;
      this.emitStatus(`Mit Twitch-Chat ${channel} verbunden.`);
    });

    this.client.on('disconnected', reason => {
      this.connected = false;
      this.pendingConnection = false;
      this.emitStatus(`Twitch-Chat getrennt: ${reason || 'unbekannt'}.`);
    });

    this.client.on('message', (chan, tags, message, self) => {
      if (self) {
        return;
      }
      if (typeof this.onChatMessage === 'function') {
        const username = tags['display-name'] || tags.username || 'Unbekannt';
        this.onChatMessage({
          channel: chan,
          username,
          message
        });
      }
    });

    this.client.connect().catch(error => {
      this.connected = false;
      this.pendingConnection = false;
      this.emitStatus(`Twitch-Chat Verbindung fehlgeschlagen: ${error.message}`);
    });
  }

  async sendMessage(message) {
    if (!this.client || !this.connected) {
      throw new Error('Keine aktive Twitch-Chat Verbindung.');
    }
    const channel = this.sanitizeChannel(this.activeConfig.channel);
    await this.client.say(channel, message);
  }

  async checkConnectivity(timeoutMs = 8000) {
    if (!tmi) {
      throw new Error('tmi.js konnte nicht geladen werden.');
    }

    if (!this.hasValidConfig(this.activeConfig)) {
      throw new Error('Twitch Konfiguration unvollständig.');
    }

    if (this.pendingConnection) {
      return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;
        const awaitState = () => {
          if (this.connected) {
            resolve({
              status: 'connected',
              message: `Aktive Verbindung zu ${this.sanitizeChannel(this.activeConfig.channel)}.`
            });
            return;
          }

          if (!this.pendingConnection) {
            reject(new Error('Aktuell keine aktive Verbindung.'));
            return;
          }

          if (Date.now() > deadline) {
            reject(new Error('Timeout beim Verbindungsaufbau.'));
            return;
          }

          setTimeout(awaitState, 250);
        };

        awaitState();
      });
    }

    if (this.connected) {
      return {
        status: 'connected',
        message: 'Bereits mit dem Twitch Chat verbunden.'
      };
    }

    const channel = this.sanitizeChannel(this.activeConfig.channel);
    const token = this.sanitizeToken(this.activeConfig.oauthToken);

    const probeClient = new tmi.Client({
      options: { debug: false },
      identity: {
        username: this.activeConfig.username,
        password: token
      },
      channels: [channel],
      connection: { reconnect: false, secure: true }
    });

    return new Promise((resolve, reject) => {
      let finished = false;

      const cleanup = () => {
        probeClient.removeAllListeners();
        probeClient.disconnect().catch(() => {});
      };

      const timeout = setTimeout(() => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        reject(new Error('Timeout beim Verbindungsaufbau.'));
      }, timeoutMs);

      probeClient.on('connected', () => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeout);
        cleanup();
        this.ensureConnected();
        resolve({
          status: 'connected',
          message: `Erfolgreich mit ${channel} verbunden.`
        });
      });

      probeClient.on('disconnected', reason => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeout);
        cleanup();
        reject(new Error(`Verbindung getrennt: ${reason || 'unbekannt'}`));
      });

      probeClient.connect().catch(error => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeout);
        cleanup();
        reject(error);
      });
    });
  }
}

module.exports = { TwitchChatManager };
