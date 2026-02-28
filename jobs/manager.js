/**
 * Job Manager — v2.4.0
 * ---------------------
 * Scraping  → spawns job-runner.js
 */

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const ROOT_DIR  = path.join(__dirname, '..');
const DATA_DIR  = path.join(ROOT_DIR, 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

class JobManager extends EventEmitter {

    constructor() {
        super();
        this.jobs     = this._load();
        this.procs    = {};   // active scrape child processes
    }

    _load() {
        try {
            if (fs.existsSync(JOBS_FILE)) {
                const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
                for (const j of data) {
                    if (j.status === 'running' || j.status === 'stopping') j.status = 'stopped';
                }
                return data;
            }
        } catch {}
        return [];
    }

    _save() {
        fs.writeFileSync(JOBS_FILE, JSON.stringify(this.jobs, null, 2), 'utf-8');
    }

    list()  { return this.jobs.map(j => this._safe(j)); }
    get(id) { return this.jobs.find(j => j.id === id); }

    // ────────────────────────────────────────────────────────────────────────
    // CREATE / DELETE
    // ────────────────────────────────────────────────────────────────────────
    create({ name, url, urls }) {
        const id     = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const jobDir = path.join(DATA_DIR, id);
        fs.mkdirSync(jobDir, { recursive: true });

        const job = {
            id,
            name: name || `Job ${this.jobs.length + 1}`,
            url:  url  || '',
            urls: urls || [],
            status: 'idle', progress: 0, currentPage: 0, totalLeads: 0,
            createdAt: new Date().toISOString(),
            dir: jobDir, logs: [],
        };
        this.jobs.push(job);
        this._save();
        this.emit('update', job);
        return this._safe(job);
    }

    delete(id) {
        const idx = this.jobs.findIndex(j => j.id === id);
        if (idx === -1) return false;
        this.stop(id);
        const job = this.jobs[idx];
        try { if (job.dir && fs.existsSync(job.dir)) fs.rmSync(job.dir, { recursive: true, force: true }); } catch {}
        this.jobs.splice(idx, 1);
        this._save();
        this.emit('delete', id);
        return true;
    }

    // ────────────────────────────────────────────────────────────────────────
    // SCRAPE: start / stop
    // ────────────────────────────────────────────────────────────────────────
    start(id) {
        const job = this.get(id);
        if (!job) return null;
        if (job.status === 'running') return this._safe(job);

        const resumePage = (job.status === 'stopped' || job.status === 'failed' || job.status === 'done') && job.currentPage > 0
            ? job.currentPage : 0;

        job.status = 'running';
        if (resumePage > 0) {
            job.logs.push(`\n══ RESUMED from page ${resumePage} ══`);
        } else {
            job.progress = 0; job.currentPage = 0; job.totalLeads = 0;
            job.logs = [];
        }
        this._save();

        const urlToUse = job.url || (job.urls.length > 0 ? job.urls[0].url : '');
        if (!urlToUse) {
            job.status = 'failed'; job.logs.push('No URL to scrape');
            this._save(); this.emit('update', job);
            return this._safe(job);
        }

        const runner = path.join(ROOT_DIR, 'job-runner.js');
        const child  = spawn(process.execPath, [runner], {
            cwd: ROOT_DIR,
            env: {
                ...process.env,
                JOB_ID: id, JOB_URL: urlToUse, JOB_DIR: job.dir,
                JOB_MAX_PAGES: '100',
                JOB_START_PAGE: String(resumePage),
                PW_CHROMIUM_ATTACH_TO_OTHER: '1',
            },
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });

        this.procs[id] = child;

        const handle = (line) => {
            if (!line) return;
            job.logs.push(line);
            if (job.logs.length > 300) job.logs.shift();
            this._parseProgress(job, line);
            this.emit('log', { id, line });
        };

        let buf = '';
        child.stdout.on('data', chunk => {
            buf += chunk.toString();
            const lines = buf.split('\n'); buf = lines.pop();
            lines.forEach(l => handle(l.trim()));
        });
        child.stderr.on('data', chunk => {
            chunk.toString().split('\n').forEach(l => handle(('[ERR] ' + l).trim()));
        });

        child.on('exit', (code) => {
            delete this.procs[id];
            if (job.status === 'running' || job.status === 'stopping') {
                job.status = code === 0 ? 'done' : 'failed';
                if (code === 0) job.progress = 100;
            }
            this._countLeads(job);
            this._save();
            this.emit('update', job);
        });

        this.emit('update', job);
        return this._safe(job);
    }

    stop(id) {
        const job = this.get(id);
        if (!job) return null;
        const child = this.procs[id];
        if (child) {
            try { child.send({ action: 'stop' }); } catch {}
            const kill = setTimeout(() => {
                try { child.kill('SIGTERM'); } catch {}
                delete this.procs[id];
            }, 5 * 60 * 1000);
            child.once('exit', () => clearTimeout(kill));
        }
        if (job.status === 'running') {
            job.status = 'stopping';
            this._countLeads(job);
            this._save();
            this.emit('update', job);
        }
        return this._safe(job);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────────────────────────
    _parseProgress(job, line) {
        const pm = line.match(/Page\s+(\d+)/i);
        if (pm) { job.currentPage = parseInt(pm[1]); job.progress = Math.min(95, job.currentPage * 4); }
        if (/completed/i.test(line)) job.progress = 100;
        const lm = line.match(/(\d+)\s+leads/i);
        if (lm) job.totalLeads = parseInt(lm[1]);
        this._save();
        this.emit('update', job);
    }

    _countLeads(job) {
        try {
            const csv = path.join(job.dir, 'leads.csv');
            if (fs.existsSync(csv))
                job.totalLeads = Math.max(0, fs.readFileSync(csv, 'utf-8').split('\n').filter(l => l.trim()).length - 1);
        } catch {}
    }

    _safe(j) {
        let hasData = false;
        try {
            hasData = j.dir && fs.existsSync(path.join(j.dir, 'leads.jsonl'));
        } catch {}
        return {
            id: j.id, name: j.name, url: j.url, urls: j.urls,
            status: j.status, progress: j.progress,
            currentPage: j.currentPage, totalLeads: j.totalLeads,
            createdAt: j.createdAt, logCount: j.logs?.length || 0,
            hasData,
        };
    }

    getCsvPath(id) {
        const j = this.get(id); if (!j) return null;
        const p = path.join(j.dir, 'leads.csv');
        return fs.existsSync(p) ? p : null;
    }

    getLogs(id) { return this.get(id)?.logs || []; }
}

module.exports = new JobManager();
