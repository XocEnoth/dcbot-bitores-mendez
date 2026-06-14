import { EmbedBuilder } from 'discord.js';
import config from '../../config/index.js';
import { generateChatResponse } from '../../services/gemini.service.js';
import { chatRateLimiter } from '../../utils/rateLimiter.js';

const name = "chat";
const description = "Chat with BM AI Assistant";

const execute = async (message, args) => {
    // 1. Rate Limiting Check
    const rateLimit = chatRateLimiter.check(message.author.id);
    if (rateLimit.limited) {
        const remainingSeconds = Math.ceil(rateLimit.timeRemainingMs / 1000);
        const limitEmbed = new EmbedBuilder()
            .setColor('#ffcc00')
            .setTitle('⏳ Rate Limited')
            .setDescription(`You are sending messages too fast! Please wait **${remainingSeconds}s** before chatting again.\n*(Limit: 5 requests per minute)*`);
        return message.reply({ embeds: [limitEmbed] });
    }

    // 2. Input Validation
    const prompt = args.join(' ').trim();
    if (!prompt) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setDescription(`❌ Please provide a prompt. Example: \`${config.prefix}chat Hello there!\``);
        return message.reply({ embeds: [errorEmbed] });
    }

    // 3. Thinking State
    const thinkingEmbed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setDescription('🤔 Thinking...');
    
    const replyMessage = await message.reply({ embeds: [thinkingEmbed] });

    try {
        // 4. Generate Response
        const aiResponse = await generateChatResponse(prompt);

        // 5. Response Splitting (Discord Embed Description Limit is 4096)
        const text = aiResponse.text;
        const MAX_LENGTH = 4096;
        const chunks = [];
        
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
            chunks.push(text.substring(i, i + MAX_LENGTH));
        }

        // 6. Send Response
        // Update the first reply with the first chunk
        const firstEmbed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setDescription(chunks[0])
            .setFooter({ text: `⏱️ ${aiResponse.timeTaken}ms | 🤖 ${aiResponse.model}` });
        
        await replyMessage.edit({ embeds: [firstEmbed] });

        // If there are more chunks, send them as follow-up replies
        for (let i = 1; i < chunks.length; i++) {
            const followUpEmbed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setDescription(chunks[i])
                .setFooter({ text: `⏱️ ${aiResponse.timeTaken}ms | 🤖 ${aiResponse.model} (Part ${i + 1}/${chunks.length})` });
            
            await message.reply({ embeds: [followUpEmbed] });
        }

    } catch (error) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Error')
            .setDescription(error.message || 'An unexpected error occurred while generating the response.');
        
        await replyMessage.edit({ embeds: [errorEmbed] }).catch(() => {
            message.reply({ embeds: [errorEmbed] }).catch(console.error);
        });
    }
};

export default { name, description, execute };
