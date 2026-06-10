import logger from '../../utils/logger.js';

const name = 'clientReady';
const once = true;

const execute = async (client) => {
  logger.success(`Bot is online as ${client.user.tag}`);
  logger.info(`Serving ${client.guilds.cache.size} server(s)`);
  logger.info(`Loaded ${client.commands.size} command(s)`);
};

export default { name, once, execute };
