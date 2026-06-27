const fs = require('fs');
const path = require('path');

const ARENA_DIR = path.join(__dirname, '..', 'arenas');

const MAP_HEIGHTS = {
  Airshow:    '90:115', Speedway:   '90:115', Lighthouse:  '90:115',
  Pernicious: '90:110', Orchestra:  '90:115', Steampunk:   '95:120',
  Zarzul:     '90:110', Solace:     '90:115', Crypt:       '90:115',
  Siege:      '90:110', Amazon:     '90:115', Aquarium:    '90:115',
  Inca:       '90:115', Cave:       '90:115', Treenan:     '90:115',
  Hollow:     '90:115', Glacier:    '90:115', Biohazard:   '90:115',
  Rooted:     '90:115', Dragonlight:'95:120',
};

// Maximum build height values
const MAX_HEIGHT = 150;

function generateArenaConfig(mapName) {
  const [minY, maxY] = MAP_HEIGHTS[mapName].split(':');
  const yLimit = parseInt(maxY);
  const minLimit = parseInt(minY);

  return `# Onyx RBW - ${mapName}
# World configuration
# After placing the map folder in paper/, run:
#   /bw add ${mapName}
#   /bw setarena ${mapName}
# Then use /bw setup ${mapName} to configure spawns and generators in-game.

world: "${mapName}"
config-version: "22.01"

# Build height limits
min-build-y: ${minLimit}
max-build-y: ${yLimit}
build-limit: ${yLimit}

# Game settings
game-time: 900
waiting-time: 15
ending-time: 10
respawn-time: 5
players-per-team: 4
min-teams: 2

# Arena group for matchmaking
group: "ranked"

# Enable/disable
enabled: true

# Database storage
database: false

# Target blocks (beds)
target-blocks:
- BED_BLOCK
- BED

# Spectator settings
spectator-spawn:
  world: "${mapName}"
  x: 0
  y: ${yLimit + 10}
  z: 0
  yaw: 0
  pitch: 90

# --- TEAMS ---
# Configure using /bw setup ${mapName} in-game
# Template for team spawns:
# teams:
#   red:
#     spawn:
#       world: "${mapName}"
#       x: 0
#       y: ${minLimit + 1}
#       z: 0
#       yaw: 0
#       pitch: 0
#     bed:
#       world: "${mapName}"
#       x: 0
#       y: ${minLimit + 1}
#       z: 0
#     shop:
#       world: "${mapName}"
#       x: 0
#       y: ${minLimit + 1}
#       z: 0
#     team-upgrade:
#       world: "${mapName}"
#       x: 0
#       y: ${minLimit + 1}
#       z: 0
#   blue: ...
#   green: ...
#   yellow: ...

# --- GENERATORS ---
# Configure using /bw setup ${mapName} in-game
# Template:
# generators:
#   diamond:
#   - location:
#       world: "${mapName}"
#       x: 0
#       y: ${minLimit + 1}
#       z: 0
#   emerald:
#   - location:
#       world: "${mapName}"
#       x: 0
#       y: ${minLimit + 1}
#       z: 0
`;
}

// Generate configs
if (!fs.existsSync(ARENA_DIR)) fs.mkdirSync(ARENA_DIR, { recursive: true });

for (const map of Object.keys(MAP_HEIGHTS)) {
  const mapDir = path.join(ARENA_DIR, map);
  if (!fs.existsSync(mapDir)) fs.mkdirSync(mapDir, { recursive: true });
  fs.writeFileSync(path.join(mapDir, 'config.yml'), generateArenaConfig(map));
  console.log(`Created arenas/${map}/config.yml`);
}

console.log('All arena configs generated. Complete setup in-game using /bw setup <map>');
