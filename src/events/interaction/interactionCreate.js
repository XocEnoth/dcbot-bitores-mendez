import playerManager from '../../services/music/playerManager.js';
import lyricsService from '../../services/music/lyricsService.js';
import { truncate } from '../../utils/formatters.js';
import { buildQueueEmbed, buildQueueButtons, TRACKS_PER_PAGE } from '../../utils/queueBuilder.js';
import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

const name = 'interactionCreate';

const MUSIC_BUTTONS = [
  'music_playpause', 'music_skip', 'music_stop', 'music_queue', 'music_shuffle', 'music_repeat', 'music_lyrics', 'music_stop_confirm', 'music_stop_cancel',
  'music_prev', 'music_rewind', 'music_forward', 'music_save', 'music_voldown', 'music_mute', 'music_volup'
];

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
        } else {
          player.pause();
        }
        await interaction.deferUpdate().catch(() => {});
        break;

      case 'music_prev': {
        if (player.isPlaying) {
          player.jump(0);
        }
        await interaction.deferUpdate().catch(() => {});
        break;
      }

      case 'music_rewind': {
        if (player.isPlaying) {
          if (player.currentIndex > 0) {
            player.jump(player.currentIndex - 1);
          } else {
            player.jump(0);
          }
        }
        await interaction.deferUpdate().catch(() => {});
        break;
      }

      case 'music_forward': {
        if (player.isPlaying) {
          player.skip();
        }
        await interaction.deferUpdate().catch(() => {});
        break;
      }

      case 'music_skip': {
        if (player.isPlaying && player.queue.length > 0) {
          player.jump(player.queue.length - 1);
        }
        await interaction.deferUpdate().catch(() => {});
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
        player.isQueueVisible = !player.isQueueVisible;
        if (player.isQueueVisible) {
          player.isLyricsVisible = false;
        }
        player.updateNowPlayingMessage();
        await interaction.deferUpdate().catch(() => {});
        break;
      }

      case 'music_shuffle': {
        player.shuffle();
        await interaction.deferUpdate().catch(() => {});
        break;
      }

      case 'music_repeat': {
        player.isRepeat = !player.isRepeat;
        player.updateNowPlayingMessage();
        await interaction.deferUpdate().catch(() => {});
        break;
      }

      case 'music_lyrics': {
        if (!player.isPlaying || !player.currentTrack) {
          await interaction.deferUpdate().catch(() => {});
          break;
        }

        player.isLyricsVisible = !player.isLyricsVisible;

        if (player.isLyricsVisible) {
          player.isQueueVisible = false;
          await interaction.deferUpdate().catch(() => {});

          const track = player.currentTrack;
          player.updateNowPlayingMessage(); // Update UI to show button state change
          player.fetchLyricsIfVisible(); // Fetch lyrics asynchronously
        } else {
          player.updateNowPlayingMessage();
          await interaction.deferUpdate().catch(() => {});
        }
        break;
      }

      default:
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ This feature will be implemented soon.')],
          flags: MessageFlags.Ephemeral,
        });
        break;
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
