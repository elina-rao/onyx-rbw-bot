import type { RowDataPacket } from "mysql2";
import type { Game } from "./games";
import type { Player } from "./players";
import type { Bot } from "./bot";

export interface PlayerRow extends RowDataPacket, Player {}
export interface GameRow extends RowDataPacket, Game {}
export interface BotRow extends RowDataPacket, Bot {}

export interface Database {
  query: <T extends RowDataPacket[]>(sql: string, params?: any[]) => Promise<T>;
}
