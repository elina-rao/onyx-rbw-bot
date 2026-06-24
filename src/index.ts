import dotenv from "dotenv";
dotenv.config();

import Logger from "./logger";
import createScorecard from './app';

const logger = new Logger("Main");

import { CategoryChannel, Collection, ColorResolvable, Message, MessageEmbed, TextChannel, User } from "discord.js";
import https from "https";
import fetch from "node-fetch";
import bot, { defaultGuild } from "./managers/bot";
import database from "./managers/database";

import type { InteractionPayload } from "./typings/commands";
import { Constants } from "./constants";
import { activeGames, BotManager, createNewGame, delay, findOpenCategory, getBanDuration, hasPerms, Player, Players, toEscapedFormat, gameReport, calculateElo, getDivision, voidGame } from "./utils";
import { GameState, helpCommand, strikeCheck } from "./typings/games";
import { bots } from "./managers/socket";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { SocketAPI } from "./typings/socket";
import { query } from "./managers/database";

dayjs.extend(relativeTime);

let help_cmd_cache: helpCommand[] = [];
const voiceQueueMap = new Collection();

function createEmbed(description?: string, color: ColorResolvable = "#d4a017", footerSuffix = `Watching players!`){
  const embed = new MessageEmbed()
    .setColor(color)
    .setFooter(`© Onyx RBW | ${footerSuffix}`, Constants.BRANDING_URL);
  if(description) embed.setDescription(description);
  return embed;
}

function getRole(p: number) {
  let index = Math.floor(Math.abs(p) / 300);
  index = Math.min(index, Constants.ELO_ROLES.length - 1);
  return Constants.ELO_ROLES[index] ? { id: Constants.ELO_ROLES[index] } : null;
}

type LeaderboardStat = "kills" | "wins" | "bedsBroken" | "elo" | "losses" | "games" | "winstreak";

(async () => {
  const [ client, guild ] = await Promise.all([bot, defaultGuild]).catch(err => {
    logger.error(`Startup failed:\n${err.stack}`);
    return process.exit(1);
  });

  client.on("raw", async (payload: InteractionPayload) => {
    if(payload.t !== "INTERACTION_CREATE") return;
    const logger = new Logger("Command Handler");
    const { token, data, id, member, channel_id } = payload.d;
    const { user } = member;
    const { name: cmd } = data;

    const req = https.request(`${Constants.DISCORD_API_BASE_URL}/interactions/${id}/${token}/callback`, {
      method: "POST",
      headers: { authorization: `Bot ${process.env.TOKEN}`, "Content-Type": "application/json" }
    });

    function respond(message: string | MessageEmbed){
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
        if(Constants.REGISTER_CHANNEL !== channel_id) {
          respond(createEmbed(`<@${user.id}> you cannot register in this channel. Please do /register [IGN] in ${guild.channels.cache.get(Constants.REGISTER_CHANNEL)}`, "RED"));
          break;
        }

        const player = payload.d.data.options[0].value;
        try {
          const mojang = await (await fetch(`https://api.mojang.com/users/profiles/minecraft/${player}`)).text();
          if(!mojang){ respond(createEmbed("Minecraft account not found.", "RED")); break; }
          const d = JSON.parse(mojang);
          if(!d.id){ respond(createEmbed("Minecraft account not found.", "RED")); break; }

            const existing = await Players.getByDiscord(user.id);
          let member = guild.members.cache.get(user.id);
          if(!member) member = await guild.members.fetch(user.id).catch(() => null) as any;
          if(existing){
            await query('UPDATE players SET minecraft_uuid = ?, minecraft_name = ?, registered_at = ? WHERE discord_id = ?', [d.id, d.name, Date.now(), user.id]);
            if(member){
              if(!member.roles.cache.has(Constants.SUPPORT_ROLE_ID))
                await member.setNickname(`[${existing.elo}] ${d.name}`).catch(e => logger.error(`Failed to update nickname:\n${e.stack}`));

              member.roles.cache.forEach(async role => {
                if(Constants.ELO_ROLES.includes(role.id)) await member.roles.remove(role).catch(() => null);
              });
              if(!member.roles.cache.has(Constants.RANKBANNED)){
                const roleId = getRole(existing.elo ?? 400);
                if(roleId) await member.roles.add(roleId.id).catch(() => null);
              }
              await member.roles.remove(Constants.REGISTERED_ROLE).catch(() => null);
              await member.roles.add(Constants.REGISTERED_ROLE).catch(() => null);
              await member.roles.remove(Constants.UNREGISTERED_ROLE).catch(() => null);
            }
            respond(createEmbed(`You have successfully changed your linked Minecraft account to **${toEscapedFormat(d.name)}**.`, "#d4a017"));
          } else {
            await query('INSERT INTO players (discord_id, minecraft_uuid, minecraft_name, registered_at, elo) VALUES (?, ?, ?, ?, 400) ON DUPLICATE KEY UPDATE minecraft_uuid = VALUES(minecraft_uuid), minecraft_name = VALUES(minecraft_name), registered_at = VALUES(registered_at)', [user.id, d.id, d.name, Date.now()]);
            if(member && !member.roles.cache.has(Constants.SUPPORT_ROLE_ID))
              await member.setNickname(`[400] ${d.name}`).catch(e => logger.error(`Failed to update a new member's nickname:\n${e.stack}`));
            respond(createEmbed(`You have successfully registered with the username **${toEscapedFormat(d.name)}**. Welcome to Onyx RBW!`, "#d4a017"));
            if(member){
              member.roles.cache.forEach(async role => {
                if(Constants.ELO_ROLES.includes(role.id)) await member.roles.remove(role).catch(() => null);
              });
              const roleId = getRole(400);
              if(roleId) await member.roles.add(roleId.id).catch(() => null);
              await member.roles.add(Constants.REGISTERED_ROLE).catch(() => null);
              await member.roles.remove(Constants.UNREGISTERED_ROLE).catch(() => null);
            }
          }
        } catch(e: any){
          logger.error(`An error occurred while using the /register command:\nDeclared username: ${player}\n${e.stack}`);
          respond(createEmbed('Something went wrong while registering your account. Please try again later. If the issue persists, please contact a staff member.', "RED"));
        }
        break;
      }

      case "info": {
        const lookup: string = payload.d.data.options[0].value;
        try {
          const player = await Players.getByDiscord(lookup);
          if(!player){ respond(createEmbed(`<@${lookup}> is not a registered Onyx RBW player.`, "RED")); break; }
          const card = await createScorecard(player.minecraft.uuid, player.minecraft.name, 'discord.gg/onyxrbw', '#363942', player);
          respond(new MessageEmbed().attachFiles([{ attachment: card, name: 'profile.png' }]));
        } catch(e: any){
          logger.error(`An error occurred while using the /info command:\nUser: ${lookup}\n${e.stack}`);
          respond(createEmbed("Something went wrong while requesting a player's stats. Please try again later. If the issue persists, please contact a staff member.", "RED"));
        }
        break;
      }

      case "leaderboard": {
        if(Constants.CHAT === channel_id) {
          respond(createEmbed(`<@${user.id}> commands are disabled in this channel.`, "RED"));
          break;
        }
        try {
          let { name, options } = payload.d.data.options[0];
          if(name === "bedsbroken") name = "bedsBroken";
          let page = options ? options[0].value as number : 1;
          const nPerPage = 10;

          const validStats = ['kills','wins','losses','bedsBroken','bedsLost','games','winstreak','losestreak','elo','deaths'];
          const useAgg = ['wl','kd','bblr'];
          let orderCol = name;
          if(useAgg.includes(name)) orderCol = name === 'wl' ? 'wins' : name === 'kd' ? 'kills' : 'beds_broken';

          const totalRows = await query<any[]>('SELECT COUNT(*) as cnt FROM players');
          const total = totalRows[0].cnt;

          if(total < 1){
            respond(createEmbed("There's no players on this leaderboard yet. Play now, and claim a top spot!", "RED"));
            break;
          }

          let prettyName = name;
          const names: any = {
            kills: "Top Kills", elo: "Top ELO", wins: "Top Wins", losses: "Top Losses",
            bedsBroken: "Most Beds Broken", games: "Most Games Played", wl: "Highest W/L",
            kd: "Highest K/D", bblr: "Highest BBLR", losestreak: "Highest Losestreak",
            deaths: "Most Deaths", bedsLost: "Most Beds Lost"
          };
          prettyName = names[name] || name;

          const pages = Math.ceil(total / nPerPage);
          if(page > pages) page = pages;
          const offset = (page - 1) * nPerPage;

          let rows: any[];
          if(useAgg.includes(name)){
            rows = await query<any[]>(`SELECT *, (${name === 'wl' ? 'wins' : name === 'kd' ? 'kills' : 'beds_broken'} / NULLIF(${name === 'wl' ? 'losses' : name === 'kd' ? 'deaths' : 'losses'}, 0)) as computed FROM players ORDER BY computed DESC LIMIT ? OFFSET ?`, [nPerPage, offset]);
          } else {
            const dbCol = name.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
            rows = await query<any[]>(`SELECT * FROM players ORDER BY ${dbCol} DESC LIMIT ? OFFSET ?`, [nPerPage, offset]);
          }

          respond(createEmbed(rows.map((row: any, i: number) => {
            const roleId = getRole(row.elo ?? 400);
            const roleIndex = roleId ? Constants.ELO_ROLES.indexOf(roleId.id) : 0;
            return `\n\`#${i + 1 + offset}\` ${Constants.ELO_EMOJIS[roleIndex] || ''} **${toEscapedFormat(row.minecraft_name)}** : ${useAgg.includes(name) ? (row.computed?.toFixed?.(1) ?? 0) : (row[name === 'bedsBroken' ? 'beds_broken' : name === 'bedsLost' ? 'beds_lost' : name] ?? 0)}`;
          }).join(""), "#d4a017").setTitle(`${prettyName} | Page ${page}/${pages}`));
        } catch(e: any){
          logger.error(`An error occurred while using the /leaderboard command:\n${e.stack}`);
          respond(createEmbed("Something went wrong while requesting the leaderboard. Please try again later. If the issue persists, please contact a staff member.", "RED"));
        }
      }
    }
  });

  client.on('ready', async () => {
    await guild.members.fetch().catch(() => null);
  });

  client.on("voiceStateUpdate", async (oldState, newState) => {
    if (oldState.channelID === newState.channelID) return;

    if (oldState.channelID && (oldState.channel?.members?.size ?? 0) - 1 < (oldState.channel?.userLimit ?? 0) && Constants.QUEUES_ARRAY.flat().includes(oldState.channelID ?? '')) {
      return await strikeEmbed(newState.id, oldState.channelID);
    }

    if (!newState.channelID || !newState.channel || !Constants.QUEUES_ARRAY.flat().includes(newState.channelID ?? '')
        || newState.channel.members.size !== newState.channel.userLimit) return;

    const gameMembers = [...newState.channel!.members.array()];
    const ids = gameMembers.map(mem => mem.id);

    try {
      const queueChannel = newState.channel;
      const { game } = await createNewGame();
      const { textChannel } = await game.createChannels(gameMembers, queueChannel);

      const strike: strikeCheck = {
        members: ids,
        timeOfLastPick: Date.now(),
        textChannelID: textChannel.id,
        voiceChannelID: newState.channelID,
        pickingOver: false,
      };
      voiceQueueMap.set(newState.channelID, strike);

      const { gameNumber, logger: gameLogger, id: insertedId } = game;

      const index = Constants.QUEUES_ARRAY.findIndex(q => q.includes(queueChannel.id));
      const textCategory = await findOpenCategory(Constants.CATEGORY_ARRAY[index].map(cat => guild.channels.cache.get(cat) as CategoryChannel));
      const teamCallCategory = await findOpenCategory(Constants.TEAM_CALLS.map(cat => guild.channels.cache.get(cat) as CategoryChannel));

      if(!(textCategory && teamCallCategory)) {
        return gameLogger.warn('No category assigned.');
      }

      await Promise.all([
        textChannel.overwritePermissions(gameMembers.map<any>(member => ({
          id: member.id,
          allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"],
        })).concat({
          id: guild.id,
          deny: ["VIEW_CHANNEL"]
        })),
      ]).catch(() => null);

      const [message, players] = await Promise.all<any>([
        textChannel.send(gameMembers.join("")),
        Players.getManyByDiscord(gameMembers.map(({ id }) => id)),
        query('UPDATE games SET voice_channel_id = ?, text_channel_id = ? WHERE id = ?', [queueChannel.id, textChannel.id, insertedId]),
      ]) as [Message, Collection<string, Player>];

      const unregistered = gameMembers.filter(mem => !players.map(p => p.discord).includes(mem.id));
      let unreg = unregistered.length > 0 ? unregistered.join(' ') : '';

      if (8 !== players.size) {
        voiceQueueMap.delete(newState.channelID);
        let msg = `${unreg} **unregistered player(s)** are in your queue. Please make sure to register in ${guild.channels.cache.get(Constants.REGISTER_CHANNEL)} before queuing.\n\n**NOTE:** Please ensure that no unregistered/ingame player exists in the queue and that queues are currently open.`;
        if(gameMembers.length < 8) msg = `The **queues are not open** right now. Please be patient. Thank you! `;
        message.channel.send(msg);
        return setTimeout(() => game.cancel(true), 10000);
      }

      const asArray = [...players.values()];
      const [ cap1 ] = asArray.splice(Math.floor(Math.random() * asArray.length), 1);
      const [ cap2 ] = asArray.splice(Math.floor(Math.random() * asArray.length), 1);
      const team1: Player[] = [cap1];
      const team2: Player[] = [cap2];
      let firstPick = true;

      while(asArray.length !== 0) {
        if(game.state === GameState.VOID) break;
        if(asArray.length === 1) {
          team2.push(asArray.shift()!);
          textChannel.send(createEmbed(undefined, "#00FFFF", `Team Picking for Game #${gameNumber}`)
            .addFields(
              { name: 'Team 1', value: `\`•\`Captain: <@${cap1.discord}>\n${team1.slice(1).map(({ discord }) => `\`•\` <@${discord}>`).join("\n")}` },
              { name: 'Team 2', value: `\`•\`Captain: <@${cap2.discord}>\n${team2.slice(1).map(({ discord }) => `\`•\` <@${discord}>`).join("\n")}` },
            ));
          continue;
        }
        textChannel.send(createEmbed(undefined, "#00FFFF", `Team Picking for Game #${gameNumber}`)
          .addFields(
            { name: 'Team 1', value: `\`•\`Captain: <@${cap1.discord}>\n${team1.slice(1).map(({ discord }) => `\`•\` <@${discord}>`).join("\n")}` },
            { name: 'Team 2', value: `\`•\`Captain: <@${cap2.discord}>\n${team2.slice(1).map(({ discord }) => `\`•\` <@${discord}>`).join("\n")}` },
            { name: 'Remaining Players', value: asArray.map(({ discord }) => `\`•\` <@${discord}>`).join("\n") }
          ));
        textChannel.send(`<@${firstPick ? cap1.discord : cap2.discord}>`).then(secondPing => secondPing.delete({ timeout: 50 }).catch(() => logger.info("Failed to ping second captain."))).catch(e => logger.error(`Failed to ping captain:\n${e}`));
        textChannel.send(createEmbed(`<@${firstPick ? cap1.discord : cap2.discord}> it is your turn to pick. Use \`=p @user\` to pick one of the remaining players!`, "AQUA", `Team Picking for Game #${gameNumber}`));

        const msg: any = (await textChannel.awaitMessages((message: Message) => {
          const { author, content } = message;
          if(game.state === GameState.VOID) { asArray.splice(0, asArray.length); return false; }
          if(!(content.toLowerCase().startsWith('=pick ') || content.toLowerCase().startsWith('=p ') || content.toLowerCase().startsWith('=P '))) return false;
          if(![cap1.discord, cap2.discord].includes(author.id)){ textChannel.send(createEmbed(`${author} you are not a team captain.`, "RED", `Team Picking for Game #${gameNumber}`)); return false; }
          if((firstPick ? cap2 : cap1).discord === author.id){ textChannel.send(createEmbed(`${author}, it's the other captain's turn to pick right now.`, "RED", `Team Picking for Game #${gameNumber}`)); return false; }
          if(!message.mentions.users.first()) { message.channel.send(createEmbed(`${author}, you have to mention someone to pick them.`, "RED", `Team Picking for Game #${gameNumber}`)); return false; }
          if(!asArray.map(({ discord }) => discord).includes(message.mentions.users.first()!.id)) { message.channel.send(createEmbed(`${author}, you cannot pick a user who is already on a team or isn't in the game.`, "RED", `Team Picking for Game #${gameNumber}`)); return false; }
          return true;
        }, { max: 1 })).first();

        if(!msg) continue;
        const g: any = voiceQueueMap.find((g: any) => g.textChannelID === textChannel.id);
        if(g) g.timeOfLastPick = Date.now();
        const user = msg.mentions.users.first()!;
        const chosen = players.get(user.id)!;
        asArray.splice(asArray.indexOf(chosen), 1);
        (firstPick ? team1 : team2).push(chosen);
        firstPick = !firstPick;
      }

      if(team1.length !== 4 || team2.length !== 4) { voiceQueueMap.delete(newState.channelID); return; }

      const g: any = voiceQueueMap.find((g: any) => g.textChannelID === textChannel.id);
      if(g) g.pickingOver = true;

      const [ tc1, tc2 ] = await Promise.all([
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

      await query('UPDATE games SET team1_channel_id = ?, team2_channel_id = ? WHERE id = ?', [tc1.id, tc2.id, insertedId]);
      await game.enterStartingState();
      await Promise.all([tc1.setParent(teamCallCategory), tc2.setParent(teamCallCategory)]);

      for await (const member of team1.map(p1 => guild.members.cache.get(p1.discord))) {
        await member?.voice.setChannel(tc1.id).catch(() => logger.info('failed to send players to teams'));
        await delay(200);
      }
      for await (const member of team2.map(p2 => guild.members.cache.get(p2.discord))) {
        await member?.voice.setChannel(tc2.id).catch(() => logger.info('failed to send players to teams'));
        await delay(200);
      }
      voiceQueueMap.delete(newState.channelID);

      const map = await game.pickMap();
      if(!map) throw new Error("pickMap returned nothing");

      if(game.state === GameState.VOID){ tc1.delete().catch(() => null); return tc2.delete().catch(() => null); }

      const start = Date.now();
      const loading = await textChannel.send(createEmbed('Looking for an available bot...'));
      const { reason, username: bot } = await game.getAssignedBot();

      if (reason === 'GAME_VOID') {
        await loading.edit(createEmbed('This game is not active. Please re-queue to start a new game.', "RED"));
        tc1.delete().catch(() => null); tc2.delete().catch(() => null);
        await delay(5000);
        return game.cancel(true);
      }

      if (reason === 'NONE_AVAILABLE' || !bot) {
        await loading.edit(createEmbed('The maximum waiting time has been exceeded. No bots are available right now. Please try again later.', "RED"));
        await delay(5000);
        return game.cancel(true);
      }

      const _bot = bots.get(bot);
      if (!_bot) {
        await loading.edit(createEmbed(`Failed to bind to **${bot}** after **${dayjs(start).from(dayjs(), true)}**.`, 'RED'));
        await delay(5000);
        return game.cancel(true);
      }

      const query_socket = (bot ? bots.get(bot) : {})?.handshake?.query as SocketAPI.Query;
      if (bot !== query_socket.bot) {
        await loading.edit(createEmbed(`The socket for this bot (**${bot}**) is actually pointing to **${query_socket.bot}**.`, 'RED'));
        await delay(5000);
        return game.cancel(true);
      }

      await loading.edit(createEmbed(`The bot **${bot}** has been assigned to your game after **${dayjs(start).from(dayjs(), true)}**.`));

      _bot.once('gameCancel', () => {
        try { setTimeout(() => game.cancel(true), 10000); } catch(e) { logger.error(`Bot failed to cancel game:\n${e}`); }
      });

      _bot.emit('gameStart', {
        players: [...team1.map(player => player.toJSON()), ...team2.map(player => player.toJSON())],
        map, number: gameNumber
      });

      game.start(team1, team2);
    } catch(e: any){
      logger.error(`Failed to start a new game:\n${e.stack}`);
    }
  });

  client.on("message", async function(message: any){
    if(!message.guild) return;

    if (message.content === '=help') {
      if(Constants.CHAT === message.channel.id) return message.reply(createEmbed(`${message.author} commands are disabled in this channel.`, "RED"));

      const reactions = ['🛠️', '⚔️', '📋', '⚙️', '🪧', '❌'];
      const embed = new MessageEmbed().setTitle('Onyx RBW Bot Commands').setDescription(`\n**Main Menu:**\n\n${reactions[0]} \`Management\`\n\n${reactions[1]} \`Gameplay\`\n\n${reactions[2]} \`Scoring\`\n\n${reactions[3]} \`Moderation\`\n\n${reactions[4]} \`Leaderboards\``).setFooter('© Onyx RBW | Main Menu', Constants.BRANDING_URL);
      const replied_embed = await message.channel.send(embed);

      for (let i = 0; i < reactions.length; i++) { await replied_embed.react(reactions[i]); }

      const helpCommandObj: helpCommand = { message: replied_embed, user: message.author, timeOfCreation: Date.now() };
      help_cmd_cache.push(helpCommandObj);

      const filtered = [...reactions, '◀️', '▶️'];
      const collector = replied_embed.createReactionCollector((r: any, u: any) => u.id === message.author.id && filtered.includes(r.emoji.name), { idle: 60000 });
      let page = 0, paged = false;

      const embeds: any = [
        new MessageEmbed().setTitle('Management').setDescription(`\n- \`Bot Restart\`\n\`•\` **Usage**: =restart \`@IGN\`\n\`•\` **Description**: *Gets a bot back online.*\n- \`Force Close\`\n\`•\` **Usage**: =forceclose\n\`•\` **Aliases**: =fclose\n\`•\` **Description**: *Force closes a queue.*\n- \`Info Card Background Modifier\`\n\`•\` **Usage**: =setbackground \`@User/User_ID <PNG>\`\n\`•\` **Description**: *Modifies a user's info card background.*\n- \`Info Card Text Modifier\`\n\`•\` **Usage**: =settext \`@User/User_ID <text>\`\n\`•\` **Description**: *Modifies a user's info card text.*`).setFooter('© Onyx RBW | Management Commands | Page 1', Constants.BRANDING_URL),
        new MessageEmbed().setTitle('Gameplay').setDescription(`\n- \`Stats\`\n\`•\` **Usage**: /info \`@User\`\n\`•\` **Aliases**: =info, =i\n\`•\` **Description**: *Shows a user stats.*\n- \`Pick\`\n\`•\` **Usage**: =pick \`@User\`\n\`•\` **Aliases**: =p\n\`•\` **Description**: *Allows captains to pick a remaining player in the queue.*\n- \`Strikes\`\n\`•\` **Usage**: =strikes \`@User/User_ID\`\n\`•\` **Aliases**: =getuser\n\`•\` **Description**: *Displays total strikes and ban duration.*\n- \`Queue Stats\`\n\`•\` **Usage**: =qs\n\`•\` **Aliases**: =queuestats\n\`•\` **Description**: *Displays stats of everyone in the current queue.*`).setFooter('© Onyx RBW | Gameplay Commands | Page 1', Constants.BRANDING_URL),
        new MessageEmbed().setTitle('Scoring').setDescription(`\n- \`Win\`\n\`•\` **Usage**: =win \`@User/User_ID\`\n\`•\` **Aliases**: =w\n\`•\` **Description**: *Manually scores a single win, modifies elo by division-based gain.*\n- \`Loss\`\n\`•\` **Usage**: =loss \`@User/User_ID\`\n\`•\` **Aliases**: =l\n\`•\` **Description**: *Manually scores a single loss, modifies elo by division-based loss.*\n- \`Strike\`\n\`•\` **Usage**: =strike \`@User/User_ID ±[number]\`\n\`•\` **Description**: *Modifies a user's strikes, with division-based elo penalty.*\n- \`Void\`\n\`•\` **Usage**: =void \`GameNumber\`\n\`•\` **Description**: *Voids a game and reverses all stat changes.*\n- \`Modify\`\n\`•\` **Usage**: =modify \`wins|losses|kills|deaths|bedsbroken|bedslost|\n|winstreak|bedstreak @User/User_ID ±[number]\`\n\`•\` **Description**: *Modifies a user's stats.*`).setFooter('© Onyx RBW | Scoring Commands | Page 1', Constants.BRANDING_URL),
        new MessageEmbed().setTitle('Moderation').setDescription(`\n- \`Freeze\`\n\`•\` **Usage**: .ss \`@User/User_ID [Reason]\`\n\`•\` **Description**: *Sends a screenshare request to our team.*\n- \`Ban\`\n\`•\` **Usage**: =ban \`@User/User_ID x(h)/(d) [Reason]\`\n\`•\` **Description**: *Temporarily bans a user.*\n- \`Unban\`\n\`•\` **Usage**: =unban \`@User/User_ID\`\n\`•\` **Description**: *Unbans a user.*`).setFooter('© Onyx RBW | Moderation Commands | Page 1', Constants.BRANDING_URL),
        [new MessageEmbed().setTitle('Leaderboards').setDescription(`- \`Leaderboard Elo\`\n\`•\` **Usage**: /leaderboard elo <page>\n\`•\` **Aliases**: =leaderboard elo, =lb elo \n\`•\` **Description**: *View the players with the current highest ELO.*\n- \`Leaderboard Games\`\n\`•\` **Usage**: /leaderboard games <page>\n\`•\` **Aliases**: =leaderboard games, =lb games\n\`•\` **Description**: *View the players with the most games.*\n- \`Leaderboard Wins\`\n\`•\` **Usage**: /leaderboard wins <page>\n\`•\` **Aliases**: =leaderboard wins, =lb wins\n\`•\` **Description**: *View the players with the most wins.*\n- \`Leaderboard Losses\`\n\`•\` **Usage**: /leaderboard losses <page>\n\`•\` **Aliases**: =leaderboard losses, =lb losses\n\`•\` **Description**: *View the players with the most losses.*\n- \`Leaderboard W/L\`\n\`•\` **Usage**: /leaderboard w/l <page>\n\`•\` **Aliases**: =leaderboard w/l, =lb w/l\n\`•\` **Description**: *View the players with the current highest W/L.*`).setFooter('© Onyx RBW | Leaderboard Commands | Page 1', Constants.BRANDING_URL),
         new MessageEmbed().setTitle('Leaderboards').setDescription(`- \`Leaderboard Kills\`\n\`•\` **Usage**: /leaderboard kills <page>\n\`•\` **Aliases**: =leaderboard kills, =lb kills\n\`•\` **Description**: View the players with the most kills.\n- \`Leaderboard Deaths\`\n\`•\` **Usage**: /leaderboard deaths <page>\n\`•\` **Aliases**: =leaderboard deaths, =lb deaths\n\`•\` **Description**: View the players with the most deaths.\n- \`Leaderboard K/D\`\n\`•\` **Usage**: /leaderboard k/d <page>\n\`•\` **Aliases**: =leaderboard k/d, =lb k/d\n\`•\` **Description**: View the players with the current highest K/D.\n- \`Leaderboard Winstreak\`\n\`•\` **Usage**: /leaderboard winstreak <page>\n\`•\` **Aliases**: =leaderboard winstreak, =lb winstreak\n\`•\` **Description**: View the players with the current highest winstreak.\n- \`Leaderboard Losestreak\`\n\`•\` **Usage**: /leaderboard losestreak <page>\n\`•\` **Aliases**: =leaderboard losestreak, =lb losestreak\n\`•\` **Description**: View the players with the current highest losestreak.`).setFooter('© Onyx RBW | Leaderboard Commands | Page 2', Constants.BRANDING_URL),
         new MessageEmbed().setTitle('Leaderboards').setDescription(`- \`Leaderboard BedsBroken\`\n\`•\` **Usage**: /leaderboard bedsbroken <page>\n\`•\` **Aliases**: =leaderboard bedsbroken, =lb bedbroken, =lb bb\n\`•\` **Description**: View the players with the most beds broken.\n- \`Leaderboard BedsLost\`\n\`•\` **Usage**: /leaderboard bedslost <page>\n\`•\` **Aliases**: =leaderboard bedslost, =lb bedslost, =lb bl\n\`•\` **Description**: View the players with the most beds lost.\n- \`Leaderboard BBLR\`\n\`•\` **Usage**: /leaderboard bblr <page>\n\`•\` **Aliases**: =leaderboard bblr, =lb bblr\n\`•\` **Description**: View the players with the current highest BBLR.`).setFooter('© Onyx RBW | Leaderboard Commands | Page 3', Constants.BRANDING_URL)],
        new MessageEmbed().setTitle('Onyx RBW Bot Commands').setDescription(`\n**Main Menu:**\n\n${reactions[0]} \`Management\`\n\n${reactions[1]} \`Gameplay\`\n\n${reactions[2]} \`Scoring\`\n\n${reactions[3]} \`Moderation\`\n\n${reactions[4]} \`Leaderboards\``).setFooter('© Onyx RBW | Main Menu', Constants.BRANDING_URL)
      ];

      collector.on('collect', async (reaction: any, user: any) => {
        const embed = embeds[reactions.indexOf(reaction.emoji.name)];
        if (Array.isArray(embed)) {
          paged = true;
          await replied_embed.reactions.removeAll();
          for (const emoji of ['▶️', '❌']) { await replied_embed.react(emoji); }
        } else if (embed) {
          if (paged === true) {
            paged = false; page = 0;
            await replied_embed.reactions.removeAll();
            for (const emoji of reactions) { await replied_embed.react(emoji); }
          } else reaction.users.remove(user);
        }

        const index = ['◀️', '▶️'].indexOf(reaction.emoji.name) * 2 - 1;
        if (index >= -1 && paged) {
          const next = Math.min(Math.max(0, page + index), 2);
          if (next === embeds[4].length - 1) replied_embed.reactions.cache.get('▶️')?.remove();
          else if (next === 0) replied_embed.reactions.cache.get('◀️')?.remove();
          else if (page === 0 || page === embeds[4].length - 1) {
            await replied_embed.reactions.removeAll();
            for (const emoji of ['◀️', '▶️', '❌']) { await replied_embed.react(emoji); }
          } else reaction.users.remove(user);
          page = next;
          return replied_embed.edit(embeds[4][page]);
        }
        replied_embed.edit(Array.isArray(embed) ? embed[0] : embed);
      });
    }

    if (message.content.toLowerCase().startsWith('=lb') || message.content.toLowerCase().startsWith('=leaderboard')) {
      const formatName: { [key: string]: string } = {
        kills: 'Top Kills', elo: 'Top Elo', wins: 'Top Wins', losses: 'Top Losses',
        bedsBroken: 'Most Beds Broken', games: 'Most Games Played', wl: 'Highest W/L',
        kd: 'Highest K/D', bblr: 'Highest BBLR', losestreak: 'Highest Losestreak',
        deaths: 'Most Deaths', bedsLost: 'Most Beds Lost'
      };

      let [, name, page = 1 ] = message.content.split(' ');
      const prettyName: string | undefined = formatName[name];
      if (!name) return message.reply(createEmbed(`${message.author}, you did not provide a valid type:\n\n**TYPES**: ${Object.keys(formatName).join(', ')}`, "RED"));

      try {
        const nPerPage = 10;
        const useAgg = ['wl', 'kd', 'bblr'];
        const totalRows = await query<any[]>('SELECT COUNT(*) as cnt FROM players');
        const total = totalRows[0].cnt;

        if(total < 1) return message.channel.send(createEmbed("There's no players on this leaderboard yet. Play now, and claim a top spot!", "RED"));

        const pages = Math.ceil(total / nPerPage);
        if(page > pages) page = pages;
        const offset = (page - 1) * nPerPage;

        let rows: any[];
        if(useAgg.includes(name)){
          const col = name === 'wl' ? 'wins' : name === 'kd' ? 'kills' : 'beds_broken';
          const div = name === 'wl' ? 'losses' : name === 'kd' ? 'deaths' : 'losses';
          rows = await query<any[]>(`SELECT *, (${col} / NULLIF(${div}, 0)) as computed FROM players ORDER BY computed DESC LIMIT ? OFFSET ?`, [nPerPage, offset]);
        } else {
          const dbCol = name.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
          rows = await query<any[]>(`SELECT * FROM players ORDER BY ${dbCol} DESC LIMIT ? OFFSET ?`, [nPerPage, offset]);
        }

        message.channel.send(createEmbed(rows.map((row: any, i: number) => {
          const roleId = getRole(row.elo ?? 400);
          const roleIndex = roleId ? Constants.ELO_ROLES.indexOf(roleId.id) : 0;
          return `\n\`#${i + 1 + offset}\` ${Constants.ELO_EMOJIS[roleIndex] || ''} **${toEscapedFormat(row.minecraft_name)}** : ${useAgg.includes(name) ? (row.computed?.toFixed?.(1) ?? 0) : (row[name === 'bedsBroken' ? 'beds_broken' : name === 'bedsLost' ? 'beds_lost' : name === 'elos' ? 'elo' : name] ?? 0)}`;
        }).join(""), "#d4a017").setTitle(`${prettyName} | Page ${page}/${pages}`));
      } catch(e: any){
        logger.error(`An error occurred while using the =leaderboard command:\n${e.stack}`);
        message.channel.send(createEmbed("Something went wrong while requesting the leaderboard. Please try again later. If the issue persists, please contact a staff member.", "RED"));
      }
    }

    if (message.content.toLowerCase().startsWith('=streakmessage')) {
      const hasPerms = Constants.STRIKE_UNSTRIKE.ROLES.some(r => message.member?.roles.cache.has(r));
      if (!hasPerms) return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW Streak Messages!"));

      const user = message.mentions.users.first();
      if (!user) return message.reply(createEmbed("Invalid User mentioned. Use =streakmessage @User <streak> <message>", "RED"));
      let [ streak, ...content ] = message.content.split(' ').slice(2);
      streak *= 1;
      if (isNaN(streak) || content.length === 0) return message.reply(createEmbed(`Invalid usage. \`=streakmessage @user <streak> <message>\``, "RED"));
      if (streak !== 5 && streak !== 8 && streak !== 10) return message.reply(createEmbed(`Invalid usage. The streak must be either **5**, **8**, or **10**.`, "RED"));

      const player = await Players.getByDiscord(user.id);
      if(!player) return message.reply(createEmbed(`<@${user}> is not a registered Onyx RBW player.`, "RED"));
      const msgs = player.messages;
      msgs[streak] = content.join(' ').slice(0, 250);
      await query('UPDATE players SET messages = ? WHERE id = ?', [JSON.stringify(msgs), player.id]);
      return message.reply(`${user.tag}'s streak message at ${streak} kills has been changed.`);
    }

    if (message.content.toLowerCase().startsWith('=winmessage')) {
      const hasPerms = Constants.STRIKE_UNSTRIKE.ROLES.some(r => message.member?.roles.cache.has(r));
      if (!hasPerms) return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW Streak Messages!"));
      const user = message.mentions.users.first();
      if (!user) return message.reply(createEmbed("Invalid User mentioned. Use =winmessage @User <message>", "RED"));
      const content = message.content.split(' ').slice(2).join(' ');
      if (!content) return message.reply(createEmbed(`Invalid usage. \`=winmessage @user <message>\``, "RED"));
      const player = await Players.getByDiscord(user.id);
      if(!player) return message.reply(createEmbed(`<@${user}> is not a registered Onyx RBW player.`, "RED"));
      await query('UPDATE players SET win_message = ? WHERE id = ?', [content.slice(0, 250), player.id]);
      return message.reply(`${user.tag}'s win message has been changed.`);
    }

    if (message.content.toLowerCase().startsWith('=losemessage')) {
      const hasPerms = Constants.STRIKE_UNSTRIKE.ROLES.some(r => message.member?.roles.cache.has(r));
      if (!hasPerms) return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW Streak Messages!"));
      const user = message.mentions.users.first();
      if (!user) return message.reply(createEmbed("Invalid User mentioned. Use =losemessage @User <message>", "RED"));
      const content = message.content.split(' ').slice(2).join(' ');
      if (!content) return message.reply(createEmbed(`Invalid usage. \`=losemessage @user <message>\``, "RED"));
      const player = await Players.getByDiscord(user.id);
      if(!player) return message.reply(createEmbed(`<@${user}> is not a registered Onyx RBW player.`, "RED"));
      await query('UPDATE players SET lose_message = ? WHERE id = ?', [content.slice(0, 250), player.id]);
      return message.reply(`${user.tag}'s lose message has been changed.`);
    }

    if(message.content.toLowerCase().startsWith('=i') || message.content.toLowerCase().startsWith('=info')) {
      if(Constants.CHAT === message.channel.id) return message.reply(createEmbed(`<@${message.author.id}> commands are disabled in this channel.`, "RED"));
      const msg_arr = message.content.split(' ');
      let user = message.mentions.users.first() || message.author;
      if(!user) { user = client.users.cache.get(msg_arr[1]); if(!user) return message.reply(createEmbed("Invalid User mentioned. Use =info @User/User_ID", "RED")); }

      const lookup: string = user.id;
      try {
        const player = await Players.getByDiscord(lookup);
        if(!player) return message.reply(createEmbed(`<@${lookup}> is not a registered Onyx RBW player.`, "RED"));
        const card = await createScorecard(player.minecraft.uuid, player.minecraft.name, player.info_card_text || 'discord.gg/onyxrbw', player.info_card_background || '#363942', player);
        message.channel.send({ files: [{ attachment: card, name: 'profile.png' }] });
      } catch(e: any){
        logger.error(`An error occurred while using the =info command:\nUser: ${lookup}\n${e.stack}`);
        message.reply(createEmbed("Something went wrong while requesting a player's stats. Please try again later. If the issue persists, please contact a staff member.", "RED"));
      }
      return;
    }

    if(Constants.PMODIFY_VOID.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=modify')) {
      if(!message.member) return;
      if(!(await hasPerms(message.member, Constants.PMODIFY_VOID.ROLES))) return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW!"));

      const users = message.content.split(' ').slice(2, -1).map((id: string) => client.users.cache.get(id)).filter((u: any) => u);
      users.push(...message.mentions.users.array());
      const msg_arr = message.content.split(' ');
      if(msg_arr.length < 4) return message.reply(createEmbed(`Invalid Usage. Please use format \`=modify wins|losses|kills|deaths|bedsbroken|bedslost|winstreak|bedstreak @User/User_ID ±[number]\``, "RED"));
      const option = msg_arr[1].toLowerCase();
      if(![`wins`, `losses`, `kills`, `deaths`, `bedsbroken`, `bedslost`, `winstreak`, `bedstreak`].includes(option)) return message.reply(createEmbed(`Invalid Usage. Please use format \`=modify wins|losses|kills|deaths|bedsbroken|bedslost|winstreak|bedstreak @User/User_ID ±[number]\``, "RED"));
      const num = parseInt(msg_arr[3]);
      if(Number.isNaN(num)) return message.reply(createEmbed(`Number of ${option} must be an Integer or Valid Number.`));

      if(users.length > 0){
        let ids = users.map((user: any) => user!.id);
        const players = (await Players.getManyByDiscord(ids));
        ids = ids.filter((id: any) => players.has(id));

        if(ids.length === 0) return message.reply(createEmbed("No registered players found.", "RED"));
        const placeholders = ids.map(() => '?').join(',');

        const colMap: any = {
          wins: 'wins', losses: 'losses', kills: 'kills', deaths: 'deaths',
          bedsbroken: 'beds_broken', bedslost: 'beds_lost', winstreak: 'winstreak', bedstreak: 'bedstreak'
        };
        const col = colMap[option];
        if(col){
          const sign = num >= 0 ? '+' : '';
          await query(`UPDATE players SET ${col} = ${col} ${sign} ? WHERE discord_id IN (${placeholders})`, [num, ...ids]);
          if(option === 'bedsbroken') await query(`UPDATE players SET elo = elo + ? WHERE discord_id IN (${placeholders})`, [10 * num, ...ids]);
          message.reply(createEmbed(`Successfully modified ${option} by ${num} for ${ids.length} player(s).`));
        }
      }
    }

    if(Constants.BAN_UNBAN.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=ban')) {
      if(!message.member) return;
      if(!(await hasPerms(message.member, Constants.BAN_UNBAN.ROLES))) return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW Ban Hammer!"));
      const msg_arr = message.content.split(' ');
      if(msg_arr.length < 3) return message.reply(createEmbed(`Invalid Usage. Please use format \`=ban @User/User_ID x(h)/(d) [Reason]\``, "RED"));

      const target = message.mentions.users.first() || client.users.cache.get(msg_arr[1]);
      if(!target) return message.reply(createEmbed("Invalid User mentioned. Use =ban @User/User_ID x(h)/(d) [Reason]", "RED"));

      const duration_str = msg_arr[2];
      const match = duration_str.match(/(\d+)(h|d)/);
      if(!match) return message.reply(createEmbed("Invalid duration format. Use x(h) or x(d). Example: =ban @user 3h", "RED"));
      const duration_num = parseInt(match[1]);
      const duration_unit = match[2];
      const duration_ms = duration_unit === 'h' ? duration_num * 3600000 : duration_num * 86400000;

      const reason = msg_arr.slice(3).join(' ') || 'No reason provided.';

      const player = await Players.getByDiscord(target.id);
      if(!player) return message.reply(createEmbed(`${target.tag} is not a registered Onyx RBW player.`, "RED"));
      await player.ban(duration_ms);

      const member = guild.members.cache.get(target.id);
      if(member){
        member.roles.add(Constants.RANKBANNED).catch(() => null);
        await member.setNickname(`[BANNED] ${player.minecraft.name}`).catch(() => null);
      }

      const logChannel = guild.channels.cache.get(Constants.BAN_UNBAN.MANUAL_BAN_RESPONSE_CHANNEL) as TextChannel;
      if(logChannel){
        logChannel.send(createEmbed(`**${message.author.tag}** banned **${target.tag}**\nDuration: ${duration_str}\nReason: ${reason}`, "RED", "Onyx RBW Ban Hammer!"));
      }
      message.reply(createEmbed(`Successfully banned **${target.tag}** for ${duration_str}.`));
    }

    if(Constants.BAN_UNBAN.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=unban')) {
      if(!message.member) return;
      if(!(await hasPerms(message.member, Constants.BAN_UNBAN.ROLES))) return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW Ban Hammer!"));
      const msg_arr = message.content.split(' ');
      if(msg_arr.length < 2) return message.reply(createEmbed(`Invalid Usage. Please use format \`=unban @User/User_ID\``, "RED"));

      const target = message.mentions.users.first() || client.users.cache.get(msg_arr[1]);
      if(!target) return message.reply(createEmbed("Invalid User mentioned. Use =unban @User/User_ID", "RED"));

      const player = await Players.getByDiscord(target.id);
      if(player) await player.unban();

      guild.members.unban(target.id).catch(() => null);
      const member = guild.members.cache.get(target.id);
      if(member){
        member.roles.remove(Constants.RANKBANNED).catch(() => null);
        const row = await query<any[]>('SELECT elo, minecraft_name FROM players WHERE discord_id = ? LIMIT 1', [target.id]);
        if(row.length > 0) await member.setNickname(`[${row[0].elo}] ${row[0].minecraft_name}`).catch(() => null);
      }

      const logChannel = guild.channels.cache.get(Constants.BAN_UNBAN.UNBAN_RESPONSE_CHANNEL) as TextChannel;
      if(logChannel) logChannel.send(createEmbed(`**${message.author.tag}** unbanned **${target.tag}**`, "#d4a017", "Onyx RBW Ban Hammer!"));
      message.reply(createEmbed(`Successfully unbanned **${target.tag}**.`));
    }

    if(Constants.STRIKE_UNSTRIKE.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=strike')) {
      if(!message.member) return;
      if(!(await hasPerms(message.member, Constants.STRIKE_UNSTRIKE.ROLES))) return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW!"));
      const msg_arr = message.content.split(' ');
      if(msg_arr.length < 3) return message.reply(createEmbed(`Invalid Usage. Please use format \`=strike @User/User_ID ±[number]\``, "RED"));

      const target = message.mentions.users.first() || client.users.cache.get(msg_arr[1]);
      if(!target) return message.reply(createEmbed("Invalid User mentioned. Use =strike @User/User_ID ±[number]", "RED"));

      const strikeCount = parseInt(msg_arr[2]);
      if(isNaN(strikeCount)) return message.reply(createEmbed("Invalid strike count. Use =strike @User/User_ID ±[number]", "RED"));

      const player = await Players.getByDiscord(target.id);
      if(!player) return message.reply(createEmbed(`${target.tag} is not a registered Onyx RBW player.`, "RED"));

      const newStrikes = Math.max(0, player.strikes + strikeCount);
      await query('UPDATE players SET strikes = ? WHERE id = ?', [newStrikes, player.id]);
      const newElo = await player.strikeELO(strikeCount > 0 ? 'Strike' : 'Unstrike');

      const member = guild.members.cache.get(target.id);
      if(member) await member.setNickname(`[${newElo}] ${player.minecraft.name}`).catch(() => null);

      if(newStrikes >= 2){
        const duration = getBanDuration(newStrikes - strikeCount, strikeCount);
        if(duration !== '0d'){
          await player.ban(duration.endsWith('d') ? parseInt(duration) * 86400000 : parseInt(duration) * 3600000);
          if(member) member.roles.add(Constants.RANKBANNED).catch(() => null);
        }
      }

      const logChannel = guild.channels.cache.get(Constants.STRIKE_UNSTRIKE.MANUALSTRIKE_RESPONSE_CHANNEL) as TextChannel;
      if(logChannel) logChannel.send(createEmbed(`**${message.author.tag}** modified strikes for **${target.tag}**\nStrikes: ${player.strikes} → ${newStrikes}\nELO: ${player.elo} → ${newElo}`, strikeCount > 0 ? "RED" : "#d4a017", "Onyx RBW!"));
      message.reply(createEmbed(`Strikes modified for **${target.tag}**: ${player.strikes} → ${newStrikes}`));
    }

    if(Constants.FCLOSE_ROLES.some((r: string) => message.member?.roles.cache.has(r)) && (message.content.toLowerCase().startsWith('=fclose') || message.content.toLowerCase().startsWith('=forceclose'))) {
      if(!Constants.QUEUES_ARRAY.flat().length) return message.reply(createEmbed("No queue channels configured.", "RED"));
      for(const qId of Constants.QUEUES_ARRAY.flat()){
        const vc = guild.channels.cache.get(qId) as any;
        if(vc && vc.members && vc.members.size > 0){
          for(const [, member] of vc.members){
            await member.voice.setChannel(null).catch(() => null);
          }
        }
      }
      message.reply(createEmbed("Queue force closed. All players have been removed from queue channels.", "#d4a017"));
    }

    if(Constants.PMODIFY_VOID.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=void')) {
      if(!message.member) return;
      if(!(await hasPerms(message.member, Constants.PMODIFY_VOID.ROLES))) return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW!"));

      const msg_arr = message.content.split(' ');
      if(msg_arr.length < 2) return message.reply(createEmbed(`Invalid Usage. Please use format \`=void GameNumber\``, "RED"));
      const gameNumber = parseInt(msg_arr[1]);
      if(isNaN(gameNumber)) return message.reply(createEmbed("Invalid game number.", "RED"));

      const gameRows = await query<any[]>('SELECT id FROM games WHERE game_number = ? LIMIT 1', [gameNumber]);
      if(gameRows.length === 0) return message.reply(createEmbed(`Game #${gameNumber} not found.`, "RED"));

      const result = await voidGame(gameNumber);
      if (result.error) return message.reply(createEmbed(result.error, "RED"));

      const game = activeGames.get(gameRows[0].id);
      if(game) await game.cancel(true);

      message.reply(createEmbed(`Game #${gameNumber} has been voided and stats reversed.`, "#d4a017"));

      const logChannel = guild.channels.cache.get(Constants.PMODIFY_VOID.VOID_RESPONSE_CHANNEL) as TextChannel;
      if(logChannel) logChannel.send(createEmbed(`**${message.author.tag}** voided Game #${gameNumber}`, "RED", "Onyx RBW!"));
    }

    if(Constants.PMODIFY_VOID.CHANNELS.includes(message.channel.id) && message.content.toLowerCase().startsWith('=pmodify')) {
      if(!message.member) return;
      if(!(await hasPerms(message.member, Constants.PMODIFY_VOID.ROLES))) return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW!"));

      const msg_arr = message.content.split(' ');
      if(msg_arr.length < 4) return message.reply(createEmbed(`Invalid Usage. Please use format \`=pmodify GameNumber @User/User_ID wins|losses ±[value]\``, "RED"));

      const gameNumber = parseInt(msg_arr[1]);
      if(isNaN(gameNumber)) return message.reply(createEmbed("Invalid game number.", "RED"));

      const target = message.mentions.users.first() || client.users.cache.get(msg_arr[2]);
      if(!target) return message.reply(createEmbed("Invalid User mentioned.", "RED"));

      const option = msg_arr[3].toLowerCase();
      if(!['wins','losses','kills','deaths','bedsbroken','bedslost','winstreak','bedstreak','elo'].includes(option)) return message.reply(createEmbed("Invalid option.", "RED"));

      const value = parseInt(msg_arr[4]);
      if(isNaN(value)) return message.reply(createEmbed("Invalid value.", "RED"));

      const player = await Players.getByDiscord(target.id);
      if(!player) return message.reply(createEmbed(`${target.tag} is not a registered Onyx RBW player.`, "RED"));

      const colMap: any = {
        wins: 'wins', losses: 'losses', kills: 'kills', deaths: 'deaths',
        bedsbroken: 'beds_broken', bedslost: 'beds_lost', winstreak: 'winstreak',
        bedstreak: 'bedstreak', elo: 'elo'
      };
      const col = colMap[option];
      const sign = value >= 0 ? '+' : '';
      await query(`UPDATE players SET ${col} = ${col} ${sign} ? WHERE id = ?`, [value, player.id]);
      message.reply(createEmbed(`Modified **${option}** for **${target.tag}** by **${value}**.`, "#d4a017"));
    }

    if(Constants.PMODIFY_VOID.CHANNELS.includes(message.channel.id) && (message.content.toLowerCase().startsWith('=win') || message.content.toLowerCase().startsWith('=loss') || message.content.toLowerCase().startsWith('=w ') || message.content.toLowerCase().startsWith('=l '))) {
      if(!message.member) return;
      if(!(await hasPerms(message.member, Constants.PMODIFY_VOID.ROLES))) return message.channel.send(createEmbed(`${message.author} you do not have the required permissions to run this command.`, "RED", "Onyx RBW!"));

      const users = message.content.split(' ').slice(1).map((id: string) => client.users.cache.get(id)).filter((u: any) => u);
      users.push(...message.mentions.users.array());

      if(users.length === 0) return message.reply(createEmbed("No valid users mentioned.", "RED"));

      let ids = users.map((user: any) => user!.id);
      const players = await Players.getManyByDiscord(ids);
      ids = ids.filter((id: any) => players.has(id));

      if(ids.length === 0) return message.reply(createEmbed("No registered players found.", "RED"));

      const cmd = message.content.split(' ')[0].slice(1).toLowerCase();
      const isWin = cmd === 'win' || cmd === 'w';

      for (const [discordId, player] of players) {
        const div = getDivision(player.elo);
        const delta = isWin ? div.eloWin : -div.eloLoss;
        const newElo = Math.max(0, player.elo + delta);

        const sign = delta >= 0 ? '+' : '';
        await query(`UPDATE players SET elo = elo ${sign} ?, ${isWin ? 'wins = wins + 1' : 'losses = losses + 1'} WHERE id = ?`, [Math.abs(delta), player.id]);

        const member = guild.members.cache.get(discordId);
        if(member && !member.roles.cache.has(Constants.SUPPORT_ROLE_ID)) {
          await member.setNickname(`[${newElo}] ${player.minecraft.name}`).catch(() => null);
        }
      }

      message.reply(createEmbed(`Users → ${ids.map((id: any) => `<@${id}>`).join(' ')} scored successfully.`, "#d4a017"));
      const logChannel = guild.channels.cache.get(Constants.PMODIFY_VOID.PMODIFY_RESPONSE_CHANNEL) as TextChannel;
      if(logChannel){
        const logMsg = ids.map((id: string) => {
          const p = players.get(id);
          if(!p) return '';
          const div = getDivision(p.elo);
          const delta = isWin ? div.eloWin : -div.eloLoss;
          const newElo = Math.max(0, p.elo + delta);
          const oldRole = Constants.ELO_ROLES[Math.floor(p.elo / 300)] || '';
          const newRole = Constants.ELO_ROLES[Math.floor(newElo / 300)] || '';
          return `**${p.minecraft.name}** [\`${p.elo}\` → \`${newElo}\`]${oldRole && newRole && oldRole !== newRole ? ` ${oldRole} → ${newRole}` : ''}`;
        }).filter(Boolean).join('\n');
        logChannel.send(createEmbed(logMsg, isWin ? "#228B22" : "#FF0000", "Onyx RBW!").setTitle('Manual Scoring').addField('Scorer Responsible', `${message.author}`));
      }
    }

    if(message.content.toLowerCase().startsWith('=qs') || message.content.toLowerCase().startsWith('=queuestats')) {
      if(Constants.CHAT === message.channel.id) return message.reply(createEmbed(`${message.author} commands are disabled in this channel.`, "RED"));

      const queueId = Constants.QUEUES_ARRAY.flat()[0];
      if(!queueId) return message.reply(createEmbed("No queue configured.", "RED"));

      const vc = guild.channels.cache.get(queueId) as any;
      if(!vc || !vc.members || vc.members.size === 0) return message.reply(createEmbed("Queue is empty.", "RED"));

      const members = [...vc.members.values()];
      const players = await Players.getManyByDiscord(members.map((m: any) => m.id));

      const embed = createEmbed(undefined, "#00FFFF", "Queue Stats")
        .setTitle("Queue Stats")
        .setDescription(members.map((m: any) => {
          const p = players.get(m.id);
          return `${m} → ${p ? `[${p.elo}] ${p.minecraft.name} | ${p.wins}W/${p.losses}L` : 'Unregistered'}`;
        }).join('\n'));

      message.channel.send(embed);
    }

    if(message.content.toLowerCase().startsWith('=strikes') || message.content.toLowerCase().startsWith('=getuser')) {
      const target = message.mentions.users.first() || message.author;
      const player = await Players.getByDiscord(target.id);
      if(!player) return message.reply(createEmbed(`${target.tag} is not a registered Onyx RBW player.`, "RED"));

      message.channel.send(createEmbed(`**${target.tag}**\nStrikes: ${player.strikes}\nELO: ${player.elo}\nWins: ${player.wins}\nLosses: ${player.losses}\nWinstreak: ${player.winstreak}\nBedstreak: ${player.bedstreak}`, "#00FFFF", "Player Info"));
    }
  });

  // Background ban processing
  setInterval(() => Players.updateBans(), 60000);

  logger.info(`Bot started successfully. Watching ${guild.memberCount} players.`);
})();

async function strikeEmbed(userId: string, channelId: string) {
  // Handled by socket.ts playerStrike event
}
