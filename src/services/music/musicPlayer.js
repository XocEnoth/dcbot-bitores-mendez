import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
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
import ffmpegPath from 'ffmpeg-static';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import config from '../../config/index.js';
import { formatDuration, truncate } from '../../utils/formatters.js';
import logger from '../../utils/logger.js';
import audioNormalizer from './audioNormalizer.js';

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
    this.isNormalizerEnabled = true;
    this.nowPlayingMessage = null;
    this.idleTimeout = null;
    this.destroyed = false;
    this.onDestroy = null;
    this._currentProcess = null;
    this._ffmpegProcess = null;
    this._consecutiveFailures = 0;
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

    // Prevent unhandled error crash (e.g., IP discovery socket closed, Cloudflare 522)
    this.connection.on('error', (error) => {
      logger.error(`Voice connection error in guild ${this.guildId}`, error);
      
      // Auto-destroy on fatal network drops to prevent infinite error loops
      const fatal = [
        'socket closed',
        'Cannot perform IP discovery',
        'Unexpected server response',
      ];
      if (fatal.some(msg => error.message?.includes(msg))) {
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
    } else {
      this._preNormalizeNext();
    }
  }

  async insertTracks(tracks) {
    // Insert right after the current track so it plays next
    const insertPos = this.currentIndex + 1;
    this.queue.splice(insertPos, 0, ...tracks);

    if (!this.isPlaying) {
      this.currentIndex = insertPos - 1;
      await this.playNext();
    } else {
      this._preNormalizeNext();
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
      // ================================================================
      // Phase 1: Loudness Measurement
      // ================================================================
      let gainDb = 0;
      if (this.isNormalizerEnabled) {
        const { gainDb: calculatedGain, measuredLufs } = await audioNormalizer.measure(track);
        gainDb = calculatedGain;
        logger.info(`[Normalizer] Track: ${track.title}`);
        logger.info(`[Normalizer] Measured: ${measuredLufs} LUFS`);
        logger.info(`[Normalizer] Applied Gain: ${gainDb > 0 ? '+' : ''}${gainDb} dB`);
      } else {
        logger.info(`[Normalizer] Skipped for: ${track.title} (Audio Normalizer Disabled)`);
      }

      // ================================================================
      // Phase 2: yt-dlp Audio Stream
      // ================================================================
      const useCookies = hasCookies();
      const ytDlpOptions = {
        o: '-',
        q: '',
        f: 'bestaudio/best',
        forceIpv4: true,
        geoBypass: true,
        noWarnings: true,
        rmCacheDir: true,
        jsRuntimes: `node:${process.execPath}`,
      };

      if (useCookies) {
        ytDlpOptions.cookies = COOKIES_PATH;
      }
      // Let yt-dlp auto-detect the best client and solve signatures via Node.js

      const subprocess = youtubeDl.exec(track.url, ytDlpOptions);

      this._currentProcess = subprocess;

      subprocess.catch((err) => {
        // Suppress expected SIGTERM/kill errors
        if (!err.killed && err.signal !== 'SIGTERM' && err.exitCode !== 255) {
          logger.error(`[Player] yt-dlp process failed for "${track.title}":`, err);
        }
      });

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

      // Background pre-normalization is triggered at the end of this function

      // ================================================================
      // Phase 3: FFmpeg Normalization Pipeline
      // ================================================================
      // Instead of feeding yt-dlp's raw output directly to discord.js
      // (which would run its own FFmpeg internally), we explicitly pipe
      // through our own FFmpeg instance with the volume filter applied.
      //
      // Pipeline: yt-dlp stdout → FFmpeg (volume filter) → PCM output → discord.js
      //
      // For recorded tracks: "volume=XdB" — simple, zero-overhead gain adjustment
      // For live streams:    "loudnorm" — real-time dynamic normalization
      //
      // Output format: signed 16-bit little-endian PCM, 48kHz stereo
      // This matches discord.js StreamType.Raw, which only needs Opus encoding
      // (done efficiently by opusscript) — no additional FFmpeg decode step.
      const isLive = !track.duration || track.duration <= 0;
      const audioFilter = isLive
        ? 'loudnorm=I=-14:LRA=11:TP=-1.5'  // Real-time normalization for live
        : `volume=${gainDb}dB`;              // Static gain for recorded tracks

      const ffmpegProc = spawn(ffmpegPath, [
        '-i', 'pipe:0',        // Read from stdin (piped from yt-dlp)
        '-af', audioFilter,    // Audio filter: volume gain or loudnorm
        '-f', 's16le',         // Output format: signed 16-bit little-endian PCM
        '-ar', '48000',        // Sample rate: 48kHz (Discord standard)
        '-ac', '2',            // Channels: stereo
        'pipe:1',              // Output to stdout
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      this._ffmpegProcess = ffmpegProc;

      // Pipe yt-dlp output into FFmpeg's stdin
      subprocess.stdout.pipe(ffmpegProc.stdin);

      // Suppress pipe errors that occur naturally when skip/stop kills processes
      ffmpegProc.stdin.on('error', () => {});
      ffmpegProc.on('error', (err) => {
        logger.error(`FFmpeg normalizer error: ${err.message}`);
      });

      let ffmpegStderr = '';
      if (ffmpegProc.stderr) {
        ffmpegProc.stderr.on('data', (data) => {
          ffmpegStderr += data.toString();
        });
      }

      ffmpegProc.on('close', (code) => {
        // Code 255 = killed by SIGTERM (normal during skip/stop)
        if (code && code !== 0 && code !== 255) {
          logger.error(`FFmpeg normalizer exited with code ${code}. Stderr: ${ffmpegStderr.trim()}`);
        }
      });

      // Create audio resource from FFmpeg's normalized PCM output
      // StreamType.Raw tells discord.js the input is already decoded PCM
      // and only needs Opus encoding (no additional FFmpeg decode step)
      const resource = createAudioResource(ffmpegProc.stdout, {
        inputType: StreamType.Raw,
      });

      this.player.play(resource);
      this.isPlaying = true;
      this.isPaused = false;
      this._consecutiveFailures = 0; // Reset on successful play

      await this._sendNowPlaying();
      this._preNormalizeNext();
    } catch (error) {
      logger.error(`Failed to play: ${track.title}`, error);
      await this.textChannel
        ?.send({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`❌ Failed to play **${truncate(track.title, 50)}**. Skipping...\n\n*If this issue persists, please contact Discord: **xocenoth**.*`)] })
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
    this._preNormalizeNext();
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
    // Kill yt-dlp subprocess
    if (this._currentProcess) {
      try {
        if (!this._currentProcess.killed) this._currentProcess.kill('SIGKILL');
      } catch {}
      this._currentProcess = null;
    }
    // Kill FFmpeg normalizer subprocess
    if (this._ffmpegProcess) {
      try {
        if (!this._ffmpegProcess.killed) this._ffmpegProcess.kill('SIGKILL');
      } catch {}
      this._ffmpegProcess = null;
    }
  }

  async _sendNowPlaying() {
    const track = this.currentTrack;
    if (!track || !this.textChannel) return;

    const requesterId = track.requester ? track.requester.id : this.textChannel.client.user.id;
    const duration = track.durationRaw || formatDuration(track.duration);
    const progressBar = `\`00:00:00\` [🔘──────────────] \`${duration}\``;

    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle(truncate(track.title, 256))
      .setDescription(`> **By:** ${truncate(track.author, 50)}\n> **Requested By:** <@${requesterId}>\n\n${progressBar}`)
      .addFields(
        { name: 'Volume', value: '100%', inline: true },
        { name: 'Duration', value: duration, inline: true },
        { name: 'Queue', value: `${this.upcomingTracks.length} Songs`, inline: true }
      );

    if (track.thumbnail) {
      embed.setImage(track.thumbnail);
    }

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music_prev').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_rewind').setEmoji('⏪').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_playpause').setEmoji('⏸️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('music_forward').setEmoji('⏩').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music_repeat').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('music_save').setEmoji('💾').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_lyrics').setEmoji('📜').setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music_voldown').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_mute').setEmoji('🔇').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('music_volup').setEmoji('🔊').setStyle(ButtonStyle.Secondary)
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
        components: [row1, row2, row3],
      });
    } catch (error) {
      logger.error('Failed to send now playing message', error);
    }
  }

  _handleIdle() {
    // Protect against infinite skip loops when yt-dlp fails repeatedly
    this._consecutiveFailures++;
    if (this._consecutiveFailures >= 3) {
      this._consecutiveFailures = 0;
      this.isPlaying = false;
      this.isPaused = false;
      this.textChannel
        ?.send({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription('⚠️ Multiple tracks failed to play consecutively. Stopping playback to prevent loop. Please try again or check if YouTube is blocking the bot.')] })
        .catch(() => {});
      if (!this.is247) {
        this._startIdleTimeout();
      }
      return;
    }

    if (this.isRepeat && this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      this.playNext(true);
    } else {
      this.playNext();
    }
  }

  _preNormalizeNext() {
    // Abort any existing background pre-normalization to free up system resources
    if (this._preNormalizeAbortController) {
      try {
        this._preNormalizeAbortController.abort();
      } catch {}
      this._preNormalizeAbortController = null;
    }

    const nextIndex = this.currentIndex + 1;
    if (nextIndex < this.queue.length) {
      const nextTrack = this.queue[nextIndex];
      // Live streams cannot be pre-normalized
      if (nextTrack.duration && nextTrack.duration > 0) {
        this._preNormalizeAbortController = new AbortController();
        audioNormalizer.measure(nextTrack, this._preNormalizeAbortController.signal).catch((error) => {
          // Suppress warnings for expected aborts
          if (error.message !== 'aborted') {
            logger.warn(`[Normalizer] Background pre-normalization failed for "${nextTrack.title}": ${error.message}`);
          }
        });
      }
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

    if (this._preNormalizeAbortController) {
      try {
        this._preNormalizeAbortController.abort();
      } catch {}
      this._preNormalizeAbortController = null;
    }

    if (this.onDestroy) {
      this.onDestroy(this.guildId);
    }
  }
}

export default MusicPlayer;
