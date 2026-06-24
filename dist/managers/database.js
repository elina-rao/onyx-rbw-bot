"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
const promise_1 = __importDefault(require("mysql2/promise"));
const logger_1 = __importDefault(require("../logger"));
const logger = new logger_1.default("Database Manager");
const { MYSQL_URL } = process.env;
if (!MYSQL_URL) {
    logger.error("Required environment variable MYSQL_URL is not defined.");
    process.exit(1);
}
exports.pool = promise_1.default.createPool({
    uri: MYSQL_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});
async function query(sql, params) {
    const [rows] = await exports.pool.execute(sql, params);
    return rows;
}
const database = { query };
exports.default = database;
