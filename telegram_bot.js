// telegram_bot.js
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { linkWhatsAppNumber, unlinkWhatsAppNumber, getDeletedMessages } from "./whatsapp_bot.js";
import { fileURLToPath } from "url";

// -------------------- Config JSON Loader --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "config.json");
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

// Ensure users object exists
if (!config.users) config.users = {};

// ------------------ Helpers ------------------
function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
}

function isAdmin(userId) {
    return userId.toString() === config.admin?.id?.toString();
}

function generatePasskey() {
    const length = config.botSettings?.passkeyLength || 8;
    return Math.random().toString(36).slice(2, 2 + length).toUpperCase();
}

const LOCK_FILE = path.join(__dirname, ".bot_lock");

// ------------------ Bot Initialization ------------------
async function initBot(token) {
    // Single Instance Enforcement
    if (fs.existsSync(LOCK_FILE)) {
        const oldPid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8"));
        try { 
            process.kill(oldPid, 0); 
            process.kill(oldPid); 
            console.log("🛑 Stopped previous bot instance."); 
        } catch {}
        fs.unlinkSync(LOCK_FILE);
    }
    fs.writeFileSync(LOCK_FILE, process.pid.toString());

    const bot = new TelegramBot(token, { polling: true });

    bot.on("polling_error", async (err) => {
        if (err.code === "ETELEGRAM" && err.response?.statusCode === 409) {
            console.log("⚠️ 409 Conflict detected. Restarting polling...");
            await bot.stopPolling();
            setTimeout(() => bot.startPolling(), 1000);
        } else {
            console.error("Polling error:", err);
        }
    });

    return bot;
}

// ------------------ User Commands ------------------
async function handleStart(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    if (isAdmin(userId)) return bot.sendMessage(chatId, "Welcome Admin!");

    if (config.users[userId]?.authorized) return bot.sendMessage(chatId, "You already have access.");

    if (!config.users[userId]) config.users[userId] = { authorized: false, passkey: null, linkedNumbers: {} };
    saveConfig();

    if (!config.admin?.id) return bot.sendMessage(chatId, "Admin not set. Wait until admin approves.");

    // Notify admin
    bot.sendMessage(config.admin.id, `New user request from @${msg.from.username || userId}\nGrant / Ignore?`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Grant", callback_data: `grant_${userId}` }, { text: "Ignore", callback_data: `ignore_${userId}` }]
            ]
        }
    });

    bot.sendMessage(chatId, "✅ Your request has been sent to admin.");
}

async function handleVerify(bot, msg, key) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    if (config.users[userId]?.passkey === key) {
        config.users[userId].authorized = true;
        config.users[userId].passkey = null;
        saveConfig();
        bot.sendMessage(chatId, "✅ Access granted! You can now use commands.");
    } else {
        bot.sendMessage(chatId, "❌ Invalid passkey.");
    }
}

// ------------------ WhatsApp Linking ------------------
async function handleLink(bot, msg) {
    const userId = msg.from.id.toString();
    if (!config.users[userId]?.authorized) return bot.sendMessage(msg.chat.id, "❌ You are not authorized.");

    bot.sendMessage(msg.chat.id, "Send the WhatsApp number to link (with country code):");
    bot.once("message", async (reply) => {
        const number = reply.text.trim();
        const res = await linkWhatsAppNumber(userId, number, bot);
        bot.sendMessage(msg.chat.id, res);
    });
}

async function handleUnlink(bot, msg) {
    const userId = msg.from.id.toString();
    if (!config.users[userId]?.authorized) return bot.sendMessage(msg.chat.id, "❌ You are not authorized.");

    bot.sendMessage(msg.chat.id, "Send the WhatsApp number to unlink:");
    bot.once("message", async (reply) => {
        const number = reply.text.trim();
        const res = await unlinkWhatsAppNumber(userId, number, bot);
        bot.sendMessage(msg.chat.id, res);
    });
}

async function handleView(bot, msg) {
    const userId = msg.from.id.toString();
    if (!config.users[userId]?.authorized) return bot.sendMessage(msg.chat.id, "❌ You are not authorized.");

    const numbers = Object.keys(config.users[userId]?.linkedNumbers || {});
    if (!numbers.length) return bot.sendMessage(msg.chat.id, "No linked WhatsApp numbers.");

    const buttons = numbers.map(n => [{ text: n, callback_data: `view_${n}` }]);
    bot.sendMessage(msg.chat.id, "Select a number to view deleted messages:", {
        reply_markup: { inline_keyboard: buttons }
    });
}

// ------------------ Callback Queries ------------------
async function handleAdminCallback(bot, query) {
    const data = query.data;
    const fromId = query.from.id.toString();
    if (!isAdmin(fromId)) return;

    if (data.startsWith("grant_")) {
        const uid = data.split("_")[1];
        const passkey = generatePasskey();
        config.users[uid].passkey = passkey;
        saveConfig();
        bot.sendMessage(uid, `Your passkey: ${passkey}\nSend /verify <passkey> to unlock access.`);
        bot.editMessageText("✅ User granted passkey.", { chat_id: query.message.chat.id, message_id: query.message.message_id });
    } else if (data.startsWith("ignore_")) {
        const uid = data.split("_")[1];
        bot.sendMessage(uid, "❌ Your request was ignored by admin.");
        bot.editMessageText("User ignored.", { chat_id: query.message.chat.id, message_id: query.message.message_id });
    }
}

async function handleUserCallback(bot, query) {
    const userId = query.from.id.toString();
    if (!config.users[userId]?.authorized) return;

    const data = query.data;
    if (data.startsWith("view_")) {
        const number = data.split("_")[1];
        const messages = await getDeletedMessages(userId, number);
        if (!messages.length) return bot.sendMessage(query.message.chat.id, "No deleted messages.");
        messages.forEach(m => bot.sendMessage(query.message.chat.id, `From ${m.from}: ${m.content}`));
    }
}

// ------------------ Exported Initialization ------------------
export async function initTelegramBot(token) {
    const bot = await initBot(token);

    // Commands
    bot.onText(/\/start/, msg => handleStart(bot, msg));
    bot.onText(/\/verify (.+)/, (msg, match) => handleVerify(bot, msg, match[1]));
    bot.onText(/\/link/, msg => handleLink(bot, msg));
    bot.onText(/\/unlink/, msg => handleUnlink(bot, msg));
    bot.onText(/\/view/, msg => handleView(bot, msg));

    // Callback queries
    bot.on("callback_query", async (query) => {
        await handleAdminCallback(bot, query);
        await handleUserCallback(bot, query);
    });

    console.log("✅ Telegram bot initialized and polling...");
    return bot;
}
