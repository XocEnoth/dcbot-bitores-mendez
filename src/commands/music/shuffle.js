import playerManager from '../../services/music/playerManager.js';
import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';

const name = 'shuffle';
const description = 'Shuffle the upcoming tracks in the queue';

/**
 * Executes the shuffle command to randomize upcoming tracks in queue.
 *
 * @param {import('discord.js').Message} message - The Discord message object.
 */
const execute = async (message) => {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must join a voice channel first.')] });
  }

  const player = playerManager.getPlayer(message.guild.id);
  if (!player || player.queue.length <= player.currentIndex + 1) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ Not enough upcoming tracks in the queue to shuffle.')] });
  }

  if (voiceChannel.id !== player.voiceChannel?.id) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must be in the same voice channel as the bot.')] });
  }

  if (player.shuffle()) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('🔀 The queue has been shuffled.')] });
  } else {
    await message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ Not enough upcoming tracks to shuffle.')] });
  }
};

export default { name, description, execute };
