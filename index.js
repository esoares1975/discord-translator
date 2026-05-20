require('dotenv').config();

// ========================================
// EXPRESS SERVER (FLY.IO)
// ========================================

const express = require('express');

const app = express();

const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {

    res.send('Bot online');

});

app.listen(PORT, '0.0.0.0', () => {

    console.log('========================');
    console.log('SERVIDOR WEB ONLINE');
    console.log(`PORTA ${PORT}`);
    console.log('========================');

});

// ========================================
// DISCORD
// ========================================

const {
    Client,
    GatewayIntentBits
} = require('discord.js');

const axios = require('axios');

const channels = require('./channels.json');

// ========================================
// CLIENT
// ========================================

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMessages,

        GatewayIntentBits.MessageContent,

        GatewayIntentBits.GuildWebhooks
    ]
});

// ========================================
// CONFIG
// ========================================

const MAX_FILE_SIZE = 20000000;

// Armazena relação:
// mensagem original -> mensagens traduzidas

const translatedMessages = new Map();

// ========================================
// SLEEP
// ========================================

function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

// ========================================
// TRANSLATE
// ========================================

async function translateText(
    text,
    sourceLang,
    targetLang
) {

    for (let attempt = 1; attempt <= 3; attempt++) {

        try {

            console.log(
                `[DeepL] ${sourceLang} -> ${targetLang}`
            );

            const response =
                await axios.post(

                    'https://api-free.deepl.com/v2/translate',

                    {
                        text: [text],
                        source_lang: sourceLang,
                        target_lang: targetLang
                    },

                    {
                        headers: {

                            'Authorization':
                                `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,

                            'Content-Type':
                                'application/json'
                        },

                        timeout: 15000
                    }
                );

            return response.data
                .translations[0]
                .text;

        } catch (error) {

            console.log(
                `Tentativa ${attempt} falhou`
            );

            if (error.response) {

                console.log(
                    error.response.data
                );

            } else {

                console.log(
                    error.message
                );
            }

            if (attempt === 3)
                throw error;

            await sleep(3000);
        }
    }
}

// ========================================
// READY
// ========================================

client.once('clientReady', () => {

    console.log('========================');
    console.log('BOT ONLINE');
    console.log(client.user.tag);
    console.log('========================');

});

// ========================================
// CONNECTION EVENTS
// ========================================

client.on('disconnect', () => {

    console.log(
        'Bot desconectado'
    );

});

client.on('reconnecting', () => {

    console.log(
        'Reconectando...'
    );

});

client.on('resume', () => {

    console.log(
        'Conexão restaurada'
    );

});

client.on('error', (error) => {

    console.log(
        'ERRO DISCORD:',
        error
    );

});

// ========================================
// CREATE MESSAGE
// ========================================

client.on('messageCreate', async (message) => {

    try {

        if (message.author.bot)
            return;

        if (message.webhookId)
            return;

        if (
            message.author.id ===
            client.user.id
        ) {
            return;
        }

        if (
            !message.content &&
            message.attachments.size === 0
        ) {
            return;
        }

        console.log('========================');
        console.log('NOVA MENSAGEM');
        console.log('========================');

        const sourceChannelId =
            message.channel.id;

        if (!channels[sourceChannelId]) {

            console.log(
                'Canal não configurado'
            );

            return;
        }

        const sourceLang =
            channels[sourceChannelId];

        const originalText =
            message.content || '';

        // ========================================
        // ATTACHMENTS
        // ========================================

        const attachments =
            [...message.attachments.values()]
                .filter(att =>
                    att.size < MAX_FILE_SIZE
                )
                .map(att => att.url);

        // ========================================
        // SAVE RELATIONS
        // ========================================

        const createdMessages = [];

        // ========================================
        // LOOP DESTINATION CHANNELS
        // ========================================

        for (const targetChannelId in channels) {

            if (
                targetChannelId ===
                sourceChannelId
            ) {
                continue;
            }

            await sleep(1200);

            const targetLang =
                channels[targetChannelId];

            try {

                let translatedText = '';

                if (
                    originalText.trim() !== ''
                ) {

                    translatedText =
                        await translateText(

                            originalText,
                            sourceLang,
                            targetLang
                        );
                }

                const targetChannel =
                    await client.channels.fetch(
                        targetChannelId
                    );

                if (!targetChannel)
                    continue;

                // ========================================
                // WEBHOOK
                // ========================================

                let webhooks =
                    await targetChannel
                        .fetchWebhooks();

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

                // ========================================
                // SEND
                // ========================================

                const sentMessage =
                    await webhook.send({

                        content:
                            translatedText || ' ',

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

                        files: attachments
                    });

                console.log(
                    `Mensagem enviada (${targetLang})`
                );

                // ========================================
                // SAVE
                // ========================================

                createdMessages.push({

                    channelId:
                        targetChannelId,

                    messageId:
                        sentMessage.id
                });

            } catch (error) {

                console.log(
                    'ERRO DESTINO:',
                    error.message
                );
            }
        }

        translatedMessages.set(

            message.id,
            createdMessages
        );

    } catch (error) {

        console.log(
            'ERRO CREATE:',
            error.message
        );
    }
});

// ========================================
// UPDATE MESSAGE
// ========================================

client.on('messageUpdate', async (oldMessage, newMessage) => {

    try {

        if (!newMessage.author)
            return;

        if (newMessage.author.bot)
            return;

        console.log('========================');
        console.log('MENSAGEM EDITADA');
        console.log('========================');

        const translations =
            translatedMessages.get(
                newMessage.id
            );

        if (!translations)
            return;

        const sourceChannelId =
            newMessage.channel.id;

        const sourceLang =
            channels[sourceChannelId];

        const attachments =
            [...newMessage.attachments.values()]
                .filter(att =>
                    att.size < MAX_FILE_SIZE
                )
                .map(att => att.url);

        // ========================================
        // DELETE OLD TRANSLATIONS
        // ========================================

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

                }

            } catch (err) {

                console.log(
                    'Erro delete old:',
                    err.message
                );
            }
        }

        // ========================================
        // CREATE NEW TRANSLATIONS
        // ========================================

        const recreatedMessages = [];

        for (const targetChannelId in channels) {

            if (
                targetChannelId ===
                sourceChannelId
            ) {
                continue;
            }

            await sleep(1200);

            try {

                const targetLang =
                    channels[targetChannelId];

                let translatedText = '';

                if (
                    newMessage.content &&
                    newMessage.content.trim() !== ''
                ) {

                    translatedText =
                        await translateText(

                            newMessage.content,
                            sourceLang,
                            targetLang
                        );
                }

                const targetChannel =
                    await client.channels.fetch(
                        targetChannelId
                    );

                if (!targetChannel)
                    continue;

                let webhooks =
                    await targetChannel
                        .fetchWebhooks();

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

                const newTranslatedMessage =
                    await webhook.send({

                        content:
                            translatedText || ' ',

                        username:
                            newMessage.member
                                ?.displayName ||
                            newMessage.author
                                .username,

                        avatarURL:
                            newMessage.author
                                .displayAvatarURL({

                                    extension: 'png'
                                }),

                        files: attachments
                    });

                recreatedMessages.push({

                    channelId:
                        targetChannelId,

                    messageId:
                        newTranslatedMessage.id
                });

                console.log(
                    `Mensagem atualizada (${targetLang})`
                );

            } catch (err) {

                console.log(
                    'Erro update:',
                    err.message
                );
            }
        }

        // Atualiza mapa
        translatedMessages.set(

            newMessage.id,
            recreatedMessages
        );

    } catch (error) {

        console.log(
            'ERRO UPDATE:',
            error.message
        );
    }
});

// ========================================
// DELETE MESSAGE
// ========================================

client.on('messageDelete', async (message) => {

    try {

        console.log(
            'Mensagem original apagada'
        );

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
                    'Erro delete:',
                    err.message
                );
            }
        }

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

// ========================================
// LOGIN
// ========================================

client.login(
    process.env.DISCORD_TOKEN
);
