// ═══════════════════════════════════════════════════════════════════════════════
// TASK: Setup Network Capture — ZoomInfo + Lusha + Sales Nav (v2.6.0)
// ═══════════════════════════════════════════════════════════════════════════════
//
// v2.6.0 CHANGES:
//   - Sales Nav parser now extracts FULL records (not just locations)
//   - New fields: about, premium, degree, position details, tenure
//   - captureStore now has `_latestSalesNavRecords` for full records
//   - `_latestSalesNav` (locations) kept for backward compat
//
// ZoomInfo   → page.on('response')              → works (iframe fetch)
// Lusha      → browser CDP auto-attach           → captures service worker traffic
// Sales Nav  → page.on('response')              → works (same-page request)
// ═══════════════════════════════════════════════════════════════════════════════

const config = require('../config');
const { cleanName } = require('./nameCleaner');
const { parseLocation } = require('./enrichLocation');

async function setupNetworkCapture(context, browser) {
    const captureStore = {
        pages: {},
        currentPage: 1,
        _latestSalesNav: [],
        _latestSalesNavRecords: [],      // ← NEW: full parsed records

        getCurrent() {
            if (!this.pages[this.currentPage]) {
                this.pages[this.currentPage] = { zoominfo: [], lusha: [] };
            }
            return this.pages[this.currentPage];
        },

        setPage(num) {
            this.currentPage = num;
            if (!this.pages[num]) this.pages[num] = { zoominfo: [], lusha: [] };
        },

        clearCurrent() {
            this.pages[this.currentPage] = { zoominfo: [], lusha: [] };
        },

        getSalesNavLocations() {
            return this._latestSalesNav;
        },

        getSalesNavRecords() {
            return this._latestSalesNavRecords;
        },
    };

    // ═════════════════════════════════════════════════════════════════════
    // LAYER 1: page.on('response') — catches ZoomInfo + Sales Nav + Lusha fallback
    // ═════════════════════════════════════════════════════════════════════
    const attachToPage = async (pageTarget) => {
        try {
            pageTarget.on('response', async (response) => {
                try {
                    const url = response.url();
                    if (response.status() < 200 || response.status() >= 300) return;

                    if (url.includes(config.NETWORK_URLS.ZOOMINFO)) {
                        const body = await response.json().catch(() => null);
                        if (body) parseZoomInfoResponse(body, captureStore);
                    }

                    if (url.includes(config.NETWORK_URLS.LUSHA)) {
                        const body = await response.json().catch(() => null);
                        if (body) {
                            console.log('📡 [Lusha] Captured via page listener');
                            parseLushaResponse(body, captureStore);
                        }
                    }

                    if (url.includes(config.NETWORK_URLS.SALESNAV)) {
                        const body = await response.json().catch(() => null);
                        if (body) parseSalesNavResponse(body, captureStore);
                    }
                } catch {}
            });
        } catch {}
    };

    for (const pg of context.pages()) await attachToPage(pg);
    context.on('page', attachToPage);

    // Also listen on background pages (Lusha MV2 fallback)
    try {
        for (const bg of context.backgroundPages()) await attachToPage(bg);
        context.on('backgroundpage', attachToPage);
    } catch {}

    // ═════════════════════════════════════════════════════════════════════
    // LAYER 2: Browser CDP auto-attach — catches Lusha service worker
    // ═════════════════════════════════════════════════════════════════════
    try {
        const browserCDP = await browser.newBrowserCDPSession();
        const attachedSessions = new Map();
        const lushaRequests    = new Map();
        const pendingBodies    = new Map();

        await browserCDP.send('Target.setAutoAttach', {
            autoAttach: true,
            waitForDebuggerOnStart: false,
            flatten: false,
        });

        browserCDP.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
            const type = targetInfo.type || '';
            const url  = targetInfo.url  || '';

            if (type === 'service_worker' || type === 'background_page' || url.includes('lusha')) {
                attachedSessions.set(sessionId, targetInfo);
                console.log(`📡 [CDP] Attached: ${type} — ${url.slice(0, 80)}`);

                browserCDP.send('Target.sendMessageToTarget', {
                    sessionId,
                    message: JSON.stringify({ id: 1, method: 'Network.enable', params: {} }),
                }).catch(() => {});
            }
        });

        browserCDP.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
            if (!attachedSessions.has(sessionId)) return;

            let msg;
            try { msg = JSON.parse(message); } catch { return; }

            if (msg.method === 'Network.responseReceived') {
                const url    = msg.params?.response?.url || '';
                const status = msg.params?.response?.status || 0;

                if (url.includes('lusha') && url.includes('/api/') && status >= 200 && status < 300) {
                    console.log(`📡 [CDP] Lusha response detected: ${url.slice(0, 100)}`);
                    lushaRequests.set(msg.params.requestId, sessionId);
                }
            }

            if (msg.method === 'Network.loadingFinished') {
                const reqSessionId = lushaRequests.get(msg.params.requestId);
                if (!reqSessionId) return;
                lushaRequests.delete(msg.params.requestId);

                const msgId = Date.now() + Math.random();
                pendingBodies.set(msgId, true);

                browserCDP.send('Target.sendMessageToTarget', {
                    sessionId: reqSessionId,
                    message: JSON.stringify({
                        id: msgId,
                        method: 'Network.getResponseBody',
                        params: { requestId: msg.params.requestId },
                    }),
                }).catch(() => pendingBodies.delete(msgId));
            }

            if (msg.id && pendingBodies.has(msg.id) && msg.result) {
                pendingBodies.delete(msg.id);
                try {
                    const raw = msg.result.base64Encoded
                        ? Buffer.from(msg.result.body, 'base64').toString('utf-8')
                        : msg.result.body;
                    const json = JSON.parse(raw);
                    console.log('📡 [CDP] Lusha body captured from service worker');
                    parseLushaResponse(json, captureStore);
                } catch (e) {
                    console.log(`⚠️ [CDP] Lusha body parse error: ${e.message}`);
                }
            }
        });

        const { targetInfos } = await browserCDP.send('Target.getTargets');
        for (const t of targetInfos) {
            if (t.type === 'service_worker' || t.type === 'background_page' || (t.url && t.url.includes('lusha'))) {
                try {
                    await browserCDP.send('Target.attachToTarget', {
                        targetId: t.targetId,
                        flatten: false,
                    });
                } catch {}
            }
        }

        console.log(`✅ Network capture attached (page + CDP) — ${targetInfos.length} targets found`);

    } catch (err) {
        console.log(`⚠️ Browser CDP setup: ${err.message} — using page-level only`);
    }

    return captureStore;
}


// ═══════════════════════════════════════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════════════════════════════════════

function parseZoomInfoResponse(body, store) {
    try {
        const results = Array.isArray(body) ? body
            : (body.data || body.results || body.matches || []);
        if (!Array.isArray(results)) return;

        const current = store.getCurrent();
        let count = 0;

        for (const item of results) {
            if (!item || !item.person) continue;
            const p = item.person;
            const c = item.company || {};

            const firstName = (p.firstName || '').trim();
            const lastName  = (p.lastName  || '').trim();
            if (!firstName && !lastName) continue;

            const fullName = (p.name || `${firstName} ${lastName}`).trim();
            if (current.zoominfo.some(z => z.fullName === fullName)) continue;

            current.zoominfo.push({
                firstName, lastName, fullName,
                title:              p.title || '',
                department:         p.orgChartJobFunction?.[0]?.department || '',
                jobFunction:        p.orgChartJobFunction?.[0]?.jobFunction || '',
                personFax:          p.fax || '',
                city:               p.localAddress?.city    || '',
                state:              p.localAddress?.state   || '',
                country:            p.localAddress?.country || '',
                companyName:        c.name    || '',
                companyWebsite:     c.website || '',
                companyDescription: (c.description || '').replace(/[\r\n]+/g, ' '),
                industry:           c.industry || '',
                revenue:            c.revenue  || '',
                employeeCount:      c.employeeCount  || '',
                employeeRange:      c.employeesRange || '',
                companyPhone:       c.phone || '',
                companyFax:         c.fax   || '',
                alexaRank:          c.alexaRank || '',
                companyFullAddress: c.location || '',
                companyStreet:      c.locationObj?.street  || '',
                companyCity:        c.locationObj?.city    || c.city  || '',
                companyState:       c.locationObj?.state   || c.state || '',
                companyCountry:     c.locationObj?.country || '',
                companyZip:         c.locationObj?.zip     || '',
                topCompetitorId:    c.similarCompanies?.[0]?.id   || '',
                topCompetitorName:  c.similarCompanies?.[0]?.name || '',
            });
            count++;
        }

        if (count > 0) {
            console.log(`🟢 [ZoomInfo] Captured ${count} profiles (page ${store.currentPage})`);
        }
    } catch (err) {
        console.log(`⚠️ [ZoomInfo] Parse error: ${err.message}`);
    }
}


function parseLushaResponse(body, store) {
    try {
        const contacts = Array.isArray(body) ? body
            : (body.data?.contacts || body.contacts || body.results || []);
        if (!Array.isArray(contacts)) return;

        const current = store.getCurrent();
        let count = 0;

        for (const item of contacts) {
            if (!item) continue;

            const firstName = (item.firstName || '').trim();
            const lastName  = (item.lastName  || '').trim();
            if (!firstName && !lastName) continue;

            const fullName = (item.fullName || `${firstName} ${lastName}`).trim();

            let domain = '';
            if (Array.isArray(item.emails)) {
                for (const email of item.emails) {
                    const addr = (email.address || '').trim();
                    if (!addr) continue;
                    const atMatch = addr.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
                    if (atMatch) {
                        domain = atMatch[1].toLowerCase();
                        break;
                    }
                }
            }

            const personLinkedinUrl = (item.socialLink || '').trim();

            if (current.lusha.some(l => l.fullName === fullName)) continue;

            current.lusha.push({ firstName, lastName, fullName, domain, personLinkedinUrl });
            count++;
        }

        if (count > 0) {
            console.log(`🟢 [Lusha] Captured ${count} contacts (page ${store.currentPage})`);
        }
    } catch (err) {
        console.log(`⚠️ [Lusha] Parse error: ${err.message}`);
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SALES NAV PARSER — v2.6.0 (FULL RECORD EXTRACTION)
// ═══════════════════════════════════════════════════════════════════════════════
// Extracts:
//   - firstName, lastName, fullName (cleaned via nameCleaner)
//   - about (summary), premium, degree
//   - title, companyName (from currentPositions[0])
//   - position_current
//   - position_start_month, position_start_year
//   - personSalesUrl, companyLinkedin
//   - city, state, country (from geoRegion)
//   - companyFullAddress, companyCity, companyState, companyCountry (from company location)
//   - industry (from companyUrnResolutionResult)
// ═══════════════════════════════════════════════════════════════════════════════
function parseSalesNavResponse(body, store) {
    try {
        const elements = body.elements || body.data || body.results || [];
        if (!Array.isArray(elements)) return;

        const records   = [];
        const locations = [];  // backward-compat for enrichLocation
        const seen = new Set();

        for (const item of elements) {
            if (!item) continue;

            const rawFirstName = (item.firstName || '').trim();
            const rawLastName  = (item.lastName || '').trim();
            const rawFullName  = (item.fullName || '').trim();

            if (!rawFullName && !rawFirstName) continue;

            // Clean the full name (removes credentials, suffixes etc.)
            const cleanedFull = cleanName(rawFullName);
            if (!cleanedFull) continue;

            const key = cleanedFull.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            // Split cleaned name into first/last
            const nameParts = cleanedFull.split(/\s+/);
            const firstName = nameParts[0] || rawFirstName;
            const lastName  = nameParts.slice(1).join(' ') || '';

            // ── About (summary) ────────────────────────────────────────
            const about = (item.summary || '').replace(/[\r\n]+/g, ' ').trim();

            // ── Premium & Degree ───────────────────────────────────────
            const premium = item.premium ? 'Yes' : 'No';
            const degree  = item.degree != null ? String(item.degree) : '';

            // ── Current Position ────────────────────────────────────────
            const pos = Array.isArray(item.currentPositions) ? item.currentPositions[0] : null;
            const title       = (pos?.title || '').trim();
            const companyName = (pos?.companyName || '').trim();

            const position_current    = pos?.current ? 'Yes' : '';
            const position_start_month = pos?.startedOn?.month != null ? String(pos.startedOn.month) : '';
            const position_start_year  = pos?.startedOn?.year  != null ? String(pos.startedOn.year)  : '';

            // ── Company Description (from position) ───────────────────
            const companyDescription = (pos?.description || '').replace(/[\r\n]+/g, ' ').trim();

            // ── Person Location (geoRegion) ────────────────────────────
            const geoRegion = (item.geoRegion || '').trim();
            const personLoc = parseLocation(geoRegion);

            // ── Person Sales Nav URL ───────────────────────────────────
            let personSalesUrl = '';
            const entityUrn = (item.entityUrn || '').trim();
            if (entityUrn) {
                const m = entityUrn.match(/\(([^,)]+)/);
                if (m && m[1]) personSalesUrl = `https://www.linkedin.com/sales/lead/${m[1]}`;
            }

            // ── Company LinkedIn & Location ────────────────────────────
            let companyLinkedin = '';
            let companyLocationRaw = '';
            let companyIndustry = '';
            const companyUrn = (pos?.companyUrn || '').trim();
            if (companyUrn) {
                const cm = companyUrn.match(/:(\d+)$/);
                if (cm && cm[1]) companyLinkedin = `https://www.linkedin.com/sales/company/${cm[1]}`;
            }
            const companyRes = pos?.companyUrnResolutionResult;
            companyLocationRaw = (companyRes?.location || '').trim();
            companyIndustry    = (companyRes?.industry || '').trim();

            const companyLoc = parseLocation(companyLocationRaw);

            // ── Build record ───────────────────────────────────────────
            records.push({
                firstName,
                lastName,
                fullName: cleanedFull,
                title,
                companyName,
                about,
                premium,
                degree,
                position_current:    position_current,
                position_start_month,
                position_start_year,
                // Person location from geoRegion
                city:    personLoc.city,
                state:   personLoc.state,
                country: personLoc.country,
                // Sales Nav URLs
                personSalesUrl,
                companyLinkedin,
                // Company location
                companyFullAddress: companyLocationRaw,
                companyCity:        companyLoc.city,
                companyState:       companyLoc.state,
                companyCountry:     companyLoc.country,
                // Industry & description from Sales Nav
                industry: companyIndustry,
                companyDescription,
            });

            // Also push to locations array (backward compat)
            locations.push({
                name: cleanedFull,
                location: geoRegion,
                personSalesUrl,
                companyLinkedin,
                companyLocationRaw,
            });
        }

        if (records.length > 0) {
            store._latestSalesNavRecords = records;
            store._latestSalesNav = locations;
            console.log(`🟢 [Sales Nav] Captured ${records.length} full records (page ${store.currentPage})`);
        }
    } catch (err) {
        console.log(`⚠️ [Sales Nav] Parse error: ${err.message}`);
    }
}


module.exports = { setupNetworkCapture };