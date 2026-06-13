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
const description =
    "Menampilkan menu bantuan dan statistik bot yang interaktif";

const execute = async (message) => {
    const client = message.client;

    try {
        // Menghitung statistik bot
        const totalServers = client.guilds.cache.size;
        const totalUsers = client.guilds.cache.reduce(
            (acc, guild) => acc + guild.memberCount,
            0,
        );
        const latency = Math.round(client.ws.ping);

        // Format Uptime menjadi D H M S
        let totalSeconds = client.uptime / 1000;
        const days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;
        const hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        // 1. Embed Utama (Statistik & Info)
        const homeEmbed = new EmbedBuilder()
            .setColor("#ed4245") // Warna merah khas tema bot
            .setTitle("🤖 Bitores Mendez - Bantuan & Informasi")
            .setDescription(
                "Selamat datang di menu bantuan! Silakan gunakan tombol di bawah untuk menavigasi.",
            )
            .setThumbnail(
                client.user.displayAvatarURL({ dynamic: true, size: 512 }),
            )
            .addFields({
                name: "📊 Statistik Bot",
                value: `\`\`\`yaml\nServers : ${totalServers}\nUsers   : ${totalUsers}\nLatency : ${latency}ms\nUptime  : ${uptimeString}\n\`\`\``,
                inline: false,
            })
            .setFooter({
                text: `${client.user.username} v1.0.0`,
                iconURL: client.user.displayAvatarURL(),
            })
            .setTimestamp();

        // 2. Embed Daftar Command
        const generalEmbed = new EmbedBuilder()
            .setColor("#ed4245")
            .setTitle("⚙️ General Commands")
            .setDescription(
                "Berikut adalah daftar command yang tersedia saat ini:",
            )
            .addFields({
                name: "Utility",
                value: `\`${config.prefix}ping\`\nMenampilkan latency bot dan API.\n\n\`${config.prefix}help\`\nMenampilkan menu bantuan ini.`,
                inline: false,
            })
            .setFooter({
                text: `${client.user.username} v1.0.0`,
                iconURL: client.user.displayAvatarURL(),
            })
            .setTimestamp();

        // Membuat Tombol
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

        const rowHome = new ActionRowBuilder().addComponents(generalBtn, inviteBtn);
        const rowGeneral = new ActionRowBuilder().addComponents(backBtn, inviteBtn);

        let isGeneral = false;

        // Mengirim pesan bantuan
        const reply = await message.reply({
            embeds: [homeEmbed],
            components: [rowHome],
        });

        // Membuat Collector yang akan kadaluarsa dalam 5 menit (300000 ms)
        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000, // 5 menit
        });

        collector.on("collect", async (interaction) => {
            // Proteksi: Hanya pembuat command yang bisa menekan tombol
            if (interaction.user.id !== message.author.id) {
                await interaction.reply({
                    content:
                        "❌ Kamu tidak dapat menggunakan menu bantuan milik orang lain.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            try {
                if (interaction.customId === "btn_general") {
                    isGeneral = true;
                    // Update embed menjadi halaman General Commands
                    await interaction.update({ embeds: [generalEmbed], components: [rowGeneral] });
                } else if (interaction.customId === "btn_back") {
                    isGeneral = false;
                    // Update embed kembali ke halaman Home
                    await interaction.update({ embeds: [homeEmbed], components: [rowHome] });
                } else if (interaction.customId === "btn_invite") {
                    // Generate Link Invite Bot Otomatis
                    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;

                    await interaction.reply({
                        content: `🔗 **Gunakan tautan berikut untuk mengundang ${client.user.username}:**\n${inviteLink}`,
                        flags: MessageFlags.Ephemeral, // Hanya terlihat oleh user yang menekan tombol
                    });
                }
            } catch (error) {
                logger.error("Error handling help interaction", error);
            }
        });

        collector.on("end", async () => {
            try {
                // Setelah 5 menit, matikan semua tombol yang sedang aktif
                const disabledRow = new ActionRowBuilder().addComponents(
                    isGeneral ? backBtn.setDisabled(true) : generalBtn.setDisabled(true),
                    inviteBtn.setDisabled(true)
                );
                // Edit pesan yang sudah ada dengan tombol yang didisable
                await reply.edit({ components: [disabledRow] }).catch(() => {});
            } catch (error) {
                // Abaikan jika pesan asli sudah dihapus oleh user
            }
        });
    } catch (error) {
        logger.error("Error sending help command", error);
        await message
            .reply("❌ Terjadi kesalahan saat memuat menu bantuan.")
            .catch(() => {});
    }
};

export default { name, description, execute };
