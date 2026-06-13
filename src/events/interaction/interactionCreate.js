import playerManager from '../../services/music/playerManager.js';
import { truncate } from '../../utils/formatters.js';
import { buildQueueEmbed, buildQueueButtons, TRACKS_PER_PAGE } from '../../utils/queueBuilder.js';
import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

const name = 'interactionCreate';

const MUSIC_BUTTONS = ['music_playpause', 'music_skip', 'music_stop', 'music_queue', 'music_shuffle', 'music_stop_confirm', 'music_stop_cancel'];

const execute = async (interaction) => {
  if (!interaction.isButton()) return;
  if (!MUSIC_BUTTONS.includes(interaction.customId) && !interaction.customId.startsWith('music_queuepage_')) return;

  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must be in a voice channel to control the music.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const player = playerManager.getPlayer(interaction.guildId);
  if (!player) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ No music is currently playing.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (voiceChannel.id !== player.voiceChannel?.id) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ You must be in the same voice channel as the bot.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    switch (interaction.customId) {
      case 'music_playpause':
        if (player.isPaused) {
          player.resume();
          await interaction.reply({
            embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('▶ Playback resumed.')],
            flags: MessageFlags.Ephemeral,
          });
        } else {
          player.pause();
          await interaction.reply({
            embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⏸ Playback paused.')],
            flags: MessageFlags.Ephemeral,
          });
        }
        break;

      case 'music_skip': {
        const title = truncate(player.currentTrack?.title, 50) || 'Unknown';
        await player.skip();
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`⏭ Skipped **${title}**.`)],
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case 'music_stop': {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('music_stop_confirm')
            .setLabel('Yes, Stop')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('music_stop_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ Are you sure you want to stop the music and clear the queue?')],
          components: [confirmRow],
        });
        break;
      }

      case 'music_stop_confirm':
        await player.stop();
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⏹ Playback stopped.')],
          components: []
        });
        break;

      case 'music_stop_cancel':
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ Action cancelled.')],
          components: []
        });
        break;

      case 'music_queue': {
        if (player.queue.length === 0) {
          return interaction.reply({
            embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('📜 The queue is empty.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        const totalPages = Math.ceil(player.queue.length / TRACKS_PER_PAGE);
        await interaction.reply({
          embeds: [buildQueueEmbed(player, 0)],
          components: totalPages > 1 ? [buildQueueButtons(player, 0)] : [],
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case 'music_shuffle': {
        if (player.queue.length <= player.currentIndex + 1) {
          await interaction.reply({
            embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ Not enough upcoming tracks in the queue to shuffle.')],
            flags: MessageFlags.Ephemeral,
          });
        } else if (player.shuffle()) {
          await interaction.reply({
            embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('🔀 The queue has been shuffled.')],
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ Not enough upcoming tracks to shuffle.')],
            flags: MessageFlags.Ephemeral,
          });
        }
        break;
      }
    }

    if (interaction.customId.startsWith('music_queuepage_')) {
      const page = parseInt(interaction.customId.split('_')[2], 10);
      const totalPages = Math.ceil(player.queue.length / TRACKS_PER_PAGE);
      await interaction.update({
        embeds: [buildQueueEmbed(player, page)],
        components: totalPages > 1 ? [buildQueueButtons(player, page)] : [],
      });
    }
  } catch (error) {
    logger.error('Error handling music button', error);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('❌ An error occurred.')],
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
};

export default { name, execute };
