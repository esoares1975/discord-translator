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

        console.log('Mensagem detectada');

        // Ignora bots
        if (message.author.bot)
            return;

        // Ignora mensagens vazias
        if (!message.content)
            return;

        const sourceChannelId = message.channel.id;

        console.log('Canal origem:', sourceChannelId);

        // Verifica se canal está configurado
        if (!channels[sourceChannelId]) {

            console.log('Canal não configurado');
            return;
        }

        const sourceLang =
            channels[sourceChannelId];

        console.log('Idioma origem:', sourceLang);
        console.log('Mensagem:', message.content);

        // Loop dos canais
        for (const targetChannelId in channels) {

            // Ignora canal origem
            if (targetChannelId === sourceChannelId)
                continue;

            const targetLang =
                channels[targetChannelId];

            console.log('========================');
            console.log('Traduzindo para:', targetLang);

            try {

                // Tradução DeepL
                const response = await axios.post(
                    'https://api-free.deepl.com/v2/translate',
                    {
                        text: [message.content],
                        source_lang: sourceLang,
                        target_lang: targetLang
                    },
                    {
                        headers: {
                            'Authorization':
                                `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                console.log('DeepL OK');

                const translatedText =
                    response.data.translations[0].text;

                console.log(
                    'Texto traduzido:',
                    translatedText
                );

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

                // Busca webhooks existentes
                let webhooks =
                    await targetChannel.fetchWebhooks();

                // Procura webhook fixo
                let webhook = webhooks.find(
                    wh => wh.name === 'TranslatorWebhook'
                );

                // Cria se não existir
                if (!webhook) {

                    console.log(
                        'Criando webhook...'
                    );

                    webhook =
                        await targetChannel.createWebhook({
                            name: 'TranslatorWebhook'
                        });
                }

                console.log('Enviando mensagem...');

                // Envia tradução
                await webhook.send({

                    content: translatedText,

                    username:
                        message.member?.displayName ||
                        message.author.username,

                    avatarURL:
                        message.author.displayAvatarURL({
                            extension: 'png'
                        })

                });

                console.log('Mensagem enviada');

            } catch (error) {

                console.log(
                    '========== ERRO TRADUÇÃO =========='
                );

                if (error.response) {

                    console.log(error.response.data);

                } else {

                    console.log(error.message);
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

client.login(process.env.DISCORD_TOKEN);

