import { Client, GatewayIntentBits } from 'discord.js';
import config from './config/index.js';
import logger from './utils/logger.js';
import loadCommands from './handlers/commandHandler.js';
import loadEvents from './handlers/eventHandler.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const start = async () => {
  try {
    logger.info('Starting bot...');

    await loadCommands(client);
    await loadEvents(client);
    await client.login(config.token);
  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
  }
};

start();
