import 'dotenv/config';

const REQUIRED_ENV_VARS = ['DISCORD_TOKEN', 'GEMINI_API_KEY'];

/**
 * Validates that all required environment variables are set.
 * Throws an error listing any missing variables.
 */
const validateEnv = () => {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file. See .env.example for reference.'
    );
  }
};

validateEnv();

const config = Object.freeze({
  token: process.env.DISCORD_TOKEN,
  prefix: process.env.BOT_PREFIX || 'bm!',
  embedColor: '#ed4245',
  version: '6.7.0',
  spotify: Object.freeze({
    clientId: process.env.SPOTIFY_CLIENT_ID || null,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || null,
  }),
  youtubeApiKey: process.env.YOUTUBE_API_KEY || null,
  gemini: Object.freeze({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  }),
});

export default config;
