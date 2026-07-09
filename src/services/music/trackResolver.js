import play from "play-dl";
import youtubeDl from "youtube-dl-exec";
import fs from "fs";
import path from "path";
import logger from "../../utils/logger.js";
import config from "../../config/index.js";

// --- yt-dlp fallback helpers (uses cookies when available) ---

const COOKIES_PATH = path.resolve(process.cwd(), 'cookies.txt');

function hasCookies() {
    try {
        if (!fs.existsSync(COOKIES_PATH)) return false;
        const content = fs.readFileSync(COOKIES_PATH, 'utf8');
        return content.split('\n').some(line => line.trim() && !line.trim().startsWith('#'));
    } catch {
        return false;
    }
}

function getYtDlpBaseOptions() {
    const opts = {
        dumpSingleJson: true,
        noWarnings: true,
        skipDownload: true,
        preferFreeFormats: true,
        forceIpv4: true,
        geoBypass: true,
        jsRuntimes: `node:${process.execPath}`,
    };
    if (hasCookies()) {
        opts.cookies = COOKIES_PATH;
    }
    return opts;
}

const formatSecondsRaw = (seconds) => {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0)
        return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
};

const ytDlpVideoInfo = async (url) => {
    logger.info(`Falling back to yt-dlp for video info: ${url}`);
    const info = await youtubeDl(url, getYtDlpBaseOptions());
    return {
        title: info.title || 'Unknown Title',
        author: info.uploader || info.channel || 'Unknown Artist',
        url: info.webpage_url || url,
        duration: (info.duration || 0) * 1000,
        durationRaw: formatSecondsRaw(info.duration || 0),
        thumbnail: info.thumbnail || null,
    };
};

const ytDlpSearch = async (query) => {
    logger.info(`Falling back to yt-dlp for search: ${query}`);
    const info = await youtubeDl(`ytsearch:${query}`, getYtDlpBaseOptions());
    return {
        title: info.title || 'Unknown Title',
        author: info.uploader || info.channel || 'Unknown Artist',
        url: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
        duration: (info.duration || 0) * 1000,
        durationRaw: formatSecondsRaw(info.duration || 0),
        thumbnail: info.thumbnail || null,
    };
};

// --- YouTube helpers ---

const extractTrackInfo = (video) => ({
    title: video.title || "Unknown Title",
    author: video.channel?.name || "Unknown Artist",
    url: video.url,
    duration: (video.durationInSec || 0) * 1000,
    durationRaw: video.durationRaw || "0:00",
    thumbnail: video.thumbnails?.[0]?.url || null,
});

// --- Spotify helpers (NO API key / NO Premium required) ---

const SCRAPE_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
};

const parseSpotifyUrl = (url) => {
    const m = url.match(
        /spotify\.com\/(?:intl-\w+\/)?(track|playlist|album)\/([a-zA-Z0-9]+)/,
    );
    return m ? { type: m[1], id: m[2] } : null;
};

// --- Method 1: Spotify oEmbed (public, always works for single items) ---

const spotifyOEmbed = async (spotifyUrl) => {
    try {
        const res = await fetch(
            `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`,
        );
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
};

// --- Method 2: Scrape Spotify embed page for track data ---

const scrapeSpotifyEmbed = async (type, id) => {
    const url = `https://open.spotify.com/embed/${type}/${id}`;

    try {
        const res = await fetch(url, { headers: SCRAPE_HEADERS });
        if (!res.ok) {
            logger.warn(
                `Spotify embed fetch returned ${res.status} for ${type}/${id}`,
            );
            return null;
        }

        const html = await res.text();

        // Strategy 1: __NEXT_DATA__ (Next.js SSR data)
        const nextMatch = html.match(
            /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
        );
        if (nextMatch) {
            try {
                const nextData = JSON.parse(nextMatch[1]);
                const entity = nextData?.props?.pageProps?.state?.data?.entity;
                if (entity) {
                    logger.info(
                        `Extracted Spotify entity via __NEXT_DATA__ for ${type}/${id}`,
                    );
                    return entity;
                }
            } catch (e) {
                logger.warn("Failed to parse __NEXT_DATA__");
            }
        }

        // Strategy 2: Look for JSON-LD structured data
        const ldMatch = html.match(
            /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
        );
        if (ldMatch) {
            try {
                const ld = JSON.parse(ldMatch[1]);
                logger.info(
                    `Extracted Spotify data via JSON-LD for ${type}/${id}`,
                );
                return ld;
            } catch {}
        }

        // Strategy 3: Look for embedded resource/entity JSON
        const entityMatch = html.match(/"entity"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
        if (entityMatch) {
            try {
                const entity = JSON.parse(entityMatch[1]);
                logger.info(
                    `Extracted Spotify entity via regex for ${type}/${id}`,
                );
                return entity;
            } catch {}
        }

        logger.warn(
            `Could not extract data from Spotify embed page for ${type}/${id}`,
        );
        return null;
    } catch (error) {
        logger.error(`Error scraping Spotify embed for ${type}/${id}`, error);
        return null;
    }
};

// --- Method 3: Scrape the regular Spotify page for metadata ---

const scrapeSpotifyPage = async (type, id) => {
    const url = `https://open.spotify.com/${type}/${id}`;

    try {
        const res = await fetch(url, { headers: SCRAPE_HEADERS });
        if (!res.ok) return null;

        const html = await res.text();

        // Try __NEXT_DATA__
        const nextMatch = html.match(
            /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
        );
        if (nextMatch) {
            try {
                const nextData = JSON.parse(nextMatch[1]);
                // Different page structure — try to find track data
                const pageData = nextData?.props?.pageProps;
                if (pageData) {
                    logger.info(
                        `Extracted Spotify data from main page for ${type}/${id}`,
                    );
                    return pageData;
                }
            } catch {}
        }

        // Try to extract from <title> tag as last resort for single tracks
        if (type === "track") {
            // Title format: "Song Name - song and lyrics by Artist | Spotify"
            const titleMatch = html.match(/<title[^>]*>(.+?)<\/title>/);
            if (titleMatch) {
                const raw = titleMatch[1];
                const songMatch = raw.match(
                    /^(.+?)\s*[-–—]\s*(?:song\s+(?:and\s+lyrics\s+)?by|by)\s+(.+?)(?:\s*\||\s*$)/i,
                );
                if (songMatch) {
                    return {
                        name: songMatch[1].trim(),
                        artists: [{ name: songMatch[2].trim() }],
                    };
                }
                // Simpler: just use the part before the pipe
                const simpleMatch = raw.match(/^(.+?)\s*\|/);
                if (simpleMatch) {
                    return { name: simpleMatch[1].trim(), artists: [] };
                }
            }
        }

        return null;
    } catch {
        return null;
    }
};

// --- Extract track list from scraped entity data ---

const extractTracksFromEntity = (entity, type) => {
    if (!entity) return [];

    try {
        // Single track
        if (type === "track") {
            const name = entity.name || entity.title;
            const artist = entity.artists?.[0]?.name || entity.subtitle || "";
            if (name) return [{ name, artist }];
            return [];
        }

        // Playlist or Album — try multiple known data shapes
        const candidates = [
            entity.trackList,
            entity.tracks?.items,
            entity.tracks,
        ];

        for (const list of candidates) {
            if (Array.isArray(list) && list.length > 0) {
                return list
                    .map((item) => {
                        const t = item.track || item;
                        return {
                            name: t.title || t.name || "",
                            artist: t.subtitle || t.artists?.[0]?.name || "",
                        };
                    })
                    .filter((t) => t.name);
            }
        }
    } catch (error) {
        logger.error("Error extracting tracks from entity", error);
    }

    return [];
};

// --- Search YouTube for a track ---

const searchYouTube = async (name, artist) => {
    const query = artist ? `${name} ${artist}` : name;
    const results = await play.search(query.trim(), { limit: 1 });
    if (results.length === 0) return null;
    return extractTrackInfo(results[0]);
};

// --- Resolve a single Spotify track (with multiple fallbacks) ---

const resolveSpotifyTrack = async (url, parsed) => {
    // Attempt 1: Scrape embed page
    const embedEntity = await scrapeSpotifyEmbed("track", parsed.id);
    const embedTracks = extractTracksFromEntity(embedEntity, "track");
    if (embedTracks.length > 0) {
        const result = await searchYouTube(
            embedTracks[0].name,
            embedTracks[0].artist,
        );
        if (result) return [result];
    }

    // Attempt 2: Scrape main page
    const pageEntity = await scrapeSpotifyPage("track", parsed.id);
    const pageTracks = extractTracksFromEntity(pageEntity, "track");
    if (pageTracks.length > 0) {
        const result = await searchYouTube(
            pageTracks[0].name,
            pageTracks[0].artist,
        );
        if (result) return [result];
    }

    // Attempt 3: oEmbed (most reliable but least info)
    const oembed = await spotifyOEmbed(url);
    if (oembed?.title) {
        logger.info(`Spotify track resolved via oEmbed: "${oembed.title}"`);
        const result = await searchYouTube(oembed.title, "");
        if (result) return [result];
    }

    return [];
};

// --- Resolve a Spotify playlist or album ---

const resolveSpotifyCollection = async (url, parsed, page = 1) => {
    const type = parsed.type; // 'playlist' or 'album'

    // Attempt 1: Scrape embed page
    const embedEntity = await scrapeSpotifyEmbed(type, parsed.id);
    let trackNames = extractTracksFromEntity(embedEntity, type);

    // Attempt 2: Scrape main page
    if (trackNames.length === 0) {
        const pageEntity = await scrapeSpotifyPage(type, parsed.id);
        trackNames = extractTracksFromEntity(pageEntity, type);
    }

    if (trackNames.length === 0) {
        throw new Error(
            "Could not retrieve tracks from this Spotify URL. The playlist may be private, or the page format may have changed.",
        );
    }

    const MAX = 50;
    let limited;

    if (page === 'all') {
        limited = trackNames;
    } else {
        const startIndex = (page - 1) * MAX;
        limited = trackNames.slice(startIndex, startIndex + MAX);

        if (limited.length === 0) {
            if (page > 2 && trackNames.length <= 100) {
                throw new Error(
                    "Spotify limits public playlist scraping to 100 tracks (max page 2). To play more tracks, please use a YouTube playlist instead.",
                );
            }
            throw new Error(
                `Page ${page} is empty. The playlist only has ${Math.ceil(trackNames.length / MAX)} page(s).`,
            );
        }
    }

    logger.info(
        `Resolving ${limited.length} Spotify tracks (page ${page}) via YouTube search...`,
    );

    const resolved = [];
    for (const t of limited) {
        try {
            const track = await searchYouTube(t.name, t.artist);
            if (track) resolved.push(track);
        } catch {
            // Skip tracks that fail to resolve
        }
    }

    return resolved;
};

// --- YouTube Data API helpers ---

const parseIsoDuration = (duration) => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const h = parseInt(match[1] || "0", 10);
    const m = parseInt(match[2] || "0", 10);
    const s = parseInt(match[3] || "0", 10);
    return (h * 3600 + m * 60 + s) * 1000;
};

const formatRawDuration = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0)
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
};

const resolveYouTubePlaylistApi = async (playlistId, page) => {
    const API_KEY = config.youtubeApiKey;
    let allItems = [];
    let nextPageToken = "";

    logger.info(`Fetching playlist ${playlistId} via YouTube API...`);

    while (true) {
        const res = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${API_KEY}${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`,
        );
        if (!res.ok) {
            throw new Error(`YouTube API Error: ${res.status}`);
        }
        const data = await res.json();
        if (!data.items) break;
        allItems.push(...data.items);
        nextPageToken = data.nextPageToken;
        if (!nextPageToken) break;
    }

    const validItems = allItems.filter(
        (item) =>
            item.snippet.title !== "Private video" &&
            item.snippet.title !== "Deleted video",
    );

    if (validItems.length === 0)
        throw new Error("Playlist is empty or all videos are private.");

    const MAX = 50;
    let limited;
    
    if (page === 'all') {
        limited = validItems;
    } else {
        const startIndex = (page - 1) * MAX;
        limited = validItems.slice(startIndex, startIndex + MAX);

        if (limited.length === 0) {
            throw new Error(
                `Page ${page} is empty. The playlist only has ${Math.ceil(validItems.length / MAX)} page(s).`,
            );
        }
    }

    const durationMap = {};
    
    // Chunk video ID fetching since YouTube API limits to 50 ids per request
    for (let i = 0; i < limited.length; i += MAX) {
        const chunk = limited.slice(i, i + MAX);
        const videoIds = chunk.map((item) => item.snippet.resourceId.videoId).join(",");
        
        const vidRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${API_KEY}`,
        );
        if (!vidRes.ok) throw new Error("Failed to fetch video durations.");
        const vidData = await vidRes.json();

        if (vidData.items) {
            for (const v of vidData.items) {
                durationMap[v.id] = parseIsoDuration(v.contentDetails.duration);
            }
        }
    }

    return limited.map((item) => {
        const videoId = item.snippet.resourceId.videoId;
        const durationMs = durationMap[videoId] || 0;
        return {
            title: item.snippet.title,
            author: item.snippet.videoOwnerChannelTitle || "Unknown Artist",
            url: `https://www.youtube.com/watch?v=${videoId}`,
            duration: durationMs,
            durationRaw: formatRawDuration(durationMs),
            thumbnail:
                item.snippet.thumbnails?.default?.url ||
                item.snippet.thumbnails?.high?.url ||
                null,
        };
    });
};

// --- Main resolver ---

const resolve = async (query, page = 1) => {
    let validated;
    try {
        validated = await play.validate(query);
    } catch (error) {
        logger.warn(`play-dl validate failed: ${error.message}. Using yt-dlp fallback.`);
        // If play-dl itself crashes (e.g. 429), treat URL-like queries as video, else as search
        if (query.startsWith('http')) {
            const track = await ytDlpVideoInfo(query);
            return [track];
        }
        const track = await ytDlpSearch(query);
        return [track];
    }

    // YouTube video URL
    if (validated === "yt_video") {
        try {
            const info = await play.video_info(query);
            return [extractTrackInfo(info.video_details)];
        } catch (error) {
            logger.warn(`play-dl video_info failed: ${error.message}. Trying yt-dlp...`);
            const track = await ytDlpVideoInfo(query);
            return [track];
        }
    }

    // YouTube playlist URL
    if (validated === "yt_playlist") {
        const match = query.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        const listId = match ? match[1] : null;
        const isMix = listId && listId.startsWith("RD");

        if (config.youtubeApiKey && !isMix && listId) {
            try {
                return await resolveYouTubePlaylistApi(listId, page);
            } catch (error) {
                if (
                    error.message.includes(
                        "is empty. The playlist only has",
                    )
                ) {
                    throw error;
                }
                logger.warn(
                    `YouTube API failed for playlist ${listId}: ${error.message}. Falling back to play-dl...`,
                );
            }
        }

        let playlist;
        try {
            playlist = await play.playlist_info(query, { incomplete: isMix });
        } catch (error) {
            // Fallback for YouTube Mix playlists when play-dl fails to parse the new YouTube UI
            if (isMix && (error.message.includes('browseId') || error.message.includes('unviewable'))) {
                logger.warn(`play-dl failed to parse Mix playlist ${listId}, falling back to single video extraction.`);
                try {
                    const info = await play.video_info(query);
                    return [extractTrackInfo(info.video_details)];
                } catch {
                    try {
                        const track = await ytDlpVideoInfo(query);
                        return [track];
                    } catch (ytDlpError) {
                        logger.error(`yt-dlp fallback also failed for Mix ${listId}:`, ytDlpError);
                    }
                }
            }

            if (!config.youtubeApiKey) {
                throw new Error(
                    "Currently, the bot only supports standard public YouTube playlists. YouTube Music links and playlists containing hidden, private, or unavailable videos are restricted. Please contact the bot developer to unlock full playlist support.",
                );
            }
            if (
                error.message &&
                error.message.includes("Unavailable videos are hidden")
            ) {
                throw new Error(
                    "This YouTube playlist contains hidden/unavailable videos. Due to YouTube UI restrictions, the fallback mechanism cannot parse this playlist.",
                );
            }
            throw error;
        }

        const videos = await playlist.all_videos();
        const MAX = 50;

        if (!config.youtubeApiKey && page > 4 && page !== 'all') {
            throw new Error(
                "Currently, the bot is limited to processing up to 200 tracks (4 pages) per playlist. Please contact the bot developer to unlock unlimited playlist pagination.",
            );
        }

        let limited;
        if (page === 'all') {
            limited = videos;
            if (!config.youtubeApiKey && videos.length > 200) {
                 limited = videos.slice(0, 200); // cap at 200 for play-dl without API key
            }
        } else {
            const startIndex = (page - 1) * MAX;
            limited = videos.slice(startIndex, startIndex + MAX);

            if (limited.length === 0) {
                throw new Error(
                    `Page ${page} is empty. The playlist only has ${Math.ceil(videos.length / MAX)} page(s).`,
                );
            }
        }

        return limited.map(extractTrackInfo);
    }

    // Spotify track
    if (validated === "sp_track") {
        const parsed = parseSpotifyUrl(query);
        if (!parsed) throw new Error("Invalid Spotify track URL.");
        return resolveSpotifyTrack(query, parsed);
    }

    // Spotify playlist or album
    if (validated === "sp_playlist" || validated === "sp_album") {
        const parsed = parseSpotifyUrl(query);
        if (!parsed) throw new Error("Invalid Spotify URL.");
        return resolveSpotifyCollection(query, parsed, page);
    }

    // Default: YouTube search
    try {
        const results = await play.search(query, { limit: 1 });
        if (results.length === 0) return [];
        return [extractTrackInfo(results[0])];
    } catch (error) {
        logger.warn(`play-dl search failed: ${error.message}. Trying yt-dlp...`);
        const track = await ytDlpSearch(query);
        return [track];
    }
};

export default { resolve };
