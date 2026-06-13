import { Collection } from 'discord.js';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { pathToFileURL } from 'url';
import logger from '../utils/logger.js';

const COMMANDS_DIR = join(import.meta.dirname, '..', 'commands');

const loadCommands = async (client) => {
  client.commands = new Collection();

  const categories = await readdir(COMMANDS_DIR, { withFileTypes: true });
  const folders = categories.filter((entry) => entry.isDirectory());

  for (const folder of folders) {
    const folderPath = join(COMMANDS_DIR, folder.name);
    const files = await readdir(folderPath);
    const commandFiles = files.filter((file) => file.endsWith('.js'));

    const subcommands = new Collection();

    for (const file of commandFiles) {
      const filePath = join(folderPath, file);
      const fileUrl = pathToFileURL(filePath).href;
      const { default: command } = await import(fileUrl);

      if (!command.name || !command.execute) {
        logger.warn(`Skipping "${file}" — missing "name" or "execute" export`);
        continue;
      }

      if (command.subcommand) {
        subcommands.set(command.name, command);
      } else {
        client.commands.set(command.name, command);
      }
    }

    // Create a router command for subcommand groups
    if (subcommands.size > 0) {
      const subNames = [...subcommands.keys()].map((k) => `\`${k}\``).join(', ');

      client.commands.set(folder.name, {
        name: folder.name,
        description: `${folder.name} commands`,
        subcommands,
        execute: async (message, args) => {
          const subName = args.shift()?.toLowerCase();

          if (!subName) {
            return message.reply(`❌ Subcommand is required. Available: ${subNames}`);
          }

          const sub = subcommands.get(subName);
          if (!sub) {
            return message.reply(`❌ Subcommand "${subName}" not found. Available: ${subNames}`);
          }

          await sub.execute(message, args);
        },
      });

      logger.info(`Loaded ${subcommands.size} subcommand(s) for "${folder.name}"`);
    }
  }

  logger.info(`Loaded ${client.commands.size} command(s) from ${folders.length} category(s)`);
};

export default loadCommands;
