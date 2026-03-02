const https = require('https');
const fs = require('fs');

const cookies = `bcookie="v=2&069718f5-f5e8-4129-8b8a-c29a8390fc36"; bscookie="v=1&2025123121311170781c9b-1371-42a0-8c8d-2e99fd6d3b1aAQERp5vTe-EzylWYKGKbeHqxkp5m5hh6"; li_rm=AQGDC5PyXN6S6gAAAZt2Um4anBWvUtnCimj6OBDAfxKekCzwM5vgSBLODKYzGfx7bNUh0azHVdOLv6ecCHY5NWYmeSCmfIlnfSRjc3K2hfH5P6Xt7XCKD3O_; aam_uuid=25873328881347004450230739066318521317; li_sugr=2fbcf9eb-2d0b-4960-89ed-9a48eab1c0da; _gcl_au=1.1.1676103711.1768798831; JSESSIONID="ajax:1655044414259245121"; timezone=Asia/Dhaka; li_theme=light; li_theme_set=app; _guid=b9b29e07-5499-4d64-b2de-6d4b082bf843; dfpfpt=57342a379d9c4ac79a9f37b2d45bb2df; liap=true; li_ep_auth_context=AHVhcHA9c2FsZXNOYXZpZ2F0b3IsYWlkPTI0MjI2NTMyNCxpaWQ9NDcwMTc4MTQwLHBpZD02ODQ1OTgyNjMsZXhwPTE3NzQwMzE0NjI4MTUsY3VyPXRydWUsc2lkPTE1NjMzODAyOTUsY2lkPTIwMjI5ODY2MDIB6DIROrd3RSgVBVgspznCwkcIAts; li_a=AQJ2PTEmc2FsZXNfY2lkPTQ3MDE3ODE0MCUzQSUzQTQ3MDA5NDY0NCUzQSUzQXRpZXIyJTNBJTNBMjQyMjY1MzI0J_5K1BU8TYLZ1ojBqqdg918i52k; PLAY_LANG=en; lang=v=2&lang=en-US; li_at=AQEFAQ8BAAAAABwYmSYAAAGccgUR4wAAAZy6HsqyTQAAsnVybjpsaTplbnRlcnByaXNlQXV0aFRva2VuOmVKeGpaQUFDdm9JMWIwQzB4am5sN3lCYWhpMHloaEhFcUpnU25BVm14T3A3dVRNd0FnQzlKZ2ZvXnVybjpsaTplbnRlcnByaXNlUHJvZmlsZToodXJuOmxpOmVudGVycHJpc2VBY2NvdW50OjI0MjI2NTMyNCw2ODQ1OTgyNjMpXnVybjpsaTptZW1iZXI6MjYyMDE1MjW7lRAjePdeOghFV42EWRJNb-s83d22TQw4rnrMyY5cqq8iXbFgWcceQmV4_IO6DzDU7ISxX47vjStIdl5X6T3Amr3l0z9uBW8X3-tydgOL76FEUkwKrrwazl8kWzS6w9rtgcFqTim0duxf4k5cndCEHkUDlWZP8nk2OvglP1yfQP6DTRhXfTgS7NDBL-DNSn831TCT; fid=AQHIFVwncfmGBAAAAZyWw3-vHwooJbAZlGb3aAfyD7L60Xb_xiie1y_kIYMICvAa0RjZsEWZD_y4mg; sdui_ver=sdui-flagship:0.1.28916+SduiFlagship0; AnalyticsSyncHistory=AQK-CwFBByAklgAAAZyX1zVWUKmRydDgi2uU-KzGl8p8cn6rpigsMg4QlOVhP2RW11wGPcmfVArP2N86aYQ5mA; lms_ads=AQED0zYHkOOpMQAAAZyX1zaajYiR-pdQZWsFQM58u5G-_SdmlT7cgKmnX1piYaLd0QXw9TiSWjXWtkAWRkjrzv5VJ9jg7FkA; lms_analytics=AQED0zYHkOOpMQAAAZyX1zaajYiR-pdQZWsFQM58u5G-_SdmlT7cgKmnX1piYaLd0QXw9TiSWjXWtkAWRkjrzv5VJ9jg7FkA; lidc="b=OB25:s=O:r=O:a=O:p=O:g=4264:u=444:x=1:i=1772075765:t=1772138737:v=2:sig=AQHOFPJ3XSdwBh1cIRMCC57rBoOdRLVv"`;

// RAW path - no re-encoding
const rawPath = '/sales-api/salesApiLeadSearch?q=searchQuery&query=(recentSearchParam:(id:5500033684,doLogHistory:true),filters:List((type:ACCOUNT_LIST,values:List((id:7429960948314021890,text:CMS-1-3,selectionType:INCLUDED)))))&start=25&count=25&trackingParam=(sessionId:vsl2r45BSc%2BqKG0YGWd26A%3D%3D)&decorationId=com.linkedin.sales.deco.desktop.searchv2.LeadSearchResult-14';

const options = {
  hostname: 'www.linkedin.com',
  path: rawPath,
  method: 'GET',
  headers: {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9,bn;q=0.8',
    'cache-control': 'no-cache',
    'cookie': cookies,
    'csrf-token': 'ajax:1655044414259245121',
    'pragma': 'no-cache',
    'referer': 'https://www.linkedin.com/sales/search/people?page=2&query=(recentSearchParam%3A(id%3A5500033684%2CdoLogHistory%3Atrue)%2Cfilters%3AList((type%3AACCOUNT_LIST%2Cvalues%3AList((id%3A7429960948314021890%2Ctext%3ACMS-1-3%2CselectionType%3AINCLUDED)))))&sessionId=vsl2r45BSc%2BqKG0YGWd26A%3D%3D&viewAllFilters=true',
    'sec-ch-prefers-color-scheme': 'light',
    'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'x-li-identity': 'dXJuOmxpOmVudGVycHJpc2VQcm9maWxlOih1cm46bGk6ZW50ZXJwcmlzZUFjY291bnQ6MjQyMjY1MzI0LDY4NDU5ODI2Myk',
    'x-li-lang': 'en_US',
    'x-li-page-instance': 'urn:li:page:d_sales2_search_people;pvv+0VeBTu+Rea8fodGWkg==',
    'x-li-track': '{"clientVersion":"2.0.6668","mpVersion":"2.0.6668","osName":"web","timezoneOffset":6,"timezone":"Asia/Dhaka","deviceFormFactor":"DESKTOP","mpName":"lighthouse-web","displayDensity":1,"displayWidth":1920,"displayHeight":1080}',
    'x-restli-protocol-version': '2.0.0'
  }
};

// ============ CSV HELPER ============
function escCsv(val) {
  if (val == null) return '';
  const str = String(val).replace(/\n/g, ' ').replace(/\r/g, '');
  if (str.includes(',') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ============ EXTRACT LEADS FROM ACTUAL RESPONSE ============
function extractLeads(json) {
  const leads = json.elements || [];
  return leads.map(lead => {
    // --- PERSON DETAILS ---
    const firstName = lead.firstName || '';
    const lastName = lead.lastName || '';
    const fullName = lead.fullName || `${firstName} ${lastName}`.trim();
    const location = lead.geoRegion || '';
    const summary = (lead.summary || '').replace(/[\n\r]+/g, ' ').trim();
    const degree = lead.degree || '';
    const premium = lead.premium ? 'Yes' : 'No';
    const openLink = lead.openLink ? 'Yes' : 'No';
    const memorialized = lead.memorialized ? 'Yes' : 'No';

    // Member ID from objectUrn: "urn:li:member:76504625"
    const objectUrn = lead.objectUrn || '';
    const memberIdMatch = objectUrn.match(/member:(\d+)/);
    const memberId = memberIdMatch ? memberIdMatch[1] : '';

    // Sales Nav profile ID from entityUrn
    const entityUrn = lead.entityUrn || '';
    const salesIdMatch = entityUrn.match(/\(([^,]+)/);
    const salesProfileId = salesIdMatch ? salesIdMatch[1] : '';

    // URLs
    const salesNavUrl = salesProfileId
      ? `https://www.linkedin.com/sales/lead/${salesProfileId},NAME_SEARCH`
      : '';

    // --- CURRENT POSITION ---
    const pos = lead.currentPositions?.[0] || {};
    const title = pos.title || '';
    const companyName = pos.companyName || '';
    const posDescription = (pos.description || '').replace(/[\n\r]+/g, ' ').trim();
    const startMonth = pos.startedOn?.month || '';
    const startYear = pos.startedOn?.year || '';
    const startDate = startMonth && startYear ? `${startYear}-${String(startMonth).padStart(2, '0')}` : '';
    const tenureMonths = pos.tenureAtPosition?.numMonths ?? '';
    const tenureCompanyMonths = pos.tenureAtCompany?.numMonths ?? '';
    const isCurrent = pos.current ? 'Yes' : 'No';

    // --- COMPANY DETAILS (from companyUrnResolutionResult) ---
    const company = pos.companyUrnResolutionResult || {};
    const companyIndustry = company.industry || '';
    const companyLocation = company.location || '';
    const companyEntityUrn = company.entityUrn || '';
    const companyIdMatch = companyEntityUrn.match(/salesCompany:(\d+)/);
    const companyId = companyIdMatch ? companyIdMatch[1] : '';

    // Company logo (largest)
    const companyPic = company.companyPictureDisplayImage;
    let companyLogoUrl = '';
    if (companyPic?.rootUrl && companyPic?.artifacts?.length) {
      const largest = companyPic.artifacts.reduce((a, b) => (a.width > b.width ? a : b));
      companyLogoUrl = `${companyPic.rootUrl}${largest.fileIdentifyingUrlPathSegment}`;
    }

    // --- SPOTLIGHT BADGES ---
    const badges = (lead.spotlightBadges || []).map(b => b.displayValue).join('; ');

    // --- PROFILE PICTURE (largest) ---
    const pic = lead.profilePictureDisplayImage;
    let profilePicUrl = '';
    if (pic?.rootUrl && pic?.artifacts?.length) {
      const largest = pic.artifacts.reduce((a, b) => (a.width > b.width ? a : b));
      profilePicUrl = `${pic.rootUrl}${largest.fileIdentifyingUrlPathSegment}`;
    }

    return {
      // Person
      'First Name': firstName,
      'Last Name': lastName,
      'Full Name': fullName,
      'Title': title,
      'Person Location': location,
      'Summary': summary,
      'Connection Degree': degree,
      'Premium': premium,
      'Open Link': openLink,
      'Spotlight Badges': badges,

      // Company
      'Company Name': companyName,
      'Company Industry': companyIndustry,
      'Company Location': companyLocation,
      'Company ID': companyId,
      'Company Logo URL': companyLogoUrl,

      // Position
      'Position Start': startDate,
      'Is Current': isCurrent,
      'Tenure at Position (Months)': tenureMonths,
      'Tenure at Company (Months)': tenureCompanyMonths,
      'Position Description': posDescription,

      // IDs & URLs
      'Member ID': memberId,
      'Object URN': objectUrn,
      'Sales Nav Profile ID': salesProfileId,
      'Sales Nav URL': salesNavUrl,
      'Profile Picture URL': profilePicUrl,
    };
  });
}

function toCsv(rows) {
  if (!rows.length) return '';
  const hdrs = Object.keys(rows[0]);
  const lines = [hdrs.map(escCsv).join(',')];
  rows.forEach(row => lines.push(hdrs.map(h => escCsv(row[h])).join(',')));
  return lines.join('\n');
}

// ============ MAIN ============
async function fetchLeads() {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        fs.writeFileSync('response-raw.json', data);

        if (res.statusCode !== 200) {
          console.log('Response:', data.substring(0, 2000));
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        try {
          const json = JSON.parse(data);
          const total = json.paging?.total || 0;
          const start = json.paging?.start || 0;
          const count = json.paging?.count || 0;
          console.log(`\nTotal: ${total} | Start: ${start} | Count: ${count}`);

          const rows = extractLeads(json);
          console.log(`Leads extracted: ${rows.length}\n`);

          // Print summary table
          console.log('─'.repeat(100));
          console.log(`${'#'.padEnd(4)} ${'Name'.padEnd(25)} ${'Title'.padEnd(30)} ${'Company'.padEnd(20)} ${'Location'.padEnd(20)}`);
          console.log('─'.repeat(100));
          rows.forEach((r, i) => {
            console.log(
              `${String(i + 1).padEnd(4)} ${r['Full Name'].substring(0, 24).padEnd(25)} ${r['Title'].substring(0, 29).padEnd(30)} ${r['Company Name'].substring(0, 19).padEnd(20)} ${r['Person Location'].substring(0, 19).padEnd(20)}`
            );
          });
          console.log('─'.repeat(100));

          // Write CSV
          const csv = toCsv(rows);
          const pageNum = count > 0 ? Math.floor(start / count) + 1 : 1;
          const filename = `leads-page-${pageNum}.csv`;
          fs.writeFileSync(filename, '\uFEFF' + csv, 'utf8');
          console.log(`\n✅ CSV saved: ${filename} (${rows.length} leads, ${Object.keys(rows[0]).length} columns)`);
          console.log(`✅ Raw JSON saved: response-raw.json`);

          resolve(rows);
        } catch (e) {
          console.error('Parse error:', e.message);
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

fetchLeads().catch(console.error);