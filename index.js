
const asciiArt = `
\x1b[32m
██╗  ██╗███████╗ █████╗ ██╗   ██╗███████╗███╗   ██╗
██║  ██║██╔════╝██╔══██╗██║   ██║██╔════╝████╗  ██║
███████║█████╗  ███████║██║   ██║█████╗  ██╔██╗ ██║
██╔══██║██╔══╝  ██╔══██║╚██╗ ██╔╝██╔══╝  ██║╚██╗██║
██║  ██║███████╗██║  ██║ ╚████╔╝ ███████╗██║ ╚████║
╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝
\x1b[0m
`;

console.log(asciiArt);

const axios = require('axios');
const fs = require('fs');
const WebSocket = require('ws');
const config = require('./config.json');

const filepath = './tokens.txt';
const defaultVC = config.VC_CHANNEL;

function sort(filepath) {
    const fileContent = fs.readFileSync(filepath, 'utf-8');
    return fileContent.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .sort();
}

async function checkTokens(tokens) {
    const validTokens = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        console.log(`Checking token ${i + 1}: ${token}`);
        try {
            await axios.get('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `${token}` }
            });
            console.log(`Token ${i + 1} is valid: ${token}`);
            validTokens.push(token);
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.error(`Token ${i + 1} is invalid: ${token}`);
            } else {
                console.error(`Error checking token ${i + 1}:`, error.message);
            }
        }
    }
    return validTokens;
}

function setPresence(ws, statusText, status = 'idle') {
    ws.send(JSON.stringify({
        op: 3,
        d: {
            since: null,    
            activities: [
                { name: statusText, type: 0 }
            ],
            status: status,
            afk: false
        }
    }));
}

function ws_joiner(token, guildId, vcId, muted, deafen, video, stream, statusText) {
    const ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');
    let heartbeatInterval;

    const auth = {
        op: 2,
        d: {
            token: token,
            intents: 513,
            properties: { $os: 'Linux', $browser: 'Firefox', $device: 'desktop' }
        }
    };

    const vc = {
        op: 4,
        d: {
            guild_id: guildId,
            channel_id: vcId,
            self_mute: muted,
            self_deaf: deafen,
            self_video: video
        }
    };

    const streamData = {
        op: 18,
        d: {
            type: "guild",
            guild_id: guildId,
            channel_id: vcId,
            preferred_region: "singapore"
        }
    };

    ws.on('open', () => {
        console.info(`\x1b[34m[WS] Connection opened for token: ${token}\x1b[0m`);
    });

    ws.on('message', (data) => {
        const payload = JSON.parse(data);
        const { op, d, t } = payload;

        switch (op) {
            case 10:
                heartbeatInterval = setInterval(() => {
                    ws.send(JSON.stringify({ op: 1, d: null }));
                }, d.heartbeat_interval);
                ws.send(JSON.stringify(auth));
                break;

            case 0:
                if (t === 'READY') {
                    setPresence(ws, statusText, 'idle');
                    ws.send(JSON.stringify(vc));
                    console.info(`\x1b[32mToken ${token} sese katıldı.\x1b[0m`);

                    if (stream) {
                        setTimeout(() => {
                            ws.send(JSON.stringify(streamData));
                            console.log(`📺 yayın başladı ${token}`);
                        }, 1000);
                    }
                }
                break;

            case 9:
                console.warn(`\x1b[33mInvalid Token: ${token}, yeniden bağlanıyor...\x1b[0m`);
                ws.close();
                break;
        }
    });

    ws.on('close', (code, reason) => {
        clearInterval(heartbeatInterval);
        console.warn(`\x1b[33mToken ${token} kapandı (code: ${code}, reason: ${reason}). 5saniyede yeniden başlatılacak..\x1b[0m`);
        setTimeout(() => ws_joiner(token, guildId, vcId, muted, deafen, video, stream, statusText), 5000);
    });

    ws.on('error', (error) => {
        clearInterval(heartbeatInterval);
        console.error(`Web Soket Hatası : token ${token}:`, error);
    });
}

(async () => {
    try {
        const tokenSettings = config.TOKEN || {};
        const fileTokens = sort(filepath).filter(t => !(t in tokenSettings));

        const allTokens = [...Object.keys(tokenSettings), ...fileTokens];
        const validTokens = await checkTokens(allTokens);

        if (!validTokens.length) {
            console.error("🚫 Geçerli token bulunamadı.");
            return;
        }

        validTokens.forEach(token => {
            let settings;
            let statusText;

            if (token in tokenSettings) {
                settings = tokenSettings[token];
                statusText = settings.STATUS_TEXT || "/tekdar";
            } else {
                settings = {
                    GUILD_ID: config.GUILD_ID,
                    VC_CHANNEL: defaultVC,
                    MUTED: false,
                    DEAFEN: false,
                    VIDEO: true,
                    STREAM: true
                };
                statusText = "Watching Heaven !";
            }

            ws_joiner(
                token,
                settings.GUILD_ID || config.GUILD_ID,
                settings.VC_CHANNEL || defaultVC,
                settings.MUTED,
                settings.DEAFEN,
                settings.VIDEO,
                settings.STREAM,
                statusText
            );
        });
    } catch (err) {
        console.error('Error:', err);
    }
})();
