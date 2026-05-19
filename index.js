require('dotenv').config();

// ========================
// EXPRESS (FLY.IO KEEPALIVE)
// ========================

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

// ========================
// DISCORD
// ========================

const {
    Client,
    GatewayIntentBits
} = require('discord.js');

const axios = require('axios');

const channels = require('./channels.json');

// ========================
// CLIENT
// ========================

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMessages,

        GatewayIntentBits.MessageContent
    ]
});

// ========================
// CONFIG
// ========================

const MAX_FILE_SIZE = 20000000;

const translatedMessages = new Map();

// ========================
// SLEEP
// ========================

function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

// ========================
// TRANSLATE FUNCTION
// ========================

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

// ========================
// BOT READY
// ========================

client.once('clientReady', () => {

    console.log('========================');
    console.log('BOT ONLINE');
    console.log(client.user.tag);
    console.log('========================');

});

// ========================
// CONNECTION EVENTS
// ========================

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

// ========================
// MESSAGE CREATE
// ========================

client.on('messageCreate', async (message) => {

    try {

        // Ignora bots
        if (message.author.bot)
            return;

        // Ignora webhooks
        if (message.webhookId)
            return;

        // Ignora o próprio bot
        if (
            message.author.id ===
            client.user.id
        ) {
            return;
        }

        // Ignora vazio
        if (
            !message.content &&
            message.attachments.size === 0
        ) {
            return;
        }

        console.log('========================');
        console.log('Mensagem detectada');

        const sourceChannelId =
            message.channel.id;

        console.log(
            'Canal origem:',
            sourceChannelId
        );

        // Canal não configurado
        if (!channels[sourceChannelId]) {

            console.log(
                'Canal não configurado'
            );

            return;
        }

        const sourceLang =
            channels[sourceChannelId];

        console.log(
            'Idioma origem:',
            sourceLang
        );

        const originalText =
            message.content || '';

        console.log(
            'Texto:',
            originalText
        );

        // Filtra anexos grandes
        const attachments =
            [...message.attachments.values()]
                .filter(att =>
                    att.size < MAX_FILE_SIZE
                )
                .map(att => att.url);

        console.log(
            'Anexos:',
            attachments.length
        );

        // Salva mensagens traduzidas
        const createdMessages = [];

        // Loop canais
        for (const targetChannelId in channels) {

            // Ignora canal origem
            if (
                targetChannelId ===
                sourceChannelId
            ) {
                continue;
            }

            // Delay anti rate limit
            await sleep(1200);

            const targetLang =
                channels[targetChannelId];

            console.log('------------------------');
            console.log(
                `Destino: ${targetLang}`
            );

            try {

                let translatedText = '';

                // Traduz texto
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

                // Busca canal destino
                const targetChannel =
                    await client.channels.fetch(
                        targetChannelId
                    );

                if (!targetChannel) {

                    console.log(
                        'Canal não encontrado'
                    );

                    continue;
                }

                // Busca webhooks
                let webhooks =
                    await targetChannel
                        .fetchWebhooks();

                let webhook =
                    webhooks.find(

                        wh =>
                            wh.name ===
                            'TranslatorWebhook'
                    );

                // Cria webhook
                if (!webhook) {

                    console.log(
                        'Criando webhook...'
                    );

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
                    'Mensagem enviada'
                );

                // Salva referência
                createdMessages.push({

                    channelId:
                        targetChannelId,

                    messageId:
                        sentMessage.id
                });

            } catch (error) {

                console.log(
                    '========== ERRO DESTINO =========='
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

                console.log(
                    '=================================='
                );
            }
        }

        // Salva relação
        translatedMessages.set(

            message.id,
            createdMessages
        );

    } catch (error) {

        console.log(
            '========== ERRO GERAL =========='
        );

        console.log(error);

        console.log(
            '================================'
        );
    }
});

// ========================
// DELETE MESSAGE
// ========================

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
                    'Erro ao apagar:',
                    err.message
                );
            }
        }

        // Remove mapa
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

// ========================
// LOGIN
// ========================

client.login(
    process.env.DISCORD_TOKEN
);
