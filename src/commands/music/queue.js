import playerManager from '../../services/music/playerManager.js';
import config from '../../config/index.js';
import { buildQueueEmbed, buildQueueButtons, TRACKS_PER_PAGE } from '../../utils/queueBuilder.js';
import { ComponentType, MessageFlags } from 'discord.js';

const name = 'queue';
const description = 'Display the track queue';
const subcommand = true;

const execute = async (message) => {
  const player = playerManager.getPlayer(message.guild.id);
  if (!player || player.queue.length === 0) {
    return message.reply(`📜 The queue is empty. Use \`${config.prefix}music play <track>\` to add tracks.`);
  }

  const totalPages = Math.ceil(player.queue.length / TRACKS_PER_PAGE);
  let currentPage = 0;

  const reply = await message.reply({
    embeds: [buildQueueEmbed(player, currentPage)],
    components: totalPages > 1 ? [buildQueueButtons(player, currentPage)] : [],
  });

  if (totalPages <= 1) return;

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      return interaction.reply({
        content: '❌ Only the command author can use this navigation.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId.startsWith('music_queuepage_')) {
      currentPage = parseInt(interaction.customId.split('_')[2], 10);
      await interaction.update({
        embeds: [buildQueueEmbed(player, currentPage)],
        components: [buildQueueButtons(player, currentPage)],
      });
    }
  });

  collector.on('end', async () => {
    await reply.edit({ components: [] }).catch(() => {});
  });
};

export default { name, description, subcommand, execute };
