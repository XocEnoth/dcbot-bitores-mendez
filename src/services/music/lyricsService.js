import logger from "../../utils/logger.js";
import config from "../../config/index.js";

// --- Title/Artist cleanup for better lyrics search ---

const TITLE_NOISE = [
    /\(Official\s*(Music\s*)?Video\)/gi,
    /\[Official\s*(Music\s*)?Video\]/gi,
    /\(Official\s*Audio\)/gi,
    /\[Official\s*Audio\]/gi,
    /\(Lyrics?\s*(Video)?\)/gi,
    /\[Lyrics?\s*(Video)?\]/gi,
    /\(Audio\)/gi,
    /\[Audio\]/gi,
    /\(Visuali[sz]er\)/gi,
    /\[Visuali[sz]er\]/gi,
    /\(HD|HQ|4K|MV\)/gi,
    /\[HD|HQ|4K|MV\]/gi,
    /\(Live[^)]*\)/gi,
    /\[Live[^]]*\]/gi,
    /\|.*$/,
    /\s{2,}/g,
];

const cleanTitle = (title) => {
    let cleaned = title;
    for (const pattern of TITLE_NOISE) {
        cleaned = cleaned.replace(pattern, " ");
    }
    return cleaned.trim();
};

const cleanArtist = (artist) => {
    if (!artist) return "";
    return artist
        .replace(/\s*[-–]\s*Topic$/i, "")
        .replace(/VEVO$/i, "")
        .trim();
};

// --- Lyrics splitting for long text ---

const splitLyrics = (text, maxLength) => {
    const lines = text.split("\n");
    const chunks = [];
    let current = "";

    for (const line of lines) {
        // If adding this line would exceed the limit, start a new chunk
        if (current.length + line.length + 1 > maxLength) {
            if (current) chunks.push(current);
            current = line;
        } else {
            current += (current ? "\n" : "") + line;
        }
    }
    if (current) chunks.push(current);

    return chunks;
};

// --- Lyrics providers ---

const LRCLIB_SEARCH = "https://lrclib.net/api/search";

const searchLrclib = async (title, artist) => {
    // Attempt 1: search by track name + artist name
    if (artist) {
        const params = new URLSearchParams({
            track_name: title,
            artist_name: artist,
        });
        try {
            const res = await fetch(`${LRCLIB_SEARCH}?${params}`, {
                headers: { "User-Agent": `dcbot-bitores-mendez/${config.version}` },
            });
            if (res.ok) {
                const results = await res.json();
                const match = results.find((r) => r.plainLyrics);
                if (match) return match;
            }
        } catch {
            // Fall through to next attempt
        }
    }

    // Attempt 2: search by combined query
    const query = artist ? `${title} ${artist}` : title;
    try {
        const res = await fetch(
            `${LRCLIB_SEARCH}?q=${encodeURIComponent(query)}`,
            { headers: { "User-Agent": `dcbot-bitores-mendez/${config.version}` } },
        );
        if (res.ok) {
            const results = await res.json();
            const match = results.find((r) => r.plainLyrics);
            if (match) return match;
        }
    } catch {
        // Fall through
    }

    return null;
};

// --- Synced Lyrics Parser ---

/**
 * Parses an LRC formatted string into an array of timestamped objects.
 * Example format: [03:12.40] Line of lyrics
 * 
 * @param {string} lrcString - The raw LRC formatted string
 * @returns {Array<{timeMs: number, text: string}> | null} Array of parsed lyric lines, or null if invalid
 */
const parseSyncedLyrics = (lrcString) => {
    if (!lrcString) return null;
    
    const lines = lrcString.split('\n');
    const parsed = [];
    
    // Matches standard LRC time tags like [01:23.45] or [01:23.456]
    const timeRegex = /\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]/;
    
    for (const line of lines) {
        const match = timeRegex.exec(line);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            
            let milliseconds = 0;
            if (match[3]) {
                milliseconds = parseInt(match[3], 10);
                // If it's a 2-digit centisecond (e.g., .45 = 450ms), multiply by 10
                if (match[3].length === 2) milliseconds *= 10;
            }
            
            const timeMs = (minutes * 60 * 1000) + (seconds * 1000) + milliseconds;
            const text = line.replace(timeRegex, '').trim();
            
            parsed.push({ timeMs, text });
        }
    }
    
    return parsed.length > 0 ? parsed : null;
};

// --- Public API ---

const searchLyrics = async (rawTitle, rawArtist) => {
    const title = cleanTitle(rawTitle);
    const artist = cleanArtist(rawArtist);

    logger.info(`Searching lyrics for: "${title}" by "${artist || "unknown"}"`);

    const result = await searchLrclib(title, artist);

    if (result?.plainLyrics) {
        return {
            title: result.trackName || title,
            artist: result.artistName || artist || "Unknown Artist",
            lyrics: result.plainLyrics,
            syncedLyrics: parseSyncedLyrics(result.syncedLyrics)
        };
    }

    return null;
};

export default { searchLyrics, splitLyrics };
