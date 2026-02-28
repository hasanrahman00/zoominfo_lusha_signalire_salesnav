// ═══════════════════════════════════════════════════════════════════════════════
// 🔍 TASK: Activate ZoomInfo Extension — SPEED OPTIMIZED
// ═══════════════════════════════════════════════════════════════════════════════
// Purpose: Click ZoomInfo badge to trigger network API call.
// Data is captured by setupNetworkCapture.js (network interception).
// We do NOT need to wait for the sidebar to visually load.
//
// OPTIMIZATIONS vs previous:
//   - Removed 1.5s startup delay (iframe already injected)
//   - Removed 4s data load wait (network capture handles it)
//   - Poll for iframe 300ms instead of 1s intervals
//   - Total: ~0.5s instead of ~5.5s
// ═══════════════════════════════════════════════════════════════════════════════

async function getZoomInfoFrame(page) {
    const frames = page.frames();
    for (const frame of frames) {
        try {
            const url = frame.url();
            if (url.includes('ro.zoominfo.com') || url.includes('zoominfo')) {
                return frame;
            }
        } catch {}
    }

    const selectors = [
        'iframe#reachout-extension-app-iframe',
        'iframe#reachout-platform-app-iframe',
        'iframe.zoomInfo-extension-main-frame',
        'iframe[title="ZoomInfo Anywhere"]',
        'iframe[title*="ZoomInfo"]',
    ];

    for (const sel of selectors) {
        try {
            const el = await page.$(sel);
            if (el) {
                const frame = await el.contentFrame();
                if (frame) return frame;
            }
        } catch {}
    }

    return null;
}

async function activateZoomInfo(page) {
    console.log('🔵 [ZoomInfo] Activating extension...');

    try {
        // Poll for iframe (300ms intervals, max 3s)
        let ziFrame = null;
        for (let i = 0; i < 10; i++) {
            ziFrame = await getZoomInfoFrame(page);
            if (ziFrame) break;
            await page.waitForTimeout(300);
        }

        if (!ziFrame) {
            console.log('⚠️ [ZoomInfo] Iframe not found — extension may not be installed');
            return false;
        }

        console.log('✅ [ZoomInfo] Iframe detected');

        // Click the badge — this triggers the network API call
        // Network capture (setupNetworkCapture.js) catches the response
        const badgeClicked = await ziFrame.evaluate(() => {
            const badge = document.querySelector('#zi-logo-btn')
                || document.querySelector('.ro-right_btns-group')
                || document.querySelector('[id*="zi-logo"]');
            if (badge) {
                badge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                return true;
            }
            return false;
        }).catch(() => false);

        if (!badgeClicked) {
            const mainClicked = await page.evaluate(() => {
                const badge = document.querySelector('#zi-logo-btn')
                    || document.querySelector('.ro-right_btns-group');
                if (badge) { badge.click(); return true; }
                return false;
            });

            if (!mainClicked) {
                console.log('⚠️ [ZoomInfo] Badge not found');
                return false;
            }
        }

        console.log('✅ [ZoomInfo] Badge clicked — API triggered');
        // NO wait here — network capture handles data collection
        return true;

    } catch (error) {
        console.log(`⚠️ [ZoomInfo] Activation error: ${error.message}`);
        return false;
    }
}

async function minimizeZoomInfo(page) {
    try {
        console.log('🔵 [ZoomInfo] Minimizing sidebar...');

        const ziFrame = await getZoomInfoFrame(page);

        if (ziFrame) {
            const minimized = await ziFrame.evaluate(() => {
                const btn = document.querySelector('#minimize-from-open-btn')
                    || document.querySelector('.menu-btn-wrapper.open-view')
                    || document.querySelector('.ro-right-arrow');
                if (btn) {
                    const clickTarget = btn.closest('.menu-btn-wrapper') || btn;
                    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    return true;
                }
                return false;
            }).catch(() => false);

            if (minimized) {
                console.log('✅ [ZoomInfo] Sidebar minimized');
                return true;
            }
        }

        const mainMinimized = await page.evaluate(() => {
            const btn = document.querySelector('#minimize-from-open-btn')
                || document.querySelector('.menu-btn-wrapper.open-view');
            if (btn) { btn.click(); return true; }
            return false;
        });

        if (mainMinimized) {
            console.log('✅ [ZoomInfo] Sidebar minimized (from main DOM)');
            return true;
        }

        console.log('⚠️ [ZoomInfo] Minimize button not found');
        return false;

    } catch (error) {
        console.log(`⚠️ [ZoomInfo] Error minimizing: ${error.message}`);
        return false;
    }
}

module.exports = { activateZoomInfo, minimizeZoomInfo, getZoomInfoFrame };
