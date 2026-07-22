import { Collection } from 'discord.js';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { pathToFileURL } from 'url';
import logger from '../utils/logger.js';

const COMMANDS_DIR = join(import.meta.dirname, '..', 'commands');

/**
 * Dynamically loads and registers all commands from category subdirectories
 * directly into the client's commands collection as top-level commands.
 *
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
const loadCommands = async (client) => {
  client.commands = new Collection();

  const categories = await readdir(COMMANDS_DIR, { withFileTypes: true });
  const folders = categories.filter((entry) => entry.isDirectory());

  for (const folder of folders) {
    const folderPath = join(COMMANDS_DIR, folder.name);
    const files = await readdir(folderPath);
    const commandFiles = files.filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = join(folderPath, file);
      const fileUrl = pathToFileURL(filePath).href;
      const { default: command } = await import(fileUrl);

      if (!command.name || !command.execute) {
        logger.warn(`Skipping "${file}" — missing "name" or "execute" export`);
        continue;
      }

      client.commands.set(command.name, command);
    }
  }

  logger.info(`Loaded ${client.commands.size} command(s) from ${folders.length} category(s)`);
};

export default loadCommands;
