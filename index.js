import fs from "fs";
import path from "path";
import { startWhatsAppBot, loadAllSessions } from "./whatsapp_bot.js";
import { ensureDataFolder, log } from "./utils.js";
import { initTelegramBot } from "./telegram_bot.js";

const CONFIG_PATH = path.join(process.cwd(), "config.json");
let config = {};

// ------------------ Load Config ------------------
if (fs.existsSync(CONFIG_PATH)) {
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    } catch (err) {
        console.error("❌ Failed to parse config.json:", err);
        process.exit(1);
    }
}

// ------------------ Ensure Data Folder ------------------
ensureDataFolder();

// ------------------ Single-Instance Enforcement ------------------
const LOCK_FILE = path.join(process.cwd(), ".bot_lock");
if (fs.existsSync(LOCK_FILE)) {
    const oldPid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8"));
    try {
        process.kill(oldPid, 0); // check if running
        process.kill(oldPid);    // kill previous instance
        console.log("🛑 Stopped previous bot instance.");
    } catch {}
    fs.unlinkSync(LOCK_FILE);
}
fs.writeFileSync(LOCK_FILE, process.pid.toString());

// ------------------ Telegram Bot Token ------------------
async function getBotToken() {
    if (config.telegram?.token && config.telegram.token.trim() !== "") return config.telegram.token;

    process.stdout.write("Enter your Telegram Bot Token: ");
    return new Promise((resolve) => {
        process.stdin.once("data", (data) => {
            const token = data.toString().trim();
            if (!token) {
                console.error("❌ No token provided. Exiting...");
                process.exit(1);
            }
            if (!config.telegram) config.telegram = {};
            config.telegram.token = token;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4), "utf-8");
            console.log("✅ Telegram Bot Token saved to config.json");
            resolve(token);
        });
    });
}

// ------------------ Graceful Shutdown ------------------
function shutdown() {
    console.log("\n🛑 Shutting down Double Mighty Bot...");
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));
process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));

// ------------------ Main Bot Initialization ------------------
async function main() {
    try {
        const token = await getBotToken();

        // Initialize Telegram Bot
        const telegramBot = await initTelegramBot(token);

        // Load WhatsApp sessions
        const sessions = loadAllSessions();

        // Start WhatsApp Bot
        await startWhatsAppBot(sessions, telegramBot, config);

        console.log("🚀 Double Mighty Bot is running...");
    } catch (err) {
        console.error("❌ Error starting the bot:", err);
        process.exit(1);
    }
}

main();