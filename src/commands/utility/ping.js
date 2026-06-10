const name = "ping";
const description = "Menampilkan latency bot dan API Discord";

const execute = async (message) => {
    const sentTimestamp = Date.now();

    const reply = await message.reply("🏓 Mengukur latency...");

    const roundtripLatency = Date.now() - sentTimestamp;
    const apiLatency = Math.round(message.client.ws.ping);

    await reply.edit(
        `🏓 **Pong!**\n` +
            `📡 Latency: **${roundtripLatency}ms**\n` +
            `💻 API Latency: **${apiLatency}ms**`,
    );
};

export default { name, description, execute };
