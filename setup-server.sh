#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Onyx RBW — Hetzner CX23 Helsinki Server Setup Script
# ═══════════════════════════════════════════════════════════════
# Requirements:
#   - Ubuntu 22.04 on Hetzner CX23
#   - Run as root or with sudo
# ═══════════════════════════════════════════════════════════════

# === CONFIGURATION — Edit these before running ===
SOCKET_KEY="230da5c9c3a8507b4e0757723a931d927383d36dbf0d2a4a7e4094b09b6abbd9"
BOT_NAME="onyx-bot-1"
BOT_HOST="sweet-determination.up.railway.app"  # Railway app URL
BOT_PORT="8080"

# GitHub Release URLs (create release v1.0.0 first)
PLUGIN_JAR_URL="https://github.com/elina-rao/onyx-rbw-bot/releases/download/v1.0.0/onyxrbw-plugin-1.0.0.jar"

# Paper 1.8.9 download
PAPER_URL="https://api.papermc.io/v2/projects/paper/versions/1.8.9/builds/latest/downloads/paper-1.8.9-latest.jar"

# Velocity 3.4.0
VELOCITY_URL="https://api.papermc.io/v2/projects/velocity/versions/3.4.0/builds/latest/downloads/velocity-3.4.0-latest.jar"

# === COLORS ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

# === CHECK ROOT ===
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (use sudo)."
  exit 1
fi

# === SETUP DIRECTORIES ===
BASE="/opt/onyxrbw"
mkdir -p "$BASE/velocity/plugins"
mkdir -p "$BASE/paper/plugins"
mkdir -p "$BASE/paper/arenas"  # BedWars1058 arena configs
mkdir -p "$BASE/lobby/plugins"  # Lobby server
mkdir -p "$BASE/lobby/world"    # Lobby world
mkdir -p "$BASE/backups"

cd "$BASE"

log "Installing dependencies..."
apt update -qq
apt install -y -qq curl wget unzip zip screen openjdk-21-jre-headless openjdk-8-jre-headless

# === DOWNLOAD VELOCITY 3.4.0 ===
log "Downloading Velocity 3.4.0..."
curl -sLo velocity.jar "$VELOCITY_URL"
log "Downloading Velocity plugins..."

# Download Velocity plugins
# ViaVersion family for cross-version support
curl -sLo velocity/plugins/viaversion.jar "https://github.com/ViaVersion/ViaVersion/releases/latest/download/ViaVersion-5.2.1.jar"
curl -sLo velocity/plugins/viabackwards.jar "https://github.com/ViaVersion/ViaBackwards/releases/latest/download/ViaBackwards-5.2.1.jar"
curl -sLo velocity/plugins/viarewind.jar "https://github.com/ViaVersion/ViaRewind/releases/latest/download/ViaRewind-3.0.5.jar"

# nLogin for cracked/premium auth
curl -sLo velocity/plugins/nlogin.jar "https://github.com/nickuc/OpenLogin/releases/latest/download/nLogin-Velocity.jar"

log "Creating Velocity config..."
cat > velocity.toml << 'VELOCITYEOF'
# Velocity config — Onyx RBW
config-version = "3.0"

bind = "0.0.0.0:25565"
motd = "&#xd4a017;&#x1f451; Onyx Ranked Bedwars"
show-max-players = 200
max-players = 100
online-mode = false
player-info-forwarding-mode = "MODERN"
forwarding-secret-file = "forwarding-secret"

[servers]
lobby = "127.0.0.1:25566"
game = "127.0.0.1:25567"

[forced-hosts]
"onyxrbw.com" = ["lobby", "game"]
"localhost" = ["lobby"]
VELOCITYEOF

# Generate a random forwarding secret
openssl rand -base64 32 > forwarding-secret

# === DOWNLOAD PAPER 1.8.9 ===
log "Downloading Paper 1.8.9..."
curl -sLo paper.jar "$PAPER_URL"

# Accept EULA
echo "eula=true" > paper/eula.txt

log "Creating Paper server.properties..."
cat > paper/server.properties << 'PAPERPROPS'
# Paper 1.8.9 — Onyx RBW
server-port=25567
online-mode=false
motd=Onyx RBW Game Server
max-players=20
view-distance=8
simulation-distance=8
spawn-protection=0
pvp=true
allow-nether=false
announce-player-achievements=false
enable-query=true
PAPERPROPS

log "Creating Paper velocity config..."
mkdir -p paper/plugins/velocity-velocity
cat > paper/plugins/velocity-velocity/secret << SECRETEOF
$(cat forwarding-secret)
SECRETEOF

# === DOWNLOAD PAPER PLUGINS ===
log "Downloading Paper plugins..."

# BedWars1058
curl -sLo paper/plugins/bedwars1058.jar "https://github.com/andrei1058/BedWars1058/releases/latest/download/BedWars1058.jar"

# BedWars1058 dependencies
curl -sLo paper/plugins/bedwars1058-arenas.jar "https://github.com/andrei1058/BedWars1058/releases/latest/download/BedWars1058-Arena.jar"

# OnyxRBW Plugin (from GitHub Release)
if curl -sLfo paper/plugins/onyxrbw-plugin-1.0.0.jar "$PLUGIN_JAR_URL"; then
  log "Downloaded OnyxRBW plugin from GitHub Release"
else
  warn "Could not download plugin from GitHub Release — please upload manually to paper/plugins/"
fi

# === CREATE BEDWARS1058 CONFIG ===
log "Creating BedWars1058 config..."
mkdir -p paper/plugins/BedWars1058
cat > paper/plugins/BedWars1058/config.yml << 'BWCONFIG'
# BedWars1058 — Onyx RBW Configuration
arena:
  remove-entities: true
  remove-vehicles: true
  wait-time: 15
  game-time: 900
  ending-time: 10
  respawn-time: 5
  start-items:
    iron_sword:
      material: IRON_SWORD
      slot: 0
      amount: 1
    wool:
      material: WOOL
      slot: 1
      amount: 16
    shears:
      material: SHEARS
      slot: 2
      amount: 1
    wooden_pickaxe:
      material: WOOD_PICKAXE
      slot: 3
      amount: 1
    wooden_axe:
      material: WOOD_AXE
      slot: 4
      amount: 1

generator:
  enabled: true
  drop-radius: 2
  merge-radius: 1.5
  custom-items:
    diamond:
      material: DIAMOND
      spawn-rate: 8
      limit: 4
      spread: 5
    emerald:
      material: EMERALD
      spawn-rate: 15
      limit: 2
      spread: 5
    iron:
      material: IRON_INGOT
      spawn-rate: 1.5
      limit: 16
      spread: 5
    gold:
      material: GOLD_INGOT
      spawn-rate: 3
      limit: 8
      spread: 5

shop:
  follow-upgrade: true
  permanent-shop: true

database:
  enabled: false

rewards:
  win: true
  kill: true
  bed-destroy: true

scoreboard:
  enabled: true
  animated: false

chat:
  enabled: true

spectator:
  allow-chat: true
BWCONFIG

# === SETUP LOBBY SERVER ===
log "Setting up lobby server..."

# Copy Paper jar for lobby
cp paper.jar lobby/paper.jar

# Accept EULA
echo "eula=true" > lobby/eula.txt

log "Creating Lobby server.properties..."
cat > lobby/server.properties << 'LOBBYPROPS'
# Lobby — Onyx RBW
server-port=25566
online-mode=false
motd=Onyx RBW Lobby
max-players=50
view-distance=6
spawn-protection=100
pvp=false
allow-nether=false
announce-player-achievements=false
enable-query=false
level-type=FLAT
generate-structures=false
LOBBYPROPS

log "Creating Lobby velocity config..."
mkdir -p lobby/plugins/velocity-velocity
cat > lobby/plugins/velocity-velocity/secret << SECRETEOF
$(cat forwarding-secret)
SECRETEOF

# Create a simple spawn schematic marker (empty world — first join generates flat)
mkdir -p lobby/world/data
echo '{"player":[]}' > lobby/world/data/players.dat 2>/dev/null || true

# === CREATE SYSTEMD SERVICE FOR VELOCITY ===
log "Creating systemd service for Velocity Proxy..."
cat > /etc/systemd/system/onyxrbw-proxy.service << 'PROXYSVC'
[Unit]
Description=Onyx RBW Velocity Proxy
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/onyxrbw
ExecStart=/usr/lib/jvm/java-21-openjdk-amd64/bin/java \
  -Xms256M -Xmx512M \
  -XX:+UseG1GC -XX:G1HeapRegionSize=4M \
  -jar velocity.jar
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
PROXYSVC

# === CREATE SYSTEMD SERVICE FOR PAPER ===
log "Creating systemd service for Paper Server..."
cat > /etc/systemd/system/onyxrbw-game.service << 'GAMESVC'
[Unit]
Description=Onyx RBW Paper Game Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/onyxrbw/paper
ExecStart=/usr/lib/jvm/java-8-openjdk-amd64/jre/bin/java \
  -Xms512M -Xmx1G \
  -XX:+UseG1GC -XX:+ParallelRefProcEnabled \
  -jar /opt/onyxrbw/paper.jar nogui
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
GAMESVC

# === CREATE SYSTEMD SERVICE FOR LOBBY ===
log "Creating systemd service for Lobby Server..."
cat > /etc/systemd/system/onyxrbw-lobby.service << 'LOBBYSVC'
[Unit]
Description=Onyx RBW Lobby Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/onyxrbw/lobby
ExecStart=/usr/lib/jvm/java-8-openjdk-amd64/jre/bin/java \
  -Xms256M -Xmx512M \
  -XX:+UseG1GC \
  -jar /opt/onyxrbw/lobby/paper.jar nogui
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
LOBBYSVC

# === CREATE UPDATE ARENAS SCRIPT ===
log "Creating arena setup helper script..."
cat > setup-arenas.sh << 'ARENASCRIPT'
#!/bin/bash
# Run this after placing map folders in /opt/onyxrbw/paper/arenas/
# Maps should be extracted from the map zip archive
# Expected format: each map is a folder with region/*.mca + level.dat

ARENA_DIR="/opt/onyxrbw/paper/arenas"
TARGET_DIR="/opt/onyxrbw/paper"

for map_dir in "$ARENA_DIR"/*/; do
  map_name=$(basename "$map_dir")
  echo "Setting up arena: $map_name"
  
  # Copy map to paper directory
  cp -r "$map_dir" "$TARGET_DIR/$map_name"
  
done

echo "Done. Restart the game server to load new arenas."
ARENASCRIPT
chmod +x setup-arenas.sh

# === CREATE CONFIG FOR ONYXRBW PLUGIN ===
log "Creating OnyxRBW plugin config..."
cat > paper/plugins/OnyxRBW/config.yml << 'PLUGINEOF'
# OnyxRBW Plugin Configuration
socket:
  host: "sweet-determination.up.railway.app"
  port: 8080
  key: "230da5c9c3a8507b4e0757723a931d927383d36dbf0d2a4a7e4094b09b6abbd9"

bot-name: "onyx-bot-1"

reconnect:
  base-delay-seconds: 5
  max-delay-seconds: 60
  max-attempts: -1

height-limits:
  enabled: true
  default-min-y: 90
  default-max-y: 115

map-height-limits:
  Airshow: "90:115"
  Speedway: "90:115"
  Aquarium: "90:115"
  Inca: "90:115"
  Cave: "90:115"
  Treenan: "90:115"
  Lighthouse: "90:115"
  Pernicious: "90:110"
  Orchestra: "90:115"
  Steampunk: "95:120"
  Zarzul: "90:110"
  Solace: "90:115"
  Crypt: "90:115"
  Siege: "90:110"
  Amazon: "90:115"
PLUGINEOF

# === RELOAD SYSTEMD ===
systemctl daemon-reload

# === FIREWALL ===
log "Configuring firewall (ufw)..."
ufw allow 22/tcp comment 'SSH'
ufw allow 25565/tcp comment 'Minecraft (Velocity Proxy)'
ufw --force enable

# === SETUP COMPLETE ===
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Onyx RBW Server Setup Complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo "What to do next:"
echo ""
echo "  1. Extract your Hypixel maps into /opt/onyxrbw/paper/arenas/"
echo "     For ranked (Doubles): Airshow, Speedway, Lighthouse, etc."
echo "     For Normal  (3s/4s):  Aquarium, Treenan, Temple, etc."
echo ""
echo "  2. For each map, create a BedWars1058 arena config:"
echo "     /opt/onyxrbw/paper/plugins/BedWars1058/Arena/"
echo "     (or use BedWars1058 in-game setup: /bw setup)"
echo ""
echo "  3. Create GitHub Release v1.0.0 with the plugin jar"
echo ""
echo "  4. Start services:"
echo "     systemctl start onyxrbw-proxy"
echo "     systemctl start onyxrbw-lobby"
echo "     systemctl start onyxrbw-game"
echo ""
echo "  5. Enable auto-start on boot:"
echo "     systemctl enable onyxrbw-proxy onyxrbw-lobby onyxrbw-game"
echo ""
echo "  6. Set SOCKET_KEY in Railway dashboard Variables"
echo ""
echo "  7. Test the connection!"
echo ""
