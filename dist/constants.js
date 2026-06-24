"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Constants = void 0;
const logger_1 = __importDefault(require("./logger"));
const logger = new logger_1.default("Constants");
const { GUILD } = process.env;
if (!GUILD) {
    logger.error("Required environment variable GUILD is not defined.");
    process.exit(1);
}
var Constants;
(function (Constants) {
    Constants.DISCORD_API_BASE_URL = "https://discord.com/api/v8";
    Constants.BRANDING_URL = "https://i.imgur.com/Nk0fcf8.jpg";
    Constants.REGISTER_CHANNEL = '';
    Constants.UNREGISTERED_ROLE = '';
    Constants.STAFF_COMMANDS_CHANNEL = '';
    Constants.CHANNELS_FOR_SLASH_COMMANDS = [];
    Constants.ELO_ROLES = [];
    Constants.ELO_EMOJIS = [];
    Constants.RANKBANNED = '';
    Constants.QUEUES_ARRAY = [[]];
    Constants.CATEGORY_ARRAY = [[]];
    Constants.WAITING_ROOM = '';
    Constants.REGISTERED_ROLE = '';
    Constants.COMMANDS_CHANNEL = '';
    Constants.GAME_REPORT_CHANNEL = '';
    Constants.TEAM_CALLS = [];
    Constants.CHAT = '';
    Constants.SUPPORT_ROLE_ID = '';
    Constants.BAN_UNBAN = {
        ROLES: [''],
        CHANNELS: [''],
        MANUAL_BAN_RESPONSE_CHANNEL: '',
        AUTOMATIC_BAN_RESPONSE_CHANNEL: '',
        UNBAN_RESPONSE_CHANNEL: '',
    };
    Constants.STRIKE_UNSTRIKE = {
        ROLES: [''],
        CHANNELS: [''],
        CATEGORY_CHANNEL: '',
        AUTOSTRIKE_RESPONSE_CHANNEL: '',
        MANUALSTRIKE_RESPONSE_CHANNEL: '',
    };
    Constants.PMODIFY_VOID = {
        ROLES: [''],
        CHANNELS: [''],
        PMODIFY_RESPONSE_CHANNEL: '',
        VOID_RESPONSE_CHANNEL: '',
    };
    Constants.FCLOSE_ROLES = [];
    Constants.CLIENT_ID = '';
    Constants.STRIKE_VIEW = {
        ROLES: [''],
    };
})(Constants || (exports.Constants = Constants = {}));
