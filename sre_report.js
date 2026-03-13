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

const DT_URL  = process.env.DYNATRACE_ENV_URL;
const DT_TOKEN = process.env.DYNATRACE_API_TOKEN;
const DAYS    = parseInt(process.argv[3] || '14');

// Team definitions: name, MZ match string, alert profile match string
const TEAMS = [
  {
    name: 'Care Self Serve API',
    mz: 'Redpanda',
    alertProfile: 'AlertProfile_SSNS_Alert_Redpanda',
  },
  {
    name: 'Profile and Account Mgmt',
    mz: 'Pandora',
    alertProfile: 'Alert_Profile_TeamPandora',
  },
  {
    name: 'Product Solutions Team',
    mz: 'M_Product_Solutions_Team',
    alertProfile: 'AP_Product_Solutions_Team_Services',
  },
  {
    name: 'Agent and Product Experience',
    mz: 'Hokages',
    alertProfile: 'hokages',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dtGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, DT_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { Authorization: `Api-Token ${DT_TOKEN}` },
    };
    https.get(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function fetchAllProblems() {
  const from = Date.now() - DAYS * 24 * 60 * 60 * 1000;
  const problems = [];
  let nextPageKey = null;

  do {
    const qs = nextPageKey
      ? `?nextPageKey=${encodeURIComponent(nextPageKey)}`
      : `?pageSize=500&from=${from}`;
    const data = await dtGet(`/api/v2/problems${qs}`);
    (data.problems || []).forEach(p => problems.push(p));
    nextPageKey = data.nextPageKey || null;
  } while (nextPageKey);

  return problems;
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

function matchesTeam(problem, team) {
  const hasMZ = (problem.managementZones || []).some(mz =>
    mz.name?.toLowerCase().includes(team.mz.toLowerCase())
  );
  const hasProfile = (problem.problemFilters || []).some(f =>
    f.name?.toLowerCase().includes(team.alertProfile.toLowerCase())
  );
  return hasMZ || hasProfile;
}

// ─── Report Builder ───────────────────────────────────────────────────────────

function buildReport(problems) {
  const now = Date.now();
  const fromDate = new Date(now - DAYS * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
  const toDate   = new Date(now).toLocaleDateString('en-CA');

  let md = `# SRE Bi-Weekly Alert Report\n`;
  md += `**Period:** ${fromDate} → ${toDate} (${DAYS} days)\n`;
  md += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  md += `---\n\n`;

  // Summary table
  md += `## Summary\n\n`;
  md += `| Team | Total Alerts | Open | Resolved |\n`;
  md += `|------|:------------:|:----:|:--------:|\n`;

  const teamResults = TEAMS.map(team => {
    const matched = problems.filter(p => matchesTeam(p, team));
    const open     = matched.filter(p => p.status === 'OPEN').length;
    const resolved = matched.filter(p => p.status === 'CLOSED').length;
    return { team, matched, open, resolved };
  });

  teamResults.forEach(({ team, matched, open, resolved }) => {
    md += `| ${team.name} | ${matched.length} | ${open} | ${resolved} |\n`;
  });

  md += `\n---\n\n`;

  // Per-team detail
  teamResults.forEach(({ team, matched }) => {
    md += `## ${team.name}\n\n`;

    if (matched.length === 0) {
      md += `_No alerts found for this team in the reporting period._\n\n---\n\n`;
      return;
    }

    // Group by service
    const byService = {};
    matched.forEach(p => {
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
        const duration = formatDuration(p.endTime === -1 ? now - p.startTime : p.endTime - p.startTime);
        md += `| ${severityIcon(p.severityLevel)} ${p.severityLevel} | ${p.title} | ${statusIcon(p.status)} | ${start} | ${duration} |\n`;
      });

      md += `\n`;
    });

    md += `---\n\n`;
  });

  return md;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`Fetching Dynatrace problems for the last ${DAYS} days...`);
  const problems = await fetchAllProblems();
  console.log(`Fetched ${problems.length} problems.`);

  const report = buildReport(problems);
  const outFile = path.join(__dirname, 'sre_report.md');
  fs.writeFileSync(outFile, report);
  console.log(`Report written to: ${outFile}`);
})();
