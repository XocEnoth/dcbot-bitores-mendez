# 🤖 DCBot Bitores Mendez

A modular, scalable Discord bot built with **discord.js v14** and **ES6 modules**.

---

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) v18.0.0 or higher
- A Discord Bot Token — [Create one here](https://discord.com/developers/applications)

> **Important:** Enable the **Message Content Intent** in your bot's settings at  
> `Discord Developer Portal → Your Application → Bot → Privileged Gateway Intents → Message Content Intent`

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/XocEnoth/dcbot-bitores-mendez.git
cd dcbot-bitores-mendez
```

### 2. Install dependencies

```bash
npm install
```

### 3. Setup environment variables

Copy the example file and fill in your bot token:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=your_bot_token_here
BOT_PREFIX=bm!
```

### 4. Run the bot

**Production:**

```bash
npm start
```

**Development (auto-restart on file changes):**

```bash
npm run dev
```

---

## 🎮 Commands

| Command   | Description                       |
| --------- | --------------------------------- |
| `bm!ping` | Shows bot latency and API latency |
| `bm!help` | Interactive bot help & statistics |

---

## 📁 Project Structure

```
dcbot-bitores-mendez/
│
├── src/
│   ├── commands/              # Bot commands, grouped by category
│   │   └── utility/
│   │       ├── help.js        # Help & bot stats command
│   │       └── ping.js        # Ping command
│   │
│   ├── events/                # Discord event listeners, grouped by type
│   │   ├── client/
│   │   │   └── ready.js       # Fires when bot successfully connects
│   │   └── interaction/
│   │       └── messageCreate.js  # Handles incoming messages & command routing
│   │
│   ├── handlers/              # Auto-loaders for commands and events
│   │   ├── commandHandler.js  # Scans & registers all command files
│   │   └── eventHandler.js    # Scans & registers all event files
│   │
│   ├── config/                # Configuration & environment variables
│   │   └── index.js           # Loads, validates, and exports config
│   │
│   ├── utils/                 # Shared utilities
│   │   └── logger.js          # Color-coded console logger
│   │
│   └── index.js               # Entry point — initializes client & starts bot
│
├── .env.example               # Template for environment variables
├── .gitignore
├── package.json
└── README.md
```

---

## 🧩 Adding a New Command

1. Create a new `.js` file inside `src/commands/<category>/`:

```js
const name = "hello";
const description = "Replies with a greeting";

const execute = async (message, args) => {
    await message.reply("👋 Hello!");
};

export default { name, description, execute };
```

2. The command handler will automatically pick it up on the next restart — no registration needed.

---

## 🧩 Adding a New Event

1. Create a new `.js` file inside `src/events/<category>/`:

```js
const name = "guildCreate";

const execute = async (guild) => {
    console.log(`Joined new server: ${guild.name}`);
};

export default { name, execute };
```

2. Add `once: true` to the export if the event should only fire once.

---

## 📝 License

MIT
