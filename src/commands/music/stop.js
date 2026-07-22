import playerManager from '../../services/music/playerManager.js';
import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';

const name = 'stop';
const description = 'Stop playback and clear the queue';

/**
 * Executes the stop command to halt audio playback and purge the queue.
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
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ No track is currently playing.')] });
  }

  if (voiceChannel.id !== player.voiceChannel?.id) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must be in the same voice channel as the bot.')] });
  }

  await player.stop();
  await message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⏹ Playback stopped and queue cleared.')] });
};

export default { name, description, execute };
