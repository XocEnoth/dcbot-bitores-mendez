import playerManager from '../../services/music/playerManager.js';
import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';

const name = 'shuffle';
const description = 'Toggles shuffle mode on or off';

/**
 * Executes the shuffle command to toggle shuffle mode for upcoming tracks.
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
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ No music is currently playing.')] });
  }

  if (voiceChannel.id !== player.voiceChannel?.id) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must be in the same voice channel as the bot.')] });
  }

  const isEnabled = player.shuffle();
  const status = isEnabled ? '**Enabled** 🔀' : '**Disabled** ❌';
  await message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`🔀 Shuffle mode status: ${status}`)] });
};

export default { name, description, execute };
