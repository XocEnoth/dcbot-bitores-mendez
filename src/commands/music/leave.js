import playerManager from '../../services/music/playerManager.js';

const name = 'leave';
const description = 'Disconnect the bot from the voice channel';
const subcommand = true;

const execute = async (message) => {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply('❌ You must join a voice channel first.');
  }

  const player = playerManager.getPlayer(message.guild.id);
  if (!player || !player.connection) {
    return message.reply('❌ The bot is not currently in a voice channel.');
  }

  if (voiceChannel.id !== player.voiceChannel?.id) {
    return message.reply('❌ You must be in the same voice channel as the bot.');
  }

  playerManager.destroyPlayer(message.guild.id);
  await message.reply('👋 The bot has left the voice channel.');
};

export default { name, description, subcommand, execute };
