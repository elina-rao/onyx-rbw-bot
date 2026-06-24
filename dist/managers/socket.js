"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketManagerLogger = exports.devLogger = exports.bots = void 0;
const discord_js_1 = require("discord.js");
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const constants_1 = require("../constants");
const logger_1 = __importDefault(require("../logger"));
const utils_1 = require("../utils");
const games_1 = require("../typings/games");
const bot_1 = require("./bot");
const database_1 = require("./database");
exports.bots = new discord_js_1.Collection();
const colourMap = new Map([
    ['§a', 'Green'], ['Green', '§a'],
    ['§b', 'Aqua'], ['Aqua', '§b'],
    ['§c', 'Red'], ['Red', '§c'],
    ['§d', 'Pink'], ['Pink', '§d'],
    ['§e', 'Yellow'], ['Yellow', '§e'],
    ['§f', 'White'], ['White', '§f'],
    ['§8', 'Gray'], ['Gray', '§8'],
    ['§9', 'Blue'], ['Blue', '§9']
]);
const logger = new logger_1.default("Socket Manager");
exports.socketManagerLogger = logger;
exports.devLogger = new logger_1.default("Socket Manager (Dev)");
const { SOCKET_KEY, NODE_ENV } = process.env;
if (!SOCKET_KEY) {
    logger.error("Required environment variable SOCKET_KEY is not defined.");
    process.exit(1);
}
if (NODE_ENV === "development")
    exports.devLogger.warn("Additional logging enabled because the app is running in development mode. Remember to set NODE_ENV to production on release.");
const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const server = (0, http_1.createServer)();
const io = new socket_io_1.Server(server, { allowEIO3: true });
io.on('connection', socket => {
    const { key, bot } = socket.handshake.query;
    if (SOCKET_KEY !== key) {
        if (NODE_ENV === "development")
            exports.devLogger.warn("Refusing connection from socket using an invalid key.");
        return socket.disconnect();
    }
    if (exports.bots.get(bot) && NODE_ENV === "development") {
        socket.disconnect();
        return exports.devLogger.info(`${bot} has connected, but is already in the socket cache.`);
    }
    exports.bots.set(bot, socket);
    if (NODE_ENV === "development")
        exports.devLogger.info(`${bot} has connected successfully.`);
    socket.on("reconnect", () => {
        if (NODE_ENV === "development")
            exports.devLogger.info(`${bot} has reconnected.`);
        exports.bots.set(bot, socket);
    });
    socket.on("disconnect", () => {
        if (NODE_ENV === "development")
            exports.devLogger.info(`${bot} has disconnected.`);
        exports.bots.delete(bot);
    });
    socket.on("gameFinish", async (resultsObject) => {
        const gameRow = await (0, database_1.query)('SELECT * FROM games WHERE game_number = ? LIMIT 1', [resultsObject.number]);
        const game = gameRow.length > 0 ? gameRow[0] : null;
        const results = Object.values(resultsObject.players);
        const discordIds = results.map((r) => r.discord).filter((id) => id);
        const players = new discord_js_1.Collection();
        if (discordIds.length > 0) {
            const placeholders = discordIds.map(() => '?').join(',');
            const rows = await (0, database_1.query)(`SELECT * FROM players WHERE discord_id IN (${placeholders})`, discordIds);
            rows.forEach(row => players.set(row.discord_id, row));
        }
        const calculations = Object.values(resultsObject.players).map((p) => {
            const user = players.get(p.discord);
            return {
                minecraft: { name: p.minecraft.name },
                elo: user?.elo ?? 400,
                kills: p.kills || 0,
                wins: p.wins || 0,
                winstreak: user?.winstreak || 0,
                bedstreak: user?.bedstreak || 0,
                games: user?.games || 0,
                team: p.team
            };
        });
        const winner = results.find((p) => p.wins > 0)?.team ?? '§a';
        const [ratings] = (0, utils_1.calculateElo)(calculations, winner);
        const guild = await bot_1.defaultGuild;
        const teams = {};
        const statistics = Object.values(resultsObject.players).map((p) => {
            const player = players.get(p.discord) ?? {};
            const rating = ratings[p.minecraft.name] ?? 400;
            const updated = {
                discord_id: player.discord_id || p.discord,
                minecraft_uuid: player.minecraft_uuid || p.minecraft.uuid,
                minecraft_name: player.minecraft_name || p.minecraft.name,
                bedstreak: p.bedsBroken ? (player?.bedstreak ?? 0) + 1 : 0,
                winstreak: p.wins ? (player?.winstreak ?? 0) + 1 : 0,
                kills: (player?.kills || 0) + (p.kills || 0),
                deaths: (player?.deaths || 0) + (p.deaths || 0),
                beds_lost: (player?.beds_lost || 0) + (p.bedsLost || 0),
                beds_broken: (player?.beds_broken || 0) + (p.bedsBroken || 0),
                games: (player?.games || 0) + 1
            };
            if (p.losses)
                updated.losestreak = (player?.losestreak || 0) + 1;
            else
                updated.losestreak = 0;
            if (p.wins)
                updated.wins = (player?.wins || 0) + 1;
            else
                updated.wins = player?.wins || 0;
            if (p.losses)
                updated.losses = (player?.losses || 0) + 1;
            else
                updated.losses = player?.losses || 0;
            updated.elo = Math.max(0, rating);
            guild.members.fetch(p.discord)
                .then(m => m.setNickname(`[${updated.elo}] ${p.minecraft.name}`))
                .catch(() => { });
            if (p.team) {
                const entry = {
                    kills: p.kills || 0,
                    deaths: p.deaths || 0,
                    destroyedBed: (p.bedsLost ?? 0) > 0,
                    username: p.minecraft.name,
                    winstreak: (player?.winstreak || 0),
                    bedstreak: (player?.bedstreak || 0),
                    discord: p?.discord || player?.discord_id || null,
                    oldRating: player?.elo || 400,
                    newRating: updated.elo
                };
                if (!teams[p.team])
                    teams[p.team] = { players: [entry], winner: (p.wins ?? 0) > 0 };
                else
                    teams[p.team].players.push(entry);
            }
            return updated;
        }).filter((s) => s !== null);
        for (const player of statistics) {
            if (!player.discord_id)
                continue;
            await (0, database_1.query)(`UPDATE players SET 
        wins = ?, losses = ?, kills = ?, deaths = ?, beds_broken = ?, beds_lost = ?,
        winstreak = ?, losestreak = ?, bedstreak = ?, games = ?, elo = ?, minecraft_uuid = ?, minecraft_name = ?
        WHERE discord_id = ?`, [
                player.wins || 0, player.losses || 0, player.kills || 0, player.deaths || 0,
                player.beds_broken || 0, player.beds_lost || 0,
                player.winstreak || 0, player.losestreak || 0, player.bedstreak || 0, player.games || 0, player.elo || 400,
                player.minecraft_uuid || '', player.minecraft_name || '',
                player.discord_id
            ]);
        }
        const teamColours = Object.keys(teams);
        await Promise.all([
            (0, utils_1.gameReport)(teams, winner, resultsObject.number, results.map((r) => `<@${r.discord}>`).join(''), colourMap, guild),
            (0, database_1.query)(`UPDATE games SET state = ?, team1 = ?, team2 = ? WHERE game_number = ?`, [
                games_1.GameState.FINISHED,
                JSON.stringify(teams[teamColours[0]] || {}),
                JSON.stringify(teams[teamColours[1]] || {}),
                resultsObject.number
            ])
        ]);
        for (const colour in teams) {
            for (const player of teams[colour].players) {
                if (!player.discord || player.oldRating === undefined || player.newRating === undefined)
                    continue;
                const oldDiv = (0, utils_1.getDivision)(player.oldRating);
                const newDiv = (0, utils_1.getDivision)(player.newRating);
                if (oldDiv.name !== newDiv.name) {
                    const textChannel = guild.channels.cache.get(game?.text_channel_id);
                    if (textChannel) {
                        const promoted = player.newRating > player.oldRating;
                        textChannel.send(new discord_js_1.MessageEmbed()
                            .setTitle(promoted ? 'Promotion!' : 'Demotion')
                            .setColor(promoted ? '#d4a017' : '#FF0000')
                            .setDescription(`<@${player.discord}>: **${oldDiv.name}** → **${newDiv.name}**`)
                            .setFooter('© Onyx RBW', constants_1.Constants.BRANDING_URL)).catch(() => null);
                    }
                }
            }
        }
        utils_1.BotManager.release(bot);
        setTimeout(async () => {
            if (!game)
                return;
            const teamOneVoice = guild.channels.cache.get(game.team1_channel_id);
            const teamTwoVoice = guild.channels.cache.get(game.team2_channel_id);
            const textChannel = guild.channels.cache.get(game.text_channel_id);
            if (textChannel)
                textChannel.delete();
            if (teamOneVoice) {
                await Promise.allSettled(teamOneVoice.members.map((m) => m.voice.setChannel(constants_1.Constants.WAITING_ROOM)));
                await teamOneVoice.delete().catch(() => { });
            }
            if (teamTwoVoice) {
                await Promise.allSettled(teamTwoVoice.members.map((m) => m.voice.setChannel(constants_1.Constants.WAITING_ROOM)));
                await teamTwoVoice.delete().catch(() => { });
            }
        }, 10000);
        await (0, database_1.query)('DELETE FROM games WHERE game_number = ?', [resultsObject.number]);
        logger.info(`Successfully finished game ${resultsObject.number} (managed by ${bot}).`);
    });
    socket.on("alertStaff", async (nickIGN, gamePlayers) => {
        try {
            (await bot_1.defaultGuild).channels.cache.get(constants_1.Constants.ALERT_CHANNEL).send(`**Nick Exploit Detected:** Nick --> ${nickIGN} Players --> ${gamePlayers}`);
        }
        catch {
            logger.info(`Failed to send player info. Nick --> ${nickIGN} Players --> ${gamePlayers}`);
        }
    });
    socket.on('playerStrike', async ({ id, strikes, reason }) => {
        const channel = (await bot_1.defaultGuild).channels.cache.get(constants_1.Constants.STRIKE_UNSTRIKE.AUTOSTRIKE_RESPONSE_CHANNEL);
        channel.send(`<@${id}> Held banned item`);
        if (reason === 'afk') {
            const strike = (await bot_1.defaultGuild).channels.cache.get(constants_1.Constants.STRIKE_UNSTRIKE.CHANNELS[0]);
            strike.send(`=strike <@${id}> 1 AFK during game`);
        }
    });
    socket.on('playerBan', async ({ id }) => {
        const channel = (await bot_1.defaultGuild).channels.cache.get(constants_1.Constants.COMMANDS_CHANNEL);
        const strike = (await bot_1.defaultGuild).channels.cache.get(constants_1.Constants.STRIKE_UNSTRIKE.CHANNELS[0]);
        channel.send(`<@${id}> Used banned item`);
        strike.send(`=strike <@${id}> 1 Used banned item`);
    });
    socket.on("ActualGameStart", async (uuids) => {
        const new_players = (await utils_1.Players.getManyByMinecraft(uuids)).array();
        if (process.env.NODE_ENV === "development")
            exports.devLogger.info(`Received gameStart: ${JSON.stringify(new_players)}`);
        const _game = await utils_1.BotManager.getAssignedGame(bot);
        if (!_game)
            return logger.warn(`Received ActualGameStart event from bot ${bot} that is not currently bound to a game. Ignoring invocation.`);
        const game = utils_1.activeGames.get(_game);
        if (!game || game.state === games_1.GameState.VOID)
            return logger.warn(`Received ActualGameStart event from bot ${bot} that is not currently bound to game ${_game} that does not exist. Ignoring invocation.`);
        const socket = exports.bots.get(bot);
        if (socket)
            socket.emit("actualgamestart", new_players);
    });
});
server.listen(port, () => {
    logger.info(`Now listening on port ${port}.`);
});
exports.default = io;
