require('dotenv').config();

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

client.once('clientReady', () => {

    console.log('========================');
    console.log('BOT ONLINE');
    console.log(client.user.tag);
    console.log('========================');

});

client.on('messageCreate', async (message) => {

    try {

        // Ignora bots
        if (message.author.bot)
            return;

        // Ignora webhooks
        if (message.webhookId)
            return;

        // Ignora mensagens vazias
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

        // Verifica se canal existe
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

        // Texto original
        const originalText =
            message.content || '';

        console.log(
            'Mensagem:',
            originalText
        );

        // Captura anexos
        const attachments =
            [...message.attachments.values()]
                .map(att => att.url);

        console.log(
            'Anexos:',
            attachments
        );

        // Loop canais destino
        for (const targetChannelId in channels) {

            // Ignora origem
            if (
                targetChannelId === sourceChannelId
            )
                continue;

            const targetLang =
                channels[targetChannelId];

            console.log('------------------------');
            console.log(
                'Traduzindo para:',
                targetLang
            );

            try {

                let translatedText = '';

                // Traduz texto
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

                    console.log(
                        'Texto traduzido:',
                        translatedText
                    );
                }

                // Busca canal destino
                const targetChannel =
                    await client.channels.fetch(
                        targetChannelId
                    );

                if (!targetChannel) {

                    console.log(
                        'Canal destino não encontrado'
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

                console.log(
                    'Enviando mensagem...'
                );

                // Envia tradução
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

                    files: attachments

                });

                console.log(
                    'Mensagem enviada'
                );

            } catch (error) {

                console.log(
                    '========== ERRO TRADUÇÃO =========='
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
                    '==================================='
                );
            }
        }

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

client.login(
    process.env.DISCORD_TOKEN
);
```
