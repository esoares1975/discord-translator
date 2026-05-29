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

    rest: {
        timeout: 30000
    },

    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],

    partials: [
        Partials.Message,
        Partials.Channel
    ],

    makeCache: () => new Map(),

    sweepers: {

        messages: {
            interval: 300,
            lifetime: 600
        }
    }
});

/* =======================================================
   DATABASE
======================================================= */

let messageDB = {};

if (fs.existsSync(MESSAGE_DB)) {

    try {

        messageDB =
            JSON.parse(
                fs.readFileSync(
                    MESSAGE_DB,
                    'utf8'
                )
            );

    } catch {

        messageDB = {};
    }
}

function saveDB() {

    fs.writeFileSync(
        MESSAGE_DB,
        JSON.stringify(
            messageDB,
            null,
            2
        )
    );
}

/* =======================================================
   AUTO CLEAN DATABASE
======================================================= */

setInterval(() => {

    try {

        const keys =
            Object.keys(messageDB);

        if (keys.length > 5000) {

            console.log(
                '[LIMPEZA] messages.json'
            );

            const remove =
                keys.slice(0, 1000);

            for (const key of remove) {

                delete messageDB[key];
            }

            saveDB();
        }

    } catch (err) {

        console.log(err);
    }

}, 1000 * 60 * 10);

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

async function translateText(
    text,
    targetLang
) {

    if (!text || !text.trim()) {
        return '';
    }

    for (
        let attempt = 1;
        attempt <= 2;
        attempt++
    ) {

        try {

            console.log(
                `[DeepL] ${targetLang}`
            );

            const response =
                await fetch(
                    'https://api-free.deepl.com/v2/translate',
                    {

                        method: 'POST',

                        headers: {
                            'Authorization':
                                `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
                            'Content-Type':
                                'application/json'
                        },

                        body: JSON.stringify({

                            text: [text],
                            target_lang:
                                targetLang
                        })
                    }
                );

            if (!response.ok) {

                console.log(
                    `[DeepL ERROR] ${response.status}`
                );

                await wait(1000);

                continue;
            }

            const data =
                await response.json();

            if (
                data.translations &&
                data.translations.length
            ) {

                return data
                    .translations[0]
                    .text;
            }

        } catch (err) {

            console.log(
                '[DeepL FAIL]'
            );

            console.log(err);

            await wait(1000);
        }
    }

    return text;
}

/* =======================================================
   WEBHOOK CACHE
======================================================= */

const webhookCache = new Map();

async function getWebhook(channel) {

    try {

        if (
            webhookCache.has(
                channel.id
            )
        ) {

            return webhookCache.get(
                channel.id
            );
        }

        const hooks =
            await channel.fetchWebhooks();

        let hook =
            hooks.find(
                h =>
                    h.name ===
                    'TranslatorBot'
            );

        if (!hook) {

            hook =
                await channel.createWebhook({

                    name:
                        'TranslatorBot'
                });
        }

        const webhook =
            new WebhookClient({

                id: hook.id,
                token: hook.token
            });

        webhookCache.set(
            channel.id,
            webhook
        );

        if (
            webhookCache.size > 20
        ) {

            const firstKey =
                webhookCache
                    .keys()
                    .next()
                    .value;

            webhookCache.delete(
                firstKey
            );
        }

        return webhook;

    } catch (err) {

        console.log(
            '[WEBHOOK ERROR]'
        );

        console.log(err);

        return null;
    }
}

/* =======================================================
   READY
======================================================= */

client.once(
    'clientReady',
    () => {

        console.log(
            '========================'
        );

        console.log(
            'BOT ONLINE'
        );

        console.log(
            client.user.tag
        );

        console.log(
            '========================'
        );
    }
);

/* =======================================================
   MESSAGE CREATE
======================================================= */

client.on(
    'messageCreate',
    async (message) => {

        try {

            if (
                message.author.bot
            ) return;

            if (
                !CHANNELS[
                    message.channel.id
                ]
            ) return;

            console.log(
                `[MSG] ${message.author.username}`
            );

            if (
                !messageDB[
                    message.id
                ]
            ) {

                messageDB[
                    message.id
                ] = {};
            }

            for (
                const [
                    targetChannelId,
                    targetLang
                ]
                of Object.entries(
                    CHANNELS
                )
            ) {

                try {

                    if (
                        targetChannelId ===
                        message.channel.id
                    ) continue;

                    const targetChannel =
                        await client.channels.fetch(
                            targetChannelId
                        );

                    if (
                        !targetChannel
                    ) continue;

                    const translatedText =
                        await translateText(
                            message.content,
                            targetLang
                        );

                    const webhook =
                        await getWebhook(
                            targetChannel
                        );

                    if (
                        !webhook
                    ) continue;

                    const files =
                        [];

                    message.attachments.forEach(
                        att => {

                            files.push(
                                att.url
                            );
                        }
                    );

                    const sentMessage =
                        await webhook.send({

                            content:
                                translatedText || ' ',

                            username:
                                message.member
                                    ?.displayName
                                ||
                                message.author.username,

                            avatarURL:
                                message.author.displayAvatarURL(),

                            files,

                            allowedMentions: {
                                parse: []
                            }
                        });

                    messageDB[
                        message.id
                    ][
                        targetChannelId
                    ] =
                        sentMessage.id;

                    saveDB();

                    await wait(500);

                } catch (err) {

                    console.log(
                        '[CHANNEL ERROR]'
                    );

                    console.log(err);
                }
            }

        } catch (err) {

            console.log(
                '[MESSAGE ERROR]'
            );

            console.log(err);
        }
    }
);

/* =======================================================
   MESSAGE UPDATE
======================================================= */

client.on(
    'messageUpdate',
    async (
        oldMessage,
        newMessage
    ) => {

        try {

            if (
                newMessage.author?.bot
            ) return;

            const translations =
                messageDB[
                    newMessage.id
                ];

            if (
                !translations
            ) return;

            for (
                const [
                    targetChannelId,
                    translatedMessageId
                ]
                of Object.entries(
                    translations
                )
            ) {

                try {

                    const targetChannel =
                        await client.channels.fetch(
                            targetChannelId
                        );

                    if (
                        !targetChannel
                    ) continue;

                    const translatedText =
                        await translateText(
                            newMessage.content,
                            CHANNELS[
                                targetChannelId
                            ]
                        );

                    const targetMessage =
                        await targetChannel.messages.fetch(
                            translatedMessageId
                        );

                    if (
                        !targetMessage
                    ) continue;

                    await targetMessage.edit({

                        content:
                            translatedText || ' '
                    });

                    await wait(500);

                } catch (err) {

                    console.log(
                        '[UPDATE FAIL]'
                    );

                    console.log(err);
                }
            }

        } catch (err) {

            console.log(
                '[UPDATE ERROR]'
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
                messageDB[
                    message.id
                ];

            if (
                !translations
            ) return;

            for (
                const [
                    targetChannelId,
                    translatedMessageId
                ]
                of Object.entries(
                    translations
                )
            ) {

                try {

                    const targetChannel =
                        await client.channels.fetch(
                            targetChannelId
                        );

                    if (
                        !targetChannel
                    ) continue;

                    const targetMessage =
                        await targetChannel.messages.fetch(
                            translatedMessageId
                        );

                    if (
                        targetMessage
                    ) {

                        await targetMessage.delete();
                    }

                } catch (err) {

                    console.log(
                        '[DELETE FAIL]'
                    );

                    console.log(err);
                }
            }

            delete messageDB[
                message.id
            ];

            saveDB();

        } catch (err) {

            console.log(
                '[DELETE ERROR]'
            );

            console.log(err);
        }
    }
);

/* =======================================================
   LOGIN
======================================================= */

client.login(
    process.env.DISCORD_TOKEN
);
