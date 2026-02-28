// ═══════════════════════════════════════════════════════════════════════════════
// TASK: Setup Network Capture — ZoomInfo + Sales Nav
// ═══════════════════════════════════════════════════════════════════════════════
// ZoomInfo   → network (peopleMatchBulk)       → _pages[n].zoominfo
// Sales Nav  → network (salesApiLeadSearch)    → _latestSalesNav   (separate buffer)
//
// CRITICAL: Only match page-to-page data. Never cross-page.
// ═══════════════════════════════════════════════════════════════════════════════

const config = require('../config');
const { cleanName } = require('./nameCleaner');

async function setupNetworkCapture(context) {
    const captureStore = {
        pages: {},
        currentPage: 1,

        // ── Sales Nav buffer ─────────────────────────────────────────
        _latestSalesNav: [],

        getCurrent() {
            if (!this.pages[this.currentPage]) {
                this.pages[this.currentPage] = { zoominfo: [] };
            }
            return this.pages[this.currentPage];
        },

        setPage(num) {
            this.currentPage = num;
            if (!this.pages[num]) this.pages[num] = { zoominfo: [] };
        },

        clearCurrent() {
            this.pages[this.currentPage] = { zoominfo: [] };
        },

        getSalesNavLocations() {
            return this._latestSalesNav;
        },
    };

    const attachToPage = async (page) => {
        try {
            page.on('response', async (response) => {
                try {
                    const url = response.url();
                    if (response.status() < 200 || response.status() >= 300) return;

                    if (url.includes(config.NETWORK_URLS.ZOOMINFO)) {
                        const body = await response.json().catch(() => null);
                        if (body) parseZoomInfoResponse(body, captureStore);
                    }

                    if (url.includes(config.NETWORK_URLS.SALESNAV)) {
                        const body = await response.json().catch(() => null);
                        if (body) parseSalesNavResponse(body, captureStore);
                    }
                } catch {}
            });
        } catch {}
    };

    for (const page of context.pages()) await attachToPage(page);
    context.on('page', attachToPage);

    console.log('✅ Network capture attached (ZoomInfo + Sales Nav)');
    return captureStore;
}


// ── ZoomInfo parser ───────────────────────────────────────────────────────────
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


// ── Sales Nav parser ──────────────────────────────────────────────────────────
function parseSalesNavResponse(body, store) {
    try {
        const elements = body.elements || body.data || body.results || [];
        if (!Array.isArray(elements)) return;

        const locations = [];
        const seen = new Set();

        for (const item of elements) {
            if (!item) continue;

            const rawName = (item.fullName || '').trim();
            if (!rawName) continue;

            const geoRegion = (item.geoRegion || '').trim();

            // Person Sales Nav URL from entityUrn
            let personSalesUrl = '';
            const entityUrn = (item.entityUrn || '').trim();
            if (entityUrn) {
                const m = entityUrn.match(/\(([^,)]+)/);
                if (m && m[1]) personSalesUrl = `https://www.linkedin.com/sales/lead/${m[1]}`;
            }

            // Company LinkedIn URL + raw location from currentPositions[0]
            let companyLinkedin = '';
            let companyLocationRaw = '';
            const pos = Array.isArray(item.currentPositions) ? item.currentPositions[0] : null;
            const companyUrn = (pos?.companyUrn || '').trim();
            if (companyUrn) {
                const cm = companyUrn.match(/:(\d+)$/);
                if (cm && cm[1]) companyLinkedin = `https://www.linkedin.com/sales/company/${cm[1]}`;
            }
            companyLocationRaw = (pos?.companyUrnResolutionResult?.location || '').trim();

            const name = cleanName(rawName);
            if (!name) continue;

            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            locations.push({ name, location: geoRegion, personSalesUrl, companyLinkedin, companyLocationRaw });
        }

        if (locations.length > 0) {
            store._latestSalesNav = locations;
            console.log(`🟢 [Sales Nav] Captured ${locations.length} entries (+SalesURL +CompanyLI)`);
        }
    } catch (err) {
        console.log(`⚠️ [Sales Nav] Parse error: ${err.message}`);
    }
}


module.exports = { setupNetworkCapture };
