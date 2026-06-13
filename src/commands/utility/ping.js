const name = "ping";
const description = "Display bot and Discord API latency";

const execute = async (message) => {
    const sentTimestamp = Date.now();

    const reply = await message.reply("🏓 Measuring latency...");

    const roundtripLatency = Date.now() - sentTimestamp;
    const apiLatency = Math.round(message.client.ws.ping);

    await reply.edit(
        `🏓 **Pong!**\n` +
            `📡 Latency: **${roundtripLatency}ms**\n` +
            `💻 API Latency: **${apiLatency}ms**`,
    );
};

export default { name, description, execute };
