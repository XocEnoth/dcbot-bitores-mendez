import 'dotenv/config';

const REQUIRED_ENV_VARS = ['DISCORD_TOKEN'];

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
});

export default config;
