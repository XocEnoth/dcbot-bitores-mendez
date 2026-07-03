import playerManager from '../../services/music/playerManager.js';
import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';

const name = 'repeat';
const description = 'Toggle repeat mode for the current track';
const subcommand = true;

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
    if (player.isRepeat) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ Repeat mode is already enabled.')] });
    }
    player.isRepeat = true;
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('🔁 Repeat mode has been **enabled**. The current track will loop until repeat is turned off.')] });
  }

  if (mode === 'off') {
    if (!player.isRepeat) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ Repeat mode is already disabled.')] });
    }
    player.isRepeat = false;
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('🔁 Repeat mode has been **disabled**. Playback will continue to the next track.')] });
  }

  const status = player.isRepeat ? '**Enabled** ✅' : '**Disabled** ❌';
  await message.reply({
    embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`🔁 Repeat mode status: ${status}\nUse \`${config.prefix}music repeat on\` or \`${config.prefix}music repeat off\` to change it.`)]
  });
};

export default { name, description, subcommand, execute };
