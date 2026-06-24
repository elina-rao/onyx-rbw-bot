"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const logger_1 = __importDefault(require("./logger"));
const app_1 = __importDefault(require("./app"));
const logger = new logger_1.default("Main");
const discord_js_1 = require("discord.js");
const https_1 = __importDefault(require("https"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const bot_1 = __importStar(require("./managers/bot"));
const hypixel_1 = require("./managers/hypixel");
const constants_1 = require("./constants");
const utils_1 = require("./utils");
const games_1 = require("./typings/games");
const socket_1 = require("./managers/socket");
const dayjs_1 = __importDefault(require("dayjs"));
const relativeTime_1 = __importDefault(require("dayjs/plugin/relativeTime"));
const database_1 = require("./managers/database");
dayjs_1.default.extend(relativeTime_1.default);
let help_cmd_cache = [];
const voiceQueueMap = new discord_js_1.Collection();
function createEmbed(description, color = "#d4a017", footerSuffix = `Watching players!`) {
    const embed = new discord_js_1.MessageEmbed()
        .setColor(color)
        .setFooter(`© Onyx RBW | ${footerSuffix}`, constants_1.Constants.BRANDING_URL);
    if (description)
        embed.setDescription(description);
    return embed;
}
function getRole(p) {
    let index = Math.floor(Math.abs(p) / 300);
    index = Math.min(index, constants_1.Constants.ELO_ROLES.length - 1);
    return constants_1.Constants.ELO_ROLES[index] ? { id: constants_1.Constants.ELO_ROLES[index] } : null;
}
(async () => {
    const [client, guild] = await Promise.all([bot_1.default, bot_1.defaultGuild]).catch(err => {
        logger.error(`Startup failed:\n${err.stack}`);
        return process.exit(1);
    });
    client.on("raw", async (payload) => {
        if (payload.t !== "INTERACTION_CREATE")
            return;
        const logger = new logger_1.default("Command Handler");
        const { token, data, id, member, channel_id } = payload.d;
        const { user } = member;
        const { name: cmd } = data;
        const req = https_1.default.request(`${constants_1.Constants.DISCORD_API_BASE_URL}/interactions/${id}/${token}/callback`, {
            method: "POST",
            headers: { authorization: `Bot ${process.env.TOKEN}`, "Content-Type": "application/json" }
        });
        function respond(message) {
            return new Promise(res => {
                req.write(JSON.stringify({
                    type: 4,
                    data: typeof message === "string" ? { content: message } : { content: "", embeds: [message.toJSON()] }
                }));
                req.end();
                req.on("error", () => null);
                req.on("finish", res);
            });
        }
        switch (cmd) {
            case "register": {
                if (constants_1.Constants.REGISTER_CHANNEL !== channel_id) {
                    respond(createEmbed(`<@${user.id}> you cannot register in this channel. Please do /register [IGN] in ${guild.channels.cache.get(constants_1.Constants.REGISTER_CHANNEL)}`, "RED"));
                    break;
                }
                const player = payload.d.data.options[0].value;
                try {
                    const mojang = await (await (0, node_fetch_1.default)(`https://api.mojang.com/users/profiles/minecraft/${player}`)).text();
                    if (!mojang) {
                        respond(createEmbed("Minecraft account not found.", "RED"));
                        break;
                    }
                    const d = JSON.parse(mojang);
                    if (!d.id) {
                        respond(createEmbed("Minecraft account not found.", "RED"));
                        break;
                    }
                    const hypixelData = await (0, hypixel_1.getHypixelPlayer)(d.id);
                    const discord = hypixelData?.player?.socialMedia?.links?.DISCORD;
                    if (!discord) {
                        respond(createEmbed(`**${d.name}** does not have a Discord account linked. For more information, read ${guild.channels.cache.get('800070737091624970')}`, "RED"));
                        break;
                    }
                    if (discord !== `${user.username}#${user.discriminator}`) {
                        respond(createEmbed(`**${d.name}** has another Discord account or server linked. If this is you, change your linked Discord to **${user.username}#${user.discriminator}**.\n\n**Changed your Discord username?** You'll need to change your linked account in game.`, "RED"));
                        break;
                    }
                    const existing = await utils_1.Players.getByDiscord(user.id);
                    if (existing) {
                        await (0, database_1.query)('UPDATE players SET minecraft_uuid = ?, minecraft_name = ?, registered_at = ? WHERE discord_id = ?', [d.id, d.name, Date.now(), user.id]);
                        const member = guild.members.cache.get(user.id);
                        if (member) {
                            if (!member.roles.cache.has(constants_1.Constants.SUPPORT_ROLE_ID))
                                await member.setNickname(`[${existing.elo}] ${d.name}`).catch(e => logger.error(`Failed to update nickname:\n${e.stack}`));
                            member.roles.cache.forEach(async (role) => {
                                if (constants_1.Constants.ELO_ROLES.includes(role.id))
                                    await member.roles.remove(role).catch(() => null);
                            });
                            if (!member.roles.cache.has(constants_1.Constants.RANKBANNED)) {
                                const roleId = getRole(existing.elo ?? 400);
                                if (roleId)
                                    await member.roles.add(roleId.id).catch(() => null);
                            }
                            await member.roles.remove(constants_1.Constants.REGISTERED_ROLE).catch(() => null);
                            await member.roles.add(constants_1.Constants.REGISTERED_ROLE).catch(() => null);
                        }
                        respond(createEmbed(`You have successfully changed your linked Minecraft account to **${(0, utils_1.toEscapedFormat)(d.name)}**.`, "#d4a017"));
                    }
                    else {
                        await (0, database_1.query)('INSERT INTO players (discord_id, minecraft_uuid, minecraft_name, registered_at, elo) VALUES (?, ?, ?, ?, 400) ON DUPLICATE KEY UPDATE minecraft_uuid = VALUES(minecraft_uuid), minecraft_name = VALUES(minecraft_name), registered_at = VALUES(registered_at)', [user.id, d.id, d.name, Date.now()]);
                        const mem = guild.members.cache.get(user.id);
                        if (mem && !mem.roles.cache.has(constants_1.Constants.SUPPORT_ROLE_ID))
                            await mem.setNickname(`[400] ${d.name}`).catch(e => logger.error(`Failed to update a new member's nickname:\n${e.stack}`));
                        respond(createEmbed(`You have successfully registered with the username **${(0, utils_1.toEscapedFormat)(d.name)}**. Welcome to Onyx RBW!`, "#d4a017"));
                        const member = guild.members.cache.get(user.id);
                        if (member) {
                            member.roles.cache.forEach(async (role) => {
                                if (constants_1.Constants.ELO_ROLES.includes(role.id))
                                    await member.roles.remove(role).catch(() => null);
                            });
                            const roleId = getRole(400);
                            if (roleId)
                                await member.roles.add(roleId.id).catch(() => null);
                            await member.roles.add(constants_1.Constants.REGISTERED_ROLE).catch(() => null);
                        }
                    }
                }
                catch (e) {
                    logger.error(`An error occurred while using the /register command:\nDeclared username: ${player}\n${e.stack}`);
                    respond(createEmbed('Something went wrong while registering your account. Please try again later. If the issue persists, please contact a staff member.', "RED"));
                }
                break;
            }
            case "info": {
                const lookup = payload.d.data.options[0].value;
                try {
                    const player = await utils_1.Players.getByDiscord(lookup);
                    if (!player) {
                        respond(createEmbed(`<@${lookup}> is not a registered Onyx RBW player.`, "RED"));
                        break;
                    }
                    const card = await (0, app_1.default)(player.minecraft.uuid, player.minecraft.name, 'discord.gg/onyxrbw', '#363942', player);
                    respond(new discord_js_1.MessageEmbed().attachFiles([{ attachment: card, name: 'profile.png' }]));
                }
                catch (e) {
                    logger.error(`An error occurred while using the /info command:\nUser: ${lookup}\n${e.stack}`);
                    respond(createEmbed("Something went wrong while requesting a player's stats. Please try again later. If the issue persists, please contact a staff member.", "RED"));
                }
                break;
            }
            case "leaderboard": {
                if (constants_1.Constants.CHAT === channel_id) {
                    respond(createEmbed(`<@${user.id}> commands are disabled in this channel.`, "RED"));
                    break;
                }
                try {
                    let { name, options } = payload.d.data.options[0];
                    if (name === "bedsbroken")
                        name = "bedsBroken";
                    let page = options ? options[0].value : 1;
                    const nPerPage = 10;
                    const validStats = ['kills', 'wins', 'losses', 'bedsBroken', 'bedsLost', 'games', 'winstreak', 'losestreak', 'elo', 'deaths'];
                    const useAgg = ['wl', 'kd', 'bblr'];
                    let orderCol = name;
                    if (useAgg.includes(name))
                        orderCol = name === 'wl' ? 'wins' : name === 'kd' ? 'kills' : 'beds_broken';
                    const totalRows = await (0, database_1.query)('SELECT COUNT(*) as cnt FROM players');
                    const total = totalRows[0].cnt;
                    if (total < 1) {
                        respond(createEmbed("There's no players on this leaderboard yet. Play now, and claim a top spot!", "RED"));
                        break;
                    }
                    let prettyName = name;
                    const names = {
                        kills: "Top Kills", elo: "Top ELO", wins: "Top Wins", losses: "Top Losses",
                        bedsBroken: "Most Beds Broken", games: "Most Games Played", wl: "Highest W/L",
                        kd: "Highest K/D", bblr: "Highest BBLR", losestreak: "Highest Losestreak",
                        deaths: "Most Deaths", bedsLost: "Most Beds Lost"
                    };
                    prettyName = names[name] || name;
                    const pages = Math.ceil(total / nPerPage);
                    if (page > pages)
                        page = pages;
                    const offset = (page - 1) * nPerPage;
                    let rows;
                    if (useAgg.includes(name)) {
                        rows = await (0, database_1.query)(`SELECT *, (${name === 'wl' ? 'wins' : name === 'kd' ? 'kills' : 'beds_broken'} / NULLIF(${name === 'wl' ? 'losses' : name === 'kd' ? 'deaths' : 'losses'}, 0)) as computed FROM players ORDER BY computed DESC LIMIT ? OFFSET ?`, [nPerPage, offset]);
                    }
                    else {
                        const dbCol = name.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
                        rows = await (0, database_1.query)(`SELECT * FROM players ORDER BY ${dbCol} DESC LIMIT ? OFFSET ?`, [nPerPage, offset]);
                    }
                    respond(createEmbed(rows.map((row, i) => {
                        const roleId = getRole(row.elo ?? 400);
                        const roleIndex = roleId ? constants_1.Constants.ELO_ROLES.indexOf(roleId.id) : 0;
                        return `\n\`#${i + 1 + offset}\` ${constants_1.Constants.ELO_EMOJIS[roleIndex] || ''} **${(0, utils_1.toEscapedFormat)(row.minecraft_name)}** : ${useAgg.includes(name) ? (row.computed?.toFixed?.(1) ?? 0) : (row[name === 'bedsBroken' ? 'beds_broken' : name === 'bedsLost' ? 'beds_lost' : name] ?? 0)}`;
                    }).join(""), "#d4a017").setTitle(`${prettyName} | Page ${page}/${pages}`));
                }
                catch (e) {
                    logger.error(`An error occurred while using the /leaderboard command:\n${e.stack}`);
                    respond(createEmbed("Something went wrong while requesting the leaderboard. Please try again later. If the issue persists, please contact a staff member.", "RED"));
                }
            }
        }
    });
    client.on('ready', async () => { });
    client.on("voiceStateUpdate", async (oldState, newState) => {
        if (oldState.channelID === newState.channelID)
            return;
        if (oldState.channelID && (oldState.channel?.members?.size ?? 0) - 1 < (oldState.channel?.userLimit ?? 0) && constants_1.Constants.QUEUES_ARRAY.flat().includes(oldState.channelID ?? '')) {
            return await strikeEmbed(newState.id, oldState.channelID);
        }
        if (!newState.channelID || !newState.channel || !constants_1.Constants.QUEUES_ARRAY.flat().includes(newState.channelID ?? '')
            || newState.channel.members.size !== newState.channel.userLimit)
            return;
        const gameMembers = [...newState.channel.members.array()];
        const ids = gameMembers.map(mem => mem.id);
        try {
            const queueChannel = newState.channel;
            const { game } = await (0, utils_1.createNewGame)();
            const { textChannel } = await game.createChannels(gameMembers, queueChannel);
            const strike = {
                members: ids,
                timeOfLastPick: Date.now(),
                textChannelID: textChannel.id,
                voiceChannelID: newState.channelID,
                pickingOver: false,
            };
            voiceQueueMap.set(newState.channelID, strike);
            const { gameNumber, logger: gameLogger, id: insertedId } = game;
            const index = constants_1.Constants.QUEUES_ARRAY.findIndex(q => q.includes(queueChannel.id));
            const textCategory = await (0, utils_1.findOpenCategory)(constants_1.Constants.CATEGORY_ARRAY[index].map(cat => guild.channels.cache.get(cat)));
            const teamCallCategory = await (0, utils_1.findOpenCategory)(constants_1.Constants.TEAM_CALLS.map(cat => guild.channels.cache.get(cat)));
            if (!(textCategory && teamCallCategory)) {
                return gameLogger.warn('No category assigned.');
            }
            await Promise.all([
                textChannel.overwritePermissions(gameMembers.map(member => ({
                    id: member.id,
                    allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"],
                })).concat({
                    id: guild.id,
                    deny: ["VIEW_CHANNEL"]
                })),
            ]).catch(() => null);
            const [message, players] = await Promise.all([
                textChannel.send(gameMembers.join("")),
                utils_1.Players.getManyByDiscord(gameMembers.map(({ id }) => id)),
                (0, database_1.query)('UPDATE games SET voice_channel_id = ?, text_channel_id = ? WHERE id = ?', [queueChannel.id, textChannel.id, insertedId]),
            ]);
            const unregistered = gameMembers.filter(mem => !players.map(p => p.discord).includes(mem.id));
            let unreg = unregistered.length > 0 ? unregistered.join(' ') : '';
            if (8 !== players.size) {
                voiceQueueMap.delete(newState.channelID);
                let msg = `${unreg} **unregistered player(s)** are in your queue. Please make sure to register in ${guild.channels.cache.get(constants_1.Constants.REGISTER_CHANNEL)} before queuing.\n\n**NOTE:** Please ensure that no unregistered/ingame player exists in the queue and that queues are currently open.`;
                if (gameMembers.length < 8)
                    msg = `The **queues are not open** right now. Please be patient. Thank you! `;
                message.channel.send(msg);
                return setTimeout(() => game.cancel(true), 10000);
            }
            const asArray = [...players.values()];
            const [cap1] = asArray.splice(Math.floor(Math.random() * asArray.length), 1);
            const [cap2] = asArray.splice(Math.floor(Math.random() * asArray.length), 1);
            const team1 = [cap1];
            const team2 = [cap2];
            let firstPick = true;
            while (asArray.length !== 0) {
                if (game.state === games_1.GameState.VOID)
                    break;
                if (asArray.length === 1) {
                    team2.push(asArray.shift());
                    textChannel.send(createEmbed(undefined, "#00FFFF", `Team Picking for Game #${gameNumber}`)
                        .addFields({ name: 'Team 1', value: `\`•\`Captain: <@${cap1.discord}>\n${team1.slice(1).map(({ discord }) => `\`•\` <@${discord}>`).join("\n")}` }, { name: 'Team 2', value: `\`•\`Captain: <@${cap2.discord}>\n${team2.slice(1).map(({ discord }) => `\`•\` <@${discord}>`).join("\n")}` }));
                    continue;
                }
                textChannel.send(createEmbed(undefined, "#00FFFF", `Team Picking for Game #${gameNumber}`)
                    .addFields({ name: 'Team 1', value: `\`•\`Captain: <@${cap1.discord}>\n${team1.slice(1).map(({ discord }) => `\`•\` <@${discord}>`).join("\n")}` }, { name: 'Team 2', value: `\`•\`Captain: <@${cap2.discord}>\n${team2.slice(1).map(({ discord }) => `\`•\` <@${discord}>`).join("\n")}` }, { name: 'Remaining Players', value: asArray.map(({ discord }) => `\`•\` <@${discord}>`).join("\n") }));
                textChannel.send(`<@${firstPick ? cap1.discord : cap2.discord}>`).then(secondPing => secondPing.delete({ timeout: 50 }).catch(() => logger.info("Failed to ping second captain."))).catch(e => logger.error(`Failed to ping captain:\n${e}`));
                textChannel.send(createEmbed(`<@${firstPick ? cap1.discord : cap2.discord}> it is your turn to pick. Use \`=p @user\` to pick one of the remaining players!`, "AQUA", `Team Picking for Game #${gameNumber}`));
                const msg = (await textChannel.awaitMessages((message) => {
                    const { author, content } = message;
                    if (game.state === games_1.GameState.VOID) {
                        asArray.splice(0, asArray.length);
                        return false;
                    }
                    if (!(content.toLowerCase().startsWith('=pick ') || content.toLowerCase().startsWith('=p ') || content.toLowerCase().startsWith('=P ')))
                        return false;
                    if (![cap1.discord, cap2.discord].includes(author.id)) {
                        textChannel.send(createEmbed(`${author} you are not a team captain.`, "RED", `Team Picking for Game #${gameNumber}`));
                        return false;
                    }
                    if ((firstPick ? cap2 : cap1).discord === author.id) {
                        textChannel.send(createEmbed(`${author}, it's the other captain's turn to pick right now.`, "RED", `Team Picking for Game #${gameNumber}`));
                        return false;
                    }
                    if (!message.mentions.users.first()) {
                        message.channel.send(createEmbed(`${author}, you have to mention someone to pick them.`, "RED", `Team Picking for Game #${gameNumber}`));
                        return false;
                    }
                    if (!asArray.map(({ discord }) => discord).includes(message.mentions.users.first().id)) {
                        message.channel.send(createEmbed(`${author}, you cannot pick a user who is already on a team or isn't in the game.`, "RED", `Team Picking for Game #${gameNumber}`));
                        return false;
                    }
                    return true;
                }, { max: 1 })).first();
                if (!msg)
                    continue;
                const g = voiceQueueMap.find((g) => g.textChannelID === textChannel.id);
                if (g)
                    g.timeOfLastPick = Date.now();
                const user = msg.mentions.users.first();
                const chosen = players.get(user.id);
                asArray.splice(asArray.indexOf(chosen), 1);
                (firstPick ? team1 : team2).push(chosen);
                firstPick = !firstPick;
            }
            if (team1.length !== 4 || team2.length !== 4) {
                voiceQueueMap.delete(newState.channelID);
                return;
            }
            const g = voiceQueueMap.find((g) => g.textChannelID === textChannel.id);
            if (g)
                g.pickingOver = true;
            const [tc1, tc2] = await Promise.all([
                guild.channels.create(`Team #1 - Game #${gameNumber}`, {
                    type: "voice",
                    permissionOverwrites: team1.map(player => ({ id: player.discord, allow: ["CONNECT", "SPEAK"] })),
                    userLimit: team1.length,
                }),
                guild.channels.create(`Team #2 - Game #${gameNumber}`, {
                    type: "voice",
                    permissionOverwrites: team2.map(player => ({ id: player.discord, allow: ["CONNECT", "SPEAK"] })),
                    userLimit: team2.length,
                })
            ]);
            game.setTeamChannels(tc1, tc2);
            await (0, database_1.query)('UPDATE games SET team1_channel_id = ?, team2_channel_id = ? WHERE id = ?', [tc1.id, tc2.id, insertedId]);
            await game.enterStartingState();
            await Promise.all([tc1.setParent(teamCallCategory), tc2.setParent(teamCallCategory)]);
            for await (const member of team1.map(p1 => guild.members.cache.get(p1.discord))) {
                await member?.voice.setChannel(tc1.id).catch(() => logger.info('failed to send players to teams'));
                await (0, utils_1.delay)(200);
            }
            for await (const member of team2.map(p2 => guild.members.cache.get(p2.discord))) {
                await member?.voice.setChannel(tc2.id).catch(() => logger.info('failed to send players to teams'));
                await (0, utils_1.delay)(200);
            }
            voiceQueueMap.delete(newState.channelID);
            const map = await game.pickMap();
            if (!map)
                throw new Error("pickMap returned nothing");
            if (game.state === games_1.GameState.VOID) {
                tc1.delete().catch(() => null);
                return tc2.delete().catch(() => null);
            }
            const start = Date.now();
            const loading = await textChannel.send(createEmbed('Looking for an available bot...'));
            const { reason, username: bot } = await game.getAssignedBot();
            if (reason === 'GAME_VOID') {
                await loading.edit(createEmbed('This game is not active. Please re-queue to start a new game.', "RED"));
                tc1.delete().catch(() => null);
                tc2.delete().catch(() => null);
                await (0, utils_1.delay)(5000);
                return game.cancel(true);
            }
            if (reason === 'NONE_AVAILABLE' || !bot) {
                await loading.edit(createEmbed('The maximum waiting time has been exceeded. No bots are available right now. Please try again later.', "RED"));
                await (0, utils_1.delay)(5000);
                return game.cancel(true);
            }
            const _bot = socket_1.bots.get(bot);
            if (!_bot) {
                await loading.edit(createEmbed(`Failed to bind to **${bot}** after **${(0, dayjs_1.default)(start).from((0, dayjs_1.default)(), true)}**.`, 'RED'));
                await (0, utils_1.delay)(5000);
                return game.cancel(true);
            }
            const query_socket = (bot ? socket_1.bots.get(bot) : {})?.handshake?.query;
            if (bot !== query_socket.bot) {
                await loading.edit(createEmbed(`The socket for this bot (**${bot}**) is actually pointing to **${query_socket.bot}**.`, 'RED'));
                await (0, utils_1.delay)(5000);
                return game.cancel(true);
            }
            await loading.edit(createEmbed(`The bot **${bot}** has been assigned to your game after **${(0, dayjs_1.default)(start).from((0, dayjs_1.default)(), true)}**.`));
            _bot.once('gameCancel', () => {
                try {
                    setTimeout(() => game.cancel(true), 10000);
                }
                catch (e) {
                    logger.error(`Bot failed to cancel game:\n${e}`);
                }
            });
            _bot.emit('gameStart', {
                players: [...team1.map(player => player.toJSON()), ...team2.map(player => player.toJSON())],
                map, number: gameNumber
            });
            game.start(team1, team2);
        }
        catch (e) {
            logger.error(`Failed to start a new game:\n${e.stack}`);
        }
    });
    client.on("message", async function (message) {
        if (!message.guild)
            return;
        if (message.content === '=help') {
            if (constants_1.Constants.CHAT === message.channel.id)
                return message.reply(createEmbed(`${message.author} commands are disabled in this channel.`, "RED"));
            const reactions = ['🛠️', '⚔️', '📋', '⚙️', '🪧', '❌'];
            const embed = new discord_js_1.MessageEmbed().setTitle('Onyx RBW Bot Commands').setDescription(`\n**Main Menu:**\n\n${reactions[0]} \`Management\`\n\n${reactions[1]} \`Gameplay\`\n\n${reactions[2]} \`Scoring\`\n\n${reactions[3]} \`Moderation\`\n\n${reactions[4]} \`Leaderboards\``).setFooter('© Onyx RBW | Main Menu', constants_1.Constants.BRANDING_URL);
            const replied_embed = await message.channel.send(embed);
            for (let i = 0; i < reactions.length; i++) {
                await replied_embed.react(reactions[i]);
            }
            const helpCommandObj = { message: replied_embed, user: message.author, timeOfCreation: Date.now() };
            help_cmd_cache.push(helpCommandObj);
            const filtered = [...reactions, '◀️', '▶️'];
            const collector = replied_embed.createReactionCollector((r, u) => u.id === message.author.id && filtered.includes(r.emoji.name), { idle: 60000 });
            let page = 0, paged = false;
            const embeds = [
                new discord_js_1.MessageEmbed().setTitle('Management').setDescription(`\n- \`Bot Restart\`\n\`•\` **Usage**: =restart \`@IGN\`\n\`•\` **Description**: *Gets a bot back online.*\n- \`Force Close\`\n\`•\` **Usage**: =forceclose\n\`•\` **Aliases**: =fclose\n\`•\` **Description**: *Force closes a queue.*\n- \`Info Card Background Modifier\`\n\`•\` **Usage**: =setbackground \`@User/User_ID <PNG>\`\n\`•\` **Description**: *Modifies a user's info card background.*\n- \`Info Card Text Modifier\`\n\`•\` **Usage**: =settext \`@User/User_ID <text>\`\n\`•\` **Description**: *Modifies a user's info card text.*`).setFooter('© Onyx RBW | Management Commands | Page 1', constants_1.Constants.BRANDING_URL),
                new discord_js_1.MessageEmbed().setTitle('Gameplay').setDescription(`\n- \`Stats\`\n\`•\` **Usage**: /info \`@User\`\n\`•\` **Aliases**: =info, =i\n\`•\` **Description**: *Shows a user stats.*\n- \`Pick\`\n\`•\` **Usage**: =pick \`@User\`\n\`•\` **Aliases**: =p\n\`•\` **Description**: *Allows captains to pick a remaining player in the queue.*\n- \`Strikes\`\n\`•\` **Usage**: =strikes \`@User/User_ID\`\n\`•\` **Aliases**: =getuser\n\`•\` **Description**: *Displays total strikes and ban duration.*\n- \`Queue Stats\`\n\`•\` **Usage**: =qs\n\`•\` **Aliases**: =queuestats\n\`•\` **Description**: *Displays stats of everyone in the current queue.*`).setFooter('© Onyx RBW | Gameplay Commands | Page 1', constants_1.Constants.BRANDING_URL),
                new discord_js_1.MessageEmbed().setTitle('Scoring').setDescription(`\n- \`Win\`\n\`•\` **Usage**: =win \`@User/User_ID\`\n\`•\` **Aliases**: =w\n\`•\` **Description**: *Manually scores a single win, modifies elo by division-based gain.*\n- \`Loss\`\n\`•\` **Usage**: =loss \`@User/User_ID\`\n\`•\` **Aliases**: =l\n\`•\` **Description**: *Manually scores a single loss, modifies elo by division-based loss.*\n- \`Strike\`\n\`•\` **Usage**: =strike \`@User/User_ID ±[number]\`\n\`•\` **Description**: *Modifies a user's strikes, with division-based elo penalty.*\n- \`Void\`\n\`•\` **Usage**: =void \`GameNumber\`\n\`•\` **Description**: *Voids a game and reverses all stat changes.*\n- \`Modify\`\n\`•\` **Usage**: =modify \`wins|losses|kills|deaths|bedsbroken|bedslost|\n|winstreak|bedstreak @User/User_ID ±[number]\`\n\`•\` **Description**: *Modifies a user's stats.*`).setFooter('© Onyx RBW | Scoring Commands | Page 1', constants_1.Constants.BRANDING_URL),
                new discord_js_1.MessageEmbed().setTitle('Moderation').setDescription(`\n- \`Freeze\`\n\`•\` **Usage**: .ss \`@User/User_ID [Reason]\`\n\`•\` **Description**: *Sends a screenshare request to our team.*\n- \`Ban\`\n\`•\` **Usage**: =ban \`@User/User_ID x(h)/(d) [Reason]\`\n\`•\` **Description**: *Temporarily bans a user.*\n- \`Unban\`\n\`•\` **Usage**: =unban \`@User/User_ID\`\n\`•\` **Description**: *Unbans a user.*`).setFooter('© Onyx RBW | Moderation Commands | Page 1', constants_1.Constants.BRANDING_URL),
                [new discord_js_1.MessageEmbed().setTitle('Leaderboards').setDescription(`- \`Leaderboard Elo\`\n\`•\` **Usage**: /leaderboard elo <page>\n\`•\` **Aliases**: =leaderboard elo, =lb elo \n\`•\` **Description**: *View the players with the current highest ELO.*\n- \`Leaderboard Games\`\n\`•\` **Usage**: /leaderboard games <page>\n\`•\` **Aliases**: =leaderboard games, =lb games\n\`•\` **Description**: *View the players with the most games.*\n- \`Leaderboard Wins\`\n\`•\` **Usage**: /leaderboard wins <page>\n\`•\` **Aliases**: =leaderboard wins, =lb wins\n\`•\` **Description**: *View the players with the most wins.*\n- \`Leaderboard Losses\`\n\`•\` **Usage**: /leaderboard losses <page>\n\`•\` **Aliases**: =leaderboard losses, =lb losses\n\`•\` **Description**: *View the players with the most losses.*\n- \`Leaderboard W/L\`\n\`•\` **Usage**: /leaderboard w/l <page>\n\`•\` **Aliases**: =leaderboard w/l, =lb w/l\n\`•\` **Description**: *View the players with the current highest W/L.*`).setFooter('© Onyx RBW | Leaderboard Commands | Page 1', constants_1.Constants.BRANDING_URL),
                    new discord_js_1.MessageEmbed().setTitle('Leaderboards').setDescription(`- \`Leaderboard Kills\`\n\`•\` **Usage**: /leaderboard kills <page>\n\`•\` **Aliases**: =leaderboard kills, =lb kills\n\`•\` **Description**: View the players with the most kills.\n- \`Leaderboard Deaths\`\n\`•\` **Usage**: /leaderboard deaths <page>\n\`•\` **Aliases**: =leaderboard deaths, =lb deaths\n\`•\` **Description**: View the players with the most deaths.\n- \`Leaderboard K/D\`\n\`•\` **Usage**: /leaderboard k/d <page>\n\`•\` **Aliases**: =leaderboard k/d, =lb k/d\n\`•\` **Description**: View the players with the current highest K/D.\n- \`Leaderboard Winstreak\`\n\`•\` **Usage**: /leaderboard winstreak <page>\n\`•\` **Aliases**: =leaderboard winstreak, =lb winstreak\n\`•\` **Description**: View the players with the current highest winstreak.\n- \`Leaderboard Losestreak\`\n\`•\` **Usage**: /leaderboard losestreak <page>\n\`•\` **Aliases**: =leaderboard losestreak, =lb losestreak\n\`•\` **Description**: View the players with the current highest losestreak.`).setFooter('© Onyx RBW | Leaderboard Commands | Page 2', constants_1.Constants.BRANDING_URL),
                    new discord_js_1.MessageEmbed().setTitle('Leaderboards').setDescription(`- \`Leaderboard BedsBroken\`\n\`•\` **Usage**: /leaderboard bedsbroken <page>\n\`•\` **Aliases**: =leaderboard bedsbroken, =lb bedbroken, =lb bb\n\`•\` **Description**: View the players with the most beds broken.\n- \`Leaderboard BedsLost\`\n\`•\` **Usage**: /leaderboard bedslost <page>\n\`•\` **Aliases**: =leaderboard bedslost, =lb bedslost, =lb bl\n\`•\` **Description**: View the players with the most beds lost.\n- \`Leaderboard BBLR\`\n\`•\` **Usage**: /leaderboard bblr <page>\n\`•\` **Aliases**: =leaderboard bblr, =lb bblr\n\`•\` **Description**: View the players with the current highest BBLR.`).setFooter('© Onyx RBW | Leaderboard Commands | Page 3', constants_1.Constants.BRANDING_URL)],
                new discord_js_1.MessageEmbed().setTitle('Onyx RBW Bot Commands').setDescription(`\n**Main Menu:**\n\n${reactions[0]} \`Management\`\n\n${reactions[1]} \`Gameplay\`\n\n${reactions[2]} \`Scoring\`\n\n${reactions[3]} \`Moderation\`\n\n${reactions[4]} \`Leaderboards\``).setFooter('© Onyx RBW | Main Menu', constants_1.Constants.BRANDING_URL)
            ];
            collector.on('collect', async (reaction, user) => {
                const embed = embeds[reactions.indexOf(reaction.emoji.name)];
                if (Array.isArray(embed)) {
                    paged = true;
                    await replied_embed.reactions.removeAll();
                    for (const emoji of ['▶️', '❌']) {
                        await replied_embed.react(emoji);
                    }
                }
                else if (embed) {
                    if (paged === true) {
                        paged = false;
                        page = 0;
                        await replied_embed.reactions.removeAll();
                        for (const emoji of reactions) {
                            await replied_embed.react(emoji);
                        }
                    }
                    else
                        reaction.users.remove(user);
                }
                const index = ['◀️', '▶️'].indexOf(reaction.emoji.name) * 2 - 1;
                if (index >= -1 && paged) {
                    const next = Math.min(Math.max(0, page + index), 2);
                    if (next === embeds[4].length - 1)
                        replied_embed.reactions.cache.get('▶️')?.remove();
                    else if (next === 0)
                        replied_embed.reactions.cache.get('◀️')?.remove();
                    else if (page === 0 || page === embeds[4].length - 1) {
                        await replied_embed.reactions.removeAll();
                        for (const emoji of ['◀️', '▶️', '❌']) {
                            await replied_embed.react(emoji);
                        }
                    }
                    else
                        reaction.users.remove(user);
                    page = next;
                    return replied_embed.edit(embeds[4][page]);
                }
                replied_embed.edit(Array.isArray(embed) ? embed[0] : embed);
            });
        }
        if (message.content.toLowerCase().startsWith('=lb') || message.content.toLowerCase().startsWith('=leaderboard')) {
            const formatName = {
                kills: 'Top Kills', elo: 'Top Elo', wins: 'Top Wins', losses: 'Top Losses',
                bedsBroken: 'Most Beds Broken', games: 'Most Games Played', wl: 'Highest W/L',
                kd: 'Highest K/D', bblr: 'Highest BBLR', losestreak: 'Highest Losestreak',
                deaths: 'Most Deaths', bedsLost: 'Most Beds Lost'
            };
            let [, name, page = 1] = message.content.split(' ');
            const prettyName = formatName[name];
            if (!name)
                return message.reply(createEmbed(`${message.author}, you did not provide a valid type:\n\n**TYPES**: ${Object.keys(formatName).join(', ')}`, "RED"));
            try {
                const nPerPage = 10;
                const useAgg = ['wl', 'kd', 'bblr'];
                const totalRows = await (0, database_1.query)('SELECT COUNT(*) as cnt FROM players');
                const total = totalRows[0].cnt;
                if (total < 1)
                    return message.channel.send(createEmbed("There's no players on this leaderboard yet. Play now, and claim a top spot!", "RED"));
                const pages = Math.ceil(total / nPerPage);
                if (page > pages)
                    page = pages;
                const offset = (page - 1) * nPerPage;
                let rows;
                if (useAgg.includes(name)) {
                    const col = name === 'wl' ? 'wins' : name === 'kd' ? 'kills' : 'beds_broken';
                    const div = name === 'wl' ? 'losses' : name === 'kd' ? 'deaths' : 'losses';
                    rows = await (0, database_1.query)(`SELECT *, (${col} / NULLIF(${div}, 0)) as computed FROM players ORDER BY computed DESC LIMIT ? OFFSET ?`, [nPerPage, offset]);
                }
                else {
                    const dbCol = name.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
                    rows = await (0, database_1.query)(`SELECT * FROM players ORDER BY ${dbCol} DESC LIMIT ? OFFSET ?`, [nPerPage, offset]);
                }
                message.channel.send(createEmbed(rows.map((row, i) => {
                    const roleId = getRole(row.elo ?? 400);
                    const roleIndex = roleId ? constants_1.Constants.ELO_ROLES.indexOf(roleId.id) : 0;
                    return `\n\`#${i + 1 + offset}\` ${constants_1.Constants.ELO_EMOJIS[roleIndex] || ''} **${(0, utils_1.toEscapedFormat)(row.minecraft_name)}** : ${useAgg.includes(name) ? (row.computed?.toFixed?.(1) ?? 0) : (row[name === 'bedsBroken' ? 'beds_broken' : name === 'bedsLost' ? 'beds_lost' : name === 'elos' ? 'elo' : name] ?? 0)}`;
                }).join(""), "#d4a017").setTitle(`${prettyName} | Page ${page}/${pages}`));
            }
            catch (e) {
                logger.error(`An error occurred while using the =leaderboard command:\n${e.stack}`);
                message.channel.send(createEmbed("Something went wrong while requesting the leaderboard. Please try again later. If the issue persists, please contact a staff member.", "RED"));
            }
        }
        if (message.content.toLowerCase().startsWith('=streakmessage')) {
            const hasPerms = constants_1.Constants.STRIKE_UNSTRIKE.ROLES.some(r => message.member?.roles.cache.has(r));
            if (!hasPerms)
                return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW Streak Messages!"));
            const user = message.mentions.users.first();
            if (!user)
                return message.reply(createEmbed("Invalid User mentioned. Use =streakmessage @User <streak> <message>", "RED"));
            let [streak, ...content] = message.content.split(' ').slice(2);
            streak *= 1;
            if (isNaN(streak) || content.length === 0)
                return message.reply(createEmbed(`Invalid usage. \`=streakmessage @user <streak> <message>\``, "RED"));
            if (streak !== 5 && streak !== 8 && streak !== 10)
                return message.reply(createEmbed(`Invalid usage. The streak must be either **5**, **8**, or **10**.`, "RED"));
            const player = await utils_1.Players.getByDiscord(user.id);
            if (!player)
                return message.reply(createEmbed(`<@${user}> is not a registered Onyx RBW player.`, "RED"));
            const msgs = player.messages;
            msgs[streak] = content.join(' ').slice(0, 250);
            await (0, database_1.query)('UPDATE players SET messages = ? WHERE id = ?', [JSON.stringify(msgs), player.id]);
            return message.reply(`${user.tag}'s streak message at ${streak} kills has been changed.`);
        }
        if (message.content.toLowerCase().startsWith('=winmessage')) {
            const hasPerms = constants_1.Constants.STRIKE_UNSTRIKE.ROLES.some(r => message.member?.roles.cache.has(r));
            if (!hasPerms)
                return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW Streak Messages!"));
            const user = message.mentions.users.first();
            if (!user)
                return message.reply(createEmbed("Invalid User mentioned. Use =winmessage @User <message>", "RED"));
            const content = message.content.split(' ').slice(2).join(' ');
            if (!content)
                return message.reply(createEmbed(`Invalid usage. \`=winmessage @user <message>\``, "RED"));
            const player = await utils_1.Players.getByDiscord(user.id);
            if (!player)
                return message.reply(createEmbed(`<@${user}> is not a registered Onyx RBW player.`, "RED"));
            await (0, database_1.query)('UPDATE players SET win_message = ? WHERE id = ?', [content.slice(0, 250), player.id]);
            return message.reply(`${user.tag}'s win message has been changed.`);
        }
        if (message.content.toLowerCase().startsWith('=losemessage')) {
            const hasPerms = constants_1.Constants.STRIKE_UNSTRIKE.ROLES.some(r => message.member?.roles.cache.has(r));
            if (!hasPerms)
                return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW Streak Messages!"));
            const user = message.mentions.users.first();
            if (!user)
                return message.reply(createEmbed("Invalid User mentioned. Use =losemessage @User <message>", "RED"));
            const content = message.content.split(' ').slice(2).join(' ');
            if (!content)
                return message.reply(createEmbed(`Invalid usage. \`=losemessage @user <message>\``, "RED"));
            const player = await utils_1.Players.getByDiscord(user.id);
            if (!player)
                return message.reply(createEmbed(`<@${user}> is not a registered Onyx RBW player.`, "RED"));
            await (0, database_1.query)('UPDATE players SET lose_message = ? WHERE id = ?', [content.slice(0, 250), player.id]);
            return message.reply(`${user.tag}'s lose message has been changed.`);
        }
        if (message.content.toLowerCase().startsWith('=i') || message.content.toLowerCase().startsWith('=info')) {
            if (constants_1.Constants.CHAT === message.channel.id)
                return message.reply(createEmbed(`<@${message.author.id}> commands are disabled in this channel.`, "RED"));
            const msg_arr = message.content.split(' ');
            let user = message.mentions.users.first() || message.author;
            if (!user) {
                user = client.users.cache.get(msg_arr[1]);
                if (!user)
                    return message.reply(createEmbed("Invalid User mentioned. Use =info @User/User_ID", "RED"));
            }
            const lookup = user.id;
            try {
                const player = await utils_1.Players.getByDiscord(lookup);
                if (!player)
                    return message.reply(createEmbed(`<@${lookup}> is not a registered Onyx RBW player.`, "RED"));
                const card = await (0, app_1.default)(player.minecraft.uuid, player.minecraft.name, player.info_card_text || 'discord.gg/onyxrbw', player.info_card_background || '#363942', player);
                message.channel.send({ files: [{ attachment: card, name: 'profile.png' }] });
            }
            catch (e) {
                logger.error(`An error occurred while using the =info command:\nUser: ${lookup}\n${e.stack}`);
                message.reply(createEmbed("Something went wrong while requesting a player's stats. Please try again later. If the issue persists, please contact a staff member.", "RED"));
            }
            return;
        }
        if (constants_1.Constants.PMODIFY_VOID.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=modify')) {
            if (!message.member)
                return;
            if (!(await (0, utils_1.hasPerms)(message.member, constants_1.Constants.PMODIFY_VOID.ROLES)))
                return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW!"));
            const users = message.content.split(' ').slice(2, -1).map((id) => client.users.cache.get(id)).filter((u) => u);
            users.push(...message.mentions.users.array());
            const msg_arr = message.content.split(' ');
            if (msg_arr.length < 4)
                return message.reply(createEmbed(`Invalid Usage. Please use format \`=modify wins|losses|kills|deaths|bedsbroken|bedslost|winstreak|bedstreak @User/User_ID ±[number]\``, "RED"));
            const option = msg_arr[1].toLowerCase();
            if (![`wins`, `losses`, `kills`, `deaths`, `bedsbroken`, `bedslost`, `winstreak`, `bedstreak`].includes(option))
                return message.reply(createEmbed(`Invalid Usage. Please use format \`=modify wins|losses|kills|deaths|bedsbroken|bedslost|winstreak|bedstreak @User/User_ID ±[number]\``, "RED"));
            const num = parseInt(msg_arr[3]);
            if (Number.isNaN(num))
                return message.reply(createEmbed(`Number of ${option} must be an Integer or Valid Number.`));
            if (users.length > 0) {
                let ids = users.map((user) => user.id);
                const players = (await utils_1.Players.getManyByDiscord(ids));
                ids = ids.filter((id) => players.has(id));
                if (ids.length === 0)
                    return message.reply(createEmbed("No registered players found.", "RED"));
                const placeholders = ids.map(() => '?').join(',');
                const colMap = {
                    wins: 'wins', losses: 'losses', kills: 'kills', deaths: 'deaths',
                    bedsbroken: 'beds_broken', bedslost: 'beds_lost', winstreak: 'winstreak', bedstreak: 'bedstreak'
                };
                const col = colMap[option];
                if (col) {
                    const sign = num >= 0 ? '+' : '';
                    await (0, database_1.query)(`UPDATE players SET ${col} = ${col} ${sign} ? WHERE discord_id IN (${placeholders})`, [num, ...ids]);
                    if (option === 'bedsbroken')
                        await (0, database_1.query)(`UPDATE players SET elo = elo + ? WHERE discord_id IN (${placeholders})`, [10 * num, ...ids]);
                    message.reply(createEmbed(`Successfully modified ${option} by ${num} for ${ids.length} player(s).`));
                }
            }
        }
        if (constants_1.Constants.BAN_UNBAN.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=ban')) {
            if (!message.member)
                return;
            if (!(await (0, utils_1.hasPerms)(message.member, constants_1.Constants.BAN_UNBAN.ROLES)))
                return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW Ban Hammer!"));
            const msg_arr = message.content.split(' ');
            if (msg_arr.length < 3)
                return message.reply(createEmbed(`Invalid Usage. Please use format \`=ban @User/User_ID x(h)/(d) [Reason]\``, "RED"));
            const target = message.mentions.users.first() || client.users.cache.get(msg_arr[1]);
            if (!target)
                return message.reply(createEmbed("Invalid User mentioned. Use =ban @User/User_ID x(h)/(d) [Reason]", "RED"));
            const duration_str = msg_arr[2];
            const match = duration_str.match(/(\d+)(h|d)/);
            if (!match)
                return message.reply(createEmbed("Invalid duration format. Use x(h) or x(d). Example: =ban @user 3h", "RED"));
            const duration_num = parseInt(match[1]);
            const duration_unit = match[2];
            const duration_ms = duration_unit === 'h' ? duration_num * 3600000 : duration_num * 86400000;
            const reason = msg_arr.slice(3).join(' ') || 'No reason provided.';
            const player = await utils_1.Players.getByDiscord(target.id);
            if (!player)
                return message.reply(createEmbed(`${target.tag} is not a registered Onyx RBW player.`, "RED"));
            await player.ban(duration_ms);
            const member = guild.members.cache.get(target.id);
            if (member) {
                member.roles.add(constants_1.Constants.RANKBANNED).catch(() => null);
                await member.setNickname(`[BANNED] ${player.minecraft.name}`).catch(() => null);
            }
            const logChannel = guild.channels.cache.get(constants_1.Constants.BAN_UNBAN.MANUAL_BAN_RESPONSE_CHANNEL);
            if (logChannel) {
                logChannel.send(createEmbed(`**${message.author.tag}** banned **${target.tag}**\nDuration: ${duration_str}\nReason: ${reason}`, "RED", "Onyx RBW Ban Hammer!"));
            }
            message.reply(createEmbed(`Successfully banned **${target.tag}** for ${duration_str}.`));
        }
        if (constants_1.Constants.BAN_UNBAN.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=unban')) {
            if (!message.member)
                return;
            if (!(await (0, utils_1.hasPerms)(message.member, constants_1.Constants.BAN_UNBAN.ROLES)))
                return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW Ban Hammer!"));
            const msg_arr = message.content.split(' ');
            if (msg_arr.length < 2)
                return message.reply(createEmbed(`Invalid Usage. Please use format \`=unban @User/User_ID\``, "RED"));
            const target = message.mentions.users.first() || client.users.cache.get(msg_arr[1]);
            if (!target)
                return message.reply(createEmbed("Invalid User mentioned. Use =unban @User/User_ID", "RED"));
            const player = await utils_1.Players.getByDiscord(target.id);
            if (player)
                await player.unban();
            guild.members.unban(target.id).catch(() => null);
            const member = guild.members.cache.get(target.id);
            if (member) {
                member.roles.remove(constants_1.Constants.RANKBANNED).catch(() => null);
                const row = await (0, database_1.query)('SELECT elo, minecraft_name FROM players WHERE discord_id = ? LIMIT 1', [target.id]);
                if (row.length > 0)
                    await member.setNickname(`[${row[0].elo}] ${row[0].minecraft_name}`).catch(() => null);
            }
            const logChannel = guild.channels.cache.get(constants_1.Constants.BAN_UNBAN.UNBAN_RESPONSE_CHANNEL);
            if (logChannel)
                logChannel.send(createEmbed(`**${message.author.tag}** unbanned **${target.tag}**`, "#d4a017", "Onyx RBW Ban Hammer!"));
            message.reply(createEmbed(`Successfully unbanned **${target.tag}**.`));
        }
        if (constants_1.Constants.STRIKE_UNSTRIKE.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=strike')) {
            if (!message.member)
                return;
            if (!(await (0, utils_1.hasPerms)(message.member, constants_1.Constants.STRIKE_UNSTRIKE.ROLES)))
                return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW!"));
            const msg_arr = message.content.split(' ');
            if (msg_arr.length < 3)
                return message.reply(createEmbed(`Invalid Usage. Please use format \`=strike @User/User_ID ±[number]\``, "RED"));
            const target = message.mentions.users.first() || client.users.cache.get(msg_arr[1]);
            if (!target)
                return message.reply(createEmbed("Invalid User mentioned. Use =strike @User/User_ID ±[number]", "RED"));
            const strikeCount = parseInt(msg_arr[2]);
            if (isNaN(strikeCount))
                return message.reply(createEmbed("Invalid strike count. Use =strike @User/User_ID ±[number]", "RED"));
            const player = await utils_1.Players.getByDiscord(target.id);
            if (!player)
                return message.reply(createEmbed(`${target.tag} is not a registered Onyx RBW player.`, "RED"));
            const newStrikes = Math.max(0, player.strikes + strikeCount);
            await (0, database_1.query)('UPDATE players SET strikes = ? WHERE id = ?', [newStrikes, player.id]);
            const newElo = await player.strikeELO(strikeCount > 0 ? 'Strike' : 'Unstrike');
            const member = guild.members.cache.get(target.id);
            if (member)
                await member.setNickname(`[${newElo}] ${player.minecraft.name}`).catch(() => null);
            if (newStrikes >= 2) {
                const duration = (0, utils_1.getBanDuration)(newStrikes - strikeCount, strikeCount);
                if (duration !== '0d') {
                    await player.ban(duration.endsWith('d') ? parseInt(duration) * 86400000 : parseInt(duration) * 3600000);
                    if (member)
                        member.roles.add(constants_1.Constants.RANKBANNED).catch(() => null);
                }
            }
            const logChannel = guild.channels.cache.get(constants_1.Constants.STRIKE_UNSTRIKE.MANUALSTRIKE_RESPONSE_CHANNEL);
            if (logChannel)
                logChannel.send(createEmbed(`**${message.author.tag}** modified strikes for **${target.tag}**\nStrikes: ${player.strikes} → ${newStrikes}\nELO: ${player.elo} → ${newElo}`, strikeCount > 0 ? "RED" : "#d4a017", "Onyx RBW!"));
            message.reply(createEmbed(`Strikes modified for **${target.tag}**: ${player.strikes} → ${newStrikes}`));
        }
        if (constants_1.Constants.FCLOSE_ROLES.some((r) => message.member?.roles.cache.has(r)) && (message.content.toLowerCase().startsWith('=fclose') || message.content.toLowerCase().startsWith('=forceclose'))) {
            if (!constants_1.Constants.QUEUES_ARRAY.flat().length)
                return message.reply(createEmbed("No queue channels configured.", "RED"));
            for (const qId of constants_1.Constants.QUEUES_ARRAY.flat()) {
                const vc = guild.channels.cache.get(qId);
                if (vc && vc.members && vc.members.size > 0) {
                    for (const [, member] of vc.members) {
                        await member.voice.setChannel(null).catch(() => null);
                    }
                }
            }
            message.reply(createEmbed("Queue force closed. All players have been removed from queue channels.", "#d4a017"));
        }
        if (constants_1.Constants.PMODIFY_VOID.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=void')) {
            if (!message.member)
                return;
            if (!(await (0, utils_1.hasPerms)(message.member, constants_1.Constants.PMODIFY_VOID.ROLES)))
                return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW!"));
            const msg_arr = message.content.split(' ');
            if (msg_arr.length < 2)
                return message.reply(createEmbed(`Invalid Usage. Please use format \`=void GameNumber\``, "RED"));
            const gameNumber = parseInt(msg_arr[1]);
            if (isNaN(gameNumber))
                return message.reply(createEmbed("Invalid game number.", "RED"));
            const gameRows = await (0, database_1.query)('SELECT id FROM games WHERE game_number = ? LIMIT 1', [gameNumber]);
            if (gameRows.length === 0)
                return message.reply(createEmbed(`Game #${gameNumber} not found.`, "RED"));
            const result = await (0, utils_1.voidGame)(gameNumber);
            if (result.error)
                return message.reply(createEmbed(result.error, "RED"));
            const game = utils_1.activeGames.get(gameRows[0].id);
            if (game)
                await game.cancel(true);
            message.reply(createEmbed(`Game #${gameNumber} has been voided and stats reversed.`, "#d4a017"));
            const logChannel = guild.channels.cache.get(constants_1.Constants.PMODIFY_VOID.VOID_RESPONSE_CHANNEL);
            if (logChannel)
                logChannel.send(createEmbed(`**${message.author.tag}** voided Game #${gameNumber}`, "RED", "Onyx RBW!"));
        }
        if (constants_1.Constants.PMODIFY_VOID.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=pmodify')) {
            if (!message.member)
                return;
            if (!(await (0, utils_1.hasPerms)(message.member, constants_1.Constants.PMODIFY_VOID.ROLES)))
                return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW!"));
            const msg_arr = message.content.split(' ');
            if (msg_arr.length < 4)
                return message.reply(createEmbed(`Invalid Usage. Please use format \`=pmodify GameNumber @User/User_ID wins|losses ±[value]\``, "RED"));
            const gameNumber = parseInt(msg_arr[1]);
            if (isNaN(gameNumber))
                return message.reply(createEmbed("Invalid game number.", "RED"));
            const target = message.mentions.users.first() || client.users.cache.get(msg_arr[2]);
            if (!target)
                return message.reply(createEmbed("Invalid User mentioned.", "RED"));
            const option = msg_arr[3].toLowerCase();
            if (!['wins', 'losses', 'kills', 'deaths', 'bedsbroken', 'bedslost', 'winstreak', 'bedstreak', 'elo'].includes(option))
                return message.reply(createEmbed("Invalid option.", "RED"));
            const value = parseInt(msg_arr[4]);
            if (isNaN(value))
                return message.reply(createEmbed("Invalid value.", "RED"));
            const player = await utils_1.Players.getByDiscord(target.id);
            if (!player)
                return message.reply(createEmbed(`${target.tag} is not a registered Onyx RBW player.`, "RED"));
            const colMap = {
                wins: 'wins', losses: 'losses', kills: 'kills', deaths: 'deaths',
                bedsbroken: 'beds_broken', bedslost: 'beds_lost', winstreak: 'winstreak',
                bedstreak: 'bedstreak', elo: 'elo'
            };
            const col = colMap[option];
            const sign = value >= 0 ? '+' : '';
            await (0, database_1.query)(`UPDATE players SET ${col} = ${col} ${sign} ? WHERE id = ?`, [value, player.id]);
            message.reply(createEmbed(`Modified **${option}** for **${target.tag}** by **${value}**.`, "#d4a017"));
        }
        if (constants_1.Constants.PMODIFY_VOID.CHANNELS.includes(message.channel.id) && (message.content.toLowerCase().startsWith('=win') || message.content.toLowerCase().startsWith('=loss') || message.content.toLowerCase().startsWith('=w ') || message.content.toLowerCase().startsWith('=l '))) {
            if (!message.member)
                return;
            if (!(await (0, utils_1.hasPerms)(message.member, constants_1.Constants.PMODIFY_VOID.ROLES)))
                return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW!"));
            const users = message.content.split(' ').slice(1).map((id) => client.users.cache.get(id)).filter((u) => u);
            users.push(...message.mentions.users.array());
            if (users.length === 0)
                return message.reply(createEmbed("No valid users mentioned.", "RED"));
            let ids = users.map((user) => user.id);
            const players = await utils_1.Players.getManyByDiscord(ids);
            ids = ids.filter((id) => players.has(id));
            if (ids.length === 0)
                return message.reply(createEmbed("No registered players found.", "RED"));
            const cmd = message.content.split(' ')[0].slice(1).toLowerCase();
            const isWin = cmd === 'win' || cmd === 'w';
            for (const [discordId, player] of players) {
                const div = (0, utils_1.getDivision)(player.elo);
                const delta = isWin ? div.eloWin : -div.eloLoss;
                const newElo = Math.max(0, player.elo + delta);
                const sign = delta >= 0 ? '+' : '';
                await (0, database_1.query)(`UPDATE players SET elo = elo ${sign} ?, ${isWin ? 'wins = wins + 1' : 'losses = losses + 1'} WHERE id = ?`, [Math.abs(delta), player.id]);
                const member = guild.members.cache.get(discordId);
                if (member && !member.roles.cache.has(constants_1.Constants.SUPPORT_ROLE_ID)) {
                    await member.setNickname(`[${newElo}] ${player.minecraft.name}`).catch(() => null);
                }
            }
            message.reply(createEmbed(`Users → ${ids.map((id) => `<@${id}>`).join(' ')} scored successfully.`, "#d4a017"));
            const logChannel = guild.channels.cache.get(constants_1.Constants.PMODIFY_VOID.PMODIFY_RESPONSE_CHANNEL);
            if (logChannel) {
                const logMsg = ids.map((id) => {
                    const p = players.get(id);
                    if (!p)
                        return '';
                    const div = (0, utils_1.getDivision)(p.elo);
                    const delta = isWin ? div.eloWin : -div.eloLoss;
                    const newElo = Math.max(0, p.elo + delta);
                    const oldRole = constants_1.Constants.ELO_ROLES[Math.floor(p.elo / 300)] || '';
                    const newRole = constants_1.Constants.ELO_ROLES[Math.floor(newElo / 300)] || '';
                    return `**${p.minecraft.name}** [\`${p.elo}\` → \`${newElo}\`]${oldRole && newRole && oldRole !== newRole ? ` ${oldRole} → ${newRole}` : ''}`;
                }).filter(Boolean).join('\n');
                logChannel.send(createEmbed(logMsg, isWin ? "#228B22" : "#FF0000", "Onyx RBW!").setTitle('Manual Scoring').addField('Scorer Responsible', `${message.author}`));
            }
        }
        if (message.content.toLowerCase().startsWith('=qs') || message.content.toLowerCase().startsWith('=queuestats')) {
            if (constants_1.Constants.CHAT === message.channel.id)
                return message.reply(createEmbed(`${message.author} commands are disabled in this channel.`, "RED"));
            const queueId = constants_1.Constants.QUEUES_ARRAY.flat()[0];
            if (!queueId)
                return message.reply(createEmbed("No queue configured.", "RED"));
            const vc = guild.channels.cache.get(queueId);
            if (!vc || !vc.members || vc.members.size === 0)
                return message.reply(createEmbed("Queue is empty.", "RED"));
            const members = [...vc.members.values()];
            const players = await utils_1.Players.getManyByDiscord(members.map((m) => m.id));
            const embed = createEmbed(undefined, "#00FFFF", "Queue Stats")
                .setTitle("Queue Stats")
                .setDescription(members.map((m) => {
                const p = players.get(m.id);
                return `${m} → ${p ? `[${p.elo}] ${p.minecraft.name} | ${p.wins}W/${p.losses}L` : 'Unregistered'}`;
            }).join('\n'));
            message.channel.send(embed);
        }
        if (message.content.toLowerCase().startsWith('=strikes') || message.content.toLowerCase().startsWith('=getuser')) {
            const target = message.mentions.users.first() || message.author;
            const player = await utils_1.Players.getByDiscord(target.id);
            if (!player)
                return message.reply(createEmbed(`${target.tag} is not a registered Onyx RBW player.`, "RED"));
            message.channel.send(createEmbed(`**${target.tag}**\nStrikes: ${player.strikes}\nELO: ${player.elo}\nWins: ${player.wins}\nLosses: ${player.losses}\nWinstreak: ${player.winstreak}\nBedstreak: ${player.bedstreak}`, "#00FFFF", "Player Info"));
        }
    });
    setInterval(() => utils_1.Players.updateBans(), 60000);
    logger.info(`Bot started successfully. Watching ${guild.memberCount} players.`);
})();
async function strikeEmbed(userId, channelId) {
}
