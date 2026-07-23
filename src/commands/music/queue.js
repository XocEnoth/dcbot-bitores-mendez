import playerManager from '../../services/music/playerManager.js';
import config from '../../config/index.js';
import { buildQueueEmbed, buildQueueButtons, TRACKS_PER_PAGE } from '../../utils/queueBuilder.js';
import { EmbedBuilder } from 'discord.js';

const name = 'queue';
const description = 'Display the track queue';

/**
 * Executes the queue command to render the current track queue embed.
 *
 * @param {import('discord.js').Message} message - The Discord message object.
 */
const execute = async (message) => {
  const player = playerManager.getPlayer(message.guild.id);
  if (!player || player.queue.length === 0) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`📜 The queue is empty. Use \`${config.prefix}play <track>\` to add tracks.`)] });
  }

  if (player.queue.length <= 1) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`📜 There are no upcoming tracks in the queue. Use \`${config.prefix}play <track>\` to add more.`)] });
  }

  // Set the initial queue visibility true if invoked via command
  player.isQueueVisible = true;
  const totalPages = Math.ceil(player.queue.length / TRACKS_PER_PAGE);
  let currentPage = 0;

  await message.reply({
    embeds: [buildQueueEmbed(player, currentPage)],
    components: totalPages > 1 ? [buildQueueButtons(player, currentPage)] : [],
  });

  // The interaction collector has been removed because music_queuepage_ is handled globally
  // by interactionCreate.js. This prevents the 'Interaction has already been acknowledged' bug.
};

export default { name, description, execute };
