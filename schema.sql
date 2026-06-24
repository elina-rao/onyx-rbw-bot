CREATE TABLE IF NOT EXISTS players (
  id INT AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(20) NOT NULL UNIQUE,
  minecraft_uuid VARCHAR(32),
  minecraft_name VARCHAR(16),
  registered_at BIGINT,
  elo INT DEFAULT 400,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  kills INT DEFAULT 0,
  deaths INT DEFAULT 0,
  beds_broken INT DEFAULT 0,
  beds_lost INT DEFAULT 0,
  winstreak INT DEFAULT 0,
  bedstreak INT DEFAULT 0,
  games INT DEFAULT 0,
  strikes INT DEFAULT 0,
  ban_expires BIGINT DEFAULT 0,
  info_card_text VARCHAR(255) DEFAULT 'discord.gg/onyxrbw',
  info_card_background VARCHAR(255) DEFAULT '#363942',
  win_message VARCHAR(250),
  lose_message VARCHAR(250),
  emoji VARCHAR(100),
  messages JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_number INT NOT NULL,
  state TINYINT DEFAULT 0,
  text_channel_id VARCHAR(20),
  voice_channel_id VARCHAR(20),
  team1_channel_id VARCHAR(20),
  team2_channel_id VARCHAR(20),
  bot_ign VARCHAR(16),
  team1 JSON,
  team2 JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(16) NOT NULL UNIQUE,
  uuid VARCHAR(32),
  assigned_game_id INT
);
