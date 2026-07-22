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
  let forceState = null;

  if (voiceChannel.id !== player.voiceChannel?.id) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must be in the same voice channel as the bot.')] });
  }

  if (args.length > 0) {
    const arg = args[0].toLowerCase();
    if (arg === 'on') {
      forceState = true;
    } else if (arg === 'off') {
      forceState = false;
    } else {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`❌ Invalid argument. Please use \`${config.prefix}shuffle on\` or \`${config.prefix}shuffle off\`.`)] });
    }
  }

  const isEnabled = player.shuffle(forceState);
  const status = isEnabled ? '**Enabled** 🔀' : '**Disabled** ❌';
  await message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`🔀 Shuffle mode status: ${status}`)] });
};

export default { name, description, execute };
