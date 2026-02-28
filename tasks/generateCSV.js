// ═══════════════════════════════════════════════════════════════════════════════
// 📊 TASK: Generate CSV + Styled XLSX from Merged Data
// ═══════════════════════════════════════════════════════════════════════════════
// Outputs two files:
//   leads.csv  — plain CSV (backward-compatible)
//   leads.xlsx — styled Excel: colored header, alternating rows, frozen pane,
//                auto column widths, bold/border formatting — zero extra deps
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');
const { parse } = require('json2csv');
const { buildXlsx } = require('./xlsxWriter');

// ── Column definitions ────────────────────────────────────────────────────────
// label  = CSV header / XLSX column header
// key    = field name in the record object
//
// Removed columns : Full Name, Person Fax, Top Competitor ID
// Renamed columns : Top Competitor Name → Similar Company
// Order           : matches the agreed output spec
const COLUMNS = [
    { label: 'Company Name',         key: 'companyName' },
    { label: 'First Name',           key: 'firstName' },
    { label: 'Last Name',            key: 'lastName' },
    { label: 'Job Title',            key: 'title' },
    { label: 'Department',           key: 'department' },
    { label: 'Job Function',         key: 'jobFunction' },
    { label: 'Person Sales Url',     key: 'personSalesUrl' },
    { label: 'City',                 key: 'city' },
    { label: 'State',                key: 'state' },
    { label: 'Country',              key: 'country' },
    { label: 'Email Domain',         key: 'emailDomain' },
    { label: 'Company Website',      key: 'companyWebsite' },
    { label: 'Company Linkedin',     key: 'companyLinkedin' },
    { label: 'Industry',             key: 'industry' },
    { label: 'Employee Count',       key: 'employeeCount' },
    { label: 'Employee Range',       key: 'employeeRange' },
    { label: 'Company Full Address', key: 'companyFullAddress' },
    { label: 'Company Street',       key: 'companyStreet' },
    { label: 'Company City',         key: 'companyCity' },
    { label: 'Company Zip',          key: 'companyZip' },
    { label: 'Company State',        key: 'companyState' },
    { label: 'Company Country',      key: 'companyCountry' },
    { label: 'Company Phone',        key: 'companyPhone' },
    { label: 'Company Fax',          key: 'companyFax' },
    { label: 'Company Description',  key: 'companyDescription' },
    { label: 'Revenue',              key: 'revenue' },
    { label: 'Alexa Rank',           key: 'alexaRank' },
    { label: 'Similar Company',      key: 'topCompetitorName' },
];

const CSV_FIELDS = COLUMNS.map(c => c.label);

/**
 * Convert JSONL file → leads.csv + leads.xlsx with enforced column order.
 * @param {string} inputFile   path to leads.jsonl
 * @param {string} outputFile  path to leads.csv (xlsx written alongside)
 */
async function generateCSV(inputFile, outputFile) {
    console.log('📊 Generating CSV + XLSX...');

    try {
        if (!fs.existsSync(inputFile)) {
            console.log('⚠️ No data file found yet. Skipping CSV generation.');
            return 0;
        }

        const jsonlData = fs.readFileSync(inputFile, 'utf-8');
        const lines = jsonlData.trim().split('\n').filter(l => l.trim());

        if (lines.length === 0) {
            console.log('⚠️ No data captured yet.');
            return 0;
        }

        // Deduplicate by Full Name (keep first occurrence)
        const seen = new Set();
        const rows = [];

        for (const line of lines) {
            let record;
            try { record = JSON.parse(line); } catch { continue; }

            const key = (record.fullName || '').toLowerCase().trim();
            if (key && seen.has(key)) continue;
            if (key) seen.add(key);

            const row = {};
            for (const col of COLUMNS) {
                row[col.label] = record[col.key] || '';
            }
            rows.push(row);
        }

        // ── Plain CSV ────────────────────────────────────────────────────
        const csv = parse(rows, { fields: CSV_FIELDS });
        fs.writeFileSync(outputFile, csv, 'utf-8');

        // ── Styled XLSX ──────────────────────────────────────────────────
        const xlsxPath = outputFile.replace(/\.csv$/i, '.xlsx');
        buildXlsx(rows, COLUMNS.map(c => c.label), xlsxPath);

        console.log(`✅ CSV + XLSX generated: ${rows.length} leads (${seen.size} unique)`);
        return rows.length;

    } catch (err) {
        console.error(`❌ CSV/XLSX error: ${err.message}`);
        return 0;
    }
}

module.exports = { generateCSV, CSV_FIELDS };