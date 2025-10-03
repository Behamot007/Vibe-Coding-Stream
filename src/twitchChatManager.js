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

    this.updateConfig(this.loadConfig().twitch || {});
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
    this.connect();
  }

  connect() {
    if (!tmi || !this.activeConfig) {
      return;
    }

    this.disconnect();

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
      this.emitStatus(`Mit Twitch-Chat ${channel} verbunden.`);
    });

    this.client.on('disconnected', reason => {
      this.connected = false;
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
}

module.exports = { TwitchChatManager };
