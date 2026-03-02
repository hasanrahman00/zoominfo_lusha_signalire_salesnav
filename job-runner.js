// ═══════════════════════════════════════════════════════════════════════════════
// 🎬 JOB RUNNER — VikiLeads v2.5.1
// ═══════════════════════════════════════════════════════════════════════════════
//
// FLOW (per page):
//   1. Scroll dashboard (background — steady human speed)
//   2. Activate Lusha + ZoomInfo (parallel — triggers API calls)
//   3. Wait for scroll + network responses (ZoomInfo + Lusha via CDP)
//   4. Minimize sidebars
//   5. Merge all 3 sources (network captured)
//   6. Save JSONL + generate CSV/XLSX
//   7. Navigate to next page
//
// v2.5.1: Browser CDP for Lusha service worker capture
//         Steady scroll (no random pauses)
//         Longer Lusha wait (up to 8s + retry)
// ═══════════════════════════════════════════════════════════════════════════════

process.env.PW_CHROMIUM_ATTACH_TO_OTHER = '1';

const config = require('./config');
const fs     = require('fs');
const path   = require('path');

const JOB_URL   = process.env.JOB_URL;
const JOB_DIR   = process.env.JOB_DIR;
const MAX_PAGES = parseInt(process.env.JOB_MAX_PAGES  || '100', 10);
const START_PAGE= parseInt(process.env.JOB_START_PAGE || '0',   10);

if (!JOB_URL || !JOB_DIR) { console.error('Missing JOB_URL or JOB_DIR'); process.exit(1); }
if (!fs.existsSync(JOB_DIR)) fs.mkdirSync(JOB_DIR, { recursive: true });

const LEADS_JSONL = path.join(JOB_DIR, 'leads.jsonl');
const LEADS_CSV   = path.join(JOB_DIR, 'leads.csv');

const { launchChrome }              = require('./tasks/launchChrome');
const { connectToBrowser }          = require('./tasks/connectBrowser');
const { navigateToLinkedIn }        = require('./tasks/navigateToLinkedIn');
const { scrollDashboardPage }       = require('./tasks/scrollDashboard');
const { getCurrentPageInfo }        = require('./tasks/getPageInfo');
const { goToNextPage }              = require('./tasks/navigateNextPage');
const { activateLusha, minimizeLusha }           = require('./tasks/activateLusha');
const { activateZoomInfo, minimizeZoomInfo }      = require('./tasks/activateZoomInfo');
const { setupNetworkCapture }       = require('./tasks/setupNetworkCapture');
const { mergePageData }             = require('./tasks/mergeData');
const { generateCSV }               = require('./tasks/generateCSV');
const { PageTracker }               = require('./tasks/pageTracker');


(async () => {
    let stopRequested = false;
    process.on('message', (msg) => {
        if (msg && msg.action === 'stop') {
            console.log('⏸ Stop requested — finishing current page...');
            stopRequested = true;
        }
    });

    const tracker = new PageTracker(JOB_DIR);

    try {
        console.log('══════════════════════════════════════════');
        console.log('🚀 JOB STARTING — VikiLeads v2.5.1');
        console.log(`📎 URL: ${JOB_URL.slice(0, 80)}...`);
        console.log(`📂 Output: ${JOB_DIR}`);
        if (START_PAGE > 0) console.log(`♻️ Resuming from page ${START_PAGE}`);
        console.log('══════════════════════════════════════════');

        await launchChrome(config.CHROME_PATH, config.PORT, config.USER_DATA_DIR);
        const { browser, context } = await connectToBrowser(config.CDP_URL);
        if (!fs.existsSync(LEADS_JSONL)) fs.writeFileSync(LEADS_JSONL, '');

        // Pass browser for CDP-level Lusha capture
        const captureStore = await setupNetworkCapture(context, browser);

        let navUrl = JOB_URL;
        if (START_PAGE > 1) {
            try { const u = new URL(navUrl); u.searchParams.set('page', String(START_PAGE)); navUrl = u.toString(); }
            catch { navUrl += (navUrl.includes('?') ? '&' : '?') + `page=${START_PAGE}`; }
        }
        const page = await navigateToLinkedIn(context, navUrl);

        console.log('⏳ Waiting for Sales Nav content...');
        try {
            await page.waitForSelector("a[data-control-name^='view_lead_panel']", { state: 'visible', timeout: 30000 });
            console.log('✅ Sales Nav content visible');
        } catch { console.log('⚠️ Sales Nav content not found — continuing'); }

        const startInfo = await getCurrentPageInfo(page);
        let currentPage = startInfo.pageNumber || START_PAGE || 1;
        let hasNextPage = true;

        while (hasNextPage && currentPage <= MAX_PAGES && !stopRequested) {
            const pageStart = Date.now();
            const pageNum   = currentPage;
            console.log(`\n📄 ═══ Page ${pageNum} ═══`);

            tracker.pageStarted(pageNum);
            captureStore.setPage(pageNum);
            captureStore.clearCurrent();

            // ══════════════════════════════════════════════════════════
            // SCROLL — background (steady human speed)
            // ══════════════════════════════════════════════════════════
            const scrollPromise = scrollDashboardPage(page, config.SCROLL_OPTIONS);

            // ══════════════════════════════════════════════════════════
            // STEP 1: Activate Lusha + ZoomInfo (parallel)
            // ══════════════════════════════════════════════════════════
            console.log('⚡ [Step 1] Lusha + ZoomInfo activation...');
            await Promise.allSettled([
                activateLusha(page),
                activateZoomInfo(page),
            ]);

            // ══════════════════════════════════════════════════════════
            // Wait for scroll to finish
            // ══════════════════════════════════════════════════════════
            await scrollPromise;

            // ══════════════════════════════════════════════════════════
            // STEP 2: Wait for network responses
            // ══════════════════════════════════════════════════════════
            console.log('⚡ [Step 2] Waiting for network responses...');

            // ── ZoomInfo wait (poll 500ms × 8 = 4s, then retry + 3s) ──
            let ziReady = captureStore.getCurrent().zoominfo.length > 0;
            if (!ziReady) {
                for (let w = 0; w < 8; w++) {
                    await page.waitForTimeout(500);
                    if (captureStore.getCurrent().zoominfo.length > 0) { ziReady = true; break; }
                }
                if (!ziReady) {
                    console.log('⚠️ ZoomInfo not received — retrying badge...');
                    await activateZoomInfo(page);
                    for (let w = 0; w < 6; w++) {
                        await page.waitForTimeout(500);
                        if (captureStore.getCurrent().zoominfo.length > 0) { ziReady = true; break; }
                    }
                    if (!ziReady) { console.log('⚠️ ZoomInfo missing'); tracker.note(pageNum, 'ZoomInfo missing'); }
                    else { console.log('✅ ZoomInfo arrived on retry'); }
                }
            } else { console.log('✅ ZoomInfo data available'); }

            // ── Lusha wait (longer: poll 500ms × 16 = 8s, then retry + 6s) ──
            let luReady = captureStore.getCurrent().lusha.length > 0;
            if (!luReady) {
                // First wait — up to 8s (CDP capture may take longer)
                for (let w = 0; w < 16; w++) {
                    await page.waitForTimeout(500);
                    if (captureStore.getCurrent().lusha.length > 0) { luReady = true; break; }
                }
                if (!luReady) {
                    console.log('⚠️ Lusha not received — retrying badge...');
                    await minimizeLusha(page);
                    await page.waitForTimeout(500);
                    await activateLusha(page);
                    // Second wait — up to 6s
                    for (let w = 0; w < 12; w++) {
                        await page.waitForTimeout(500);
                        if (captureStore.getCurrent().lusha.length > 0) { luReady = true; break; }
                    }
                    if (!luReady) { console.log('⚠️ Lusha missing after retry'); tracker.note(pageNum, 'Lusha missing'); }
                    else { console.log('✅ Lusha arrived on retry'); }
                }
            } else { console.log('✅ Lusha data available'); }

            // ══════════════════════════════════════════════════════════
            // STEP 3: Minimize sidebars
            // ══════════════════════════════════════════════════════════
            console.log('⚡ [Step 3] Minimizing sidebars...');
            await Promise.allSettled([
                minimizeLusha(page),
                minimizeZoomInfo(page),
            ]);

            // ── Page tracker ──────────────────────────────────────────
            tracker.pageExtracted(pageNum, {
                zi:    captureStore.getCurrent().zoominfo.length,
                lusha: captureStore.getCurrent().lusha.length,
            });

            // ══════════════════════════════════════════════════════════
            // STEP 4: Merge + Save
            // ══════════════════════════════════════════════════════════
            const salesNavLocs = captureStore.getSalesNavLocations();

            const pageData = {
                zoominfo:          captureStore.getCurrent().zoominfo,
                lusha:             captureStore.getCurrent().lusha,
                salesNavLocations: salesNavLocs,
            };

            const merged = mergePageData(pageData);
            tracker.pageMerged(pageNum, merged.length);

            if (merged.length > 0) {
                const lines = merged.map(r => JSON.stringify(r)).join('\n') + '\n';
                fs.appendFileSync(LEADS_JSONL, lines);
                console.log(`💾 Appended ${merged.length} leads`);
            } else if (captureStore.getCurrent().zoominfo.length === 0) {
                tracker.pageSkipped(pageNum, 'no ZoomInfo data — page will be missed');
            }

            const totalLeads = await generateCSV(LEADS_JSONL, LEADS_CSV);

            const elapsed = ((Date.now() - pageStart) / 1000).toFixed(1);
            console.log(`✅ Page ${pageNum} done — ${totalLeads} total — ${elapsed}s`);

            tracker.pageSaved(pageNum, totalLeads);

            if (stopRequested) break;

            // ── Navigate to next page ─────────────────────────────────
            const safeToNavigate = tracker.pageNavigating(pageNum);
            if (!safeToNavigate) {
                console.log(`⚠️ Continuing navigation despite tracker warning`);
            }

            console.log('➡️ Moving to next page...');
            const nextResult = await goToNextPage(page, currentPage);

            if (!nextResult.success) {
                hasNextPage = false;
                break;
            }

            tracker.pageNavigated(pageNum, nextResult.pageNumber);
            currentPage = nextResult.pageNumber;

            try {
                await page.waitForSelector("a[data-control-name^='view_lead_panel']", { state: 'visible', timeout: 15000 });
            } catch { console.log('⚠️ New page content slow'); }
        }

        await generateCSV(LEADS_JSONL, LEADS_CSV);

        if (stopRequested) {
            console.log(`\n⏸ Stopped at page ${currentPage}. GRACEFUL STOP.`);
        } else {
            console.log(`\n🏁 Completed!`);
        }

        try {
            const csvLines = fs.readFileSync(LEADS_CSV, 'utf-8').split('\n').filter(l => l.trim());
            console.log(`📊 Final: ${Math.max(0, csvLines.length - 1)} leads in CSV`);
        } catch {}

        tracker.summary();
        process.exit(0);

    } catch (error) {
        console.error(`\n❌ ERROR: ${error.message}`);
        tracker.summary();
        process.exit(1);
    }
})();
