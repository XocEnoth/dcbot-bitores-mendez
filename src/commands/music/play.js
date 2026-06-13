import playerManager from '../../services/music/playerManager.js';
import trackResolver from '../../services/music/trackResolver.js';
import { truncate } from '../../utils/formatters.js';
import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

const name = 'play';
const description = 'Play a track from YouTube or Spotify';
const subcommand = true;

const execute = async (message, args) => {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply('❌ You must join a voice channel first.');
  }

  let page = 1;
  if (args.length > 1 && !isNaN(args[args.length - 1])) {
    page = parseInt(args.pop(), 10);
    if (page < 1) page = 1;
  }

  const query = args.join(' ');
  if (!query) {
    return message.reply(`❌ Please enter a search query or URL.\nExample: \`${config.prefix}music play never gonna give you up\` or \`${config.prefix}music play <playlist_url> 2\``);
  }

  const permissions = voiceChannel.permissionsFor(message.client.user);
  if (!permissions.has('Connect') || !permissions.has('Speak')) {
    return message.reply('❌ The bot does not have permission to join or speak in this voice channel.');
  }

  const player = playerManager.getOrCreatePlayer(message.guild.id);

  if (player.voiceChannel && player.voiceChannel.id !== voiceChannel.id) {
    return message.reply('❌ The bot is currently being used in another voice channel.');
  }

  if (!player.connection) {
    try {
      await player.connect(voiceChannel, message.channel);
    } catch (error) {
      playerManager.destroyPlayer(message.guild.id);
      return message.reply(`❌ ${error.message}`);
    }
  }

  const loadingMsg = await message.reply('🔍 Searching...');

  try {
    const tracks = await trackResolver.resolve(query, page);

    if (tracks.length === 0) {
      return loadingMsg.edit('❌ No results found for that search query.');
    }

    await player.addTracks(tracks);

    if (tracks.length === 1) {
      const track = tracks[0];
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('✅ Added to Queue')
        .setDescription(`**${truncate(track.title, 60)}**`)
        .addFields(
          { name: 'Artist', value: truncate(track.author, 40), inline: true },
          { name: 'Duration', value: track.durationRaw, inline: true },
          { name: 'Position', value: `#${player.queue.length}`, inline: true },
        );

      if (track.thumbnail) embed.setThumbnail(track.thumbnail);
      await loadingMsg.edit({ content: null, embeds: [embed] });
    } else {
      const pageInfo = page > 1 ? ` (Page ${page})` : '';
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`✅ Playlist Added${pageInfo}`)
        .setDescription(`**${tracks.length}** tracks added to the queue.`);
      await loadingMsg.edit({ content: null, embeds: [embed] });
    }
  } catch (error) {
    logger.error('Error resolving track', error);
    await loadingMsg.edit(`❌ ${error.message || 'An error occurred while searching for the track.'}`);
  }
};

export default { name, description, subcommand, execute };
