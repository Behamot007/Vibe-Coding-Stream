const EventEmitter = require('events');
let tmi;

try {
  tmi = require('tmi.js');
} catch (error) {
  tmi = null;
}

class TwitchChatManager extends EventEmitter {
  constructor({ loadConfig, persistTwitchConfig, onChatMessage, onStatus }) {
    super();
    this.loadConfig = loadConfig;
    this.persistTwitchConfig = persistTwitchConfig;
    this.onChatMessage = onChatMessage;
    this.onStatus = onStatus;
    this.client = null;
    this.connected = false;
    this.activeConfig = null;
    this.pendingConnection = false;
    this.tokenPromise = null;

    this.updateConfig(this.loadConfig().twitch || {});
    this.ensureConnected();
  }

  hasValidConfig(config) {
    if (!config) {
      return false;
    }
    const username = this.normalizeString(config.username);
    const channel = this.normalizeString(config.channel);
    const oauthToken = this.normalizeString(config.oauthToken);
    const accessToken = this.normalizeString(config.accessToken);

    if (!username || !channel) {
      return false;
    }

    if (!oauthToken && !accessToken) {
      return false;
    }

    return true;
  }

  sanitizeChannel(channel) {
    if (!channel) {
      return null;
    }
    return channel.startsWith('#') ? channel : `#${channel}`;
  }

  normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  stripOAuthPrefix(token) {
    const normalized = this.normalizeString(token);
    return normalized.replace(/^oauth:/i, '').trim();
  }

  sanitizeIrcPassword(token) {
    const raw = this.stripOAuthPrefix(token);
    if (!raw) {
      return null;
    }
    return raw.startsWith('oauth:') ? raw : `oauth:${raw}`;
  }

  configsEqual(a = {}, b = {}) {
    return (
      a.username === b.username &&
      a.oauthToken === b.oauthToken &&
      a.accessToken === b.accessToken &&
      a.refreshToken === b.refreshToken &&
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
    const twitchConfig = this.normalizeConfig(nextConfig || {});
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

    const result = this.connect();
    if (result && typeof result.catch === 'function') {
      result.catch(error => {
        this.emitStatus(`Twitch-Chat Verbindung fehlgeschlagen: ${error.message}`);
      });
    }
  }

  normalizeConfig(config) {
    const normalized = { ...config };
    const keysToNormalize = [
      'username',
      'clientId',
      'clientSecret',
      'oauthToken',
      'accessToken',
      'refreshToken',
      'tokenExpiresAt',
      'channel'
    ];

    keysToNormalize.forEach(key => {
      if (typeof normalized[key] === 'string') {
        normalized[key] = normalized[key].trim();
      }
    });

    return normalized;
  }

  async ensureIrcToken({ forceValidate = false } = {}) {
    if (!this.activeConfig) {
      throw new Error('Keine Twitch Konfiguration geladen.');
    }

    if (this.tokenPromise && !forceValidate) {
      return this.tokenPromise;
    }

    const resolver = async () => {
      const rawToken = await this.resolveRawToken({ forceValidate });
      const ircToken = this.sanitizeIrcPassword(rawToken);
      if (!ircToken) {
        throw new Error('Kein OAuth Token hinterlegt.');
      }
      return ircToken;
    };

    if (forceValidate) {
      return resolver();
    }

    this.tokenPromise = resolver().finally(() => {
      this.tokenPromise = null;
    });

    return this.tokenPromise;
  }

  async resolveRawToken({ forceValidate = false } = {}) {
    if (!this.activeConfig) {
      throw new Error('Keine Twitch Konfiguration geladen.');
    }

    const oauthToken = this.stripOAuthPrefix(this.activeConfig.oauthToken);
    if (oauthToken) {
      return oauthToken;
    }

    let accessToken = this.stripOAuthPrefix(this.activeConfig.accessToken);
    if (!accessToken) {
      throw new Error('Kein OAuth Token hinterlegt.');
    }

    const now = Date.now();
    const expiresAt = this.activeConfig.tokenExpiresAt
      ? Date.parse(this.activeConfig.tokenExpiresAt)
      : NaN;
    const refreshMargin = 2 * 60 * 1000;

    if (!Number.isNaN(expiresAt) && expiresAt - refreshMargin > now && !forceValidate) {
      return accessToken;
    }

    let validation;
    try {
      validation = await this.validateAccessToken(accessToken);
    } catch (error) {
      this.emitStatus(`Token Validierung fehlgeschlagen: ${error.message}`);
      validation = { valid: false, reason: 'unknown' };
    }

    if (validation?.valid && validation.expires_in) {
      const expiresInMs = validation.expires_in * 1000;
      if (expiresInMs > refreshMargin) {
        const patch = {
          tokenExpiresAt: new Date(now + expiresInMs).toISOString()
        };
        if (!this.activeConfig.username && validation.login) {
          patch.username = validation.login;
        }
        this.applyConfigPatch(patch);
        return accessToken;
      }
    }

    if (!validation?.valid && validation?.reason !== 'invalid') {
      if (forceValidate) {
        this.emitStatus('Token Validierung nicht möglich – nutze gespeicherten Access Token für Verbindungsversuch.');
      }
      return accessToken;
    }

    if (!this.activeConfig.refreshToken || !this.activeConfig.clientId || !this.activeConfig.clientSecret) {
      throw new Error(
        'Access Token ungültig oder abgelaufen und kein Refresh Token konfiguriert. Bitte neue Zugangsdaten speichern.'
      );
    }

    accessToken = await this.refreshAccessToken();
    return accessToken;
  }

  async validateAccessToken(accessToken) {
    if (!accessToken) {
      return { valid: false, reason: 'missing' };
    }

    const response = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: {
        Authorization: `OAuth ${accessToken}`
      }
    });

    if (response.status === 401) {
      return { valid: false, reason: 'invalid' };
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token Validierung fehlgeschlagen (${response.status}): ${text}`);
    }

    const payload = await response.json();
    return {
      valid: true,
      expires_in: payload.expires_in,
      login: payload.login,
      user_id: payload.user_id,
      scopes: payload.scopes
    };
  }

  applyConfigPatch(patch = {}) {
    if (!patch || typeof patch !== 'object') {
      return;
    }

    this.activeConfig = { ...this.activeConfig, ...patch };
    if (typeof this.persistTwitchConfig === 'function') {
      try {
        this.persistTwitchConfig(patch);
      } catch (error) {
        console.error('Persisting Twitch config failed', error);
      }
    }
  }

  async refreshAccessToken() {
    const { clientId, clientSecret, refreshToken } = this.activeConfig;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    });

    let response;
    try {
      response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });
    } catch (error) {
      throw new Error(`Token Refresh fehlgeschlagen: ${error.message}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(`Token Refresh Antwort konnte nicht gelesen werden (${response.status}).`);
    }

    if (!response.ok) {
      const message = payload?.message || 'Unbekannter Fehler';
      throw new Error(`Token Refresh fehlgeschlagen (${response.status}): ${message}`);
    }

    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 0;
    const refreshedPatch = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || this.activeConfig.refreshToken,
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : ''
    };

    this.applyConfigPatch(refreshedPatch);
    this.emitStatus('Twitch Access Token erfolgreich aktualisiert.');
    return this.stripOAuthPrefix(refreshedPatch.accessToken);
  }

  async connect() {
    if (!tmi || !this.activeConfig) {
      return;
    }

    this.disconnect();
    this.pendingConnection = true;

    const channel = this.sanitizeChannel(this.activeConfig.channel);
    let ircPassword;

    try {
      ircPassword = await this.ensureIrcToken();
    } catch (error) {
      this.pendingConnection = false;
      this.emitStatus(`OAuth Token ungültig: ${error.message}`);
      return;
    }

    this.client = new tmi.Client({
      options: { debug: false },
      identity: {
        username: this.activeConfig.username,
        password: ircPassword
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

    try {
      await this.client.connect();
    } catch (error) {
      this.connected = false;
      this.pendingConnection = false;
      this.emitStatus(`Twitch-Chat Verbindung fehlgeschlagen: ${error.message}`);
    }
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
    let ircPassword;

    try {
      ircPassword = await this.ensureIrcToken({ forceValidate: true });
    } catch (error) {
      throw new Error(`OAuth Token ungültig: ${error.message}`);
    }

    const probeClient = new tmi.Client({
      options: { debug: false },
      identity: {
        username: this.activeConfig.username,
        password: ircPassword
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
