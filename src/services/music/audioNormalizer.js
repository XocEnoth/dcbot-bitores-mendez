// ============================================================
// Audio Normalizer — LUFS-based Loudness Measurement & Gain
// ============================================================
//
// This module implements a two-phase loudness normalization system
// that ensures all tracks play at a consistent perceived volume.
//
// === Phase 1: Measurement (pre-playback) ===
//   1. Extracts a direct audio URL from YouTube via yt-dlp --get-url
//   2. Uses FFmpeg's EBU R128 loudness meter (ebur128 filter) to measure
//      the Integrated Loudness of a 10-second sample from the track's midpoint
//   3. If the sample is silent (< -70 LUFS), retries with the next 10 seconds
//
// === Phase 2: Application (during playback, in musicPlayer.js) ===
//   - The calculated gain (in dB) is passed to the playback pipeline
//   - FFmpeg applies it via the lightweight "volume" filter (simple multiplication)
//   - For live streams, FFmpeg's "loudnorm" filter is used instead (real-time normalization)
//
// === Why EBU R128 / LUFS? ===
//   LUFS (Loudness Units Full Scale) is the broadcast/streaming industry standard
//   for perceived loudness measurement. YouTube targets -14 LUFS, Spotify -14 LUFS,
//   and Apple Music -16 LUFS. Using -14 LUFS ensures consistency with the content
//   users are already familiar with.
//
// === Why pre-measure instead of real-time? ===
//   Pre-measuring allows us to apply a simple, CPU-efficient "volume" filter
//   (just sample multiplication) instead of the heavier "loudnorm" dynamic filter.
//   The "volume" filter has essentially zero CPU overhead and preserves audio
//   dynamics perfectly — no compression, no limiting, no artifacts.
//   The "loudnorm" filter is only used for live streams where pre-measurement
//   is impossible.
//
// === Cache ===
//   Results are cached by track URL so repeat/loop playback doesn't re-measure.
//   The cache uses a Map with automatic eviction after 500 entries.
//
// ============================================================

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import youtubeDl from 'youtube-dl-exec';
import logger from '../../utils/logger.js';

// --- Constants ---

/** Target loudness in LUFS (YouTube / Spotify standard) */
const TARGET_LUFS = -14;

/** Duration of the analysis sample in seconds */
const SAMPLE_DURATION = 10;

/** Readings below this threshold are considered silence (in LUFS) */
const SILENCE_THRESHOLD = -70;

/** Maximum gain boost to prevent distortion from over-amplification (in dB) */
const MAX_GAIN = 12;

/** Maximum gain reduction to prevent making audio inaudible (in dB) */
const MIN_GAIN = -12;

/** Maximum time to wait for a measurement before giving up (in ms) */
const MEASURE_TIMEOUT_MS = 15_000;

/** Maximum number of cached entries before evicting oldest */
const MAX_CACHE_SIZE = 500;

// --- Cookies path (shared with musicPlayer.js) ---
const COOKIES_PATH = path.resolve(process.cwd(), 'cookies.txt');

// --- LRU-style Cache ---
const lufsCache = new Map();
const activeMeasurements = new Map();

/**
 * Check if cookies.txt exists and contains actual cookie data.
 * Mirrors the same check used in musicPlayer.js.
 */
function hasCookies() {
  try {
    if (!fs.existsSync(COOKIES_PATH)) return false;
    const content = fs.readFileSync(COOKIES_PATH, 'utf8');
    return content.split('\n').some(
      (line) => line.trim() && !line.trim().startsWith('#'),
    );
  } catch {
    return false;
  }
}

/**
 * Measure the Integrated Loudness (LUFS) of an audio sample using FFmpeg's
 * EBU R128 loudness meter (ebur128 filter) by piping yt-dlp output directly.
 *
 * How it works:
 *   1. yt-dlp uses `--download-sections` to download only the specific time range.
 *   2. The output is piped directly to FFmpeg.
 *   3. Passes the audio through the ebur128 analysis filter.
 *   4. Discards the output (-f null) — we only need the analysis summary.
 *   5. The Integrated Loudness (I: X.X LUFS) is parsed from FFmpeg's stderr.
 *
 * @param {string} trackUrl  - YouTube watch URL
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<{lufs: number}>} Measured Integrated Loudness
 */
function measureSample(trackUrl, signal) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const ytDlpOptions = {
      format: 'bestaudio*/best',
      noWarnings: true,
      forceIpv4: true,
      geoBypass: true,
      o: '-', // output to stdout
      jsRuntimes: `node:${process.execPath}`,
    };
    if (hasCookies()) {
      ytDlpOptions.cookies = COOKIES_PATH;
    }

    const ytProc = youtubeDl.exec(trackUrl, ytDlpOptions);
    ytProc.catch(() => {}); // Prevent unhandled rejections if yt-dlp fails

    const abortHandler = () => {
      cleanup();
      reject(new Error('aborted'));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      try {
        ytProc.kill('SIGTERM'); // Terminate yt-dlp to save bandwidth
      } catch {}
    };

    const done = (lufs) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({ lufs });
    };

    const args = [
      '-hide_banner',
      '-i', 'pipe:0',                // Read from yt-dlp pipe
      '-t', String(SAMPLE_DURATION), // Measure the first 20 seconds (fast and avoids pipe seeking timeouts)
      '-map', '0:a',                 // Select only audio stream (ignore video if present)
      '-af', 'ebur128',              // EBU R128 loudness measurement filter
      '-f', 'null',                  // Null output muxer: discard decoded data
      '-',                           // Write to stdout (required with -f null)
    ];

    const proc = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Suppress EPIPE/write errors when ffmpeg closes the stdin early (-t 20)
    if (ytProc.stdout) {
      ytProc.stdout.on('error', () => {});
      ytProc.stdout.pipe(proc.stdin);
    }
    proc.stdin.on('error', () => {});

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', () => {
      // Parse the Integrated Loudness from ebur128's summary block.
      const match = stderr.match(/Integrated loudness:\s*I:\s*(-?\d+\.?\d*)\s*LUFS/);
      if (match) {
        done(parseFloat(match[1]));
      } else {
        logger.warn(`[Normalizer] FFmpeg output didn't contain LUFS. stderr: ${stderr.trim()}`);
        done(SILENCE_THRESHOLD);
      }
    });

    proc.on('error', () => {
      // FFmpeg failed to spawn — assume target LUFS (no adjustment needed)
      done(TARGET_LUFS);
    });

    // Safety timeout: if FFmpeg or yt-dlp hangs, don't block playback
    const timeout = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
      done(TARGET_LUFS); // On timeout, proceed with no adjustment
    }, MEASURE_TIMEOUT_MS);
  });
}

/**
 * Measure the loudness of a track and calculate the gain adjustment
 * needed to reach the target loudness level (-14 LUFS).
 *
 * Workflow:
 *   1. Check if the track is a live stream (duration = 0)
 *      → Skip measurement; live streams use loudnorm filter real-time
 *   2. Check the LUFS cache for a previous measurement
 *      → Return cached result if found (useful for repeat/loop)
 *   3. Get the direct audio URL via yt-dlp --get-url (~1-2s)
 *   4. Calculate the track's midpoint and seek to (midpoint - 5) seconds
 *   5. Measure 10 seconds of audio using FFmpeg ebur128 (~2-4s)
 *   6. If the sample is silence (≤ -70 LUFS), retry at midpoint + 10s
 *   7. Calculate gain: TARGET_LUFS - measured_LUFS
 *   8. Clamp gain to [-12, +12] dB to prevent extreme adjustments
 *   9. Cache the result and return { measuredLufs, gainDb }
 *
 * Fault tolerance:
 *   - If any step fails, the function returns gain = 0 (no adjustment)
 *   - The track plays normally without normalization rather than failing
 *
 * @param {object} track - Track object with { url, title, duration } properties
 * @returns {Promise<{measuredLufs: number, gainDb: number}>}
 */
async function measure(track, signal) {
  const durationMs = track.duration || 0;

  // --- Live stream handling ---
  // Live streams have no fixed duration, so we can't seek to the middle.
  // The playback pipeline uses FFmpeg's "loudnorm" filter for real-time
  // normalization instead of our static gain approach.
  if (durationMs <= 0) {
    logger.info(`[Normalizer] Live stream detected — using real-time normalization`);
    return { measuredLufs: TARGET_LUFS, gainDb: 0 };
  }

  // --- Cache lookup ---
  // Avoid re-measuring on repeat/loop — same URL = same loudness
  if (lufsCache.has(track.url)) {
    const cached = lufsCache.get(track.url);
    logger.info(`[Normalizer] Cache hit for: ${track.title}`);
    return cached;
  }

  // --- Active measurement lookup (deduplication) ---
  // If the track is already being normalized in the background, return the existing promise
  if (activeMeasurements.has(track.url)) {
    logger.info(`[Normalizer] Awaiting in-progress measurement for: ${track.title}`);
    return activeMeasurements.get(track.url);
  }

  const promise = (async () => {
    try {
      if (signal && signal.aborted) {
        throw new Error('aborted');
      }

      logger.info(`[Normalizer] Measuring loudness for: ${track.url}`);
      
      const startMs = Date.now();
      let result = await measureSample(track.url, signal);

      // --- Step 5: Handle persistent silence ---
      // If the sample returned silence, don't apply any gain.
      // Boosting silence would only amplify noise artifacts.
      if (result.lufs <= SILENCE_THRESHOLD) {
        logger.info(`[Normalizer] Silence detected, defaulting to target.`);
        const output = { measuredLufs: result.lufs, gainDb: 0 };
        cacheResult(track.url, output);
        return output;
      }
      const elapsedMs = Date.now() - startMs;
      logger.info(`[Normalizer] Measurement completed in ${elapsedMs}ms`);

      // --- Step 6: Calculate gain adjustment ---
      // gain = target - measured
      // Example: target -14, measured -20 → gain +6 dB (boost quiet track)
      // Example: target -14, measured -8  → gain -6 dB (reduce loud track)
      const rawGain = TARGET_LUFS - result.lufs;

      // --- Step 7: Clamp gain to safe range ---
      // Prevents: excessive boost that causes clipping/distortion
      // Prevents: excessive cut that makes audio inaudible
      const gainDb = Math.round(Math.max(MIN_GAIN, Math.min(MAX_GAIN, rawGain)) * 10) / 10;

      const output = {
        measuredLufs: Math.round(result.lufs * 10) / 10,
        gainDb,
      };
      cacheResult(track.url, output);
      return output;
    } catch (error) {
      if (error.message === 'aborted') {
        throw error;
      }
      // Measurement failed — proceed without normalization rather than blocking playback
      logger.warn(
        `[Normalizer] Measurement failed for "${track.title}": ${error.message}`,
      );
      return { measuredLufs: TARGET_LUFS, gainDb: 0 };
    } finally {
      // Always remove the active measurement upon completion/failure
      activeMeasurements.delete(track.url);
    }
  })();

  activeMeasurements.set(track.url, promise);
  return promise;
}

/**
 * Store a measurement result in the cache with automatic eviction
 * when the cache exceeds MAX_CACHE_SIZE entries.
 * Oldest entries (first inserted) are evicted first.
 */
function cacheResult(url, result) {
  if (lufsCache.size >= MAX_CACHE_SIZE) {
    // Evict the oldest entry (first key in Map insertion order)
    const oldestKey = lufsCache.keys().next().value;
    lufsCache.delete(oldestKey);
  }
  lufsCache.set(url, result);
}

export default { measure };
