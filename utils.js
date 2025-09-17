// utils.js
import fs from "fs";
import path from "path";
import crypto from "crypto";

// -------------------- Config JSON Loader --------------------
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

// ------------------ Directory Helpers ------------------
export function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// ------------------ Passkey Generator ------------------
export function generatePasskey(length = config.botSettings.passkeyLength) {
    return crypto.randomBytes(length).toString("hex").slice(0, length);
}

// ------------------ Message Storage ------------------
export function saveMessage(userId, number, fileName, content) {
    const dir = path.join(config.whatsapp.messageStoragePath, String(userId), number);
    ensureDir(dir);
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, content);
    return filePath;
}

export function saveMedia(userId, number, fileName, buffer) {
    const dir = path.join(config.whatsapp.messageStoragePath, String(userId), number);
    ensureDir(dir);
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

// Save deleted WhatsApp message (text or media buffer)
export function saveDeletedMessage(userId, number, content, type = "text") {
    const timestamp = Date.now();
    const ext = type === "text"
        ? ".txt"
        : type === "image"
        ? ".jpg"
        : type === "video"
        ? ".mp4"
        : type === "voice"
        ? ".mp3"
        : ".bin";
    const fileName = `${timestamp}${ext}`;
    if (Buffer.isBuffer(content)) {
        return saveMedia(userId, number, fileName, content);
    } else {
        return saveMessage(userId, number, fileName, content);
    }
}

// Remove all user storage (for unlinking)
export function removeUserStorage(userId, number) {
    const dir = path.join(config.whatsapp.messageStoragePath, String(userId), number);
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        log(`✅ Cleared storage for user ${userId}, number ${number}`);
        return true;
    }
    return false;
}

// ------------------ Message Retrieval & Clearing ------------------
export function listMessages(userId, number) {
    const dir = path.join(config.whatsapp.messageStoragePath, String(userId), number);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map(f => path.join(dir, f));
}

export function clearMessages(userId, number) {
    return removeUserStorage(userId, number);
}

// ------------------ Logging ------------------
export function log(message) {
    if (!config.logs.enable) return;
    ensureDir(config.logs.path);
    const filePath = path.join(config.logs.path, "bot.log");
    const time = new Date().toISOString();
    fs.appendFileSync(filePath, `[${time}] ${message}\n`);
}

// ------------------ Pagination Helper ------------------
export function paginate(items, page = 1, limit = config.botSettings.paginationLimit) {
    const totalPages = Math.ceil(items.length / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    return {
        items: items.slice(start, end),
        page,
        totalPages
    };
}

// ------------------ Utility: Convert Base64 to Buffer ------------------
export function bufferFromBase64(data) {
    return Buffer.from(data, "base64");
}
