import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';

const name = "ping";
const description = "Display bot and Discord API latency";

const execute = async (message) => {
    const sentTimestamp = Date.now();

    const embedInitial = new EmbedBuilder()
        .setColor(config.embedColor)
        .setDescription("🏓 Measuring latency...");

    const reply = await message.reply({ embeds: [embedInitial] });

    const roundtripLatency = Date.now() - sentTimestamp;
    const apiLatency = Math.round(message.client.ws.ping);

    const embedFinal = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle("🏓 Pong!")
        .setDescription(`📡 Latency: **${roundtripLatency}ms**\n💻 API Latency: **${apiLatency}ms**`);

    await reply.edit({ embeds: [embedFinal] });
};

export default { name, description, execute };
