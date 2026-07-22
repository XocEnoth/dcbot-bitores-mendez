import playerManager from '../../services/music/playerManager.js';
import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';

const name = '247';
const description = 'Toggle 24/7 mode to keep the bot in the voice channel';

/**
 * Executes the 24/7 mode toggle command.
 *
 * @param {import('discord.js').Message} message - The Discord message object.
 * @param {string[]} args - Command arguments.
 */
const execute = async (message, args) => {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must join a voice channel first.')] });
  }

  const player = playerManager.getPlayer(message.guild.id);
  if (!player || !player.connection) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ The bot is not currently in a voice channel.')] });
  }

  if (voiceChannel.id !== player.voiceChannel?.id) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must be in the same voice channel as the bot.')] });
  }

  const mode = args[0]?.toLowerCase();

  if (mode === 'on') {
    if (player.is247) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ 24/7 mode is already enabled.')] });
    }
    player.is247 = true;
    player._clearIdleTimeout();
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('🔄 24/7 mode has been **enabled**. The bot will remain in the voice channel even if the queue is empty.')] });
  }

  if (mode === 'off') {
    if (!player.is247) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ 24/7 mode is already disabled.')] });
    }
    player.is247 = false;
    if (!player.isPlaying) {
      player._startIdleTimeout();
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('🔄 24/7 mode has been **disabled**. The bot will leave the voice channel when the queue is empty.')] });
  }

  const status = player.is247 ? '**Enabled** ✅' : '**Disabled** ❌';
  await message.reply({
    embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`🔄 24/7 mode status: ${status}\nUse \`${config.prefix}247 on\` or \`${config.prefix}247 off\` to change it.`)]
  });
};

export default { name, description, execute };
