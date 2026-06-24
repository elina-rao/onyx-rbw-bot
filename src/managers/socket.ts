import { Collection, MessageEmbed, TextChannel } from "discord.js";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { Constants } from "../constants";
import Logger from "../logger";
import type { SocketAPI } from "../typings/socket";
import { activeGames, BotManager, Game, gameReport, calculateElo, Players, getDivision, delay } from "../utils";
import { GameState } from "../typings/games";
import { defaultGuild } from "./bot";
import database, { query } from "./database";

export const bots = new Collection<string, Socket>();

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

const logger = new Logger("Socket Manager");
export const devLogger = new Logger("Socket Manager (Dev)");

export { logger as socketManagerLogger };

const { SOCKET_KEY, NODE_ENV } = process.env;

if(!SOCKET_KEY){
  logger.error("Required environment variable SOCKET_KEY is not defined.");
  process.exit(1);
}

if(NODE_ENV === "development") devLogger.warn("Additional logging enabled because the app is running in development mode. Remember to set NODE_ENV to production on release.");

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const server = createServer();
const io = new Server(server);

io.on('connection', socket => {
  const { key, bot } = socket.handshake.query as SocketAPI.Query;

  if (SOCKET_KEY !== key){
    if (NODE_ENV === "development") devLogger.warn("Refusing connection from socket using an invalid key.");
    return socket.disconnect();
  }

  if (bots.get(bot) && NODE_ENV === "development") {
    socket.disconnect();
    return devLogger.info(`${bot} has connected, but is already in the socket cache.`);
  }

  bots.set(bot, socket);
  if(NODE_ENV === "development") devLogger.info(`${bot} has connected successfully.`);

  socket.on("reconnect", () => {
    if(NODE_ENV === "development") devLogger.info(`${bot} has reconnected.`);
    bots.set(bot, socket);
  });

  socket.on("disconnect", () => {
    if(NODE_ENV === "development") devLogger.info(`${bot} has disconnected.`);
    bots.delete(bot);
  });

  socket.on("gameFinish", async (resultsObject: any) => {
    const gameRow = await query<any[]>('SELECT * FROM games WHERE game_number = ? LIMIT 1', [resultsObject.number]);
    const game = gameRow.length > 0 ? gameRow[0] : null;

    const results: any = Object.values(resultsObject.players);
    const discordIds = results.map((r: any) => r.discord).filter((id: string) => id);
    const players = new Collection<string, any>();

    if(discordIds.length > 0){
      const placeholders = discordIds.map(() => '?').join(',');
      const rows = await query<any[]>(`SELECT * FROM players WHERE discord_id IN (${placeholders})`, discordIds);
      rows.forEach(row => players.set(row.discord_id, row));
    }

    const calculations = Object.values(resultsObject.players).map((p: any) => {
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

    const winner = results.find((p: any) => p.wins > 0)?.team ?? '§a';
    const [ ratings ] = calculateElo(calculations, winner);

    const guild = await defaultGuild;
    const teams: any = {};

    const statistics = Object.values(resultsObject.players).map((p: any) => {
      const player = players.get(p.discord) ?? {};
      const rating = ratings[p.minecraft.name] ?? 400;

      const updated: any = {
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

      if(p.losses) updated.losestreak = (player?.losestreak || 0) + 1;
      else updated.losestreak = 0;
      if(p.wins) updated.wins = (player?.wins || 0) + 1;
      else updated.wins = player?.wins || 0;
      if(p.losses) updated.losses = (player?.losses || 0) + 1;
      else updated.losses = player?.losses || 0;

      updated.elo = Math.max(0, rating);

      guild.members.fetch(p.discord)
        .then(m => m.setNickname(`[${updated.elo}] ${p.minecraft.name}`))
        .catch(() => {});

      if (p.team) {
        const entry: any = {
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
        if (!teams[p.team]) teams[p.team] = { players: [ entry ], winner: (p.wins ?? 0) > 0 };
        else teams[p.team].players.push(entry);
      }

      return updated;
    }).filter((s: any) => s !== null);

    // Batch update players
    for (const player of statistics) {
      if(!player.discord_id) continue;
      await query(`UPDATE players SET 
        wins = ?, losses = ?, kills = ?, deaths = ?, beds_broken = ?, beds_lost = ?,
        winstreak = ?, bedstreak = ?, games = ?, elo = ?, minecraft_uuid = ?, minecraft_name = ?
        WHERE discord_id = ?`, [
        player.wins || 0, player.losses || 0, player.kills || 0, player.deaths || 0,
        player.beds_broken || 0, player.beds_lost || 0,
        player.winstreak || 0, player.bedstreak || 0, player.games || 0, player.elo || 400,
        player.minecraft_uuid || '', player.minecraft_name || '',
        player.discord_id
      ]);
    }

    const teamColours = Object.keys(teams);

    await Promise.all([
      gameReport(teams, winner, resultsObject.number, results.map((r: any) => `<@${r.discord}>`).join(''), colourMap, guild),
      query(`UPDATE games SET state = ?, team1 = ?, team2 = ? WHERE game_number = ?`, [
        GameState.FINISHED,
        JSON.stringify(teams[teamColours[0]] || {}),
        JSON.stringify(teams[teamColours[1]] || {}),
        resultsObject.number
      ])
    ]);

    for (const colour in teams) {
      for (const player of teams[colour].players) {
        if (!player.discord || player.oldRating === undefined || player.newRating === undefined) continue;
        const oldDiv = getDivision(player.oldRating);
        const newDiv = getDivision(player.newRating);
        if (oldDiv.name !== newDiv.name) {
          const textChannel = guild.channels.cache.get(game?.text_channel_id) as TextChannel;
          if (textChannel) {
            const promoted = player.newRating > player.oldRating;
            textChannel.send(new MessageEmbed()
              .setTitle(promoted ? 'Promotion!' : 'Demotion')
              .setColor(promoted ? '#d4a017' : '#FF0000')
              .setDescription(`<@${player.discord}>: **${oldDiv.name}** → **${newDiv.name}**`)
              .setFooter('© Onyx RBW', Constants.BRANDING_URL)
            ).catch(() => null);
          }
        }
      }
    }

    BotManager.release(bot);

    setTimeout(async () => {
      if(!game) return;
      const teamOneVoice = guild.channels.cache.get(game.team1_channel_id);
      const teamTwoVoice = guild.channels.cache.get(game.team2_channel_id);
      const textChannel = guild.channels.cache.get(game.text_channel_id);

      if (textChannel) textChannel.delete();
      if (teamOneVoice) {
        await Promise.allSettled(teamOneVoice.members.map((m: any) => m.voice.setChannel(Constants.WAITING_ROOM)));
        await teamOneVoice.delete().catch(() => {});
      }
      if (teamTwoVoice) {
        await Promise.allSettled(teamTwoVoice.members.map((m: any) => m.voice.setChannel(Constants.WAITING_ROOM)));
        await teamTwoVoice.delete().catch(() => {});
      }
    }, 10000);

    await query('DELETE FROM games WHERE game_number = ?', [resultsObject.number]);
    logger.info(`Successfully finished game ${resultsObject.number} (managed by ${bot}).`);
  });

  socket.on("alertStaff", async (nickIGN: string, gamePlayers: any[]) => {
    try {
      const alertChannelId = '801294842914930698';
      ((await defaultGuild).channels.cache.get(alertChannelId) as TextChannel).send(`**Nick Exploit Detected:** Nick --> ${nickIGN} Players --> ${gamePlayers}`);
    } catch {
      logger.info(`Failed to send player info. Nick --> ${nickIGN} Players --> ${gamePlayers}`);
    }
  });

  socket.on('playerStrike', async ({ id, strikes, reason }: { id: string, strikes: number, reason: string }) => {
    const channel = (await defaultGuild).channels.cache.get(Constants.STRIKE_UNSTRIKE.AUTOSTRIKE_RESPONSE_CHANNEL) as TextChannel;
    channel.send(`<@${id}> Held banned item`);

    if (reason === 'afk') {
      const strike = (await defaultGuild).channels.cache.get(Constants.STRIKE_UNSTRIKE.CHANNELS[0]) as TextChannel;
      strike.send(`=strike <@${id}> 1 AFK during game`);
    }
  });

  socket.on('playerBan', async ({ id }: { id: string }) => {
    const channel = (await defaultGuild).channels.cache.get(Constants.COMMANDS_CHANNEL) as TextChannel;
    const strike = (await defaultGuild).channels.cache.get(Constants.STRIKE_UNSTRIKE.CHANNELS[0]) as TextChannel;
    channel.send(`<@${id}> Used banned item`);
    strike.send(`=strike <@${id}> 1 Used banned item`);
  });

  socket.on("ActualGameStart", async (uuids: string[]) => {
    const new_players = (await Players.getManyByMinecraft(uuids)).array();
    if(process.env.NODE_ENV === "development") devLogger.info(`Received gameStart: ${JSON.stringify(new_players)}`);
    const _game = await BotManager.getAssignedGame(bot);
    if(!_game) return logger.warn(`Received ActualGameStart event from bot ${bot} that is not currently bound to a game. Ignoring invocation.`);

    const game = activeGames.get(_game);
    if(!game || game.state === GameState.VOID) return logger.warn(`Received ActualGameStart event from bot ${bot} that is not currently bound to game ${_game} that does not exist. Ignoring invocation.`);

    const socket = bots.get(bot);
    if(socket) socket.emit("actualgamestart", new_players);
  });
});

server.listen(port, () => {
  logger.info(`Now listening on port ${port}.`);
});

export default io;
