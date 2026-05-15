require('dotenv').config();

const express = require('express');

const app = express();

app.get('/', (req, res) => {
    res.send('Bot online!');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor web ativo na porta ${PORT}`);
});

const {
    Client,
    GatewayIntentBits
} = require('discord.js');

const axios = require('axios');

const channels = require('./channels.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// MAPA:
// mensagem original -> mensagens traduzidas
const translatedMessages = new Map();

client.once('clientReady', () => {

    console.log('========================');
    console.log('BOT ONLINE');
    console.log(client.user.tag);
    console.log('========================');

});

client.on('messageCreate', async (message) => {

    try {

        // Ignora bots/webhooks
        if (message.author.bot)
            return;

        if (message.webhookId)
            return;

        // Ignora vazio
        if (
            !message.content &&
            message.attachments.size === 0
        ) {
            return;
        }

        const sourceChannelId =
            message.channel.id;

        // Canal não configurado
        if (!channels[sourceChannelId])
            return;

        const sourceLang =
            channels[sourceChannelId];

        const originalText =
            message.content || '';

        // Anexos
        const attachments =
            [...message.attachments.values()]
                .map(att => att.url);

        // Lista mensagens traduzidas
        const createdMessages = [];

        // Loop canais
        for (const targetChannelId in channels) {

            if (
                targetChannelId === sourceChannelId
            )
                continue;

            const targetLang =
                channels[targetChannelId];

            try {

                let translatedText = '';

                // Traduz
                if (
                    originalText.trim() !== ''
                ) {

                    const response =
                        await axios.post(

                            'https://api-free.deepl.com/v2/translate',

                            {
                                text: [originalText],
                                source_lang: sourceLang,
                                target_lang: targetLang
                            },

                            {
                                headers: {
                                    'Authorization':
                                        `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,

                                    'Content-Type':
                                        'application/json'
                                }
                            }
                        );

                    translatedText =
                        response.data
                            .translations[0]
                            .text;
                }

                // Canal destino
                const targetChannel =
                    await client.channels.fetch(
                        targetChannelId
                    );

                if (!targetChannel)
                    continue;

                // Webhook
                let webhooks =
                    await targetChannel.fetchWebhooks();

                let webhook =
                    webhooks.find(
                        wh =>
                            wh.name ===
                            'TranslatorWebhook'
                    );

                if (!webhook) {

                    webhook =
                        await targetChannel
                            .createWebhook({
                                name:
                                    'TranslatorWebhook'
                            });
                }

                // Envia mensagem
                const sentMessage =
                    await webhook.send({

                        content:
                            translatedText,

                        username:
                            message.member
                                ?.displayName ||
                            message.author
                                .username,

                        avatarURL:
                            message.author
                                .displayAvatarURL({
                                    extension: 'png'
                                }),

                        files: attachments,

                        wait: true
                    });

                // Salva mensagem traduzida
                createdMessages.push({
                    channelId:
                        targetChannelId,

                    messageId:
                        sentMessage.id
                });

            } catch (error) {

                console.log(
                    'ERRO:',
                    error.message
                );
            }
        }

        // Salva mapeamento
        translatedMessages.set(
            message.id,
            createdMessages
        );

    } catch (error) {

        console.log(
            'ERRO GERAL:',
            error.message
        );
    }
});

// APAGAR TRADUÇÕES
client.on('messageDelete', async (message) => {

    try {

        const translations =
            translatedMessages.get(
                message.id
            );

        if (!translations)
            return;

        for (const translation of translations) {

            try {

                const channel =
                    await client.channels.fetch(
                        translation.channelId
                    );

                if (!channel)
                    continue;

                const msg =
                    await channel.messages.fetch(
                        translation.messageId
                    );

                if (msg) {

                    await msg.delete();

                    console.log(
                        'Mensagem traduzida apagada'
                    );
                }

            } catch (err) {

                console.log(
                    'Erro ao apagar:',
                    err.message
                );
            }
        }

        // Remove do mapa
        translatedMessages.delete(
            message.id
        );

    } catch (error) {

        console.log(
            'ERRO DELETE:',
            error.message
        );
    }
});

client.login(
    process.env.DISCORD_TOKEN
);
