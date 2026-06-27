package com.onyxrbw.plugin;

import com.onyxrbw.plugin.socket.SocketClient;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.logging.Level;

public final class OnyxRBWPlugin extends JavaPlugin {

    private SocketClient socketClient;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        String host = getConfig().getString("socket.host", "localhost");
        int port = getConfig().getInt("socket.port", 8080);
        String key = getConfig().getString("socket-key", "");
        String botName = getConfig().getString("bot-name", "onyx-bot-1");

        if (key.isEmpty() || key.equals("your-socket-key-here")) {
            getLogger().severe("socket-key is not configured in config.yml!");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        socketClient = new SocketClient(this, host, port, key, botName);
        getServer().getPluginManager().registerEvents(socketClient.getGameListener(), this);
        socketClient.connect();

        getLogger().info("OnyxRBW plugin enabled successfully.");
    }

    @Override
    public void onDisable() {
        if (socketClient != null) {
            socketClient.disconnect();
        }
        getLogger().info("OnyxRBW plugin disabled.");
    }

    public void log(Level level, String message) {
        getLogger().log(level, message);
    }

    public void log(String message) {
        getLogger().info(message);
    }
}
