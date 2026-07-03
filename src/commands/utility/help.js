import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
} from "discord.js";
import config from "../../config/index.js";
import logger from "../../utils/logger.js";

const name = "help";
const description = "Display the interactive help menu and bot statistics";

const execute = async (message) => {
    const client = message.client;

    try {
        // Calculate bot statistics
        const totalServers = client.guilds.cache.size;
        const totalUsers = client.guilds.cache.reduce(
            (acc, guild) => acc + guild.memberCount,
            0,
        );
        const latency = Math.round(client.ws.ping);

        // Format Uptime to D H M S
        let totalSeconds = client.uptime / 1000;
        const days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;
        const hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        // 1. Main Embed (Statistics & Info)
        const homeEmbed = new EmbedBuilder()
            .setColor("#ed4245") // Red color signature of bot theme
            .setTitle("🤖 Bitores Mendez - Help & Information")
            .setDescription(
                "Welcome to the help menu! Please use the buttons below to navigate.",
            )
            .setThumbnail(
                client.user.displayAvatarURL({ dynamic: true, size: 512 }),
            )
            .addFields({
                name: "📊 Bot Statistics",
                value: `\`\`\`yaml\nServers : ${totalServers}\nUsers   : ${totalUsers}\nLatency : ${latency}ms\nUptime  : ${uptimeString}\n\`\`\``,
                inline: false,
            })
            .setFooter({
                text: `${client.user.username} v1.0.0`,
                iconURL: client.user.displayAvatarURL(),
            })
            .setTimestamp();

        // 2. Command List Embed
        const generalEmbed = new EmbedBuilder()
            .setColor("#ed4245")
            .setTitle("⚙️ General Commands")
            .setDescription("Here is the list of currently available commands:")
            .addFields(
                {
                    name: "Utility",
                    value: `\`${config.prefix}ping\`\nDisplay bot and API latency.\n\n\`${config.prefix}help\`\nDisplay this help menu.\n\n\`${config.prefix}chat <prompt>\`\nChat with the BM AI Assistant.`,
                    inline: false,
                },
                {
                    name: "Music",
                    value: `\`${config.prefix}music play <query/url> [page]\`\nPlay a track from YouTube/Spotify.\n\n\`${config.prefix}music insert <query/url> [page]\`\nInsert a track to the front of the queue.\n\n\`${config.prefix}music pause\` · \`resume\` · \`skip\` · \`stop\`\nControl music playback.\n\n\`${config.prefix}music queue\`\nDisplay the track queue.\n\n\`${config.prefix}music shuffle\`\nShuffle the upcoming tracks in the queue.\n\n\`${config.prefix}music repeat [on/off]\`\nToggle repeat mode for the current track.\n\n\`${config.prefix}music leave\`\nDisconnect the bot from the voice channel.\n\n\`${config.prefix}music join\`\nJoin the voice channel without playing anything.\n\n\`${config.prefix}music 247 [on/off]\`\nToggle 24/7 mode.`,
                    inline: false,
                },
            )
            .setFooter({
                text: `${client.user.username} v1.0.0`,
                iconURL: client.user.displayAvatarURL(),
            })
            .setTimestamp();

        // Create Buttons
        const generalBtn = new ButtonBuilder()
            .setCustomId("btn_general")
            .setLabel("General")
            .setEmoji("⚙️")
            .setStyle(ButtonStyle.Primary);

        const inviteBtn = new ButtonBuilder()
            .setCustomId("btn_invite")
            .setLabel("Invite Bot")
            .setEmoji("🔗")
            .setStyle(ButtonStyle.Secondary);

        const backBtn = new ButtonBuilder()
            .setCustomId("btn_back")
            .setLabel("Back")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Danger);

        const rowHome = new ActionRowBuilder().addComponents(
            generalBtn,
            inviteBtn,
        );
        const rowGeneral = new ActionRowBuilder().addComponents(
            backBtn,
            inviteBtn,
        );

        let isGeneral = false;

        // Send help message
        const reply = await message.reply({
            embeds: [homeEmbed],
            components: [rowHome],
        });

        // Create Collector that expires in 5 minutes (300000 ms)
        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000, // 5 minutes
        });

        collector.on("collect", async (interaction) => {
            // Protection: Only the command author can click the buttons
            if (interaction.user.id !== message.author.id) {
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription("❌ You cannot use someone else's help menu.")],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            try {
                if (interaction.customId === "btn_general") {
                    isGeneral = true;
                    // Update embed to General Commands page
                    await interaction.update({
                        embeds: [generalEmbed],
                        components: [rowGeneral],
                    });
                } else if (interaction.customId === "btn_back") {
                    isGeneral = false;
                    // Update embed back to Home page
                    await interaction.update({
                        embeds: [homeEmbed],
                        components: [rowHome],
                    });
                } else if (interaction.customId === "btn_invite") {
                    // Generate Automatic Bot Invite Link
                    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;

                    await interaction.reply({
                        embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`🔗 **Use the following link to invite ${client.user.username}:**\n${inviteLink}`)],
                        flags: MessageFlags.Ephemeral, // Only visible to the user who clicked
                    });
                }
            } catch (error) {
                logger.error("Error handling help interaction", error);
            }
        });

        collector.on("end", async () => {
            try {
                // After 5 minutes, disable all active buttons
                const disabledRow = new ActionRowBuilder().addComponents(
                    isGeneral
                        ? backBtn.setDisabled(true)
                        : generalBtn.setDisabled(true),
                    inviteBtn.setDisabled(true),
                );
                // Edit existing message with disabled buttons
                await reply.edit({ components: [disabledRow] }).catch(() => {});
            } catch (error) {
                // Ignore if the original message was deleted by the user
            }
        });
    } catch (error) {
        logger.error("Error sending help command", error);
        await message
            .reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription("❌ An error occurred while loading the help menu.")] })
            .catch(() => {});
    }
};

export default { name, description, execute };
