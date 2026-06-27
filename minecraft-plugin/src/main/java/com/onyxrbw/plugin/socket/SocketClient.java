package com.onyxrbw.plugin.socket;

import com.onyxrbw.plugin.OnyxRBWPlugin;
import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.emitter.Emitter;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URISyntaxException;
import java.util.*;

public class SocketClient {

    private final OnyxRBWPlugin plugin;
    private final String host;
    private final int port;
    private final String key;
    private final String botName;
    private final GameListener gameListener;

    private Socket socket;
    private boolean connected = false;
    private int reconnectAttempts = 0;

    public SocketClient(OnyxRBWPlugin plugin, String host, int port, String key, String botName) {
        this.plugin = plugin;
        this.host = host;
        this.port = port;
        this.key = key;
        this.botName = botName;
        this.gameListener = new GameListener(plugin, this);
    }

    public GameListener getGameListener() {
        return gameListener;
    }

    public void connect() {
        try {
            IO.Options options = new IO.Options();
            options.query = "key=" + key + "&bot=" + botName;
            options.reconnection = false;
            options.timeout = 10000;

            socket = IO.socket("http://" + host + ":" + port, options);

            socket.on(Socket.EVENT_CONNECT, args -> {
                connected = true;
                reconnectAttempts = 0;
                plugin.log("Connected to Discord bot socket server (" + host + ":" + port + ")");
            });

            socket.on(Socket.EVENT_DISCONNECT, args -> {
                connected = false;
                plugin.log("Disconnected from Discord bot socket server");
                scheduleReconnect();
            });

            socket.on(Socket.EVENT_CONNECT_ERROR, args -> {
                connected = false;
                plugin.log("Connection error: " + (args.length > 0 ? args[0].toString() : "unknown"));
                scheduleReconnect();
            });

            socket.on("gameStart", this::onGameStart);
            socket.on("gameCancel", this::onGameCancel);

            socket.connect();
        } catch (URISyntaxException e) {
            plugin.log("Invalid socket server URI: " + e.getMessage());
        }
    }

    public void disconnect() {
        if (socket != null) {
            socket.off();
            socket.disconnect();
            socket = null;
        }
        connected = false;
    }

    public boolean isConnected() {
        return connected;
    }

    private void scheduleReconnect() {
        int baseDelay = plugin.getConfig().getInt("reconnect.base-delay-seconds", 5);
        int maxDelay = plugin.getConfig().getInt("reconnect.max-delay-seconds", 60);
        int maxAttempts = plugin.getConfig().getInt("reconnect.max-attempts", -1);

        if (maxAttempts > 0 && reconnectAttempts >= maxAttempts) {
            plugin.log("Max reconnect attempts reached. Giving up.");
            return;
        }

        long delay = Math.min(baseDelay * (long) Math.pow(2, reconnectAttempts), maxDelay);
        reconnectAttempts++;

        plugin.log("Reconnecting in " + delay + "s (attempt " + reconnectAttempts + ")...");
        Bukkit.getScheduler().runTaskLater(plugin, this::connect, delay * 20L);
    }

    private void onGameStart(Object... args) {
        if (args.length == 0) return;

        JSONObject data;
        if (args[0] instanceof JSONObject) {
            data = (JSONObject) args[0];
        } else {
            data = new JSONObject(args[0].toString());
        }

        int gameNumber = data.optInt("number", -1);
        String map = data.optString("map", "");
        JSONArray players = data.optJSONArray("players");

        if (gameNumber == -1 || players == null || players.length() == 0) {
            plugin.log("Invalid gameStart payload received");
            return;
        }

        plugin.log("Received gameStart: game #" + gameNumber + " on map " + map + " with " + players.length() + " players");

        List<String> playerNames = new ArrayList<>();
        for (int i = 0; i < players.length(); i++) {
            JSONObject p = players.optJSONObject(i);
            if (p != null) {
                String name = p.optString("minecraft_name", "");
                if (!name.isEmpty()) playerNames.add(name);
            }
        }

        gameListener.trackGame(gameNumber, playerNames);

        JSONArray uuidArray = new JSONArray();
        for (String name : playerNames) {
            Player player = Bukkit.getPlayerExact(name);
            if (player != null) {
                uuidArray.put(player.getUniqueId().toString());
                plugin.log("Teleporting " + name + " to map " + map);
                Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "bw join " + map + " " + name);
            } else {
                plugin.log("Player " + name + " is not online");
            }
        }

        emitActualGameStart(uuidArray);
    }

    private void onGameCancel(Object... args) {
        int gameNumber = -1;
        if (args.length > 0) {
            if (args[0] instanceof JSONObject) {
                gameNumber = ((JSONObject) args[0]).optInt("gameNumber", -1);
            }
        }
        plugin.log("Received gameCancel for game #" + gameNumber);
        gameListener.removeGame(gameNumber);
    }

    private void emitActualGameStart(JSONArray uuids) {
        if (socket == null || !connected) return;
        socket.emit("ActualGameStart", uuids);
        plugin.log("Emitted ActualGameStart");
    }

    public void emitGameFinish(int gameNumber, Map<String, Object> playerStats) {
        if (socket == null || !connected) return;

        JSONObject payload = new JSONObject();
        payload.put("number", gameNumber);

        JSONObject playersObj = new JSONObject();
        for (Map.Entry<String, Object> entry : playerStats.entrySet()) {
            playersObj.put(entry.getKey(), entry.getValue());
        }
        payload.put("players", playersObj);

        socket.emit("gameFinish", payload);
        plugin.log("Emitted gameFinish for game #" + gameNumber);
    }

    public void emitPlayerStrike(String discordId, int strikes, String reason) {
        if (socket == null || !connected) return;

        JSONObject payload = new JSONObject();
        payload.put("id", discordId);
        payload.put("strikes", strikes);
        payload.put("reason", reason);

        socket.emit("playerStrike", payload);
    }

    public void emitPlayerBan(String discordId) {
        if (socket == null || !connected) return;

        JSONObject payload = new JSONObject();
        payload.put("id", discordId);

        socket.emit("playerBan", payload);
    }

    public void emitAlertStaff(String nickIGN, JSONArray gamePlayers) {
        if (socket == null || !connected) return;
        socket.emit("alertStaff", nickIGN, gamePlayers);
    }
}
