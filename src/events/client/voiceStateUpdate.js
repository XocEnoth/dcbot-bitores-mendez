import { EmbedBuilder } from "discord.js";
import playerManager from "../../services/music/playerManager.js";
import config from "../../config/index.js";
import logger from "../../utils/logger.js";

const name = "voiceStateUpdate";

const execute = async (oldState, newState) => {
    const guildId = oldState.guild.id || newState.guild.id;
    const player = playerManager.getPlayer(guildId);

    if (!player || !player.connection) return;

    const guild = oldState.guild || newState.guild;
    const botChannelId = guild.members.me.voice.channelId;
    if (!botChannelId) return;

    // Check if the event happened in the bot's channel
    if (
        oldState.channelId !== botChannelId &&
        newState.channelId !== botChannelId
    )
        return;

    // Get the bot's current channel
    const channel =
        guild.channels.cache.get(botChannelId) ||
        (await guild.channels.fetch(botChannelId).catch(() => null));
    if (!channel) return;

    // Count non-bot members
    const humans = channel.members.filter((member) => !member.user.bot).size;

    if (humans === 0) {
        if (!player.aloneTimeout) {
            logger.info(
                `Bot is alone in voice channel in guild ${guildId}. Starting 10-minute alone timeout.`,
            );
            player.aloneTimeout = setTimeout(
                () => {
                    if (player.is247) {
                        logger.info(
                            `10-minute alone timeout reached in guild ${guildId}, but 24/7 mode is on. Ignoring.`,
                        );
                        return;
                    }

                    logger.info(
                        `10-minute alone timeout reached in guild ${guildId}. Disconnecting.`,
                    );

                    if (player.textChannel) {
                        player.textChannel
                            .send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor(config.embedColor)
                                        .setDescription(
                                            "👋 I have been alone in the voice channel for 10 minutes. Disconnecting...",
                                        ),
                                ],
                            })
                            .catch(() => {});
                    }

                    if (typeof player.destroy === "function") {
                        player.destroy();
                    }
                },
                10 * 60 * 1000,
            ); // 10 minutes
        }
    } else {
        // There are humans in the channel, clear the timeout if it exists
        if (player.aloneTimeout) {
            logger.info(
                `Someone joined the voice channel in guild ${guildId}. Clearing alone timeout.`,
            );
            clearTimeout(player.aloneTimeout);
            player.aloneTimeout = null;
        }
    }
};

export default { name, execute };
