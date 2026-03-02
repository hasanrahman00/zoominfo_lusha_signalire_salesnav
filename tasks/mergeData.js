// ═══════════════════════════════════════════════════════════════════════════════
// TASK: Merge Data — Sales Nav (BASE) + ZoomInfo (ENRICH) + Lusha (v2.6.0)
// ═══════════════════════════════════════════════════════════════════════════════
//
// NEW FLOW (v2.6.0):
//   Sales Nav   → BASE: clean names, about, premium, degree, tenure, location
//   ZoomInfo    → ENRICH: person/company fields REPLACE Sales Nav IF ZoomInfo has data
//   Lusha       → ENRICH: domain + personLinkedinUrl
//
// NAME MATCHING (Sales Nav → ZoomInfo):
//   1. Cleaned firstName match → if unique hit → done
//      if multiple hits → disambiguate by cleaned lastName
//   2. Cleaned lastName match → if unique hit → done
//      if multiple hits → disambiguate by cleaned firstName
//   3. Cleaned fullName exact match → fallback
//   4. No match → skip ZoomInfo enrichment, keep Sales Nav data
//
// This fixes the issue where ZoomInfo appends credentials to names like:
//   "Griner, PharmD, MBA, BCPS, BCEMP, FTPA"
// Sales Nav has clean firstName/lastName that we use as the base.
//
// CRITICAL: Only match page-to-page data. Never cross-page.
// ═══════════════════════════════════════════════════════════════════════════════

const { cleanName } = require('./nameCleaner');
const { parseLocation } = require('./enrichLocation');

/**
 * @param {Object} pageData
 *   zoominfo:          [{ firstName, lastName, fullName, ... }]      (from network)
 *   lusha:             [{ firstName, lastName, fullName, domain, personLinkedinUrl }] (from network)
 *   salesNavRecords:   [{ firstName, lastName, fullName, about, premium, ... }]       (from network - NEW)
 *   salesNavLocations: [{ name, location, personSalesUrl, companyLinkedin, ... }]     (from network)
 */
function mergePageData(pageData) {
    const {
        lusha = [],
        zoominfo = [],
        salesNavRecords = [],
        salesNavLocations = [],
    } = pageData;

    if (salesNavRecords.length === 0 && zoominfo.length === 0) {
        console.log('⚠️ [Merge] No Sales Nav or ZoomInfo data — skipping');
        return [];
    }

    console.log(`🔗 [Merge] SN:${salesNavRecords.length} ZI:${zoominfo.length} LU:${lusha.length}`);

    // ══════════════════════════════════════════════════════════════════════
    // STEP 1: Build base records from Sales Nav (clean names + new fields)
    // ══════════════════════════════════════════════════════════════════════
    const ziMatched = new Set();
    const lushaMatched = new Set();

    const merged = salesNavRecords.map(sn => {
        // Start with Sales Nav as the base
        const record = { ...sn };

        // ══════════════════════════════════════════════════════════════════
        // STEP 2: Match ZoomInfo → enrich/replace if ZoomInfo has data
        // ══════════════════════════════════════════════════════════════════
        const ziMatch = matchZoomInfoRecord(sn, zoominfo, ziMatched);

        if (ziMatch) {
            // ZoomInfo data REPLACES Sales Nav data — but ONLY where ZoomInfo has values
            const ziFields = [
                'title', 'department', 'jobFunction', 'personFax',
                'city', 'state', 'country',
                'companyName', 'companyWebsite', 'companyDescription',
                'industry', 'revenue', 'employeeCount', 'employeeRange',
                'companyPhone', 'companyFax', 'alexaRank',
                'companyFullAddress', 'companyStreet', 'companyCity',
                'companyZip', 'companyState', 'companyCountry',
                'topCompetitorId', 'topCompetitorName',
            ];

            for (const field of ziFields) {
                const ziVal = (ziMatch[field] || '').toString().trim();
                if (ziVal) {
                    record[field] = ziVal;
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // STEP 3: Match Lusha → get domain + personLinkedinUrl
        // ══════════════════════════════════════════════════════════════════
        const lushaMatch = matchLushaRecord(record, lusha, lushaMatched);
        record.emailDomain = lushaMatch.domain;

        // Only set personLinkedinUrl if record has a personSalesUrl (skip duplicates)
        if (record.personSalesUrl) {
            record.personLinkedinUrl = lushaMatch.personLinkedinUrl;
            // Fallback: convert Sales Nav URL → LinkedIn profile URL if Lusha didn't provide one
            if (!record.personLinkedinUrl) {
                record.personLinkedinUrl = record.personSalesUrl.replace('/sales/lead/', '/in/');
            }
        }

        return record;
    }).filter(r => r.personSalesUrl || r.personLinkedinUrl);

    // ══════════════════════════════════════════════════════════════════════
    // STEP 4: Add any UNMATCHED ZoomInfo records (people not in Sales Nav)
    // These might appear if Sales Nav didn't capture all leads on the page
    // ══════════════════════════════════════════════════════════════════════
    let unmatchedAdded = 0;
    for (let i = 0; i < zoominfo.length; i++) {
        if (ziMatched.has(i)) continue;
        const zi = zoominfo[i];

        // Clean the ZoomInfo name
        const cleanedFirst = (zi.firstName || '').trim();
        const cleanedLast  = (zi.lastName || '').trim();
        const cleanedFull  = cleanName(zi.fullName || `${cleanedFirst} ${cleanedLast}`);

        if (!cleanedFull) continue;

        const record = { ...zi };
        // Override with cleaned name
        const parts = cleanedFull.split(/\s+/);
        record.firstName = parts[0] || cleanedFirst;
        record.lastName  = parts.slice(1).join(' ') || cleanedLast;
        record.fullName  = cleanedFull;

        // Match Lusha
        const lushaMatch = matchLushaRecord(record, lusha, lushaMatched);
        record.emailDomain = lushaMatch.domain;

        // Only set personLinkedinUrl if record has a personSalesUrl (skip duplicates)
        if (record.personSalesUrl) {
            record.personLinkedinUrl = lushaMatch.personLinkedinUrl;
            if (!record.personLinkedinUrl) {
                record.personLinkedinUrl = record.personSalesUrl.replace('/sales/lead/', '/in/');
            }
        }

        // Skip profiles without any Sales Nav or LinkedIn URL (duplicates/limited info)
        if (!record.personSalesUrl && !record.personLinkedinUrl) continue;

        merged.push(record);
        unmatchedAdded++;
    }

    // ── Stats ─────────────────────────────────────────────────────────────
    const ziMatchCount = ziMatched.size;
    const luDomainHits = merged.filter(r => r.emailDomain).length;
    const luLinkedHits = merged.filter(r => r.personLinkedinUrl).length;

    console.log(`✅ [Merge] SalesNav base: ${salesNavRecords.length}`);
    console.log(`✅ [Merge] ZoomInfo matched: ${ziMatchCount}/${zoominfo.length}`);
    if (unmatchedAdded > 0) console.log(`✅ [Merge] ZoomInfo unmatched (added as-is): ${unmatchedAdded}`);
    console.log(`✅ [Merge] Lusha → domain:${luDomainHits} linkedin:${luLinkedHits}`);
    console.log(`✅ [Merge] Total records: ${merged.length}`);

    return merged;
}


// ═══════════════════════════════════════════════════════════════════════════════
// ZOOMINFO MATCHING — v2.6.0
// ═══════════════════════════════════════════════════════════════════════════════
// Match Sales Nav record → ZoomInfo record using cleaned names.
// Priority:
//   1. firstName match (unique → done; multiple → disambiguate by lastName)
//   2. lastName match  (unique → done; multiple → disambiguate by firstName)
//   3. fullName exact match (cleaned) — fallback
//   4. No match → return null (skip ZoomInfo enrichment)
// ═══════════════════════════════════════════════════════════════════════════════
function matchZoomInfoRecord(snRecord, ziRecords, matchedSet) {
    if (ziRecords.length === 0) return null;

    const snFirst = norm(snRecord.firstName);
    const snLast  = norm(snRecord.lastName);
    const snFull  = normFull(snRecord.fullName);

    if (!snFirst && !snLast) return null;

    // ── Strategy 1: firstName match ──────────────────────────────────────
    if (snFirst) {
        const hits = [];
        for (let i = 0; i < ziRecords.length; i++) {
            if (matchedSet.has(i)) continue;
            if (norm(ziRecords[i].firstName) === snFirst) hits.push(i);
        }

        if (hits.length === 1) {
            matchedSet.add(hits[0]);
            return ziRecords[hits[0]];
        }

        if (hits.length > 1 && snLast) {
            const refined = hits.filter(i => {
                // ZoomInfo lastName may have credentials appended, so also try cleaning
                const ziLastClean = norm(cleanName(ziRecords[i].lastName || '').split(/\s+/).pop() || '');
                return norm(ziRecords[i].lastName) === snLast || ziLastClean === snLast;
            });
            if (refined.length === 1) {
                matchedSet.add(refined[0]);
                return ziRecords[refined[0]];
            }
        }
    }

    // ── Strategy 2: lastName match ───────────────────────────────────────
    if (snLast) {
        const hits = [];
        for (let i = 0; i < ziRecords.length; i++) {
            if (matchedSet.has(i)) continue;
            const ziLast = norm(ziRecords[i].lastName);
            // Also try cleaning ZoomInfo lastName (might have "Griner, PharmD..." → "Griner")
            const ziLastCleaned = norm((ziRecords[i].lastName || '').split(',')[0]);
            if (ziLast === snLast || ziLastCleaned === snLast) hits.push(i);
        }

        if (hits.length === 1) {
            matchedSet.add(hits[0]);
            return ziRecords[hits[0]];
        }

        if (hits.length > 1 && snFirst) {
            const refined = hits.filter(i => norm(ziRecords[i].firstName) === snFirst);
            if (refined.length === 1) {
                matchedSet.add(refined[0]);
                return ziRecords[refined[0]];
            }
        }
    }

    // ── Strategy 3: fullName match (cleaned both sides) ─────────────────
    if (snFull) {
        for (let i = 0; i < ziRecords.length; i++) {
            if (matchedSet.has(i)) continue;
            const ziFull = normFull(ziRecords[i].fullName || `${ziRecords[i].firstName} ${ziRecords[i].lastName}`);
            if (ziFull === snFull) {
                matchedSet.add(i);
                return ziRecords[i];
            }
        }
    }

    return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// LUSHA MATCHING — same as v2.5.0
// ═══════════════════════════════════════════════════════════════════════════════
function matchLushaRecord(record, lushaRecords, matchedSet) {
    const empty = { domain: '', personLinkedinUrl: '' };
    if (lushaRecords.length === 0) return empty;

    const recFirst = norm(record.firstName);
    const recLast  = norm(record.lastName);
    const recFull  = normFull(record.fullName);

    if (!recFirst && !recLast) return empty;

    // Strategy 1: firstName match
    if (recFirst) {
        const hits = [];
        for (let i = 0; i < lushaRecords.length; i++) {
            if (matchedSet.has(i)) continue;
            if (norm(lushaRecords[i].firstName) === recFirst) hits.push(i);
        }
        if (hits.length === 1) {
            matchedSet.add(hits[0]);
            return extractLushaFields(lushaRecords[hits[0]]);
        }
        if (hits.length > 1 && recLast) {
            const refined = hits.filter(i => norm(lushaRecords[i].lastName) === recLast);
            if (refined.length === 1) {
                matchedSet.add(refined[0]);
                return extractLushaFields(lushaRecords[refined[0]]);
            }
        }
    }

    // Strategy 2: lastName match
    if (recLast) {
        const hits = [];
        for (let i = 0; i < lushaRecords.length; i++) {
            if (matchedSet.has(i)) continue;
            if (norm(lushaRecords[i].lastName) === recLast) hits.push(i);
        }
        if (hits.length === 1) {
            matchedSet.add(hits[0]);
            return extractLushaFields(lushaRecords[hits[0]]);
        }
        if (hits.length > 1 && recFirst) {
            const refined = hits.filter(i => norm(lushaRecords[i].firstName) === recFirst);
            if (refined.length === 1) {
                matchedSet.add(refined[0]);
                return extractLushaFields(lushaRecords[refined[0]]);
            }
        }
    }

    // Strategy 3: fullName match
    if (recFull) {
        for (let i = 0; i < lushaRecords.length; i++) {
            if (matchedSet.has(i)) continue;
            if (normFull(lushaRecords[i].fullName) === recFull) {
                matchedSet.add(i);
                return extractLushaFields(lushaRecords[i]);
            }
        }
    }

    return empty;
}

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