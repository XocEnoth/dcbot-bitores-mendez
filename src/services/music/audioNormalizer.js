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
 * Get the direct audio stream URL from YouTube using yt-dlp --get-url.
 *
 * This URL points directly to YouTube's CDN (e.g., rr1---sn-*.googlevideo.com)
 * and can be used by FFmpeg for HTTP-based seeking without downloading the
 * entire track. The URL typically expires after ~6 hours, but since we use it
 * immediately for measurement, expiration is not a concern.
 *
 * @param {string} trackUrl - YouTube watch URL
 * @returns {Promise<string>} Direct audio stream URL
 */
async function getDirectUrl(trackUrl) {
  const opts = {
    getUrl: true,
    format: 'bestaudio*/best',
    noWarnings: true,
    forceIpv4: true,
    geoBypass: true,
    jsRuntimes: `node:${process.execPath}`,
  };
  if (hasCookies()) {
    opts.cookies = COOKIES_PATH;
  }
  const result = await youtubeDl(trackUrl, opts);
  return result.trim();
}

/**
 * Measure the Integrated Loudness (LUFS) of an audio sample using FFmpeg's
 * EBU R128 loudness meter (ebur128 filter).
 *
 * How it works:
 *   1. FFmpeg seeks to `seekSeconds` in the audio stream using input seeking
 *      (-ss before -i), which is fast because it doesn't download preceding data
 *   2. Reads `duration` seconds of audio
 *   3. Passes the audio through the ebur128 analysis filter
 *   4. Discards the output (-f null) — we only need the analysis summary
 *   5. The Integrated Loudness (I: X.X LUFS) is parsed from FFmpeg's stderr
 *
 * The Integrated Loudness is a single number representing the perceived
 * loudness of the entire sample, weighted according to human hearing sensitivity.
 *
 * @param {string} audioUrl  - Direct audio URL (from yt-dlp --get-url)
 * @param {number} seekSeconds - Seek position in seconds
 * @param {number} duration  - Duration to analyze in seconds
 * @returns {Promise<{lufs: number}>} Measured Integrated Loudness
 */
function measureSample(audioUrl, seekSeconds, duration) {
  return new Promise((resolve) => {
    let resolved = false;

    const done = (lufs) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve({ lufs });
    };

    const args = [
      '-hide_banner',                // Suppress FFmpeg version/build info banner
      '-ss', String(seekSeconds),    // Input seeking: fast seek to position (before -i)
      '-t', String(duration),        // Only read N seconds from that position
      '-i', audioUrl,                // Input: direct YouTube CDN URL (HTTP)
      '-map', '0:a',                 // Select only audio stream (ignore video if present)
      '-af', 'ebur128',              // EBU R128 loudness measurement filter
      '-f', 'null',                  // Null output muxer: discard decoded data
      '-',                           // Write to stdout (required with -f null)
    ];

    const proc = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', () => {
      // Parse the Integrated Loudness from ebur128's summary block.
      // FFmpeg outputs a summary at the end of analysis like:
      //   Summary:
      //     Integrated loudness:
      //       I:         -18.3 LUFS
      //       Threshold: -28.3 LUFS
      const match = stderr.match(/I:\s*(-?\d+\.?\d*)\s*LUFS/);
      if (match) {
        done(parseFloat(match[1]));
      } else {
        // Could not parse — treat as silence to trigger retry logic
        done(SILENCE_THRESHOLD);
      }
    });

    proc.on('error', () => {
      // FFmpeg failed to spawn — assume target LUFS (no adjustment needed)
      done(TARGET_LUFS);
    });

    // Safety timeout: if FFmpeg hangs (e.g., CDN timeout), don't block playback
    const timeout = setTimeout(() => {
      try {
        proc.kill('SIGTERM');
      } catch {}
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
async function measure(track) {
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

  try {
    // --- Step 1: Get direct audio URL ---
    const directUrl = await getDirectUrl(track.url);

    // --- Step 2: Calculate midpoint ---
    // We sample from the middle of the track because:
    // - Intros/outros are often quieter (fade-in/fade-out)
    // - The middle is most representative of the track's overall loudness
    const durationSec = durationMs / 1000;
    let seekPoint = Math.max(0, Math.floor(durationSec / 2) - SAMPLE_DURATION / 2);

    // --- Step 3: Measure 10-second sample from the middle ---
    let result = await measureSample(directUrl, seekPoint, SAMPLE_DURATION);

    // --- Step 4: Silence fallback ---
    // If the middle sample was silent (e.g., a silent break, spoken interlude),
    // try the next 10 seconds which is more likely to have actual music.
    if (result.lufs <= SILENCE_THRESHOLD) {
      logger.info(
        `[Normalizer] Silence detected at ${seekPoint}s, retrying at ${seekPoint + SAMPLE_DURATION}s...`,
      );
      const nextSeek = seekPoint + SAMPLE_DURATION;
      if (nextSeek + SAMPLE_DURATION < durationSec) {
        result = await measureSample(directUrl, nextSeek, SAMPLE_DURATION);
      }
    }

    // --- Step 5: Handle persistent silence ---
    // If the retry also returned silence, don't apply any gain.
    // Boosting silence would only amplify noise artifacts.
    if (result.lufs <= SILENCE_THRESHOLD) {
      const output = { measuredLufs: result.lufs, gainDb: 0 };
      cacheResult(track.url, output);
      return output;
    }

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
    // Measurement failed — proceed without normalization rather than blocking playback
    logger.warn(
      `[Normalizer] Measurement failed for "${track.title}": ${error.message}`,
    );
    return { measuredLufs: TARGET_LUFS, gainDb: 0 };
  }
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
