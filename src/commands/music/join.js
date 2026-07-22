import playerManager from '../../services/music/playerManager.js';
import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';

const name = 'join';
const description = 'Join the voice channel without playing anything';

/**
 * Executes the join command to connect the bot to the author's voice channel.
 *
 * @param {import('discord.js').Message} message - The Discord message object.
 */
const execute = async (message) => {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must join a voice channel first.')] });
  }

  const permissions = voiceChannel.permissionsFor(message.client.user);
  if (!permissions.has('Connect') || !permissions.has('Speak')) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ The bot does not have permission to join or speak in this voice channel.')] });
  }

  const player = playerManager.getOrCreatePlayer(message.guild.id);
  
  if (player.voiceChannel && player.voiceChannel.id !== voiceChannel.id) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ The bot is currently in another voice channel.')] });
  }

  if (!player.connection) {
    try {
      await player.connect(voiceChannel, message.channel);
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setDescription(`✅ Successfully joined ${voiceChannel}`);
      return message.reply({ embeds: [embed] });
    } catch (error) {
      playerManager.destroyPlayer(message.guild.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`❌ ${error.message}`)] });
    }
  } else {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ The bot is already in your voice channel.')] });
  }
};

export default { name, description, execute };
