export interface Player {
  id?: number;
  discord_id: string;
  minecraft_uuid?: string;
  minecraft_name?: string;
  registered_at?: number;
  wins?: number;
  losses?: number;
  beds_broken?: number;
  beds_lost?: number;
  kills?: number;
  deaths?: number;
  elo?: number;
  roles?: string;
  ban_expires?: number;
  strikes?: number;
  games?: number;
  winstreak?: number;
  bedstreak?: number;
  info_card_text?: string;
  info_card_background?: string;
  win_message?: string;
  lose_message?: string;
  emoji?: string;
  messages?: string;
  created_at?: string;
}
