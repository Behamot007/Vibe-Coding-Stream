const EventEmitter = require('events');
const { loadConfig } = require('./server');

class EventBridge extends EventEmitter {
  constructor() {
    super();
    this.config = loadConfig();
  }

  refreshConfig() {
    this.config = loadConfig();
    this.emit('configUpdated', this.config);
  }

  getTwitchSettings() {
    return { ...this.config.twitch };
  }

  getMinecraftSettings() {
    return { ...this.config.minecraft };
  }

  getCommandMappings() {
    return [...this.config.commandMappings];
  }

  mapChatCommand(chatCommand) {
    return this.config.commandMappings.find(
      entry => entry.command.toLowerCase() === chatCommand.toLowerCase()
    );
  }

  createTwitchEventPayload(message) {
    const mapping = this.mapChatCommand(message);
    if (!mapping) {
      return null;
    }
    return {
      origin: 'twitch',
      command: mapping.command,
      scriptName: mapping.scriptName,
      description: mapping.description,
      timestamp: new Date().toISOString()
    };
  }

  createMinecraftTrigger(mapping) {
    if (!mapping) {
      return null;
    }

    const minecraftConfig = this.getMinecraftSettings();
    return {
      ...minecraftConfig,
      scriptToTrigger: mapping.scriptName,
      command: mapping.command,
      description: mapping.description,
      triggerType: 'script'
    };
  }
}

module.exports = { EventBridge };
