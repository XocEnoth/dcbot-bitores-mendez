import playerManager from '../../services/music/playerManager.js';

const name = 'resume';
const description = 'Resume the paused track';
const subcommand = true;

const execute = async (message) => {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply('❌ You must join a voice channel first.');
  }

  const player = playerManager.getPlayer(message.guild.id);
  if (!player) {
    return message.reply('❌ No track is currently playing.');
  }

  if (voiceChannel.id !== player.voiceChannel?.id) {
    return message.reply('❌ You must be in the same voice channel as the bot.');
  }

  if (!player.isPaused) {
    return message.reply('⚠️ The track is not paused.');
  }

  player.resume();
  await message.reply('▶ Playback resumed.');
};

export default { name, description, subcommand, execute };
