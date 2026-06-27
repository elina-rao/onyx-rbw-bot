package com.onyxrbw.plugin.socket;

import com.andrei1058.bedwars.api.events.gameplay.GameEndEvent;
import com.andrei1058.bedwars.api.events.player.PlayerBedBreakEvent;
import com.andrei1058.bedwars.api.events.player.PlayerKillEvent;
import com.onyxrbw.plugin.OnyxRBWPlugin;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

public class GameListener implements Listener {

    private final OnyxRBWPlugin plugin;
    private final SocketClient socketClient;
    private final Map<Integer, GameTracker> activeGames = new ConcurrentHashMap<>();

    public GameListener(OnyxRBWPlugin plugin, SocketClient socketClient) {
        this.plugin = plugin;
        this.socketClient = socketClient;
    }

    public void trackGame(int gameNumber, Collection<String> playerNames) {
        activeGames.put(gameNumber, new GameTracker(gameNumber, playerNames));
        plugin.log("Tracking game #" + gameNumber + " with players: " + String.join(", ", playerNames));
    }

    public void removeGame(int gameNumber) {
        activeGames.remove(gameNumber);
    }

    @EventHandler
    public void onPlayerKill(PlayerKillEvent event) {
        String victim = event.getVictim().getName();
        Player killerPlayer = event.getKiller();
        String killer = killerPlayer != null ? killerPlayer.getName() : null;

        for (GameTracker tracker : activeGames.values()) {
            if (killer != null && tracker.hasPlayer(killer)) {
                tracker.addKill(killer);
            }
            if (tracker.hasPlayer(victim)) {
                tracker.addDeath(victim);
            }
        }
    }

    @EventHandler
    public void onBedBreak(PlayerBedBreakEvent event) {
        String player = event.getPlayer().getName();
        for (GameTracker tracker : activeGames.values()) {
            if (tracker.hasPlayer(player)) {
                tracker.addBedBroken(player);
            }
        }
    }

    @EventHandler
    public void onGameEnd(GameEndEvent event) {
        String arenaName = event.getArena().getArenaName();

        GameTracker tracker = activeGames.values().stream()
                .filter(t -> t.arenaName != null && t.arenaName.equals(arenaName))
                .findFirst().orElse(null);

        if (tracker == null) return;

        Set<UUID> winnerUUIDs = new HashSet<>(event.getWinners());

        Set<String> winners = winnerUUIDs.stream()
                .map(uuid -> Bukkit.getPlayer(uuid))
                .filter(Objects::nonNull)
                .map(Player::getName)
                .filter(tracker::hasPlayer)
                .collect(Collectors.toSet());

        Set<String> losers = new HashSet<>(tracker.players);
        losers.removeAll(winners);

        Map<String, Object> playerStats = new HashMap<>();
        for (String winner : winners) {
            Map<String, Object> stat = new HashMap<>();
            stat.put("minecraft", winner);
            stat.put("kills", tracker.getKills(winner));
            stat.put("deaths", tracker.getDeaths(winner));
            stat.put("wins", 1);
            stat.put("losses", 0);
            stat.put("bedsBroken", tracker.getBedsBroken(winner));
            stat.put("bedsLost", 0);
            stat.put("team", tracker.hasPlayerOnTeam(winner));
            playerStats.put(winner, stat);
        }
        for (String loser : losers) {
            Map<String, Object> stat = new HashMap<>();
            stat.put("minecraft", loser);
            stat.put("kills", tracker.getKills(loser));
            stat.put("deaths", tracker.getDeaths(loser));
            stat.put("wins", 0);
            stat.put("losses", 1);
            stat.put("bedsBroken", tracker.getBedsBroken(loser));
            stat.put("bedsLost", 1);
            stat.put("team", tracker.hasPlayerOnTeam(loser));
            playerStats.put(loser, stat);
        }

        socketClient.emitGameFinish(tracker.gameNumber, playerStats);
        activeGames.remove(tracker.gameNumber);
        plugin.log("Game #" + tracker.gameNumber + " finished. Winners: " + winners.size() + ", Losers: " + losers.size());
    }

    private static class GameTracker {
        final int gameNumber;
        final Set<String> players;
        String arenaName;
        final Map<String, Integer> kills = new ConcurrentHashMap<>();
        final Map<String, Integer> deaths = new ConcurrentHashMap<>();
        final Map<String, Integer> bedsBroken = new ConcurrentHashMap<>();
        final Map<String, Integer> bedsLost = new ConcurrentHashMap<>();

        GameTracker(int gameNumber, Collection<String> players) {
            this.gameNumber = gameNumber;
            this.players = new HashSet<>(players);
            for (String p : players) {
                kills.put(p, 0);
                deaths.put(p, 0);
                bedsBroken.put(p, 0);
                bedsLost.put(p, 0);
            }
        }

        boolean hasPlayer(String name) { return players.contains(name); }
        void addKill(String player) { kills.merge(player, 1, Integer::sum); }
        void addDeath(String player) { deaths.merge(player, 1, Integer::sum); }
        void addBedBroken(String player) { bedsBroken.merge(player, 1, Integer::sum); }
        int getKills(String player) { return kills.getOrDefault(player, 0); }
        int getDeaths(String player) { return deaths.getOrDefault(player, 0); }
        int getBedsBroken(String player) { return bedsBroken.getOrDefault(player, 0); }
        int getBedsLost(String player) { return bedsLost.getOrDefault(player, 0); }

        String hasPlayerOnTeam(String name) {
            return players.contains(name) ? "§a" : "§c";
        }
    }
}
