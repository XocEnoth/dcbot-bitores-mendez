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
        };
    }

    return null;
};

export default { searchLyrics, splitLyrics };
