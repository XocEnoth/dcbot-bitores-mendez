import { EmbedBuilder } from 'discord.js';
import playerManager from '../../services/music/playerManager.js';
import config from '../../config/index.js';

const name = 'anorm';
const description = 'Toggle Audio Normalizer on or off for the current server.';
const subcommand = true;

const execute = async (message, args) => {
  const player = playerManager.getPlayer(message.guild.id);
  if (!player) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ The bot is not currently in a voice channel.')] });
  }

  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must join a voice channel first.')] });
  }

  if (player.voiceChannel && player.voiceChannel.id !== voiceChannel.id) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must be in the same voice channel as the bot.')] });
  }

  const state = args[0]?.toLowerCase();

  if (state === 'on') {
    if (player.isNormalizerEnabled) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ Audio Normalizer is already enabled.')] });
    }
    player.isNormalizerEnabled = true;
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('🎚️ Audio Normalizer has been **enabled**. Upcoming tracks will be normalized to -14 LUFS.')] });
  } else if (state === 'off') {
    if (!player.isNormalizerEnabled) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ Audio Normalizer is already disabled.')] });
    }
    player.isNormalizerEnabled = false;
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('🎚️ Audio Normalizer has been **disabled**. Upcoming tracks will play at their original volume.')] });
  }
  
  const statusMsg = player.isNormalizerEnabled ? '**Enabled** ✅' : '**Disabled** ❌';
  await message.reply({
    embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`🎚️ Audio Normalizer status: ${statusMsg}\nUse \`${config.prefix}music anorm on\` or \`${config.prefix}music anorm off\` to change it.`)]
  });
};

export default { name, description, subcommand, execute };
