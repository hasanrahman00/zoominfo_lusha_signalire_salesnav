// ═════════════════════════════════════════════════════════════════
// TASK: Scroll Dashboard Page
// ═════════════════════════════════════════════════════════════════
// Purpose: Human-like scrolling to load all leads on current page
// No external dependencies - all logic self-contained
// ═════════════════════════════════════════════════════════════════

// Helper: Random integer between min and max (inclusive)
const randInt = (min, max) => {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return Math.floor(Math.random() * (high - low + 1)) + low;
};

async function scrollDashboardPage(page, options = {}) {

    console.log('📜 Scrolling dashboard to load leads...');

    // Configure scroll behavior
    const trackerSelector = options.trackerSelector || "a[data-control-name^='view_lead_panel']";
    const scrollSelector = options.scrollSelector || null;
    const maxSteps = randInt(options.minSteps || 10, options.maxSteps || 15);
    const stepPx = options.stepPx || 300;
    const minDelayMs = options.minDelayMs || 300;
    const maxDelayMs = options.maxDelayMs || 700;
    const highlight = options.highlight || false;
    const timeoutMs = options.timeoutMs || 15000;
    const maxRounds = options.maxRounds || 25;
    const bottomStallLimit = options.bottomStallLimit || 5;

    console.log(`🖱️ Starting scroll (${maxSteps} steps)...`);

    // Wait for lead tracker element to appear
    try {
        await page.waitForSelector(trackerSelector, { state: 'visible', timeout: timeoutMs });
        console.log(`✅ Found lead elements`);
    } catch (e) {
        console.log(`⚠️ Lead tracker not found: ${trackerSelector}`);
        return 'tracker-not-found';
    }

    // Execute scroll in browser context
    const result = await page.evaluate(`
        (async () => {
            const cfg = {
                scrollSelector: ${JSON.stringify(scrollSelector)},
                maxSteps: ${maxSteps},
                stepPx: ${stepPx},
                minDelayMs: ${minDelayMs},
                maxDelayMs: ${maxDelayMs},
                highlight: ${highlight},
                maxRounds: ${maxRounds},
                bottomStallLimit: ${bottomStallLimit}
            };

            const delay = (ms) => new Promise((res) => setTimeout(res, ms));
            const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

            // Find scrollable container
            let el = null;
            if (cfg.scrollSelector) {
                el = document.querySelector(cfg.scrollSelector);
            }

            if (!el) {
                const cands = Array.from(document.querySelectorAll('main, section, div, ul, ol'))
                    .filter((n) => n.scrollHeight > n.clientHeight && n.offsetHeight > 300)
                    .sort((a, b) => b.clientHeight - a.clientHeight);
                el = cands[0] || null;
            }

            if (!el) {
                return 'no-scroll-container';
            }

            if (cfg.highlight) {
                el.style.outline = '2px solid red';
            }

            // Scroll with stall detection
            let lastTop = -1;
            let same = 0;
            let rounds = 0;

            while (rounds < cfg.maxRounds) {
                for (let i = 0; i < cfg.maxSteps; i++) {
                    el.scrollBy({ top: cfg.stepPx, behavior: 'smooth' });
                    await delay(rand(cfg.minDelayMs, cfg.maxDelayMs));

                    const curr = el.scrollTop;
                    if (curr === lastTop) {
                        same += 1;
                        if (same >= cfg.bottomStallLimit) {
                            return 'scroll-complete';
                        }
                    } else {
                        same = 0;
                        lastTop = curr;
                    }
                }
                rounds += 1;
            }

            return 'scroll-max-rounds';
        })()
    `);

    console.log(`✅ Scrolling completed: ${result}`);
    return result;
}

module.exports = { scrollDashboardPage };
