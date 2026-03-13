#!/usr/bin/env node
/**
 * SRE Bi-Weekly Alert Report
 * Pulls Dynatrace problems per team, grouped by service, with duration tracking.
 *
 * Usage: node sre_report.js [--days 14]
 * Output: sre_report.md
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '.env');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#')) {
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/\r$/, '');
  }
});

const DT_URL    = process.env.DYNATRACE_ENV_URL;
const DT_TOKEN  = process.env.DYNATRACE_API_TOKEN;
const DAYS      = parseInt(process.argv[3] || '14');
const REFRESH   = process.argv.includes('--refresh');
const CACHE_FILE = path.join(__dirname, '.dt_cache.json');

// Team definitions
// mzFilters: exact MZ names to filter server-side (OR logic)
// alertProfile: substring match for client-side alert profile filter
const TEAMS = [
  {
    name: 'Care Self Serve API',
    mzFilters: ['M_SSNS_Redpanda_day1', 'M_SSNS_Redpanda_day2_Billing'],
    alertProfile: 'AlertProfile_SSNS_Alert_Redpanda',
  },
  {
    name: 'Profile and Account Mgmt',
    mzFilters: ['TeamPandora_MZ'],
    alertProfile: 'Alert_Profile_TeamPandora',
  },
  {
    name: 'Product Solutions Team',
    mzFilters: ['M_Product_Solutions_Team'],
    alertProfile: 'AP_Product_Solutions_Team_Services',
  },
  {
    name: 'Agent and Product Experience',
    mzFilters: ['Hokages Services'],
    alertProfile: 'hokages',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dtGet(apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, DT_URL);
    https.get(
      { hostname: url.hostname, path: url.pathname + url.search, headers: { Authorization: `Api-Token ${DT_TOKEN}` } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
        });
      }
    ).on('error', reject);
  });
}

// Load from cache if valid (same day, same DAYS window), otherwise fetch and cache
async function fetchAllProblems(from) {
  const cacheValid = !REFRESH && (() => {
    try {
      const c = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const sameDay  = new Date(c.cachedAt).toDateString() === new Date().toDateString();
      const sameDays = c.days === DAYS;
      return sameDay && sameDays ? c.problems : null;
    } catch { return null; }
  })();

  if (cacheValid) {
    console.log(`  Using cached data (${cacheValid.length} problems). Run with --refresh to re-fetch.`);
    return cacheValid;
  }

  const problems = [];
  let nextPageKey = null;
  let page = 0;

  do {
    page++;
    const qs = nextPageKey
      ? `?nextPageKey=${encodeURIComponent(nextPageKey)}`
      : `?pageSize=500&from=${from}`;

    const data = await dtGet(`/api/v2/problems${qs}`);
    if (data.error) throw new Error(`DT API error: ${data.error.message}`);

    (data.problems || []).forEach(p => problems.push(p));
    nextPageKey = data.nextPageKey || null;

    process.stdout.write(`\r  Pages fetched: ${page} | Problems: ${problems.length} `);
  } while (nextPageKey);

  process.stdout.write('\n');

  // Save to cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ cachedAt: Date.now(), days: DAYS, problems }));
  return problems;
}

function matchesAlertProfile(problem, team) {
  return (problem.problemFilters || []).some(f =>
    f.name?.toLowerCase().includes(team.alertProfile.toLowerCase())
  );
}

function formatDuration(ms) {
  if (ms < 0) return 'Ongoing';
  const mins  = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

function severityIcon(s) {
  return { ERROR: '🔴', PERFORMANCE: '🟡', AVAILABILITY: '🟠', RESOURCE_CONTENTION: '🟣' }[s] || '⚪';
}

function statusIcon(s) {
  return s === 'OPEN' ? '🔴 Open' : '✅ Resolved';
}

// ─── Report Builder ───────────────────────────────────────────────────────────

function buildReport(teamResults, now) {
  const fromDate = new Date(now - DAYS * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
  const toDate   = new Date(now).toLocaleDateString('en-CA');

  let md = `# SRE Bi-Weekly Alert Report\n`;
  md += `**Period:** ${fromDate} → ${toDate} (${DAYS} days)\n`;
  md += `**Generated:** ${new Date(now).toLocaleString()}\n\n---\n\n`;

  // Summary
  md += `## Summary\n\n`;
  md += `| Team | Total Alerts | Open | Resolved |\n`;
  md += `|------|:------------:|:----:|:--------:|\n`;
  teamResults.forEach(({ team, problems }) => {
    const open     = problems.filter(p => p.status === 'OPEN').length;
    const resolved = problems.filter(p => p.status === 'CLOSED').length;
    md += `| ${team.name} | ${problems.length} | ${open} | ${resolved} |\n`;
  });
  md += `\n---\n\n`;

  // Per-team detail
  teamResults.forEach(({ team, problems }) => {
    md += `## ${team.name}\n\n`;

    if (problems.length === 0) {
      md += `_No alerts found for this team in the reporting period._\n\n---\n\n`;
      return;
    }

    // Group by service
    const byService = {};
    problems.forEach(p => {
      const entities = p.affectedEntities || p.impactedEntities || [];
      const service  = entities[0]?.name || 'Unknown Service';
      if (!byService[service]) byService[service] = [];
      byService[service].push(p);
    });

    Object.entries(byService).sort().forEach(([service, sproblems]) => {
      md += `### ${service}\n\n`;
      md += `| Severity | Alert | Status | Start | Duration |\n`;
      md += `|----------|-------|--------|-------|----------|\n`;

      sproblems.sort((a, b) => b.startTime - a.startTime).forEach(p => {
        const start    = new Date(p.startTime).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' });
        const durationMs = p.endTime === -1 ? now - p.startTime : p.endTime - p.startTime;
        md += `| ${severityIcon(p.severityLevel)} ${p.severityLevel} | ${p.title} | ${statusIcon(p.status)} | ${start} | ${formatDuration(durationMs)} |\n`;
      });

      md += `\n`;
    });

    md += `---\n\n`;
  });

  return md;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const now  = Date.now();
  const from = now - DAYS * 24 * 60 * 60 * 1000;

  console.log(`Fetching Dynatrace problems for the last ${DAYS} days...`);
  const start = Date.now();

  // Single fetch shared across all teams
  const allProblems = await fetchAllProblems(from);

  // Filter per team by alert profile
  const fetched = TEAMS.map(team => {
    const problems = allProblems.filter(p => matchesAlertProfile(p, team));
    console.log(`  ${team.name}: ${problems.length} problems`);
    return { team, problems };
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const total   = fetched.reduce((n, r) => n + r.problems.length, 0);
  console.log(`\nDone in ${elapsed}s — ${allProblems.length} fetched, ${total} matched across all teams.`);

  const report  = buildReport(fetched, now);
  const outFile = path.join(__dirname, 'sre_report.md');
  fs.writeFileSync(outFile, report);
  console.log(`Report written to: ${outFile}`);
})();
