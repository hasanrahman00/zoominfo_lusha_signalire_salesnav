// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 TASK: Activate & Minimize Lusha Extension — v2.5.0
// ═══════════════════════════════════════════════════════════════════════════════
// Purpose: Click Lusha badge to trigger the API call (network captured).
// v2.5.0: Data is now captured via network interception in setupNetworkCapture.
//         No more DOM extraction — we just need to trigger and minimize.
// ═══════════════════════════════════════════════════════════════════════════════

async function activateLusha(page) {
    console.log('🔵 [Lusha] Activating extension...');

    try {
        const lushaSelectors = [
            '#LU__extension_badge_main',
            '#LU__extension_badge_wrapper',
            'div[id="LU__extension_badge_main"]',
            '[id*="LU__extension_badge"]',
        ];

        let clicked = false;

        for (const selector of lushaSelectors) {
            try {
                const count = await page.locator(selector).count();
                if (count > 0) {
                    await page.evaluate((sel) => {
                        const el = document.querySelector(sel);
                        if (el) {
                            el.scrollIntoView({ block: 'center' });
                            el.click();
                        }
                    }, selector);
                    console.log('✅ [Lusha] Badge clicked — API triggered');
                    clicked = true;
                    break;
                }
            } catch {}
        }

        if (!clicked) {
            console.log('⚠️ [Lusha] Badge not found');
            return false;
        }

        // Wait briefly for iframe to appear (network response captured passively)
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(300);
            const frames = page.frames();
            const hasFrame = frames.some(f => {
                try {
                    return f.url().includes('LU__extension_iframe') ||
                           f.name() === 'LU__extension_iframe' ||
                           f.url().includes('lusha.com');
                } catch { return false; }
            });
            if (hasFrame) break;
        }
        await handleLushaPrivacyApproval(page);

        return true;

    } catch (error) {
        console.log(`⚠️ [Lusha] Activation error: ${error.message}`);
        return false;
    }
}


async function minimizeLusha(page) {
    try {
        // Method 1: Click minimize inside Lusha iframe
        const frames = page.frames();
        for (const frame of frames) {
            try {
                const url = frame.url();
                const name = frame.name();
                if (url.includes('LU__extension_iframe') ||
                    name === 'LU__extension_iframe' ||
                    url.includes('lusha.com')) {

                    const clicked = await frame.evaluate(() => {
                        const btn = document.querySelector('.minimize-icon-container img[alt="Minimize"]')
                            || document.querySelector('.minimize-icon-container')
                            || document.querySelector('img[src*="Minimize.svg"]');
                        if (btn) {
                            const target = btn.closest('.minimize-icon-container') || btn;
                            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                            return true;
                        }
                        return false;
                    }).catch(() => false);

                    if (clicked) {
                        console.log('✅ [Lusha] Sidebar minimized');
                        return true;
                    }
                }
            } catch {}
        }

        // Method 2: iframe by element ID
        try {
            const el = await page.$('iframe#LU__extension_iframe');
            if (el) {
                const frame = await el.contentFrame();
                if (frame) {
                    const clicked = await frame.evaluate(() => {
                        const btn = document.querySelector('.minimize-icon-container img[alt="Minimize"]')
                            || document.querySelector('.minimize-icon-container');
                        if (btn) {
                            const target = btn.closest('.minimize-icon-container') || btn;
                            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                            return true;
                        }
                        return false;
                    }).catch(() => false);
                    if (clicked) {
                        console.log('✅ [Lusha] Sidebar minimized (via element)');
                        return true;
                    }
                }
            }
        } catch {}

        console.log('⚠️ [Lusha] Minimize button not found');
        return false;

    } catch (error) {
        console.log(`⚠️ [Lusha] Minimize error: ${error.message}`);
        return false;
    }
}


async function handleLushaPrivacyApproval(page) {
    try {
        const frames = page.frames();
        for (const frame of frames) {
            try {
                const url = frame.url();
                if (url.includes('lusha') || url.includes('LU__extension')) {
                    const clicked = await frame.evaluate(() => {
                        const button = document.querySelector('[data-test-id="privacy-approval-button"]')
                            || Array.from(document.querySelectorAll('button')).find(b =>
                                /got it,?\s*let'?s? go/i.test(b.textContent || '')
                            );
                        if (button) { button.click(); return true; }
                        return false;
                    }).catch(() => false);
                    if (clicked) {
                        console.log('✅ [Lusha] Privacy approval handled');
                        return true;
                    }
                }
            } catch {}
        }
    } catch {}
    return false;
}


module.exports = { activateLusha, minimizeLusha };