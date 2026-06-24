import Logger from "./logger";

const logger = new Logger("Constants");

const { GUILD } = process.env;
if(!GUILD){
  logger.error("Required environment variable GUILD is not defined.");
  process.exit(1);
}

export namespace Constants {
  export const DISCORD_API_BASE_URL = "https://discord.com/api/v8";
  export const BRANDING_URL = "https://i.imgur.com/Nk0fcf8.jpg";
  export const REGISTER_CHANNEL = '';
  export const UNREGISTERED_ROLE = '';
  export const STAFF_COMMANDS_CHANNEL = '';
  export const CHANNELS_FOR_SLASH_COMMANDS: string[] = [];

  // 8 Onyx RBW rank roles (IDs to be filled after role creation)
  export const ELO_ROLES: string[] = [];

  // 8 rank emojis
  export const ELO_EMOJIS: string[] = [];

  export const RANKBANNED = '';

  // Single queue
  export const QUEUES_ARRAY: string[][] = [[]];
  export const CATEGORY_ARRAY: string[][] = [[]];
  export const WAITING_ROOM = '';
  export const REGISTERED_ROLE = '';
  export const COMMANDS_CHANNEL = '';
  export const GAME_REPORT_CHANNEL = '';
  export const TEAM_CALLS: string[] = [];

  export const CHAT = '';
  export const SUPPORT_ROLE_ID = '';

  export const BAN_UNBAN = {
    ROLES: [''],
    CHANNELS: [''],
    MANUAL_BAN_RESPONSE_CHANNEL: '',
    AUTOMATIC_BAN_RESPONSE_CHANNEL: '',
    UNBAN_RESPONSE_CHANNEL: '',
  };

  export const STRIKE_UNSTRIKE = {
    ROLES: [''],
    CHANNELS: [''],
    CATEGORY_CHANNEL: '',
    AUTOSTRIKE_RESPONSE_CHANNEL: '',
    MANUALSTRIKE_RESPONSE_CHANNEL: '',
  };

  export const PMODIFY_VOID = {
    ROLES: [''],
    CHANNELS: [''],
    PMODIFY_RESPONSE_CHANNEL: '',
    VOID_RESPONSE_CHANNEL: '',
  };

  export const FCLOSE_ROLES: string[] = [];
  export const CLIENT_ID = '';
  export const STRIKE_VIEW = {
    ROLES: [''],
  };
}
