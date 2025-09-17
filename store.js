// store.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "./config.js";
import { generatePasskey, ensureDir } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_PATH = path.join(__dirname, "data");
const USERS_FILE = path.join(STORE_PATH, "users.json");

// Ensure data directory exists
ensureDir(STORE_PATH);

// ------------------ Users Data ------------------
function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) return { authorized: {}, pending: {} };
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    } catch {
        return { authorized: {}, pending: {} };
    }
}

function saveUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 4));
}

// ------------------ Access Management ------------------
export function requestAccess(userId) {
    const users = loadUsers();
    if (users.authorized[userId] || users.pending[userId]) return false;
    users.pending[userId] = { requestedAt: Date.now() };
    saveUsers(users);
    return true;
}

export function approveAccess(userId) {
    const users = loadUsers();
    if (!users.pending[userId]) return null;
    const passkey = generatePasskey();
    users.authorized[userId] = { passkey, verified: false, linkedNumbers: [] };
    delete users.pending[userId];
    saveUsers(users);
    return passkey;
}

export function verifyPasskey(userId, passkey) {
    const users = loadUsers();
    if (!users.authorized[userId]) return false;
    if (users.authorized[userId].passkey === passkey) {
        users.authorized[userId].verified = true;
        users.authorized[userId].passkey = null; // clear after verification
        saveUsers(users);
        return true;
    }
    return false;
}

export function removeUser(userId) {
    const users = loadUsers();
    delete users.authorized[userId];
    delete users.pending[userId];
    saveUsers(users);
}

// ------------------ Users Listing ------------------
export function listAuthorized() {
    return Object.keys(loadUsers().authorized);
}
export function listPending() {
    return Object.keys(loadUsers().pending);
}

// ------------------ WhatsApp Numbers ------------------
export function linkNumber(userId, number) {
    const users = loadUsers();
    if (!users.authorized[userId]) return false;

    const numbers = users.authorized[userId].linkedNumbers || [];
    if (numbers.length >= config.limits.maxLinkedNumbersPerUser) return false;

    if (!numbers.includes(number)) {
        numbers.push(number);
        users.authorized[userId].linkedNumbers = numbers;
        saveUsers(users);
    }
    return true;
}

export function unlinkNumber(userId, number) {
    const users = loadUsers();
    if (!users.authorized[userId]) return false;

    users.authorized[userId].linkedNumbers =
        (users.authorized[userId].linkedNumbers || []).filter(n => n !== number);
    saveUsers(users);
    return true;
}

export function listNumbers(userId) {
    const users = loadUsers();
    return users.authorized[userId]?.linkedNumbers || [];
}