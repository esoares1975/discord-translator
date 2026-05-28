require('dotenv').config();

process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

const fs = require('fs');
const express = require('express');

const {
    Client,
    GatewayIntentBits,
    Partials,
    WebhookClient
} = require('discord.js');

const fetch = (...args) =>
    import('node-fetch').then(({ default: fetch }) => fetch(...args));

/* =======================================================
   CONFIG
======================================================= */

const PORT = process.env.PORT || 8080;

const CHANNELS =
    JSON.parse(
        fs.readFileSync(
            './channels.json',
            'utf8'
        )
    );

console.log('========================');
console.log('CHANNELS CARREGADOS');
console.log(CHANNELS);
console.log('========================');

const MESSAGE_DB = './messages.json';

/* =======================================================
   EXPRESS
======================================================= */

const app = express();

app.get('/', (req, res) => {
    res.send('Translator Bot Online');
});

app.listen(PORT, '0.0.0.0', () => {

    console.log('========================');
    console.log('SERVIDOR WEB ONLINE');
    console.log(`PORTA ${PORT}`);
    console.log('========================');
});

/* =======================================================
   DISCORD CLIENT
======================================================= */

const client = new Client({

    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],

    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction
    ]
});

/* =======================================================
   DATABASE
======================================================= */

let messageDB = {};

if (fs.existsSync(MESSAGE_DB)) {

    try {

        messageDB = JSON.parse(
            fs.readFileSync(MESSAGE_DB, 'utf8')
        );

    } catch {

        messageDB = {};
    }
}

function saveDB() {

    fs.writeFileSync(
        MESSAGE_DB,
        JSON.stringify(messageDB, null, 2)
    );
}

/* =======================================================
   HELPERS
======================================================= */

function wait(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

/* =======================================================
   TRANSLATE
======================================================= */

async function translateText(text, targetLang) {

    if (!text || text.trim() === '') {
        return '';
    }

    for (let attempt = 1; attempt <= 3; attempt++) {

        try {

            console.log(
                `[DeepL] ${targetLang} tentativa ${attempt}`
            );

            const response = await fetch(
                'https://api-free.deepl.com/v2/translate',
                {
                    method: 'POST',

                    headers: {
                        'Authorization':
                            `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
                        'Content-Type': 'application/json'
                    },

                    body: JSON.stringify({
                        text: [text],
                        target_lang: targetLang
                    })
                }
            );

            if (!response.ok) {

                console.log(
                    `[DeepL ERROR] ${response.status}`
                );

                await wait(3000);

                continue;
            }

            const data = await response.json();

            if (
                data.translations &&
                data.translations.length > 0
            ) {

                return data.translations[0].text;
            }

        } catch (err) {

            console.log(
                `[DeepL FAIL] tentativa ${attempt}`
            );

            console.log(err);

            await wait(3000);
        }
    }

    console.log('[DeepL] FALHA FINAL');

    return text;
}

/* =======================================================
   WEBHOOK CACHE
======================================================= */

const webhookCache = {};

async function getWebhook(channel) {

    try {

        if (webhookCache[channel.id]) {
            return webhookCache[channel.id];
        }

        const hooks =
            await channel.fetchWebhooks();

        let hook = hooks.find(
            h => h.name === 'TranslatorBot'
        );

        if (!hook) {

            console.log(
                `[WEBHOOK] criando ${channel.id}`
            );

            hook =
                await channel.createWebhook({
                    name: 'TranslatorBot'
                });
        }

        webhookCache[channel.id] =
            new WebhookClient({
                id: hook.id,
                token: hook.token
            });

        return webhookCache[channel.id];

    } catch (err) {

        console.log('[WEBHOOK ERROR]');
        console.log(err);

        return null;
    }
}

/* =======================================================
   READY
======================================================= */

client.once('clientReady', () => {

    console.log('========================');
    console.log('BOT ONLINE');
    console.log(client.user.tag);
    console.log('========================');
});

/* =======================================================
   MESSAGE CREATE
======================================================= */

client.on('messageCreate', async (message) => {

    try {

        console.log('========================');
        console.log('NOVA MENSAGEM');
        console.log('Canal:', message.channel.id);
        console.log('Autor:', message.author.username);
        console.log('Conteúdo:', message.content);
        console.log('========================');

        if (message.author.bot) {

            console.log('[IGNORADO] BOT');

            return;
        }

        if (!CHANNELS[message.channel.id]) {

            console.log(
                '[IGNORADO] Canal não configurado:',
                message.channel.id
            );

            return;
        }

        if (!messageDB[message.id]) {
            messageDB[message.id] = {};
        }

        for (const [targetChannelId, targetLang]
            of Object.entries(CHANNELS)) {

            try {

                if (
                    targetChannelId === message.channel.id
                ) continue;

                console.log(
                    `[PROCESSANDO] ${targetLang}`
                );

                const targetChannel =
                    await client.channels.fetch(
                        targetChannelId
                    );

                if (!targetChannel) {

                    console.log(
                        '[ERRO] Canal destino não encontrado'
                    );

                    continue;
                }

                const translatedText =
                    await translateText(
                        message.content,
                        targetLang
                    );

                console.log(
                    `[TRADUZIDO] ${translatedText}`
                );

                const webhook =
                    await getWebhook(targetChannel);

                if (!webhook) {

                    console.log(
                        '[ERRO] webhook null'
                    );

                    continue;
                }

                const files = [];

                message.attachments.forEach(att => {
                    files.push(att.url);
                });

                let sentMessage = null;

                for (
                    let attempt = 1;
                    attempt <= 3;
                    attempt++
                ) {

                    try {

                        console.log(
                            `[ENVIANDO] ${targetLang} tentativa ${attempt}`
                        );

                        sentMessage =
                            await webhook.send({

                                content:
                                    translatedText || ' ',

                                username:
                                    message.member?.displayName
                                    || message.author.username,

                                avatarURL:
                                    message.author.displayAvatarURL(),

                                files,

                                allowedMentions: {
                                    parse: []
                                }
                            });

                        console.log(
                            `[ENVIADO] ${targetLang}`
                        );

                        break;

                    } catch (err) {

                        console.log(
                            `[SEND FAIL] ${targetLang}`
                        );

                        console.log(err);

                        await wait(5000);
                    }
                }

                if (!sentMessage) {

                    console.log(
                        `[FALHA FINAL] ${targetLang}`
                    );

                    continue;
                }

                messageDB[message.id][targetChannelId] =
                    sentMessage.id;

                saveDB();

                await wait(1200);

            } catch (err) {

                console.log(
                    `[CHANNEL ERROR] ${targetLang}`
                );

                console.log(err);
            }
        }

    } catch (err) {

        console.log(
            '[MESSAGE CREATE ERROR]'
        );

        console.log(err);
    }
});

/* =======================================================
   MESSAGE UPDATE
======================================================= */

client.on(
    'messageUpdate',
    async (oldMessage, newMessage) => {

        try {

            if (newMessage.author?.bot) return;

            const translations =
                messageDB[newMessage.id];

            if (!translations) return;

            console.log(
                `[UPDATE] ${newMessage.id}`
            );

            for (
                const [targetChannelId, translatedMessageId]
                of Object.entries(translations)
            ) {

                try {

                    const targetChannel =
                        await client.channels.fetch(
                            targetChannelId
                        );

                    if (!targetChannel) continue;

                    const translatedText =
                        await translateText(
                            newMessage.content,
                            CHANNELS[targetChannelId]
                        );

                    const targetMessage =
                        await targetChannel.messages.fetch(
                            translatedMessageId
                        );

                    if (!targetMessage) continue;

                    await targetMessage.edit({
                        content:
                            translatedText || ' '
                    });

                    console.log(
                        `[EDITADO] ${targetChannelId}`
                    );

                    await wait(1000);

                } catch (err) {

                    console.log(
                        '[UPDATE FAIL]'
                    );

                    console.log(err);
                }
            }

        } catch (err) {

            console.log(
                '[MESSAGE UPDATE ERROR]'
            );

            console.log(err);
        }
    }
);

/* =======================================================
   MESSAGE DELETE
======================================================= */

client.on(
    'messageDelete',
    async (message) => {

        try {

            const translations =
                messageDB[message.id];

            if (!translations) return;

            console.log(
                `[DELETE] ${message.id}`
            );

            for (
                const [targetChannelId, translatedMessageId]
                of Object.entries(translations)
            ) {

                try {

                    const targetChannel =
                        await client.channels.fetch(
                            targetChannelId
                        );

                    if (!targetChannel) continue;

                    const targetMessage =
                        await targetChannel.messages.fetch(
                            translatedMessageId
                        );

                    if (targetMessage) {

                        await targetMessage.delete();

                        console.log(
                            `[DELETADO] ${targetChannelId}`
                        );
                    }

                } catch (err) {

                    console.log(
                        '[DELETE FAIL]'
                    );

                    console.log(err);
                }
            }

            delete messageDB[message.id];

            saveDB();

        } catch (err) {

            console.log(
                '[MESSAGE DELETE ERROR]'
            );

            console.log(err);
        }
    }
);

/* =======================================================
   LOGIN
======================================================= */

client.login(process.env.DISCORD_TOKEN);
