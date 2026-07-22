import playerManager from '../../services/music/playerManager.js';
import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';

const name = 'leave';
const description = 'Disconnect the bot from the voice channel';

/**
 * Executes the leave command to disconnect the bot from the voice channel.
 *
 * @param {import('discord.js').Message} message - The Discord message object.
 */
const execute = async (message) => {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must join a voice channel first.')] });
  }

  const player = playerManager.getPlayer(message.guild.id);
  if (!player) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ The bot is not currently in a voice channel.')] });
  }

  if (voiceChannel.id !== player.voiceChannel?.id) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must be in the same voice channel as the bot.')] });
  }

  playerManager.destroyPlayer(message.guild.id);
  await message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('👋 Disconnected from voice channel.')] });
};

export default { name, description, execute };
