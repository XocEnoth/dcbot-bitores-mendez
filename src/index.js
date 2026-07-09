import { Client, GatewayIntentBits } from 'discord.js';
import 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import config from './config/index.js';
import logger from './utils/logger.js';
import loadCommands from './handlers/commandHandler.js';
import loadEvents from './handlers/eventHandler.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const start = async () => {
  try {
    logger.info('Starting bot...');

    // Write cookies.txt from env var for deployments (e.g. Railway)
    if (process.env.YOUTUBE_COOKIES) {
      const cookiesPath = path.resolve(process.cwd(), 'cookies.txt');
      fs.writeFileSync(cookiesPath, process.env.YOUTUBE_COOKIES);
      logger.info('Loaded YouTube cookies from YOUTUBE_COOKIES environment variable.');
    }

    await loadCommands(client);
    await loadEvents(client);
    await client.login(config.token);
  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
  }
};

// Prevent bot crashes from unhandled errors (e.g., play-dl 429, network issues)
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  // Only exit on truly fatal errors; keep running for recoverable ones
  if (error.message?.includes('DISALLOWED_INTENTS') || error.message?.includes('TOKEN_INVALID')) {
    process.exit(1);
  }
});

start();
