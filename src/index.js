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

      // Provide cookies to play-dl to prevent YouTube 429 rate limit issues
      try {
        const play = (await import('play-dl')).default;
        await play.setToken({ youtube: { cookie: process.env.YOUTUBE_COOKIES } });
        logger.info('Applied YouTube cookies to play-dl to prevent 429 errors.');
      } catch (err) {
        logger.warn(`Failed to set play-dl cookies: ${err.message}`);
      }
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
  const errMsg = error?.message || String(error);
  if (errMsg.includes('429')) {
    logger.warn(`[play-dl] Background rate limit (429) hit, but safely ignored: ${errMsg}`);
  } else {
    logger.error('Unhandled promise rejection', error);
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  // Only exit on truly fatal errors; keep running for recoverable ones
  if (error.message?.includes('DISALLOWED_INTENTS') || error.message?.includes('TOKEN_INVALID')) {
    process.exit(1);
  }
});

start();
