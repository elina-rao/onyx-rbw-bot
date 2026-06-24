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
exports.BotManager = exports.activeGames = exports.LocalGame = exports.Game = exports.Players = exports.Player = void 0;
exports.getDivision = getDivision;
exports.calculateElo = calculateElo;
exports.hasPerms = hasPerms;
exports.createNewGame = createNewGame;
exports.getBanDuration = getBanDuration;
exports.gameReport = gameReport;
exports.updateRoles = updateRoles;
exports.voidGame = voidGame;
exports.delay = delay;
exports.findOpenCategory = findOpenCategory;
exports.checkStatus = checkStatus;
exports.toEscapedFormat = toEscapedFormat;
const discord_js_1 = require("discord.js");
const constants_1 = require("./constants");
const logger_1 = __importDefault(require("./logger"));
const bot_1 = __importStar(require("./managers/bot"));
const database_1 = require("./managers/database");
const games_1 = require("./typings/games");
const divisions_json_1 = __importDefault(require("./divisions.json"));
const { HYPIXEL_KEY } = process.env;
const socket_1 = require("./managers/socket");
const Hypixel = require('hypixel-api-reborn');
const hypixel = new Hypixel.Client(HYPIXEL_KEY);
const maps_object = {
    "Extinction": { img: "https://media.discordapp.net/attachments/796082875475689506/810012638955175986/extiction-png.png", limit: "+95" },
    "Enchanted": { img: "https://media.discordapp.net/attachments/796082875475689506/810015425155825687/enchanted-png.png", limit: "+100" },
    "Aquarium": { img: "https://cdn.discordapp.com/attachments/799897234128764958/800008639342575667/aquariumold-png.png", limit: "+110" },
    "Katsu": { img: "https://cdn.discordapp.com/attachments/799897234128764958/800010460429942794/NEW-Katsu-bw-3v3v3v3-4v4v4v4.png", limit: "+96" },
    "Invasion": { img: "https://cdn.discordapp.com/attachments/799897234128764958/800014465294008370/image0.jpg", limit: "+115" },
    "Rise": { img: "https://cdn.discordapp.com/attachments/800022796301369344/800024134217629706/rise-png.png", limit: "+96" },
    "Temple": { img: "https://cdn.discordapp.com/attachments/800022796301369344/800023969918746624/templebedwars-png.png", limit: "+106" },
    "Lectus": { img: "https://cdn.discordapp.com/attachments/799897234128764958/800014149232492594/image0.jpg", limit: "+90" },
    "Catalyst": { img: "https://media.discordapp.net/attachments/796082875475689506/811700045085671514/catalyst-png.png", limit: "+101" },
    "Treenan": { img: "https://media.discordapp.net/attachments/796082875475689506/811700135339622430/treenan-png.png", limit: "+121" },
};
class Player {
    constructor(data) {
        this.data = data;
    }
    ;
    get id() { return this.data.id; }
    get discord() { return this.data.discord_id; }
    get minecraft() {
        return {
            uuid: this.data.minecraft_uuid || '',
            name: this.data.minecraft_name || '',
        };
    }
    get registeredAt() { return this.data.registered_at ?? 0; }
    get wins() { return this.data.wins ?? 0; }
    get losses() { return this.data.losses ?? 0; }
    get bedsBroken() { return this.data.beds_broken ?? 0; }
    get bedsLost() { return this.data.beds_lost ?? 0; }
    get elo() { return this.data.elo ?? 0; }
    get kills() { return this.data.kills ?? 0; }
    get deaths() { return this.data.deaths ?? 0; }
    get roles() { return this.data.roles ? JSON.parse(this.data.roles) : []; }
    get banExpires() { return this.data.ban_expires ?? 0; }
    get banned() { return (this.data.ban_expires ?? 0) < 0 || (this.data.ban_expires ?? 0) >= Date.now(); }
    get strikes() { return this.data.strikes ?? 0; }
    get games() { return this.data.games ?? 0; }
    get winstreak() { return this.data.winstreak ?? 0; }
    get bedstreak() { return this.data.bedstreak ?? 0; }
    get info_card_background() { return this.data.info_card_background ?? '#363942'; }
    get info_card_text() { return this.data.info_card_text ?? 'discord.gg/onyxrbw'; }
    get messages() { return this.data.messages ? JSON.parse(this.data.messages) : {}; }
    get loseMessage() { return this.data.lose_message; }
    get emoji() { return this.data.emoji; }
    get winMessage() { return this.data.win_message; }
    async update(data) {
        const sets = [];
        const vals = [];
        for (const [key, value] of Object.entries(data)) {
            if (value === undefined)
                continue;
            const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
            sets.push(`${col} = ?`);
            vals.push(value);
        }
        if (sets.length === 0)
            return this;
        vals.push(this.id);
        await (0, database_1.query)(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`, vals);
        return this;
    }
    async ban(duration = -1) {
        if (this.banned && ((this.banExpires - Date.now())) + duration < 0) {
            await (0, database_1.query)(`UPDATE players SET ban_expires = 0 WHERE id = ?`, [this.id]);
        }
        else if (duration === -1) {
            await (0, database_1.query)(`UPDATE players SET ban_expires = -1 WHERE id = ?`, [this.id]);
        }
        else {
            if (this.banned) {
                await (0, database_1.query)(`UPDATE players SET ban_expires = ban_expires + ? WHERE id = ?`, [duration, this.id]);
            }
            else {
                await (0, database_1.query)(`UPDATE players SET ban_expires = ? WHERE id = ?`, [Date.now() + duration, this.id]);
            }
        }
        return this;
    }
    async unban() {
        await (0, database_1.query)(`UPDATE players SET ban_expires = 0 WHERE id = ?`, [this.id]);
        return this;
    }
    toGamePlayer() {
        return { username: this.minecraft.name, winstreak: this.winstreak, bedstreak: this.bedstreak, discord: this.discord };
    }
    toJSON() {
        return {
            id: this.id,
            discord_id: this.discord,
            minecraft_uuid: this.minecraft.uuid,
            minecraft_name: this.minecraft.name,
            registered_at: this.registeredAt,
            ban_expires: this.banExpires,
            beds_broken: this.bedsBroken,
            beds_lost: this.bedsLost,
            bedstreak: this.bedstreak,
            deaths: this.deaths,
            elo: this.elo,
            games: this.games,
            kills: this.kills,
            losses: this.losses,
            strikes: this.strikes,
            wins: this.wins,
            winstreak: this.winstreak,
            info_card_text: this.info_card_text,
            info_card_background: this.info_card_background,
            win_message: this.winMessage,
            lose_message: this.loseMessage,
            emoji: this.emoji,
        };
    }
    async strikeELO(mode) {
        const div = getDivision(this.elo);
        const delta = mode === 'Strike'
            ? -Math.round(div.eloLoss * 0.5)
            : Math.round(div.eloWin * 0.5);
        const newElo = Math.max(0, this.elo + delta);
        await this.update({ elo: newElo });
        return newElo;
    }
}
exports.Player = Player;
var Players;
(function (Players) {
    async function getById(id) {
        const rows = await (0, database_1.query)('SELECT * FROM players WHERE id = ? LIMIT 1', [id]);
        return rows.length ? new Player(rows[0]) : null;
    }
    Players.getById = getById;
    async function getByDiscord(id) {
        const rows = await (0, database_1.query)('SELECT * FROM players WHERE discord_id = ? LIMIT 1', [id]);
        return rows.length ? new Player(rows[0]) : null;
    }
    Players.getByDiscord = getByDiscord;
    async function getByMinecraft(uuid) {
        const rows = await (0, database_1.query)('SELECT * FROM players WHERE minecraft_uuid = ? LIMIT 1', [uuid]);
        return rows.length ? new Player(rows[0]) : null;
    }
    Players.getByMinecraft = getByMinecraft;
    async function getManyByDiscord(ids) {
        if (ids.length === 0)
            return new discord_js_1.Collection();
        const placeholders = ids.map(() => '?').join(',');
        const rows = await (0, database_1.query)(`SELECT * FROM players WHERE discord_id IN (${placeholders})`, ids);
        const players = new discord_js_1.Collection();
        rows.forEach(row => players.set(row.discord_id, new Player(row)));
        return players;
    }
    Players.getManyByDiscord = getManyByDiscord;
    async function getManyByMinecraft(uuids) {
        if (uuids.length === 0)
            return new discord_js_1.Collection();
        const placeholders = uuids.map(() => '?').join(',');
        const rows = await (0, database_1.query)(`SELECT * FROM players WHERE minecraft_uuid IN (${placeholders})`, uuids);
        rows.sort((a, b) => uuids.indexOf(a.minecraft_uuid) - uuids.indexOf(b.minecraft_uuid));
        const players = new discord_js_1.Collection();
        rows.forEach(row => players.set(row.minecraft_uuid, new Player(row)));
        return players;
    }
    Players.getManyByMinecraft = getManyByMinecraft;
    async function updateBans() {
        const logger = new logger_1.default("Background Ban Processing");
        try {
            const [guild, client] = await Promise.all([bot_1.defaultGuild, bot_1.default]);
            const now = Date.now();
            const rows = await (0, database_1.query)('SELECT * FROM players WHERE ban_expires >= 0 AND ban_expires <= ?', [now]);
            await Promise.all(rows.map(async ({ discord_id }) => {
                guild.members.cache.get(discord_id)?.roles.remove(guild.roles.cache.get(constants_1.Constants.RANKBANNED));
                guild.members.unban(discord_id).catch(() => null);
            }));
            if (rows.length > 0) {
                const msg = rows.length === 1 ? 'Player' : 'Players';
                const channel = guild.channels.cache.get(constants_1.Constants.BAN_UNBAN.UNBAN_RESPONSE_CHANNEL);
                if (channel) {
                    channel.send(new discord_js_1.MessageEmbed()
                        .setTitle('Onyx RBW')
                        .setColor("#d4a017")
                        .setDescription(`Unbanned ${rows.map(p => client.users.cache.get(p.discord_id)).join(" ")}`)
                        .setFooter(`© Onyx RBW | Unbanned → ${rows.length} ${msg} this wave.`, constants_1.Constants.BRANDING_URL)).catch(() => null);
                }
                logger.info(`Unbanned ${rows.length} ${msg} automatically.`);
            }
            const ids = rows.map(r => r.id);
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                await (0, database_1.query)(`UPDATE players SET ban_expires = 0 WHERE id IN (${placeholders})`, ids);
            }
        }
        catch (e) {
            logger.error(`Failed to execute successfully:\n${e.stack}`);
        }
    }
    Players.updateBans = updateBans;
})(Players || (exports.Players = Players = {}));
class Game {
    constructor(data) {
        this.data = data;
    }
    ;
    get id() { return this.data.id; }
    get voiceChannel() { return this.data.voice_channel_id; }
    get textChannel() { return this.data.text_channel_id; }
    get team1() { return this.data.team1 ? JSON.parse(this.data.team1) : undefined; }
    get team2() { return this.data.team2 ? JSON.parse(this.data.team2) : undefined; }
    async update(data) {
        const sets = [];
        const vals = [];
        for (const [key, value] of Object.entries(data)) {
            if (value === undefined)
                continue;
            const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
            if (typeof value === 'object') {
                sets.push(`${col} = ?`);
                vals.push(JSON.stringify(value));
            }
            else {
                sets.push(`${col} = ?`);
                vals.push(value);
            }
        }
        if (sets.length === 0)
            return this;
        vals.push(this.id);
        await (0, database_1.query)(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`, vals);
        return this;
    }
}
exports.Game = Game;
function getDivision(elo) {
    for (const div of divisions_json_1.default.divisions) {
        if (elo >= div.min && (elo < div.max || div.max === -1)) {
            return div;
        }
    }
    return divisions_json_1.default.divisions[divisions_json_1.default.divisions.length - 1];
}
function calculateElo(players, winner) {
    const [kills, teams] = players.reduce((a, b) => {
        if (!b)
            return a;
        b.team = b.team || winner;
        a[0] += b.kills || 0;
        if (!a[1][b.team]) {
            a[1][b.team] = { players: [] };
        }
        a[1][b.team].players.push(b);
        return a;
    }, [0, {}]);
    const colours = Object.keys(teams);
    const isVoid = kills < 2;
    for (const colour in teams) {
        const team = teams[colour];
        team.avgElo = team.players.reduce((a, b) => a + (b.elo || 400), 0) / team.players.length;
    }
    const loserColours = colours.filter(c => c !== winner);
    const winnerAvg = teams[winner]?.avgElo || 0;
    const loserAvg = loserColours.reduce((a, c) => a + (teams[c]?.avgElo || 0), 0) / (loserColours.length || 1);
    const isBoosted = winnerAvg - loserAvg > 500;
    const ratings = players.reduce((a, player) => {
        const isWinner = player.team === winner;
        const div = getDivision(player.elo || 400);
        const games = player.games || 0;
        const isPlacement = games < 5;
        let delta = isWinner ? div.eloWin : (isPlacement ? 0 : -div.eloLoss);
        if (isWinner) {
            const ws = player.winstreak || 0;
            delta += Math.min(ws, 5);
        }
        if (isWinner && isBoosted)
            delta = Math.min(delta, 1);
        if (isVoid)
            delta = 0;
        a[player.minecraft.name] = Math.max(0, (player.elo || 400) + delta);
        return a;
    }, {});
    return [ratings, teams];
}
class LocalGame {
    constructor(gameNumber, id) {
        this.gameNumber = gameNumber;
        this.id = id;
        this.logger = new logger_1.default(`Game #${this.gameNumber}`);
        this._state = games_1.GameState.PRE_GAME;
    }
    ;
    get state() { return this._state; }
    get textChannel() { return this._textChannel; }
    get voiceChannel() { return this._voiceChannel; }
    get teams() { return [this.team1, this.team2]; }
    get teamPlayers() { return [this.team1Players, this.team2Players]; }
    get gameMembers() { return this.gamePlayers ?? []; }
    async createChannels(members, vc) {
        const guild = await bot_1.defaultGuild;
        const index = constants_1.Constants.QUEUES_ARRAY.findIndex(q => q.includes(vc.id));
        const textCategory = await findOpenCategory(constants_1.Constants.CATEGORY_ARRAY[index].map(cat => guild.channels.cache.get(cat)));
        const [textChannel] = await Promise.all([
            guild.channels.create(`game-${this.gameNumber}`, {
                type: "text",
                permissionOverwrites: [{ id: (await bot_1.defaultGuild).id, deny: ["VIEW_CHANNEL"] }],
                parent: textCategory
            })
        ]);
        this._textChannel = textChannel;
        this._voiceChannel = vc;
        this.gamePlayers = members.map(mem => mem.id);
        return { textChannel };
    }
    async end() {
        await Promise.all([
            this.update({
                state: games_1.GameState.FINISHED,
                team1: this.team1,
                team2: this.team2,
            }),
            ...this._bot ? [BotManager.release(this._bot)] : [],
        ]);
        this._state = games_1.GameState.FINISHED;
        setTimeout(async () => {
            this._textChannel?.delete().catch(() => null);
            if (this.team1Channel) {
                await Promise.all(this.team1Channel.members.map(member => member.voice.setChannel(constants_1.Constants.WAITING_ROOM))).catch(() => null);
                this.team1Channel?.delete().catch(() => null);
            }
            if (this.team2Channel) {
                await Promise.all(this.team2Channel.members.map(member => member.voice.setChannel(constants_1.Constants.WAITING_ROOM))).catch(() => null);
                this.team2Channel?.delete().catch(() => null);
            }
        }, 10000);
    }
    async start(team1, team2) {
        this.team1 = { players: team1.map(player => player.toGamePlayer()) };
        this.team1Players = team1;
        this.team2 = { players: team2.map(player => player.toGamePlayer()) };
        this.team2Players = team2;
        await this.update({
            state: games_1.GameState.ACTIVE,
            team1: this.team1,
            team2: this.team2,
        });
        this._state = games_1.GameState.ACTIVE;
    }
    getPlayer(player) {
        return this.team1?.players.find(({ username }) => username === player) ?? this.team2?.players.find(({ username }) => username === player) ?? null;
    }
    getFullPlayer(player) {
        return this.team1Players?.find(({ minecraft }) => minecraft.name === player) ?? this.team2Players?.find(({ minecraft }) => minecraft.name === player) ?? null;
    }
    async cancel(deleteChannels = false) {
        this._state = games_1.GameState.VOID;
        try {
            await Promise.all([
                this.update({ state: games_1.GameState.VOID }),
                ...this._bot ? [BotManager.release(this._bot)] : [],
            ]);
        }
        catch (e) {
            console.error(`Failed to cancel the game:\n${e}`);
        }
        if (deleteChannels) {
            this._textChannel?.delete().catch(() => null);
            if (this.team1Channel) {
                await Promise.all(this.team1Channel.members.map(member => member.voice.setChannel(constants_1.Constants.WAITING_ROOM))).catch(() => null);
                this.team1Channel?.delete().catch(() => null);
            }
            if (this.team2Channel) {
                await Promise.all(this.team2Channel.members.map(member => member.voice.setChannel(constants_1.Constants.WAITING_ROOM))).catch(() => null);
                this.team2Channel?.delete().catch(() => null);
            }
        }
    }
    async enterStartingState() {
        try {
            await this.update({ state: games_1.GameState.STARTING });
            this._state = games_1.GameState.STARTING;
        }
        catch (e) {
            this.logger.error(`Failed to entering the starting phase:\n${e}`);
        }
    }
    async getAssignedBot() {
        if (this._state === games_1.GameState.VOID)
            return { error: true, reason: 'GAME_VOID' };
        if (this._bot)
            return { error: false, username: this._bot };
        const bot = await BotManager.assign(this.id);
        if (bot === null)
            return { error: true, reason: 'NONE_AVAILABLE' };
        return { error: false, username: this._bot = bot };
    }
    async update(data) {
        const sets = [];
        const vals = [];
        for (const [key, value] of Object.entries(data)) {
            if (value === undefined)
                continue;
            const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
            if (typeof value === 'object') {
                sets.push(`${col} = ?`);
                vals.push(JSON.stringify(value));
            }
            else {
                sets.push(`${col} = ?`);
                vals.push(value);
            }
        }
        if (sets.length === 0)
            return;
        vals.push(this.id);
        await (0, database_1.query)(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    setTeamChannels(team1, team2) {
        this.team1Channel = team1;
        this.team2Channel = team2;
    }
    pickMap() {
        return new Promise(async (res, rej) => {
            const reject = () => rej(new Error("MESSAGE_DELETED"));
            const playerCount = (this.team1Players?.length ?? 0) + (this.team2Players?.length ?? 0);
            let maps = Object.keys(maps_object), firstMap, secondMap, pick, rankedlogo = "https://cdn.discordapp.com/attachments/759444475818278942/805517822360027146/rbw_white_logo.jpg";
            firstMap = maps[Math.floor(Math.random() * maps.length)];
            maps = maps.filter(map => map !== firstMap);
            secondMap = maps[Math.floor(Math.random() * maps.length)];
            let [, , m] = await Promise.all([
                this.textChannel.send(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle(`1️⃣ ${firstMap}`).addField("Build Limit", `Y: ${maps_object[firstMap].limit}`).setImage(maps_object[firstMap].img).setFooter("© Onyx RBW", rankedlogo)),
                this.textChannel.send(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle(`2️⃣ ${secondMap}`).addField("Build Limit", `Y: ${maps_object[secondMap].limit}`).setImage(maps_object[secondMap].img).setFooter("© Onyx RBW", rankedlogo)),
                this.textChannel.send(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle("Map Picking").addField(`1️⃣ ${firstMap}`, "\u200b").addField(`2️⃣ ${secondMap}`, "\u200b").addField("♻️ Reroll", "\u200b").setFooter("© Onyx RBW | Map Picking", rankedlogo)),
            ]);
            let reactions = ["1️⃣", "2️⃣", "♻️"];
            await Promise.all(reactions.map(reaction => m.react(reaction).catch(rej)));
            let optionone = [], optiontwo = [], optionthree = [];
            if (m.deleted)
                return reject();
            let collector = m.createReactionCollector((reaction) => reactions.includes(reaction.emoji.name), { time: 30000 });
            collector.on('collect', async (reaction, user) => {
                reaction.users.remove(user);
                switch (reaction.emoji.name) {
                    case "1️⃣": {
                        if (optionone.includes(user))
                            return;
                        optionone.push(user);
                        optiontwo = optiontwo.filter(u => u !== user);
                        optionthree = optionthree.filter(u => u !== user);
                        await m.edit(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle("Map Picking").addField(`1️⃣ ${firstMap}`, "\u200b" + optionone.join("\n")).addField(`2️⃣ ${secondMap}`, "\u200b" + optiontwo.join("\n")).addField("♻️ Reroll", "\u200b" + optionthree.join("\n")).setFooter("© Onyx RBW | Map Picking", rankedlogo));
                        break;
                    }
                    case "2️⃣": {
                        if (optiontwo.includes(user))
                            return;
                        optionone = optionone.filter(u => u !== user);
                        optiontwo.push(user);
                        optionthree = optionthree.filter(u => u !== user);
                        await m.edit(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle("Map Picking").addField(`1️⃣ ${firstMap}`, "\u200b" + optionone.join("\n")).addField(`2️⃣ ${secondMap}`, "\u200b" + optiontwo.join("\n")).addField("♻️ Reroll", "\u200b" + optionthree.join("\n")).setFooter("© Onyx RBW | Map Picking", rankedlogo));
                        break;
                    }
                    case "♻️": {
                        if (optionthree.includes(user))
                            return;
                        optionone = optionone.filter(u => u !== user);
                        optiontwo = optiontwo.filter(u => u !== user);
                        optionthree.push(user);
                        await m.edit(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle("Map Picking").addField(`1️⃣ ${firstMap}`, "\u200b" + optionone.join("\n")).addField(`2️⃣ ${secondMap}`, "\u200b" + optiontwo.join("\n")).addField("♻️ Reroll", "\u200b" + optionthree.join("\n")).setFooter("© Onyx RBW | Map Picking", rankedlogo));
                        break;
                    }
                }
            });
            collector.on('end', async () => {
                if (m.deleted)
                    return reject();
                m.reactions.removeAll().catch(err => console.log(err));
                if (optionone.length > optiontwo.length && optionone.length > optionthree.length)
                    pick = firstMap;
                else if (optiontwo.length > optionone.length && optiontwo.length > optionthree.length)
                    pick = secondMap;
                else
                    pick = null;
                if (pick) {
                    await m.edit(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle("Map Picking").setDescription(`The map **${pick}** has been chosen, by a margin of ${Math.abs(optionone.length - optiontwo.length)} vote${Math.abs(optionone.length - optiontwo.length) > 1 ? "s" : ""}!`).setFooter("© Onyx RBW | Map Picking", rankedlogo));
                    return res(pick);
                }
                else {
                    maps = maps.filter(map => map !== secondMap);
                    firstMap = maps[Math.floor(Math.random() * maps.length)];
                    maps = maps.filter(map => map !== firstMap);
                    secondMap = maps[Math.floor(Math.random() * maps.length)];
                    const [, , m] = await Promise.all([
                        this.textChannel.send(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle(`1️⃣ ${firstMap}`).addField("Build Limit", `Y: ${maps_object[firstMap].limit}`).setImage(maps_object[firstMap].img).setFooter("© Onyx RBW", rankedlogo)),
                        this.textChannel.send(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle(`2️⃣ ${secondMap}`).addField("Build Limit", `Y: ${maps_object[secondMap].limit}`).setImage(maps_object[secondMap].img).setFooter("© Onyx RBW", rankedlogo)),
                        this.textChannel.send(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle("Map Picking | Reroll").addField(`1️⃣ ${firstMap}`, "\u200b").addField(`2️⃣ ${secondMap}`, "\u200b").setFooter("© Onyx RBW | Map Picking", rankedlogo))
                    ]);
                    optionone = [], optiontwo = [];
                    reactions = ["1️⃣", "2️⃣"];
                    for (const reaction of reactions) {
                        await m.react(reaction).catch(rej);
                    }
                    if (m.deleted)
                        return reject();
                    collector = m.createReactionCollector((reaction) => reactions.includes(reaction.emoji.name), { time: 30000 });
                    collector.on('collect', async (reaction, user) => {
                        reaction.users.remove(user);
                        if (reaction.emoji.name === "1️⃣") {
                            if (optionone.includes(user))
                                return;
                            optionone.push(user);
                            optiontwo = optiontwo.filter(u => u !== user);
                            await m.edit(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle("Map Picking | Reroll").addField(`1️⃣ ${firstMap}`, "\u200b" + optionone.join("\n")).addField(`2️⃣ ${secondMap}`, "\u200b" + optiontwo.join("\n")).setFooter("© Onyx RBW | Map Picking", rankedlogo));
                        }
                        else if (reaction.emoji.name === "2️⃣") {
                            if (optiontwo.includes(user))
                                return;
                            optionone = optionone.filter(u => u !== user);
                            optiontwo.push(user);
                            await m.edit(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle("Map Picking | Reroll").addField(`1️⃣ ${firstMap}`, "\u200b" + optionone.join("\n")).addField(`2️⃣ ${secondMap}`, "\u200b" + optiontwo.join("\n")).setFooter("© Onyx RBW | Map Picking", rankedlogo));
                        }
                    });
                    collector.on('end', async () => {
                        if (m.deleted)
                            return reject();
                        m.reactions.removeAll().catch(err => console.log(err));
                        if (optionone.length > optiontwo.length)
                            pick = firstMap;
                        else if (optiontwo.length > optionone.length)
                            pick = secondMap;
                        else
                            pick = null;
                        if (pick) {
                            await m.edit(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle("Map Picking | Reroll").setDescription(`The map **${pick}** has been chosen, by a margin of ${Math.abs(optionone.length - optiontwo.length)} vote${Math.abs(optionone.length - optiontwo.length) > 1 ? "s" : ""}!`).setFooter("© Onyx RBW | Map Picking", rankedlogo));
                        }
                        else {
                            pick = [firstMap, secondMap][Math.floor(Math.random() * 2)];
                            await m.edit(new discord_js_1.MessageEmbed().setColor("ORANGE").setTitle("Map Picking | Reroll").setDescription(`The map **${pick}** has been randomly chosen, due to a draw.`).setFooter("© Onyx RBW | Map Picking", rankedlogo));
                        }
                        res(pick);
                    });
                }
            });
        });
    }
}
exports.LocalGame = LocalGame;
exports.activeGames = new discord_js_1.Collection();
async function hasPerms(member, roles) {
    let hasPerms = false;
    member?.roles.cache.forEach(role => {
        if (roles.includes(role.id))
            hasPerms = true;
    });
    return hasPerms;
}
async function createNewGame() {
    const result = await (0, database_1.query)('INSERT INTO games (game_number) VALUES (0)');
    const insertId = result.insertId;
    const countResult = await (0, database_1.query)('SELECT COUNT(*) as cnt FROM games WHERE id <= ?', [insertId]);
    const gameNumber = countResult[0].cnt;
    await (0, database_1.query)('UPDATE games SET game_number = ? WHERE id = ?', [gameNumber, insertId]);
    const game = new LocalGame(gameNumber, insertId);
    exports.activeGames.set(insertId, game);
    return { game, gameNumber, insertedId: insertId };
}
async function isAssigned(username) {
    const bot = socket_1.bots.get(username);
    if (!bot)
        return true;
    return new Promise(r => { bot.emit('isAssigned', r); });
}
var BotManager;
(function (BotManager) {
    const logger = new logger_1.default("Mineflayer Bot Manager");
    async function assign(gameId) {
        const start = Date.now();
        let value = null;
        while (!value && Date.now() - start < 60000) {
            const result = await (0, database_1.query)('UPDATE bots SET assigned_game_id = ? WHERE assigned_game_id IS NULL LIMIT 1', [gameId]);
            if (result.affectedRows > 0) {
                const rows = await (0, database_1.query)('SELECT username FROM bots WHERE assigned_game_id = ? LIMIT 1', [gameId]);
                if (rows.length > 0 && !(await isAssigned(rows[0].username))) {
                    value = rows[0].username;
                }
                else {
                    await (0, database_1.query)('UPDATE bots SET assigned_game_id = NULL WHERE assigned_game_id = ?', [gameId]);
                }
            }
            await delay(1000);
        }
        return value;
    }
    BotManager.assign = assign;
    async function release(bot) {
        try {
            await (0, database_1.query)('UPDATE bots SET assigned_game_id = NULL WHERE username = ?', [bot]);
        }
        catch { }
        ;
    }
    BotManager.release = release;
    async function getAssignedGame(name) {
        const rows = await (0, database_1.query)('SELECT assigned_game_id FROM bots WHERE username = ? LIMIT 1', [name]);
        return rows.length ? rows[0].assigned_game_id : null;
    }
    BotManager.getAssignedGame = getAssignedGame;
})(BotManager || (exports.BotManager = BotManager = {}));
function getBanDuration(existingStrikes, strikesToAdd) {
    socket_1.devLogger.info(`existingStrikes --> ${existingStrikes}`);
    socket_1.devLogger.info(`stringsToAdd --> ${strikesToAdd}`);
    if (existingStrikes + strikesToAdd > 10)
        return '0d';
    const strikes = Math.max(existingStrikes, 0) + strikesToAdd;
    const durations = [3, 6, 12, 1, 2, 3, 4, 5, 6, 0];
    return `${durations[strikes - 2]}${strikes > 4 ? 'd' : 'h'}`;
}
function getRole(p) {
    const index = Math.floor(Math.abs(p) / 300);
    return constants_1.Constants.ELO_ROLES[Math.min(index, constants_1.Constants.ELO_ROLES.length - 1)];
}
async function gameReport(teams, winner, number, tag, colourMap, guild) {
    const scoring = new discord_js_1.MessageEmbed()
        .setAuthor(`Automatic Scoring: Score Request [#${number}]`, 'https://cdn.discordapp.com/attachments/799897234128764958/804020431576105000/Daco_3568543.png');
    for (const team in teams) {
        const name = colourMap.get(team);
        const users = teams[team].players.map((p) => {
            const oldRole = getRole(p.oldRating);
            const newRole = getRole(p.newRating);
            const updated = oldRole && newRole && oldRole !== newRole;
            if (updated) {
                guild.members.fetch(p.discord).then((m) => {
                    m.roles.add(newRole).catch(() => { });
                    m.roles.remove(oldRole).catch(() => { });
                    if (!m.roles.cache.has(constants_1.Constants.SUPPORT_ROLE_ID))
                        m.setNickname(`[${p.newRating}] ${p.username}`).catch(() => { });
                }).catch(() => { });
            }
            return `**${p.username}** | \`[${p.oldRating} → ${p.newRating}]\`${updated ? ` <@&${oldRole}> → <@&${newRole}>` : ''}`;
        }).join('\n');
        scoring.addField(`${name} Team`, users);
    }
    scoring.addField('Winning Team', `\`•\` ${colourMap.get(winner)}`);
    const channel = guild.channels.cache.get(constants_1.Constants.GAME_REPORT_CHANNEL);
    try {
        const m = await channel.send(tag, scoring);
    }
    catch (e) {
        console.log('GAME_ERROR', e);
        console.log(`Couldn't send Game Report for game: ${number}`);
    }
}
async function updateRoles(member_id, role1_id, role2_id) {
    const guild = await bot_1.defaultGuild;
    const member = guild.members.cache.get(member_id);
    await member?.roles.remove(role1_id).catch(() => null);
    await member?.roles.add(role2_id).catch(() => null);
}
async function voidGame(gameNumber) {
    const rows = await (0, database_1.query)('SELECT team1, team2 FROM games WHERE game_number = ? LIMIT 1', [gameNumber]);
    if (rows.length === 0)
        return { error: 'Game not found.' };
    const game = rows[0];
    const team1Parsed = game.team1 ? JSON.parse(game.team1) : null;
    const team2Parsed = game.team2 ? JSON.parse(game.team2) : null;
    const both = [
        { team: team1Parsed, winner: team1Parsed?.winner === true },
        { team: team2Parsed, winner: team2Parsed?.winner === true },
    ];
    for (const { team, winner } of both) {
        if (!team)
            continue;
        for (const player of team.players) {
            if (!player.discord)
                continue;
            const sets = [];
            const vals = [];
            if (player.oldRating !== undefined && player.newRating !== undefined) {
                sets.push('elo = ?');
                vals.push(player.oldRating);
            }
            if (winner) {
                sets.push('wins = wins - 1');
                sets.push('winstreak = ?');
                vals.push(player.winstreak);
            }
            else {
                sets.push('losses = losses - 1');
                sets.push('winstreak = 0');
            }
            if (player.kills) {
                sets.push('kills = GREATEST(0, kills - ?)');
                vals.push(player.kills);
            }
            if (player.deaths) {
                sets.push('deaths = GREATEST(0, deaths - ?)');
                vals.push(player.deaths);
            }
            sets.push('bedstreak = ?');
            vals.push(player.bedstreak);
            if (player.destroyedBed) {
                sets.push('beds_lost = GREATEST(0, beds_lost - 1)');
            }
            sets.push('games = GREATEST(0, games - 1)');
            if (sets.length > 0) {
                vals.push(player.discord);
                await (0, database_1.query)(`UPDATE players SET ${sets.join(', ')} WHERE discord_id = ?`, vals);
            }
        }
    }
    return { success: true };
}
function delay(delay) {
    return new Promise(r => setTimeout(r, delay, true));
}
function findOpenCategory(categories) {
    return new Promise(res => {
        const cat = categories.find(cat => cat.children.size <= 20);
        if (cat)
            return res(cat);
        const checker = setInterval(() => {
            const cat = categories.find(cat => cat.children.size <= 20);
            if (cat) {
                clearInterval(checker);
                return res(cat);
            }
        }, 5000);
    });
}
async function checkStatus(username) {
    let bool = false;
    await hypixel.getPlayer(username).then((player) => {
        console.log(`isOnline --> ${player.isOnline}`);
        bool = player.isOnline;
    }).catch((e) => {
        console.error('ASD', e);
    });
    return bool;
}
function toEscapedFormat(str) {
    return str.replace(/_/g, "\\_");
}
