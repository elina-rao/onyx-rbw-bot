# Onyx RBW v1.0.0 — Initial Release

The first release of Onyx Ranked Bedwars — a competitive Bedwars server with ELO matchmaking, Discord integration, and real-time socket bridge.

## What's Included

### Discord Bot
- ELO system with 8 ranks (Ash → Onyx, 300 ELO per tier)
- Discord queue → match → ELO sync pipeline
- `/register` via Mojang API (IGN stored lowercase)
- Slash command responses (ephemeral, flags: 64)
- MySQL database (Railway auto-injected `MYSQL_URL`)
- Auto-role updates on division change
- Nickname format: `[ELO] PlayerName`
- Win/loss stat tracking, KDR, winstreak, bedstreak

### Minecraft Plugin (onyxrbw-plugin-1.0.0.jar)
- Socket.IO client (v2) connecting to Discord bot (Socket.IO v3 with `allowEIO3: true`)
- Real-time game events: kills, deaths, bed breaks, game end
- Player tracking via BedWars1058 API
- Auto-teleport on queue match
- Height limit enforcement (Y: 90–115 per map)

### Server Stack
- Velocity 3.4.0 proxy (Java 21) with MODERN forwarding
- Paper 1.8.9 backend (Java 8)
- ViaVersion/ViaBackwards/ViaRewind (1.7.10–1.20.x support)
- nLogin for cracked + premium auth
- BedWars1058 for game management
- OnyxRBW plugin for Discord bridge

## Installation

1. Download `onyxrbw-plugin-1.0.0.jar`
2. Place in `/opt/onyxrbw/paper/plugins/`
3. Configure `SOCKET_KEY` in Railway Variables
4. Run the setup script on your Hetzner VPS

## Default ELO Divisions

| Rank    | ELO Range  | Win ± | Loss ± |
|---------|------------|-------|--------|
| Ash     | 0–299      | +30   | -10    |
| Stone   | 300–599    | +28   | -12    |
| Copper  | 600–899    | +26   | -14    |
| Silver  | 900–1199   | +24   | -16    |
| Gold    | 1200–1499  | +22   | -18    |
| Ruby    | 1500–1799  | +20   | -20    |
| Sapphire| 1800–2199  | +18   | -22    |
| Onyx    | 2200+      | +15   | -25    |

## Notes

- Version 1.0.0 — closed beta phase
- Queue currently supports Ranked Doubles only
- Maps are Hypixel RBW maps with per-map height limits
