// ═══════════════════════════════════════════════════════════════════════════════
// TASK: Merge Data from ZoomInfo + Lusha + Sales Nav Locations
// ═══════════════════════════════════════════════════════════════════════════════
// ZoomInfo        → PRIMARY (network capture) — all person + company fields
// Lusha           → DOM extraction — firstName, domain
// Sales Nav       → network capture — location, personSalesUrl, companyLinkedin
//
// CRITICAL: Only match page-to-page data. Never cross-page.
// ═══════════════════════════════════════════════════════════════════════════════

const { cleanName } = require('./nameCleaner');
const { enrichLocations } = require('./enrichLocation');

/**
 * @param {Object} pageData
 *   zoominfo:          [{ firstName, lastName, fullName, ... }]  (from network)
 *   lusha:             [{ fullName, firstName, lastName, domain }] (from DOM)
 *   salesNavLocations: [{ name, location, ... }]                 (from network)
 */
function mergePageData(pageData) {
    const {
        lusha = [],
        zoominfo = [],
        salesNavLocations = [],
    } = pageData;

    if (zoominfo.length === 0) {
        console.log('⚠️ [Merge] No ZoomInfo data — skipping');
        return [];
    }

    console.log(`🔗 [Merge] ZI:${zoominfo.length} LU:${lusha.length}`);

    const lushaMatched = new Set();

    const merged = zoominfo.map(zi => {
        const record = { ...zi };
        record.emailDomain = matchRecord(zi, lusha, lushaMatched, 'domain');
        return record;
    });

    const luHits = merged.filter(r => r.emailDomain).length;
    console.log(`✅ [Merge] Lusha:${luHits}/${zoominfo.length}`);

    // Enrich missing location + Sales Nav URLs
    enrichLocations(merged, salesNavLocations);

    return merged;
}

/**
 * Match a ZoomInfo record against source records by name.
 * Returns the value of `field` from the matched record, or ''.
 */
function matchRecord(zi, records, matchedSet, field) {
    if (records.length === 0) return '';

    const ziFirst = norm(zi.firstName);
    const ziLast = norm(zi.lastName);
    const ziFull = normFull(zi.fullName);

    if (!ziFirst && !ziLast) return '';

    // 1. Unique firstName match
    if (ziFirst) {
        const hits = [];
        for (let i = 0; i < records.length; i++) {
            if (matchedSet.has(i)) continue;
            if (norm(records[i].firstName) === ziFirst) hits.push(i);
        }
        if (hits.length === 1) {
            matchedSet.add(hits[0]);
            return records[hits[0]][field] || '';
        }
    }

    // 2. fullName match
    if (ziFull) {
        for (let i = 0; i < records.length; i++) {
            if (matchedSet.has(i)) continue;
            if (normFull(records[i].fullName) === ziFull) {
                matchedSet.add(i);
                return records[i][field] || '';
            }
        }
    }

    // 3. Unique lastName match
    if (ziLast) {
        const hits = [];
        for (let i = 0; i < records.length; i++) {
            if (matchedSet.has(i)) continue;
            if (norm(records[i].lastName) === ziLast) hits.push(i);
        }
        if (hits.length === 1) {
            matchedSet.add(hits[0]);
            return records[hits[0]][field] || '';
        }
    }

    return '';
}

function norm(str) {
    return (str || '').trim().toLowerCase().replace(/[^a-z]/g, '');
}

function normFull(str) {
    const cleaned = cleanName(str || '');
    return cleaned.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = { mergePageData };
