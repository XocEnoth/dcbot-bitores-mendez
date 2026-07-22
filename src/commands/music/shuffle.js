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

  const args = message.content.split(' ').slice(1);


  if (voiceChannel.id !== player.voiceChannel?.id) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must be in the same voice channel as the bot.')] });
  }

  const mode = args[0]?.toLowerCase();

  if (mode === 'on') {
    if (player.isShuffle) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ Shuffle mode is already enabled.')] });
    }
    player.shuffle(true);
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('🔀 Shuffle mode has been **enabled**. The next track will be randomly selected from the remaining queue.')] });
  }

  if (mode === 'off') {
    if (!player.isShuffle) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ Shuffle mode is already disabled.')] });
    }
    player.shuffle(false);
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('🔀 Shuffle mode has been **disabled**. Playback will continue in sequential order.')] });
  }

  const status = player.isShuffle ? '**Enabled** ✅' : '**Disabled** ❌';
  await message.reply({
    embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`🔀 Shuffle mode status: ${status}\nUse \`${config.prefix}shuffle on\` or \`${config.prefix}shuffle off\` to change it.`)]
  });
};

export default { name, description, execute };
