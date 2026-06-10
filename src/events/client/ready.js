import { ActivityType } from "discord.js";
import logger from "../../utils/logger.js";
import config from "../../config/index.js";

const name = "clientReady";
const once = true;

const execute = async (client) => {
    logger.success(`Bot is online as ${client.user.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} server(s)`);
    logger.info(`Loaded ${client.commands.size} command(s)`);

    // Set Rich Presence
    client.user.setPresence({
        activities: [
            {
                name: `${config.prefix}help`,
                type: ActivityType.Listening,
            },
        ],
        status: "online",
    });

    logger.info(`Presence set to: Listening to ${config.prefix}help`);
};

export default { name, once, execute };
