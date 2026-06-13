import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { formatDuration, truncate } from './formatters.js';
import config from '../config/index.js';

export const TRACKS_PER_PAGE = 10;

export const buildQueueEmbed = (player, page) => {
  const totalPages = Math.ceil(player.queue.length / TRACKS_PER_PAGE) || 1;
  const start = page * TRACKS_PER_PAGE;
  const end = Math.min(start + TRACKS_PER_PAGE, player.queue.length);

  const lines = [];
  for (let i = start; i < end; i++) {
    const track = player.queue[i];
    const isNowPlaying = i === player.currentIndex;
    const prefix = isNowPlaying ? '🎵' : `${i + 1}.`;
    const suffix = isNowPlaying ? ' **(Now Playing)**' : '';
    lines.push(`${prefix} ${truncate(track.title, 45)} \`${track.durationRaw}\`${suffix}`);
  }

  const totalDuration = player.queue.reduce((sum, t) => sum + t.duration, 0);

  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle('📜 Music Queue')
    .setDescription(lines.length > 0 ? lines.join('\n') : 'The queue is empty.')
    .setFooter({
      text: `Page ${page + 1}/${totalPages} | ${player.queue.length} songs | Total: ${formatDuration(totalDuration)}`,
    })
    .setTimestamp();
};

export const buildQueueButtons = (player, page) => {
  const totalPages = Math.ceil(player.queue.length / TRACKS_PER_PAGE) || 1;
  
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_queuepage_${page - 1}`)
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`music_queuepage_${page + 1}`)
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
};
