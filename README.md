# VikiLeads v2 — LinkedIn Sales Navigator Scraper

"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\Chrome_Scraper"

Network-interception based lead extraction with **SignalHire + Lusha + ZoomInfo** enrichment.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Browser (Chrome + 3 Extensions)                              │
│  ┌─────────────┐  ┌─────────┐  ┌──────────┐                  │
│  │ SignalHire   │  │  Lusha  │  │ ZoomInfo │                  │
│  │ (Shadow DOM) │  │ (iframe)│  │ (iframe) │                  │
│  └──────┬──────┘  └────┬────┘  └─────┬────┘                  │
│         │ POST         │ POST        │ POST                   │
│         ▼              ▼             ▼                        │
│  signalhire.com   lusha.com    zoominfo.com                   │
│  /ext-api/        /api/v2/     /plg-match/                    │
│  candidates/      search       peopleMatchBulk                │
│  byIds                                                        │
└───────────────────────┬───────────────────────────────────────┘
                        │ CDP Network Interception
                        ▼
┌───────────────────────────────────────────────────────────────┐
│  setupNetworkCapture.js — Captures all 3 responses per page   │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ captureStore.pages[pageNum] = {                          │ │
│  │   signalhire: [{ fullName, linkedinUrl }],               │ │
│  │   lusha:      [{ firstName, lastName, domain }],         │ │
│  │   zoominfo:   [{ firstName, ..., companyName, ... }]     │ │
│  │ }                                                        │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│  mergeData.js — Page-by-page matching                         │
│                                                               │
│  ZoomInfo (primary) + Lusha firstName → Email Domain          │
│                     + SignalHire fullName → Person LinkedIn    │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│  generateCSV.js → leads.csv with 30 columns                  │
└───────────────────────────────────────────────────────────────┘
```

## Project Structure

```
vikileads-v2/
├── server.js                    # HTTP server (port 3000)
├── config.js                    # Chrome/CDP + network URL config
├── job-runner.js                # Spawned per job — main orchestrator
├── package.json
├── routes/
│   ├── router.js                # Zero-dep HTTP router (GET/POST/DELETE/SSE)
│   └── api.js                   # REST + SSE endpoints
├── jobs/
│   └── manager.js               # Job state machine + child process mgmt
├── tasks/
│   ├── launchChrome.js          # Launch/reuse Chrome with CDP
│   ├── connectBrowser.js        # Playwright CDP connection
│   ├── navigateToLinkedIn.js    # Open/reuse Sales Nav tab
│   ├── scrollDashboard.js       # Human-like scrolling (8-12 steps)
│   ├── getPageInfo.js           # Extract page number from URL/DOM
│   ├── navigateNextPage.js      # Click next, verify page change
│   ├── nameCleaner.js           # Clean/normalize names (prefixes, suffixes)
│   ├── activateSignalHire.js    # Shadow DOM: badge → Get Profiles → minimize
│   ├── activateLusha.js         # Badge click → open sidebar
│   ├── activateZoomInfo.js      # Iframe badge click → open/minimize sidebar
│   ├── setupNetworkCapture.js   # CDP interception for all 3 APIs
│   ├── mergeData.js             # Smart page-by-page name matching
│   └── generateCSV.js           # JSONL → CSV with 30 columns
├── public/
│   └── index.html               # Dashboard UI (single file, dark theme)
└── data/
    ├── settings.json            # Chrome CDP settings
    └── {job-id}/                # Per-job output directory
        ├── leads.jsonl          # Raw merged data
        └── leads.csv            # Final CSV output
```

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start Chrome with your extensions (SignalHire + Lusha + ZoomInfo)
#    Use the CDP command shown in Settings page, e.g.:
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\Chrome_Scraper"

# 3. Log into LinkedIn Sales Navigator in the Chrome window

# 4. Start the dashboard
npm start
# → http://localhost:3000
```

## Flow Per Page

1. **SignalHire** — Click Shadow DOM badge → "Get Profiles" → minimize
2. **Scroll** — Human-like scroll (8-12 steps, 450px each) to load all leads
3. **Lusha** — Click badge → wait 2s → minimize
4. **ZoomInfo** — Click iframe badge → wait 4s → minimize
5. **Wait** — 3s for all network responses to arrive (captured passively)
6. **Merge** — ZoomInfo (primary) + Lusha (domain) + SignalHire (LinkedIn)
7. **CSV** — Append to JSONL → regenerate CSV
8. **Next** — Click next page → repeat

## CSV Output Columns

| Column | Source |
|--------|--------|
| First Name | ZoomInfo |
| Last Name | ZoomInfo |
| Full Name | ZoomInfo |
| Job Title | ZoomInfo |
| Department | ZoomInfo |
| Job Function | ZoomInfo |
| Person Fax | ZoomInfo |
| City / State / Country | ZoomInfo |
| **Email Domain** | **Lusha** (matched by firstName) |
| **Person LinkedIn** | **SignalHire** (matched by fullName) |
| Company Name | ZoomInfo |
| Company Website | ZoomInfo |
| Company Description | ZoomInfo |
| Industry | ZoomInfo |
| Revenue | ZoomInfo |
| Employee Count / Range | ZoomInfo |
| Company Phone / Fax | ZoomInfo |
| Alexa Rank | ZoomInfo |
| Company Address fields | ZoomInfo |
| Top Competitor | ZoomInfo |

## Key Differences from v1

| Feature | v1 (Previous) | v2 (This) |
|---------|---------------|-----------|
| Primary data | Prospeo (DOM trap) | ZoomInfo (network capture) |
| Enrichment | DOM scraping | Network interception (CDP) |
| SignalHire | DOM card extraction | API response capture |
| Lusha | iframe DOM scraping | API response capture |
| ZoomInfo | Not used | Primary data source |
| Data capture | `setupSidePanelTrap()` | `setupNetworkCapture()` |
| Merging | By LinkedIn URL / name | Page-by-page firstName/fullName |
