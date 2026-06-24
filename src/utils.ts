import { CategoryChannel, Collection, GuildMember, MessageEmbed, MessageReaction, TextChannel, User, VoiceChannel } from "discord.js";
import { Constants } from "./constants";
import Logger from "./logger";
import bot, { defaultGuild } from "./managers/bot";
import database, { query } from "./managers/database";
import { Game as _Game, GamePlayer, GameState, Team } from "./typings/games";
import type { Player as _Player } from "./typings/players";
import type { PlayerRow, GameRow, BotRow } from "./typings/database";
import divisions from "./divisions.json";
const { HYPIXEL_KEY } = process.env;
import { bots, devLogger } from "./managers/socket";
const Hypixel = require('hypixel-api-reborn');
const hypixel = new Hypixel.Client(HYPIXEL_KEY);

interface _Map {
  img: string;
  limit: string;
}

const maps_object: { [key: string]: _Map } = {
  "Extinction": {img:"https://media.discordapp.net/attachments/796082875475689506/810012638955175986/extiction-png.png", limit:"+95"},
  "Enchanted": {img:"https://media.discordapp.net/attachments/796082875475689506/810015425155825687/enchanted-png.png", limit:"+100"},
  "Aquarium": {img:"https://cdn.discordapp.com/attachments/799897234128764958/800008639342575667/aquariumold-png.png", limit:"+110"},
  "Katsu": {img:"https://cdn.discordapp.com/attachments/799897234128764958/800010460429942794/NEW-Katsu-bw-3v3v3v3-4v4v4v4.png", limit:"+96"},
  "Invasion": {img:"https://cdn.discordapp.com/attachments/799897234128764958/800014465294008370/image0.jpg", limit:"+115"},
  "Rise": {img:"https://cdn.discordapp.com/attachments/800022796301369344/800024134217629706/rise-png.png", limit:"+96"},
  "Temple": {img:"https://cdn.discordapp.com/attachments/800022796301369344/800023969918746624/templebedwars-png.png", limit:"+106"},
  "Lectus": {img:"https://cdn.discordapp.com/attachments/799897234128764958/800014149232492594/image0.jpg", limit:"+90"},
  "Catalyst": {img:"https://media.discordapp.net/attachments/796082875475689506/811700045085671514/catalyst-png.png", limit:"+101"},
  "Treenan": {img:"https://media.discordapp.net/attachments/796082875475689506/811700135339622430/treenan-png.png", limit:"+121"},
};

export class Player {
  constructor(private data: _Player){};

  get id(){ return this.data.id; }
  get discord(){ return this.data.discord_id; }
  get minecraft(){
    return {
      uuid: this.data.minecraft_uuid || '',
      name: this.data.minecraft_name || '',
    };
  }
  get registeredAt(){ return this.data.registered_at ?? 0; }
  get wins(){ return this.data.wins ?? 0; }
  get losses(){ return this.data.losses ?? 0; }
  get bedsBroken(){ return this.data.beds_broken ?? 0; }
  get bedsLost(){ return this.data.beds_lost ?? 0; }
  get elo(){ return this.data.elo ?? 0; }
  get kills(){ return this.data.kills ?? 0; }
  get deaths(){ return this.data.deaths ?? 0; }
  get roles(){ return this.data.roles ? JSON.parse(this.data.roles) : []; }
  get banExpires(){ return this.data.ban_expires ?? 0; }
  get banned(){ return (this.data.ban_expires ?? 0) < 0 || (this.data.ban_expires ?? 0) >= Date.now(); }
  get strikes(){ return this.data.strikes ?? 0; }
  get games(){ return this.data.games ?? 0; }
  get winstreak(){ return this.data.winstreak ?? 0; }
  get bedstreak(){ return this.data.bedstreak ?? 0; }
  get info_card_background(){ return this.data.info_card_background ?? '#363942'; }
  get info_card_text(){ return this.data.info_card_text ?? 'discord.gg/onyxrbw'; }
  get messages(): { [key: number]: string } { return this.data.messages ? JSON.parse(this.data.messages) : {}; }
  get loseMessage(): string | undefined { return this.data.lose_message; }
  get emoji() { return this.data.emoji; }
  get winMessage(): string | undefined { return this.data.win_message; }

  async update(data: Partial<_Player>){
    const sets: string[] = [];
    const vals: any[] = [];
    for(const [key, value] of Object.entries(data)){
      if(value === undefined) continue;
      const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
      sets.push(`${col} = ?`);
      vals.push(value);
    }
    if(sets.length === 0) return this;
    vals.push(this.id);
    await query(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`, vals);
    return this;
  }

  async ban(duration = -1){
    if(this.banned && ((this.banExpires - Date.now())) + duration < 0){
      await query(`UPDATE players SET ban_expires = 0 WHERE id = ?`, [this.id]);
    } else if(duration === -1){
      await query(`UPDATE players SET ban_expires = -1 WHERE id = ?`, [this.id]);
    } else {
      if(this.banned){
        await query(`UPDATE players SET ban_expires = ban_expires + ? WHERE id = ?`, [duration, this.id]);
      } else {
        await query(`UPDATE players SET ban_expires = ? WHERE id = ?`, [Date.now() + duration, this.id]);
      }
    }
    return this;
  }

  async unban(){
    await query(`UPDATE players SET ban_expires = 0 WHERE id = ?`, [this.id]);
    return this;
  }

  toGamePlayer(): GamePlayer {
    return { username: this.minecraft.name, winstreak: this.winstreak, bedstreak: this.bedstreak, discord: this.discord };
  }

  toJSON(): _Player {
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

  async strikeELO(mode: string) {
    const div = getDivision(this.elo);
    const delta = mode === 'Strike'
      ? -Math.round(div.eloLoss * 0.5)
      : Math.round(div.eloWin * 0.5);
    const newElo = Math.max(0, this.elo + delta);
    await this.update({ elo: newElo });
    return newElo;
  }
}

export namespace Players {
  export async function getById(id: number){
    const rows = await query<PlayerRow[]>('SELECT * FROM players WHERE id = ? LIMIT 1', [id]);
    return rows.length ? new Player(rows[0]) : null;
  }

  export async function getByDiscord(id: string){
    const rows = await query<PlayerRow[]>('SELECT * FROM players WHERE discord_id = ? LIMIT 1', [id]);
    return rows.length ? new Player(rows[0]) : null;
  }

  export async function getByMinecraft(uuid: string){
    const rows = await query<PlayerRow[]>('SELECT * FROM players WHERE minecraft_uuid = ? LIMIT 1', [uuid]);
    return rows.length ? new Player(rows[0]) : null;
  }

  export async function getManyByDiscord(ids: string[]){
    if(ids.length === 0) return new Collection<string, Player>();
    const placeholders = ids.map(() => '?').join(',');
    const rows = await query<PlayerRow[]>(`SELECT * FROM players WHERE discord_id IN (${placeholders})`, ids);
    const players = new Collection<string, Player>();
    rows.forEach(row => players.set(row.discord_id, new Player(row)));
    return players;
  }

  export async function getManyByMinecraft(uuids: string[]){
    if(uuids.length === 0) return new Collection<string, Player>();
    const placeholders = uuids.map(() => '?').join(',');
    const rows = await query<PlayerRow[]>(`SELECT * FROM players WHERE minecraft_uuid IN (${placeholders})`, uuids);
    rows.sort((a, b) => uuids.indexOf(a.minecraft_uuid!) - uuids.indexOf(b.minecraft_uuid!));
    const players = new Collection<string, Player>();
    rows.forEach(row => players.set(row.minecraft_uuid!, new Player(row)));
    return players;
  }

  export async function updateBans(){
    const logger = new Logger("Background Ban Processing");
    try {
      const [guild, client] = await Promise.all([defaultGuild, bot]);
      const now = Date.now();
      const rows = await query<PlayerRow[]>('SELECT * FROM players WHERE ban_expires >= 0 AND ban_expires <= ?', [now]);

      await Promise.all(rows.map(async ({ discord_id }) => {
        guild.members.cache.get(discord_id)?.roles.remove(guild.roles.cache.get(Constants.RANKBANNED)!);
        guild.members.unban(discord_id).catch(() => null);
      }));

      if(rows.length > 0){
        const msg = rows.length === 1 ? 'Player' : 'Players';
        const channel = guild.channels.cache.get(Constants.BAN_UNBAN.UNBAN_RESPONSE_CHANNEL) as TextChannel;
        if(channel){
          channel.send(new MessageEmbed()
            .setTitle('Onyx RBW')
            .setColor("#d4a017")
            .setDescription(`Unbanned ${rows.map(p => client.users.cache.get(p.discord_id)).join(" ")}`)
            .setFooter(`© Onyx RBW | Unbanned → ${rows.length} ${msg} this wave.`, Constants.BRANDING_URL)
          ).catch(() => null);
        }
        logger.info(`Unbanned ${rows.length} ${msg} automatically.`);
      }

      const ids = rows.map(r => r.id);
      if(ids.length > 0){
        const placeholders = ids.map(() => '?').join(',');
        await query(`UPDATE players SET ban_expires = 0 WHERE id IN (${placeholders})`, ids);
      }
    } catch(e: any){
      logger.error(`Failed to execute successfully:\n${e.stack}`);
    }
  }
}

export class Game {
  constructor(private data: _Game){};

  get id(){ return this.data.id; }
  get voiceChannel() { return this.data.voice_channel_id; }
  get textChannel() { return this.data.text_channel_id; }
  get team1() { return this.data.team1 ? JSON.parse(this.data.team1) : undefined; }
  get team2() { return this.data.team2 ? JSON.parse(this.data.team2) : undefined; }

  async update(data: Partial<_Game>){
    const sets: string[] = [];
    const vals: any[] = [];
    for(const [key, value] of Object.entries(data)){
      if(value === undefined) continue;
      const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
      if(typeof value === 'object') {
        sets.push(`${col} = ?`);
        vals.push(JSON.stringify(value));
      } else {
        sets.push(`${col} = ?`);
        vals.push(value);
      }
    }
    if(sets.length === 0) return this;
    vals.push(this.id);
    await query(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`, vals);
    return this;
  }
}

export function getDivision(elo: number) {
  for (const div of divisions.divisions) {
    if (elo >= div.min && (elo < div.max || div.max === -1)) {
      return div;
    }
  }
  return divisions.divisions[divisions.divisions.length - 1];
}

export function calculateElo(players: any[], winner: string) {
  const [ kills, teams ] = players.reduce((a, b) => {
    if (!b) return a;
    b.team = b.team || winner;
    a[0] += b.kills || 0;
    if (!a[1][b.team]) {
      a[1][b.team] = { players: [] };
    }
    a[1][b.team].players.push(b);
    return a;
  }, [ 0, {} ]);

  const colours = Object.keys(teams);
  const isVoid = kills < 2;

  for (const colour in teams) {
    const team = teams[colour];
    team.avgElo = team.players.reduce((a: any, b: any) => a + (b.elo || 400), 0) / team.players.length;
  }

  const loserColours = colours.filter(c => c !== winner);
  const winnerAvg = teams[winner]?.avgElo || 0;
  const loserAvg = loserColours.reduce((a, c) => a + (teams[c]?.avgElo || 0), 0) / (loserColours.length || 1);
  const isBoosted = winnerAvg - loserAvg > 500;

  const ratings = players.reduce((a: any, player) => {
    const isWinner = player.team === winner;
    const div = getDivision(player.elo || 400);
    const games = player.games || 0;
    const isPlacement = games < 5;

    let delta = isWinner ? div.eloWin : (isPlacement ? 0 : -div.eloLoss);

    if (isWinner) {
      const ws = player.winstreak || 0;
      delta += Math.min(ws, 5);
    }

    if (isWinner && isBoosted) delta = Math.min(delta, 1);

    if (isVoid) delta = 0;

    a[player.minecraft.name] = Math.max(0, (player.elo || 400) + delta);
    return a;
  }, {});

  return [ ratings, teams ];
}

export class LocalGame {
  public readonly logger = new Logger(`Game #${this.gameNumber}`);
  private gamePlayers?: string[];
  private _textChannel?: TextChannel;
  private _voiceChannel?: VoiceChannel;
  private _bot?: string;
  private _state = GameState.PRE_GAME;
  private team1?: Team;
  private team2?: Team;
  private team1Players?: Player[];
  private team2Players?: Player[];
  private team1Channel?: VoiceChannel;
  private team2Channel?: VoiceChannel;

  constructor(public readonly gameNumber: number, public readonly id: number){};

  get state(){ return this._state; }
  get textChannel(){ return this._textChannel; }
  get voiceChannel(){ return this._voiceChannel; }
  get teams(): [ Team | undefined, Team | undefined ] { return [ this.team1, this.team2 ]; }
  get teamPlayers(): [ Player[] | undefined, Player[] | undefined ] { return [ this.team1Players, this.team2Players ]; }
  get gameMembers(){ return this.gamePlayers ?? []; }

  async createChannels(members: GuildMember[], vc: VoiceChannel){
    const guild = await defaultGuild;
    const index = Constants.QUEUES_ARRAY.findIndex(q => q.includes(vc.id));
    const textCategory = await findOpenCategory(Constants.CATEGORY_ARRAY[index].map(cat => guild.channels.cache.get(cat)! as CategoryChannel));

    const [ textChannel ] = await Promise.all([
      guild.channels.create(`game-${this.gameNumber}`, {
        type: "text",
        permissionOverwrites: [{ id: (await defaultGuild).id, deny: ["VIEW_CHANNEL"] }],
        parent: textCategory
      })
    ]);
    this._textChannel = textChannel;
    this._voiceChannel = vc;
    this.gamePlayers = members.map(mem => mem.id);
    return { textChannel };
  }

  async end(){
    await Promise.all<any>([
      this.update({
        state: GameState.FINISHED,
        team1: this.team1,
        team2: this.team2,
      }),
      ...this._bot ? [BotManager.release(this._bot)] : [],
    ]);
    this._state = GameState.FINISHED;
    setTimeout(async () => {
      this._textChannel?.delete().catch(() => null);
      if(this.team1Channel){
        await Promise.all(this.team1Channel!.members.map(member => member.voice.setChannel(Constants.WAITING_ROOM))).catch(() => null);
        this.team1Channel?.delete().catch(() => null);
      }
      if(this.team2Channel){
        await Promise.all(this.team2Channel!.members.map(member => member.voice.setChannel(Constants.WAITING_ROOM))).catch(() => null);
        this.team2Channel?.delete().catch(() => null);
      }
    }, 10000);
  }

  async start(team1: Player[], team2: Player[]){
    this.team1 = { players: team1.map(player => player.toGamePlayer()) };
    this.team1Players = team1;
    this.team2 = { players: team2.map(player => player.toGamePlayer()) };
    this.team2Players = team2;
    await this.update({
      state: GameState.ACTIVE,
      team1: this.team1,
      team2: this.team2,
    });
    this._state = GameState.ACTIVE;
  }

  getPlayer(player: string){
    return this.team1?.players.find(({ username }) => username === player) ?? this.team2?.players.find(({ username }) => username === player) ?? null;
  }

  getFullPlayer(player: string){
    return this.team1Players?.find(({ minecraft }) => minecraft.name === player) ?? this.team2Players?.find(({ minecraft }) => minecraft.name === player) ?? null;
  }

  async cancel(deleteChannels: boolean = false) {
    this._state = GameState.VOID;
    try {
      await Promise.all<any>([
        this.update({ state: GameState.VOID }),
        ...this._bot ? [BotManager.release(this._bot)] : [],
      ]);
    } catch(e){
      console.error(`Failed to cancel the game:\n${e}`);
    }

    if (deleteChannels) {
      this._textChannel?.delete().catch(() => null);
      if(this.team1Channel){
        await Promise.all(this.team1Channel!.members.map(member => member.voice.setChannel(Constants.WAITING_ROOM))).catch(() => null);
        this.team1Channel?.delete().catch(() => null);
      }
      if(this.team2Channel){
        await Promise.all(this.team2Channel!.members.map(member => member.voice.setChannel(Constants.WAITING_ROOM))).catch(() => null);
        this.team2Channel?.delete().catch(() => null);
      }
    }
  }

  async enterStartingState(){
    try {
      await this.update({ state: GameState.STARTING });
      this._state = GameState.STARTING;
    } catch(e){
      this.logger.error(`Failed to entering the starting phase:\n${e}`);
    }
  }

  async getAssignedBot(): Promise<{ error: boolean, reason?: string, username?: string }> {
    if (this._state === GameState.VOID) return { error: true, reason: 'GAME_VOID' };
    if (this._bot) return { error: false, username: this._bot };

    const bot = await BotManager.assign(this.id);
    if (bot === null) return { error: true, reason: 'NONE_AVAILABLE' };
    return { error: false, username: this._bot = bot };
  }

  async update(data: Partial<_Game>){
    const sets: string[] = [];
    const vals: any[] = [];
    for(const [key, value] of Object.entries(data)){
      if(value === undefined) continue;
      const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
      if(typeof value === 'object') {
        sets.push(`${col} = ?`);
        vals.push(JSON.stringify(value));
      } else {
        sets.push(`${col} = ?`);
        vals.push(value);
      }
    }
    if(sets.length === 0) return;
    vals.push(this.id);
    await query(`UPDATE games SET ${sets.join(', ')} WHERE id = ?`, vals);
  }

  setTeamChannels(team1: VoiceChannel, team2: VoiceChannel){
    this.team1Channel = team1;
    this.team2Channel = team2;
  }

  pickMap(){
    return new Promise(async (res, rej) => {
      const reject = () => rej(new Error("MESSAGE_DELETED"));
      const playerCount = (this.team1Players?.length ?? 0) + (this.team2Players?.length ?? 0);
      let maps = Object.keys(maps_object), firstMap: string, secondMap: string, pick, rankedlogo = "https://cdn.discordapp.com/attachments/759444475818278942/805517822360027146/rbw_white_logo.jpg";

      firstMap = maps[Math.floor(Math.random() * maps.length)];
      maps = maps.filter(map => map !== firstMap);
      secondMap = maps[Math.floor(Math.random() * maps.length)];

      let [,, m] = await Promise.all([
        this.textChannel!.send(new MessageEmbed().setColor("ORANGE").setTitle(`1️⃣ ${firstMap}`).addField("Build Limit", `Y: ${maps_object[firstMap].limit}`).setImage(maps_object[firstMap].img).setFooter("© Onyx RBW", rankedlogo)),
        this.textChannel!.send(new MessageEmbed().setColor("ORANGE").setTitle(`2️⃣ ${secondMap}`).addField("Build Limit", `Y: ${maps_object[secondMap].limit}`).setImage(maps_object[secondMap].img).setFooter("© Onyx RBW", rankedlogo)),
        this.textChannel!.send(new MessageEmbed().setColor("ORANGE").setTitle("Map Picking").addField(`1️⃣ ${firstMap}`, "\u200b").addField(`2️⃣ ${secondMap}`, "\u200b").addField("♻️ Reroll", "\u200b").setFooter("© Onyx RBW | Map Picking", rankedlogo)),
      ]);

      let reactions = ["1️⃣", "2️⃣", "♻️"];
      await Promise.all(reactions.map(reaction => m.react(reaction).catch(rej)));

      let optionone: User[] = [], optiontwo: User[] = [], optionthree: User[] = [];

      if (m.deleted) return reject();

      let collector = m.createReactionCollector((reaction: MessageReaction) => reactions.includes(reaction.emoji.name), { time: 30000 });

      collector.on('collect', async (reaction, user) => {
        reaction.users.remove(user);
        switch (reaction.emoji.name) {
          case "1️⃣": {
            if (optionone.includes(user)) return;
            optionone.push(user);
            optiontwo = optiontwo.filter(u => u !== user);
            optionthree = optionthree.filter(u => u !== user);
            await m.edit(new MessageEmbed().setColor("ORANGE").setTitle("Map Picking").addField(`1️⃣ ${firstMap}`, "\u200b"+optionone.join("\n")).addField(`2️⃣ ${secondMap}`, "\u200b"+optiontwo.join("\n")).addField("♻️ Reroll", "\u200b"+optionthree.join("\n")).setFooter("© Onyx RBW | Map Picking", rankedlogo));
            break;
          }
          case "2️⃣": {
            if (optiontwo.includes(user)) return;
            optionone = optionone.filter(u => u !== user);
            optiontwo.push(user);
            optionthree = optionthree.filter(u => u !== user);
            await m.edit(new MessageEmbed().setColor("ORANGE").setTitle("Map Picking").addField(`1️⃣ ${firstMap}`, "\u200b"+optionone.join("\n")).addField(`2️⃣ ${secondMap}`, "\u200b"+optiontwo.join("\n")).addField("♻️ Reroll", "\u200b"+optionthree.join("\n")).setFooter("© Onyx RBW | Map Picking", rankedlogo));
            break;
          }
          case "♻️": {
            if (optionthree.includes(user)) return;
            optionone = optionone.filter(u => u !== user);
            optiontwo = optiontwo.filter(u => u !== user);
            optionthree.push(user);
            await m.edit(new MessageEmbed().setColor("ORANGE").setTitle("Map Picking").addField(`1️⃣ ${firstMap}`, "\u200b"+optionone.join("\n")).addField(`2️⃣ ${secondMap}`, "\u200b"+optiontwo.join("\n")).addField("♻️ Reroll", "\u200b"+optionthree.join("\n")).setFooter("© Onyx RBW | Map Picking", rankedlogo));
            break;
          }
        }
      });

      collector.on('end', async () => {
        if (m.deleted) return reject();
        m.reactions.removeAll().catch(err => console.log(err));

        if(optionone.length > optiontwo.length && optionone.length > optionthree.length) pick = firstMap;
        else if (optiontwo.length > optionone.length && optiontwo.length > optionthree.length) pick = secondMap;
        else pick = null;

        if (pick) {
          await m.edit(new MessageEmbed().setColor("ORANGE").setTitle("Map Picking").setDescription(`The map **${pick}** has been chosen, by a margin of ${Math.abs(optionone.length-optiontwo.length)} vote${Math.abs(optionone.length-optiontwo.length) > 1 ? "s" : ""}!`).setFooter("© Onyx RBW | Map Picking", rankedlogo));
          return res(pick);
        } else {
          maps = maps.filter(map => map !== secondMap);
          firstMap = maps[Math.floor(Math.random() * maps.length)];
          maps = maps.filter(map => map !== firstMap);
          secondMap = maps[Math.floor(Math.random() * maps.length)];

          const [,, m] = await Promise.all([
            this.textChannel!.send(new MessageEmbed().setColor("ORANGE").setTitle(`1️⃣ ${firstMap}`).addField("Build Limit", `Y: ${maps_object[firstMap].limit}`).setImage(maps_object[firstMap].img).setFooter("© Onyx RBW", rankedlogo)),
            this.textChannel!.send(new MessageEmbed().setColor("ORANGE").setTitle(`2️⃣ ${secondMap}`).addField("Build Limit", `Y: ${maps_object[secondMap].limit}`).setImage(maps_object[secondMap].img).setFooter("© Onyx RBW", rankedlogo)),
            this.textChannel!.send(new MessageEmbed().setColor("ORANGE").setTitle("Map Picking | Reroll").addField(`1️⃣ ${firstMap}`, "\u200b").addField(`2️⃣ ${secondMap}`, "\u200b").setFooter("© Onyx RBW | Map Picking", rankedlogo))
          ]);

          optionone = [], optiontwo = [];
          reactions = ["1️⃣", "2️⃣"];
          for (const reaction of reactions) { await m.react(reaction).catch(rej); }

          if (m.deleted) return reject();

          collector = m.createReactionCollector((reaction: MessageReaction) => reactions.includes(reaction.emoji.name), { time: 30000 });

          collector.on('collect', async (reaction, user) => {
            reaction.users.remove(user);
            if (reaction.emoji.name === "1️⃣") {
              if (optionone.includes(user)) return;
              optionone.push(user);
              optiontwo = optiontwo.filter(u => u !== user);
              await m.edit(new MessageEmbed().setColor("ORANGE").setTitle("Map Picking | Reroll").addField(`1️⃣ ${firstMap}`, "\u200b"+optionone.join("\n")).addField(`2️⃣ ${secondMap}`, "\u200b"+optiontwo.join("\n")).setFooter("© Onyx RBW | Map Picking", rankedlogo));
            } else if (reaction.emoji.name === "2️⃣") {
              if (optiontwo.includes(user)) return;
              optionone = optionone.filter(u => u !== user);
              optiontwo.push(user);
              await m.edit(new MessageEmbed().setColor("ORANGE").setTitle("Map Picking | Reroll").addField(`1️⃣ ${firstMap}`, "\u200b"+optionone.join("\n")).addField(`2️⃣ ${secondMap}`, "\u200b"+optiontwo.join("\n")).setFooter("© Onyx RBW | Map Picking", rankedlogo));
            }
          });

          collector.on('end', async () => {
            if (m.deleted) return reject();
            m.reactions.removeAll().catch(err => console.log(err));
            if(optionone.length > optiontwo.length) pick = firstMap;
            else if(optiontwo.length > optionone.length) pick = secondMap;
            else pick = null;

            if (pick) {
              await m.edit(new MessageEmbed().setColor("ORANGE").setTitle("Map Picking | Reroll").setDescription(`The map **${pick}** has been chosen, by a margin of ${Math.abs(optionone.length-optiontwo.length)} vote${Math.abs(optionone.length-optiontwo.length) > 1 ? "s" : ""}!`).setFooter("© Onyx RBW | Map Picking", rankedlogo));
            } else {
              pick = [firstMap, secondMap][Math.floor(Math.random() * 2)];
              await m.edit(new MessageEmbed().setColor("ORANGE").setTitle("Map Picking | Reroll").setDescription(`The map **${pick}** has been randomly chosen, due to a draw.`).setFooter("© Onyx RBW | Map Picking", rankedlogo));
            }
            res(pick);
          });
        }
      });
    });
  }
}

export const activeGames = new Collection<number, LocalGame>();

export async function hasPerms(member: GuildMember, roles: string[]) {
  let hasPerms = false;
  member?.roles.cache.forEach(role => {
    if(roles.includes(role.id)) hasPerms = true;
  });
  return hasPerms;
}

export async function createNewGame(){
  const result = await query<any>('INSERT INTO games (game_number) VALUES (0)');
  const insertId = result.insertId;
  const countResult = await query<any[]>('SELECT COUNT(*) as cnt FROM games WHERE id <= ?', [insertId]);
  const gameNumber = countResult[0].cnt;
  await query('UPDATE games SET game_number = ? WHERE id = ?', [gameNumber, insertId]);

  const game = new LocalGame(gameNumber, insertId);
  activeGames.set(insertId, game);
  return { game, gameNumber, insertedId: insertId };
}

async function isAssigned(username: string) {
  const bot = bots.get(username);
  if (!bot) return true;
  return new Promise(r => { bot.emit('isAssigned', r); });
}

export namespace BotManager {
  const logger = new Logger("Mineflayer Bot Manager");

  export async function assign(gameId: number): Promise<string | null> {
    const start = Date.now();
    let value: string | null = null;

    while (!value && Date.now() - start < 60000) {
      const result = await query<any>('UPDATE bots SET assigned_game_id = ? WHERE assigned_game_id IS NULL LIMIT 1', [gameId]);
      if(result.affectedRows > 0){
        const rows = await query<BotRow[]>('SELECT username FROM bots WHERE assigned_game_id = ? LIMIT 1', [gameId]);
        if(rows.length > 0 && !(await isAssigned(rows[0].username))){
          value = rows[0].username;
        } else {
          await query('UPDATE bots SET assigned_game_id = NULL WHERE assigned_game_id = ?', [gameId]);
        }
      }
      await delay(1000);
    }

    return value;
  }

  export async function release(bot: string){
    try {
      await query('UPDATE bots SET assigned_game_id = NULL WHERE username = ?', [bot]);
    } catch {};
  }

  export async function getAssignedGame(name: string) {
    const rows = await query<BotRow[]>('SELECT assigned_game_id FROM bots WHERE username = ? LIMIT 1', [name]);
    return rows.length ? rows[0].assigned_game_id : null;
  }
}

export function getBanDuration(existingStrikes: number, strikesToAdd: number) {
  devLogger.info(`existingStrikes --> ${existingStrikes}`);
  devLogger.info(`stringsToAdd --> ${strikesToAdd}`);

  if (existingStrikes + strikesToAdd > 10) return '0d';
  const strikes = Math.max(existingStrikes, 0) + strikesToAdd;
  const durations = [ 3, 6, 12, 1, 2, 3, 4, 5, 6, 0 ];
  return `${durations[strikes - 2]}${strikes > 4 ? 'd' : 'h'}`;
}

function getRole(p: number) {
  const index = Math.floor(Math.abs(p) / 300);
  return Constants.ELO_ROLES[Math.min(index, Constants.ELO_ROLES.length - 1)];
}

export async function gameReport(teams: any, winner: string, number: number, tag: string, colourMap: Map<string, string>, guild: any) {
  const scoring = new MessageEmbed()
    .setAuthor(`Automatic Scoring: Score Request [#${number}]`, 'https://cdn.discordapp.com/attachments/799897234128764958/804020431576105000/Daco_3568543.png');

  for (const team in teams) {
    const name = colourMap.get(team);
    const users = teams[team].players.map((p: any) => {
      const oldRole = getRole(p.oldRating);
      const newRole = getRole(p.newRating);
      const updated = oldRole && newRole && oldRole !== newRole;
      if (updated) {
        guild.members.fetch(p.discord).then((m: any) => {
          m.roles.add(newRole).catch(() => {});
          m.roles.remove(oldRole).catch(() => {});
          if (!m.roles.cache.has(Constants.SUPPORT_ROLE_ID))
            m.setNickname(`[${p.newRating}] ${p.username}`).catch(() => {});
        }).catch(() => {});
      }
      return `**${p.username}** | \`[${p.oldRating} → ${p.newRating}]\`${updated ? ` <@&${oldRole}> → <@&${newRole}>` : ''}`;
    }).join('\n');
    scoring.addField(`${name} Team`, users);
  }

  scoring.addField('Winning Team', `\`•\` ${colourMap.get(winner)}`);

  const channel = guild.channels.cache.get(Constants.GAME_REPORT_CHANNEL) as TextChannel;
  try {
    const m = await channel.send(tag, scoring);
  } catch(e) {
    console.log('GAME_ERROR', e);
    console.log(`Couldn't send Game Report for game: ${number}`);
  }
}

export async function updateRoles(member_id: string, role1_id: string, role2_id: string) {
  const guild = await defaultGuild;
  const member = guild.members.cache.get(member_id);
  await member?.roles.remove(role1_id).catch(() => null);
  await member?.roles.add(role2_id).catch(() => null);
}

export async function voidGame(gameNumber: number) {
  const rows = await query<any[]>('SELECT team1, team2 FROM games WHERE game_number = ? LIMIT 1', [gameNumber]);
  if (rows.length === 0) return { error: 'Game not found.' };

  const game = rows[0];
  const team1Parsed: Team | null = game.team1 ? JSON.parse(game.team1) : null;
  const team2Parsed: Team | null = game.team2 ? JSON.parse(game.team2) : null;

  const both: { team: Team | null; winner: boolean }[] = [
    { team: team1Parsed, winner: team1Parsed?.winner === true },
    { team: team2Parsed, winner: team2Parsed?.winner === true },
  ];

  for (const { team, winner } of both) {
    if (!team) continue;
    for (const player of team.players) {
      if (!player.discord) continue;

      const sets: string[] = [];
      const vals: any[] = [];

      if (player.oldRating !== undefined && player.newRating !== undefined) {
        sets.push('elo = ?');
        vals.push(player.oldRating);
      }

      if (winner) {
        sets.push('wins = wins - 1');
        sets.push('winstreak = ?');
        vals.push(player.winstreak);
      } else {
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
        await query(`UPDATE players SET ${sets.join(', ')} WHERE discord_id = ?`, vals);
      }
    }
  }

  return { success: true };
}

export function delay(delay: number) {
  return new Promise(r => setTimeout(r, delay, true));
}

export function findOpenCategory(categories: CategoryChannel[]){
  return new Promise<CategoryChannel>(res => {
    const cat = categories.find(cat => cat.children.size <= 20);
    if(cat) return res(cat);
    const checker = setInterval(() => {
      const cat = categories.find(cat => cat.children.size <= 20);
      if(cat){
        clearInterval(checker);
        return res(cat);
      }
    }, 5000);
  });
}

export async function checkStatus(username: string) {
  let bool = false;
  await hypixel.getPlayer(username).then((player: { isOnline: boolean; }) => {
    console.log(`isOnline --> ${player.isOnline}`);
    bool = player.isOnline;
  }).catch((e: any) => {
    console.error('ASD', e);
  });
  return bool;
}

export function toEscapedFormat(str: string) {
  return str.replace(/_/g, "\\_");
}
