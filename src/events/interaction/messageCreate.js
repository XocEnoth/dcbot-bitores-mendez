import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

const name = 'messageCreate';

const execute = async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();

  const command = message.client.commands.get(commandName);

  if (!command) return;

  try {
    await command.execute(message, args);
  } catch (error) {
    logger.error(`Error executing command "${commandName}"`, error);
    await message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ An error occurred while executing this command.')] }).catch(() => {});
  }
};

export default { name, execute };
