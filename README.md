# 🤖 Bitores Mendez Discord Bot (v6.7.0)

[![discord.js](https://img.shields.io/badge/discord.js-v14.26-blue.svg?logo=discord&logoColor=white)](https://discord.js.org/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.12.0-green.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A modular, highly scalable Discord bot built with **discord.js v14** and modern **ES6 modules**. Features a high-performance music playback engine with native support for YouTube and Spotify URLs, complete with an interactive button-based player interface.

---

## ✨ Features

- **Modular Architecture**: Command and event handlers load dynamically, allowing you to add new features seamlessly.
- **Advanced Music Engine**: Play, pause, resume, skip, stop, and queue tracks using direct prefix commands (`bm!play`, `bm!insert`, `bm!skip`, etc.). Includes a **24/7 mode** to keep the bot connected.
- **Dynamic Track Resolution**:
  - Resolves YouTube videos, playlists, and search queries.
  - Automatically parses Spotify tracks, playlists, and albums and resolves them using high-speed metadata scraping (no Spotify Developer API credentials required!).
- **Interactive Controls**: Beautiful, rich embeds with live-updating buttons for real-time player control.
- **Lyrics Display**: Click the "Show Lyrics" button on the Now Playing message to view lyrics for the current track, powered by [lrclib.net](https://lrclib.net).
- **Volume Normalization**: Automatic LUFS-based loudness normalization (-14 LUFS target, YouTube standard) ensures consistent volume across all tracks without manual adjustment. Toggleable per server via `bm!anorm`.
- **Color-Coded Logging**: Clean, formatted console logging for ease of debugging and server health monitoring.

---

## 📋 Prerequisites

Before setting up the bot, ensure you have the following installed:
- [Node.js](https://nodejs.org/) v22.12.0 or higher (Required for newer discordjs/voice versions).
- [FFmpeg](https://ffmpeg.org/) (automatically managed via `ffmpeg-static` dependency; no manual system installation required).

### Discord Bot Token Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new Application, navigate to the **Bot** tab, and copy your Token.
3. Enable the **Message Content Intent** under `Privileged Gateway Intents` in the Bot tab (this is required to read prefix-based commands).

---

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/XocEnoth/dcbot-bitores-mendez.git
cd dcbot-bitores-mendez
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Copy the template environment file:
```bash
cp .env.example .env
```
Open `.env` and fill in your Discord Bot Token and preferred command prefix:
```env
DISCORD_TOKEN=your_bot_token_here
BOT_PREFIX=bm!
```

*Optional Configuration:*
- **Google Gemini API Key (`GEMINI_API_KEY`)**: Required if you want to use the AI `chat` command. Get it from [Google AI Studio](https://aistudio.google.com/). You can also specify the model using `GEMINI_MODEL` (defaults to `gemini-3.1-flash-lite`).
- **YouTube API Key (`YOUTUBE_API_KEY`)**: Highly recommended if you intend to play massive YouTube playlists (e.g., 500+ songs). Without it, the bot will use a scraping fallback that is strictly capped by YouTube at 200 items per playlist due to "Unavailable videos are hidden" UI errors. Get this key for free from the Google Cloud Console.
- **YouTube Cookies (`cookies.txt`)**: Recommended if the bot is being blocked by YouTube (Error 429 / Sign-in required). Export your YouTube cookies using a browser extension like "Get cookies.txt LOCALLY" and place the file in the project root. The bot automatically detects `cookies.txt` and switches its player strategy accordingly. See the [Deployment](#-deployment-eg-railway) section for Railway setup.
- **Spotify Credentials (`SPOTIFY_CLIENT_ID` & `SPOTIFY_CLIENT_SECRET`)**: No longer required. The bot utilizes an advanced public scraper fallback to fetch Spotify track metadata directly without a developer key.

---

## 🎮 Execution

### Development Mode (Hot-reloading enabled)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

---

## 🛠 Command List

### Utility Commands
| Command | Arguments | Description |
| :--- | :--- | :--- |
| `bm!ping` | None | Measures and displays bot latency and Discord API latency. |
| `bm!help` | None | Shows an interactive statistics page and command list with navigation buttons. |
| `bm!chat` | `<prompt>` | Chat with the BM AI Assistant (powered by Google Gemini API). Includes rate limiting and pagination. |

### Music Commands
| Command | Arguments | Description |
| :--- | :--- | :--- |
| `bm!play` | `<query or URL> [page]` | Plays a track/playlist from YouTube/Spotify, or searches YouTube. Supports pagination for playlists. |
| `bm!insert` | `<query or URL> [page]` | Inserts a track/playlist to the front of the queue (plays next). |
| `bm!pause` | None | Pauses the current audio playback. |
| `bm!resume`| None | Resumes the paused audio playback. |
| `bm!skip`  | None | Skips the current playing song. |
| `bm!stop`  | None | Stops playback, clears the queue, and resets the player status. |
| `bm!leave` | None | Disconnects the bot from the voice channel and cleans up resources. |
| `bm!join`  | None | Joins the voice channel without playing any tracks immediately. |
| `bm!queue` | None | Displays the current music queue with interactive pagination buttons. |
| `bm!shuffle`| None | Shuffles the upcoming tracks in the queue. |
| `bm!repeat` | `[on / off]` | Toggles repeat mode for the current track. When enabled, the track will loop until repeat is turned off. |
| `bm!247`   | `[on / off]` | Toggles 24/7 mode to prevent the bot from leaving the voice channel when idle. |
| `bm!anorm` | `[on / off]` | Toggles Audio Normalizer on or off for the current server. Default is ON. |

---

## 📁 Project Structure

```
dcbot-bitores-mendez/
├── src/
│   ├── index.js                 # App Entry Point - initializes client & event loops
│   ├── commands/                # Bot command categories
│   │   ├── music/               # Music commands (direct top-level execution)
│   │   │   ├── anorm.js         # Audio Normalizer toggle
│   │   │   ├── insert.js        # Insert track/playlist next up
│   │   │   ├── join.js          # Join voice channel
│   │   │   ├── leave.js         # Leave voice channel
│   │   │   ├── pause.js         # Pause audio
│   │   │   ├── play.js          # Play song/playlist
│   │   │   ├── queue.js         # Interactive queue view
│   │   │   ├── repeat.js        # Repeat mode toggle
│   │   │   ├── resume.js        # Resume audio
│   │   │   ├── shuffle.js       # Shuffle upcoming queue
│   │   │   ├── skip.js          # Skip current song
│   │   │   ├── stop.js          # Stop & clear queue
│   │   │   └── twentyFourSeven.js # 24/7 mode toggle
│   │   └── utility/             # General utility commands
│   │       ├── chat.js          # AI Chat command
│   │       ├── help.js          # Interactive help page
│   │       └── ping.js          # Ping latency check
│   ├── services/                # Core business logic layer
│   │   ├── gemini.service.js    # Google Gemini API integration
│   │   └── music/
│   │       ├── playerManager.js # Manages music player instances across guilds
│   │       ├── musicPlayer.js   # Handles player state, queues, voice connections
│   │       ├── trackResolver.js # Resolves URLs & searches YouTube/Spotify
│   │       ├── audioNormalizer.js # LUFS-based audio normalization engine
│   │       └── lyricsService.js # Fetches lyrics from lrclib.net
│   ├── events/                  # Event listeners mapped by category
│   │   ├── client/
│   │   │   └── ready.js         # Ready event (Status & Activity)
│   │   └── interaction/
│   │       ├── interactionCreate.js # Interactive button clicks
│   │       └── messageCreate.js # Prefix command parsing
│   ├── handlers/                # Dynamic loaders
│   │   ├── commandHandler.js    # Registers commands dynamically as top-level commands
│   │   └── eventHandler.js      # Registers events dynamically
│   ├── config/                  # Configuration loaders
│   │   └── index.js             # Parses, validates, and freezes config variables
│   └── utils/                   # Shared helper utilities
│       ├── formatters.js        # String and duration formatters
│       ├── logger.js            # Chalk-like colored console logs
│       ├── queueBuilder.js      # Interactive queue page builder
│       └── rateLimiter.js       # In-memory rate limiting logic
├── .env.example                 # Environment configuration template
├── .gitignore                   # Version control exclusions
├── package.json                 # Project dependencies & scripts
└── README.md                    # Documentation
```

---

## 🧩 Extension Guide

### Adding a New Command
To add a new command, create a `.js` file inside any subfolder under `src/commands/` (e.g., `src/commands/utility/hello.js`):
```javascript
const name = "hello";
const description = "Replies with a friendly greeting";

const execute = async (message, args) => {
    await message.reply("👋 Hello!");
};

export default { name, description, execute };
```
The command loader will automatically register it as a top-level command on the next startup.

### Adding a New Event
Create a `.js` file inside `src/events/<category>/`:
```javascript
const name = "guildMemberAdd";

const execute = async (member) => {
    console.log(`${member.user.tag} joined the server.`);
};

export default { name, execute };
```
Add `once: true` to the export if the event should only run once (like `ready`).

---

## 🚀 Deployment (e.g., Railway)

This repository is heavily optimized for quick deployment to hosting providers like [Railway](https://railway.app) using **Nixpacks**:
1. Create a new project on Railway and connect your repository.
2. In your Railway project settings, ensure the **Builder** is set to **Nixpacks** (this is usually the default). Nixpacks will automatically read the `nixpacks.toml` file to install Node 22, Python 3, and FFmpeg.
3. Under Variables, add the required keys (`DISCORD_TOKEN`, `BOT_PREFIX`, `GEMINI_API_KEY`, etc.). If you use a `cookies.txt` locally, paste its entire raw content into a variable named `YOUTUBE_COOKIES`.
4. Railway will auto-detect everything, install dependencies, and start the bot automatically.

---

## 📝 License

This project is licensed under the [MIT License](LICENSE).
