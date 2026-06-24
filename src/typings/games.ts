export interface Game {
  id?: number;
  game_number: number;
  state?: number;
  text_channel_id?: string;
  voice_channel_id?: string;
  team1_channel_id?: string;
  team2_channel_id?: string;
  bot_ign?: string;
  team1?: any;
  team2?: any;
  created_at?: string;
}

export interface GamePlayer {
  kills?: number;
  deaths?: number;
  destroyedBed?: boolean;
  elo?: number;
  username: string;
  winstreak: number;
  bedstreak: number;
  discord: string;
  oldRating?: number;
  newRating?: number;
}

export interface Team {
  winner?: boolean;
  players: GamePlayer[];
}

export interface strikeCheck {
  textChannelID: string;
  timeOfLastPick: number;
  pickingOver: boolean;
  voiceChannelID: string;
  members: string[];
}

export interface helpCommand {
  user: any;
  message: any;
  timeOfCreation: number;
}

export enum GameState {
  PRE_GAME,
  STARTING,
  ACTIVE,
  SCORING,
  FINISHED,
  VOID
}
