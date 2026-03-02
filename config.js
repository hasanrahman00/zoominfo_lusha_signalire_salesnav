// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ CONFIGURATION FILE — v2.5.0
// ═══════════════════════════════════════════════════════════════════════════════

process.env.PW_CHROMIUM_ATTACH_TO_OTHER = '1';

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

const DEFAULTS = {
    CHROME_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    USER_DATA_DIR: 'C:\\Chrome_Scraper',
    PORT: 9222,
};

let userSettings = {};
try {
    if (fs.existsSync(SETTINGS_FILE)) {
        userSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
} catch {}

const PORT = userSettings.PORT || DEFAULTS.PORT;

module.exports = {
    PORT,
    CDP_URL: `http://127.0.0.1:${PORT}`,
    CHROME_PATH: userSettings.CHROME_PATH || DEFAULTS.CHROME_PATH,
    USER_DATA_DIR: userSettings.USER_DATA_DIR || DEFAULTS.USER_DATA_DIR,

    MAX_PAGES: 100,

    // ── Human-like scroll settings (v2.5.0 — slower & more natural) ──────
    SCROLL_OPTIONS: {
        trackerSelector: "a[data-control-name^='view_lead_panel']",
        minSteps: 12,           // was 8  — more scroll increments
        maxSteps: 18,           // was 12 — more scroll increments
        stepPx: 280,            // was 450 — smaller steps = more human
        minDelayMs: 500,        // was 300 — slower between steps
        maxDelayMs: 1200,       // was 700 — more variation in speed
        maxRounds: 30,          // was 25 — allow more scroll rounds
        bottomStallLimit: 4,    // was 3  — more patience at bottom
        pauseChance: 0.25,      // NEW: 25% chance of random mid-scroll pause
        pauseMinMs: 800,        // NEW: min pause duration
        pauseMaxMs: 2500,       // NEW: max pause duration
    },

    // Network URLs to intercept
    NETWORK_URLS: {
        LUSHA: 'plugin-services.lusha.com/api/v2/search',
        ZOOMINFO: 'app.zoominfo.com/ziapi/reachout-api-plg/api/v1/plg-match/peopleMatchBulk',
        SALESNAV: 'linkedin.com/sales-api/salesApiLeadSearch?q=searchQuery',
    },

    SETTINGS_FILE,
    DEFAULTS,
};