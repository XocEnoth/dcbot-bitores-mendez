import fs from 'fs';
import path from 'path';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} from '@discordjs/voice';
import youtubeDl from 'youtube-dl-exec';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import config from '../../config/index.js';
import { formatDuration, truncate } from '../../utils/formatters.js';
import logger from '../../utils/logger.js';

const IDLE_TIMEOUT_MS = 300_000; // 5 minutes
const CONNECTION_TIMEOUT_MS = 30_000; // 30 seconds

// Resolve cookies.txt path once at startup
const COOKIES_PATH = path.resolve(process.cwd(), 'cookies.txt');

/**
 * Check if cookies.txt exists and contains actual cookie data (not just comments).
 */
function hasCookies() {
  try {
    if (!fs.existsSync(COOKIES_PATH)) return false;
    const content = fs.readFileSync(COOKIES_PATH, 'utf8');
    return content.split('\n').some(line => line.trim() && !line.trim().startsWith('#'));
  } catch {
    return false;
  }
}

class MusicPlayer {
  constructor(guildId) {
    this.guildId = guildId;
    this.textChannel = null;
    this.voiceChannel = null;
    this.connection = null;
    this.player = null;
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isPaused = false;
    this.is247 = false;
    this.isRepeat = false;
    this.nowPlayingMessage = null;
    this.idleTimeout = null;
    this.destroyed = false;
    this.onDestroy = null;
    this._currentProcess = null;
  }

  async connect(voiceChannel, textChannel) {
    this.voiceChannel = voiceChannel;
    this.textChannel = textChannel;
    this.destroyed = false;

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: this.guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });

    this.connection.subscribe(this.player);

    // Handle audio player state transitions
    this.player.on(AudioPlayerStatus.Idle, () => this._handleIdle());
    this.player.on('error', (error) => this._handleError(error));

    // Handle voice connection disconnects
    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });

    // Prevent unhandled error crash (e.g., IP discovery socket closed)
    this.connection.on('error', (error) => {
      logger.error(`Voice connection error in guild ${this.guildId}`, error);
      
      // Auto-destroy on fatal network drops to prevent infinite error loops
      if (error.message.includes('socket closed') || error.message.includes('Cannot perform IP discovery')) {
        logger.info(`Destroying broken connection for guild ${this.guildId}`);
        this.destroy();
      }
    });

    this.connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (!this.destroyed) {
        this.destroyed = true;
        this._cleanup();
      }
    });

    // Wait for connection to be ready
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, CONNECTION_TIMEOUT_MS);
    } catch {
      this.destroy();
      throw new Error('Failed to connect to the voice channel within 30 seconds.');
    }
  }

  async addTracks(tracks) {
    const startIndex = this.queue.length;
    this.queue.push(...tracks);

    if (!this.isPlaying) {
      this.currentIndex = startIndex - 1;
      await this.playNext();
    }
  }

  async insertTracks(tracks) {
    // Insert right after the current track so it plays next
    const insertPos = this.currentIndex + 1;
    this.queue.splice(insertPos, 0, ...tracks);

    if (!this.isPlaying) {
      this.currentIndex = insertPos - 1;
      await this.playNext();
    }
  }

  async playNext(replay = false) {
    if (this.destroyed) return;

    this._killProcess();
    this._clearIdleTimeout();

    if (!replay) {
      this.currentIndex++;
    }

    if (this.currentIndex >= this.queue.length) {
      this.isPlaying = false;
      this.isPaused = false;

      if (!this.is247) {
        this._startIdleTimeout();
      }
      return;
    }

    const track = this.queue[this.currentIndex];

    try {
      const useCookies = hasCookies();
      const ytDlpOptions = {
        o: '-',
        q: '',
        f: 'bestaudio/best',
        r: '100K',
        forceIpv4: true,
        geoBypass: true,
        noWarnings: true,
        rmCacheDir: true,
      };

      if (useCookies) {
        // Web client supports cookies; provide Node.js for JS signature resolution
        ytDlpOptions.cookies = COOKIES_PATH;
        ytDlpOptions.extractorArgs = 'youtube:player_client=web';
        ytDlpOptions.jsRuntimes = `node:${process.execPath}`;
      } else {
        // Android/iOS clients don't need JS signature solving (fastest)
        ytDlpOptions.extractorArgs = 'youtube:player_client=android,ios;player_skip=webpage,configs,js';
      }

      const subprocess = youtubeDl.exec(track.url, ytDlpOptions);

      this._currentProcess = subprocess;

      subprocess.catch(() => {});

      if (subprocess.stderr) {
        subprocess.stderr.on('data', (data) => {
          const msg = data.toString();
          if (!msg.includes('Broken pipe') && !msg.includes('Invalid argument')) {
            logger.warn(`yt-dlp stderr: ${msg}`);
          }
        });
      }

      if (!subprocess.stdout) {
        throw new Error('Failed to create audio stream');
      }

      const resource = createAudioResource(subprocess.stdout, {
        inputType: StreamType.Arbitrary,
      });

      this.player.play(resource);
      this.isPlaying = true;
      this.isPaused = false;

      await this._sendNowPlaying();
    } catch (error) {
      logger.error(`Failed to play: ${track.title}`, error);
      await this.textChannel
        ?.send({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`❌ Failed to play **${truncate(track.title, 50)}**. Skipping...`)] })
        .catch(() => {});
      await this.playNext();
    }
  }

  pause() {
    if (this.isPlaying && !this.isPaused) {
      this.player.pause();
      this.isPaused = true;
      return true;
    }
    return false;
  }

  resume() {
    if (this.isPaused) {
      this.player.unpause();
      this.isPaused = false;
      return true;
    }
    return false;
  }

  async skip() {
    if (!this.isPlaying) return false;
    this._killProcess();
    this.player.stop();
    return true;
  }

  async stop() {
    this._killProcess();
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isPaused = false;
    this.player?.stop(true);

    if (!this.is247) {
      this._startIdleTimeout();
    }
  }

  shuffle() {
    if (this.queue.length <= this.currentIndex + 2) return false;
    
    // Extract upcoming tracks
    const upcoming = this.queue.slice(this.currentIndex + 1);
    
    // Fisher-Yates shuffle
    for (let i = upcoming.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
    }
    
    // Re-assemble queue
    this.queue = [
      ...this.queue.slice(0, this.currentIndex + 1),
      ...upcoming
    ];
    return true;
  }

  get currentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex];
    }
    return null;
  }

  get upcomingTracks() {
    return this.queue.slice(this.currentIndex + 1);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._killProcess();
    this._clearIdleTimeout();
    this.player?.stop(true);
    this.connection?.destroy();
    this._cleanup();
  }

  // --- Private methods ---

  _killProcess() {
    if (this._currentProcess) {
      try {
        this._currentProcess.kill('SIGTERM');
      } catch {
        // Process may have already exited
      }
      this._currentProcess = null;
    }
  }

  async _sendNowPlaying() {
    const track = this.currentTrack;
    if (!track || !this.textChannel) return;

    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle('🎶 Now Playing')
      .addFields(
        { name: 'Song', value: truncate(track.title, 60), inline: true },
        { name: 'Artist', value: truncate(track.author, 40), inline: true },
        { name: 'Duration', value: track.durationRaw || formatDuration(track.duration), inline: true },
        { name: 'Status', value: this.isRepeat ? '🔁 Repeating' : '▶ Playing', inline: true },
      )
      .setFooter({ text: `Queue: ${this.upcomingTracks.length} more song(s)${this.isRepeat ? ' | 🔁 Repeat On' : ''}` })
      .setTimestamp();

    if (track.thumbnail) {
      embed.setThumbnail(track.thumbnail);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music_playpause')
        .setLabel('Play/Pause')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('music_shuffle')
        .setLabel('Shuffle')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_repeat')
        .setLabel('Repeat')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_skip')
        .setLabel('Skip')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_stop')
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music_lyrics')
        .setLabel('Show Lyrics')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_queue')
        .setLabel('Show Queue')
        .setStyle(ButtonStyle.Secondary),
    );

    // Delete old now playing message
    try {
      await this.nowPlayingMessage?.delete().catch(() => {});
    } catch {
      // Ignore if already deleted
    }

    try {
      this.nowPlayingMessage = await this.textChannel.send({
        embeds: [embed],
        components: [row, row2],
      });
    } catch (error) {
      logger.error('Failed to send now playing message', error);
    }
  }

  _handleIdle() {
    if (this.isRepeat && this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      this.playNext(true);
    } else {
      this.playNext();
    }
  }

  _handleError(error) {
    logger.error(`Audio player error in guild ${this.guildId}`, error);
    this.playNext();
  }

  _startIdleTimeout() {
    this._clearIdleTimeout();
    this.idleTimeout = setTimeout(() => {
      if (!this.isPlaying && !this.is247) {
        this.textChannel
          ?.send({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('👋 No track is being played. The bot has left the voice channel.')] })
          .catch(() => {});
        this.destroy();
      }
    }, IDLE_TIMEOUT_MS);
  }

  _clearIdleTimeout() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  _cleanup() {
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isPaused = false;
    this.isRepeat = false;
    this.connection = null;
    this.player = null;
    this.nowPlayingMessage = null;
    this._clearIdleTimeout();

    if (this.onDestroy) {
      this.onDestroy(this.guildId);
    }
  }
}

export default MusicPlayer;
