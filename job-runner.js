// ═══════════════════════════════════════════════════════════════════════════════
// 🎬 JOB RUNNER — VikiLeads v2.4.0
// ═══════════════════════════════════════════════════════════════════════════════
//
// FLOW (per page):
//   1. Scroll dashboard (background)
//   2. Activate Lusha + ZoomInfo (parallel)
//   3. Wait for scroll + ZoomInfo network
//   4. Extract Lusha + Minimize sidebars
//   5. Merge ZoomInfo (network) + Lusha (DOM) + Sales Nav locations
//   6. Save JSONL + generate CSV/XLSX
//   7. Navigate to next page
//
// PAGE TRACKER:
//   Logs every page start/extract/merge/save/navigate to pageTracker.json
//   Detects skipped pages, double-navigation, unsaved pages
//   Prints summary at end of run
//
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
const { activateZoomInfo, minimizeZoomInfo }     = require('./tasks/activateZoomInfo');
const { setupNetworkCapture }       = require('./tasks/setupNetworkCapture');
const { extractLushaContacts }      = require('./tasks/extractLusha');
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
        console.log('🚀 JOB STARTING — Sales Nav Extraction');
        console.log(`📎 URL: ${JOB_URL.slice(0, 80)}...`);
        console.log(`📂 Output: ${JOB_DIR}`);
        if (START_PAGE > 0) console.log(`♻️ Resuming from page ${START_PAGE}`);
        console.log('══════════════════════════════════════════');

        await launchChrome(config.CHROME_PATH, config.PORT, config.USER_DATA_DIR);
        const { browser, context } = await connectToBrowser(config.CDP_URL);
        if (!fs.existsSync(LEADS_JSONL)) fs.writeFileSync(LEADS_JSONL, '');
        const captureStore = await setupNetworkCapture(context);

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

            // ── Page tracker: start ───────────────────────────────────
            tracker.pageStarted(pageNum);

            captureStore.setPage(pageNum);
            captureStore.clearCurrent();

            // ══════════════════════════════════════════════════════════
            // SCROLL — background, ~5-7s, overlaps everything below
            // ══════════════════════════════════════════════════════════
            const scrollPromise = scrollDashboardPage(page, config.SCROLL_OPTIONS);

            // ══════════════════════════════════════════════════════════
            // STEP 1: Lusha + ZoomInfo (parallel)
            // ══════════════════════════════════════════════════════════
            console.log('⚡ [Step 1] Lusha + ZoomInfo...');
            await Promise.allSettled([
                activateLusha(page),
                activateZoomInfo(page),
            ]);

            // ══════════════════════════════════════════════════════════
            // Wait for scroll to finish (likely already done)
            // ══════════════════════════════════════════════════════════
            await scrollPromise;

            // ══════════════════════════════════════════════════════════
            // ZoomInfo network wait (poll 500ms, max 3s + retry 3s)
            // ══════════════════════════════════════════════════════════
            let ziReady = captureStore.getCurrent().zoominfo.length > 0;
            if (!ziReady) {
                for (let w = 0; w < 6; w++) {
                    await page.waitForTimeout(500);
                    if (captureStore.getCurrent().zoominfo.length > 0) { ziReady = true; break; }
                }
                if (!ziReady) {
                    console.log('⚠️ ZoomInfo not received — retrying badge...');
                    await activateZoomInfo(page);
                    for (let w = 0; w < 6; w++) {
                        await page.waitForTimeout(500);
                        if (captureStore.getCurrent().zoominfo.length > 0) {
                            ziReady = true;
                            console.log('✅ ZoomInfo arrived on retry');
                            break;
                        }
                    }
                    if (!ziReady) {
                        console.log('⚠️ ZoomInfo not received after retry');
                        tracker.note(pageNum, 'ZoomInfo missing');
                    }
                }
            } else {
                console.log('✅ ZoomInfo data available');
            }

            // ══════════════════════════════════════════════════════════
            // STEP 2: Extract Lusha + Minimize all (parallel)
            // ══════════════════════════════════════════════════════════
            console.log('⚡ [Step 2] Extract + Minimize...');

            const [lushaResult] = await Promise.allSettled([
                extractLushaContacts(page, {
                    maxWaitSec:  4,
                    maxCards:    25,
                    maxRetries:  3,
                }),
                minimizeLusha(page),
                minimizeZoomInfo(page),
            ]);

            const lushaContacts = lushaResult.status === 'fulfilled' ? lushaResult.value : [];

            // ── Page tracker: extracted ───────────────────────────────
            tracker.pageExtracted(pageNum, {
                zi:    captureStore.getCurrent().zoominfo.length,
                lusha: lushaContacts.length,
            });

            // ══════════════════════════════════════════════════════════
            // Merge + Save
            // ══════════════════════════════════════════════════════════
            const salesNavLocs = captureStore.getSalesNavLocations();

            const pageData = {
                zoominfo:          captureStore.getCurrent().zoominfo,
                lusha:             lushaContacts,
                salesNavLocations: salesNavLocs,
            };

            const merged = mergePageData(pageData);

            // ── Page tracker: merged ──────────────────────────────────
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

            // ── Page tracker: saved ───────────────────────────────────
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

            // ── Page tracker: navigated ───────────────────────────────
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

        // ── Final page tracker summary ────────────────────────────────
        tracker.summary();

        process.exit(0);

    } catch (error) {
        console.error(`\n❌ ERROR: ${error.message}`);
        tracker.summary();
        process.exit(1);
    }
})();
