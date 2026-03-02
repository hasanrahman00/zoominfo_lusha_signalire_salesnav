// ═══════════════════════════════════════════════════════════════════════════════
// TASK: Merge Data — ZoomInfo + Lusha + Sales Nav (v2.5.0)
// ═══════════════════════════════════════════════════════════════════════════════
// ZoomInfo        → PRIMARY (network) — all person + company fields
// Lusha           → network capture   — domain + personLinkedinUrl    ← CHANGED
// Sales Nav       → network capture   — location, personSalesUrl, companyLinkedin
//
// v2.5.0 MATCHING LOGIC (Lusha):
//   1. firstName match — if unique hit → done
//      if multiple firstName hits → disambiguate by lastName
//   2. lastName match  — if unique hit → done
//      if multiple lastName hits → disambiguate by firstName
//   3. fullName exact match (cleaned) — fallback
//
// CRITICAL: Only match page-to-page data. Never cross-page.
// ═══════════════════════════════════════════════════════════════════════════════

const { cleanName } = require('./nameCleaner');
const { enrichLocations } = require('./enrichLocation');

/**
 * @param {Object} pageData
 *   zoominfo:          [{ firstName, lastName, fullName, ... }]   (from network)
 *   lusha:             [{ firstName, lastName, fullName, domain, personLinkedinUrl }] (from network)
 *   salesNavLocations: [{ name, location, ... }]                  (from network)
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

        // Match Lusha → get domain + personLinkedinUrl
        const lushaMatch = matchLushaRecord(zi, lusha, lushaMatched);
        record.emailDomain       = lushaMatch.domain;
        record.personLinkedinUrl = lushaMatch.personLinkedinUrl;

        return record;
    });

    const luDomainHits = merged.filter(r => r.emailDomain).length;
    const luLinkedHits = merged.filter(r => r.personLinkedinUrl).length;
    console.log(`✅ [Merge] Lusha → domain:${luDomainHits}/${zoominfo.length} linkedin:${luLinkedHits}/${zoominfo.length}`);

    // Enrich missing location + Sales Nav URLs
    enrichLocations(merged, salesNavLocations);

    return merged;
}


// ═══════════════════════════════════════════════════════════════════════════════
// LUSHA MATCHING — v2.5.0
// ═══════════════════════════════════════════════════════════════════════════════
// Priority:
//   1. firstName unique match → done
//      firstName multiple hits → disambiguate by lastName
//   2. lastName unique match → done
//      lastName multiple hits → disambiguate by firstName
//   3. fullName exact match → fallback
// ═══════════════════════════════════════════════════════════════════════════════
function matchLushaRecord(zi, lushaRecords, matchedSet) {
    const empty = { domain: '', personLinkedinUrl: '' };
    if (lushaRecords.length === 0) return empty;

    const ziFirst = norm(zi.firstName);
    const ziLast  = norm(zi.lastName);
    const ziFull  = normFull(zi.fullName);

    if (!ziFirst && !ziLast) return empty;

    // ── Strategy 1: firstName match ──────────────────────────────────────
    if (ziFirst) {
        const hits = [];
        for (let i = 0; i < lushaRecords.length; i++) {
            if (matchedSet.has(i)) continue;
            if (norm(lushaRecords[i].firstName) === ziFirst) hits.push(i);
        }

        // Unique firstName → direct match
        if (hits.length === 1) {
            matchedSet.add(hits[0]);
            return extractLushaFields(lushaRecords[hits[0]]);
        }

        // Multiple same firstName → disambiguate by lastName
        if (hits.length > 1 && ziLast) {
            const refined = hits.filter(i => norm(lushaRecords[i].lastName) === ziLast);
            if (refined.length === 1) {
                matchedSet.add(refined[0]);
                return extractLushaFields(lushaRecords[refined[0]]);
            }
        }
    }

    // ── Strategy 2: lastName match ───────────────────────────────────────
    if (ziLast) {
        const hits = [];
        for (let i = 0; i < lushaRecords.length; i++) {
            if (matchedSet.has(i)) continue;
            if (norm(lushaRecords[i].lastName) === ziLast) hits.push(i);
        }

        // Unique lastName → direct match
        if (hits.length === 1) {
            matchedSet.add(hits[0]);
            return extractLushaFields(lushaRecords[hits[0]]);
        }

        // Multiple same lastName → disambiguate by firstName
        if (hits.length > 1 && ziFirst) {
            const refined = hits.filter(i => norm(lushaRecords[i].firstName) === ziFirst);
            if (refined.length === 1) {
                matchedSet.add(refined[0]);
                return extractLushaFields(lushaRecords[refined[0]]);
            }
        }
    }

    // ── Strategy 3: fullName exact match (fallback) ─────────────────────
    if (ziFull) {
        for (let i = 0; i < lushaRecords.length; i++) {
            if (matchedSet.has(i)) continue;
            if (normFull(lushaRecords[i].fullName) === ziFull) {
                matchedSet.add(i);
                return extractLushaFields(lushaRecords[i]);
            }
        }
    }

    return empty;
}


/**
 * Extract the two Lusha fields we need for merge.
 */
function extractLushaFields(record) {
    return {
        domain:            record.domain || '',
        personLinkedinUrl: record.personLinkedinUrl || '',
    };
}


// ── Normalization helpers ─────────────────────────────────────────────────────
function norm(str) {
    return (str || '').trim().toLowerCase().replace(/[^a-z]/g, '');
}

function normFull(str) {
    const cleaned = cleanName(str || '');
    return cleaned.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}


module.exports = { mergePageData };