// ═══════════════════════════════════════════════════════════════════════════════
// ⚙️ CONFIGURATION FILE
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

    SCROLL_OPTIONS: {
        trackerSelector: "a[data-control-name^='view_lead_panel']",
        minSteps: 8,
        maxSteps: 12,
        stepPx: 450,
        minDelayMs: 300,
        maxDelayMs: 700,
        maxRounds: 25,
        bottomStallLimit: 3,
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
