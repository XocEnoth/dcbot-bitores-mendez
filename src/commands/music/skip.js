import playerManager from '../../services/music/playerManager.js';
import { truncate } from '../../utils/formatters.js';

const name = 'skip';
const description = 'Skip the currently playing track';
const subcommand = true;

const execute = async (message) => {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply('❌ You must join a voice channel first.');
  }

  const player = playerManager.getPlayer(message.guild.id);
  if (!player || !player.isPlaying) {
    return message.reply('❌ No track is currently playing.');
  }

  if (voiceChannel.id !== player.voiceChannel?.id) {
    return message.reply('❌ You must be in the same voice channel as the bot.');
  }

  const skippedTitle = truncate(player.currentTrack?.title, 50) || 'Unknown';
  await player.skip();
  await message.reply(`⏭ Skipped **${skippedTitle}**.`);
};

export default { name, description, subcommand, execute };
