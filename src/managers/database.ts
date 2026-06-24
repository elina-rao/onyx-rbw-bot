import mysql from "mysql2/promise";
import Logger from "../logger";
import type { RowDataPacket } from "mysql2";

const logger = new Logger("Database Manager");

const { MYSQL_URL } = process.env;

if(!MYSQL_URL){
  logger.error("Required environment variable MYSQL_URL is not defined.");
  process.exit(1);
}

export const pool = mysql.createPool({
  uri: MYSQL_URL,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function query<T extends RowDataPacket[]>(sql: string, params?: any[]): Promise<T> {
  const [rows] = await pool.execute<T>(sql, params);
  return rows;
}

const database = { query };

export default database;
