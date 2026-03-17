#!/usr/bin/env node
/**
 * SRE Report — HTML Visualization
 * Reads from .dt_cache.json and generates sre_report.html
 *
 * Usage: node sre_report_html.js [--days 14]
 */

const fs   = require('fs');
const path = require('path');

// Load .env
fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#'))
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/\r$/, '');
});

const DAYS = parseInt(process.argv[3] || '14');

const TEAMS = [
  { name: 'Care Self Serve API',          alertProfile: 'AlertProfile_SSNS_Alert_Redpanda',   color: '#4e79a7' },
  { name: 'Profile and Account Mgmt',     alertProfile: 'Alert_Profile_TeamPandora',           color: '#f28e2b' },
  { name: 'Product Solutions Team',       alertProfile: 'AP_Product_Solutions_Team_Services',  color: '#e15759' },
  { name: 'Agent and Product Experience', alertProfile: 'hokages',                             color: '#76b7b2' },
];

const SEV_COLORS = {
  ERROR:               '#e15759',
  AVAILABILITY:        '#f28e2b',
  PERFORMANCE:         '#4e79a7',
  RESOURCE_CONTENTION: '#b07aa1',
};

// ─── Load & filter data ───────────────────────────────────────────────────────

const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '.dt_cache.json'), 'utf8'));
const now   = Date.now();
const from  = now - DAYS * 24 * 60 * 60 * 1000;

const allProblems = cache.problems.filter(p => p.startTime >= from);

const teamData = TEAMS.map(team => {
  const problems = allProblems.filter(p =>
    (p.problemFilters || []).some(f => f.name?.toLowerCase().includes(team.alertProfile.toLowerCase()))
  );

  // Group by service
  const byService = {};
  problems.forEach(p => {
    const svc = [...(p.affectedEntities || []), ...(p.impactedEntities || [])][0]?.name || 'Unknown';
    if (!byService[svc]) byService[svc] = [];
    byService[svc].push(p);
  });

  // Daily counts for timeline
  const dailyCounts = {};
  problems.forEach(p => {
    const day = new Date(p.startTime).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  });

  // Severity breakdown
  const sevCounts = {};
  problems.forEach(p => {
    sevCounts[p.severityLevel] = (sevCounts[p.severityLevel] || 0) + 1;
  });

  // Top recurring services
  const topServices = Object.entries(byService)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8);

  return { team, problems, byService, dailyCounts, sevCounts, topServices };
});

// Build shared timeline labels (all days in range)
const dayLabels = [];
for (let d = 0; d < DAYS; d++) {
  const dt = new Date(from + d * 86400000);
  dayLabels.push(dt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }));
}

const fromStr = new Date(from).toLocaleDateString('en-CA', { dateStyle: 'medium' });
const toStr   = new Date(now).toLocaleDateString('en-CA',  { dateStyle: 'medium' });

// ─── Build HTML ───────────────────────────────────────────────────────────────

const timelineDatasets = teamData.map(({ team, dailyCounts }) => ({
  label: team.name,
  data: dayLabels.map(d => dailyCounts[d] || 0),
  borderColor: team.color,
  backgroundColor: team.color + '33',
  tension: 0.3,
  fill: false,
}));

const summaryRows = teamData.map(({ team, problems }) => {
  const open     = problems.filter(p => p.status === 'OPEN').length;
  const resolved = problems.filter(p => p.status === 'CLOSED').length;
  const errorPct = Math.round((problems.filter(p => p.severityLevel === 'ERROR').length / (problems.length || 1)) * 100);
  return `<tr>
    <td><span class="dot" style="background:${team.color}"></span>${team.name}</td>
    <td class="num">${problems.length}</td>
    <td class="num open">${open}</td>
    <td class="num resolved">${resolved}</td>
    <td class="num">${errorPct}%</td>
  </tr>`;
}).join('');

const teamSections = teamData.map(({ team, problems, topServices, sevCounts }) => {
  const sevLabels  = Object.keys(sevCounts);
  const sevValues  = sevLabels.map(k => sevCounts[k]);
  const sevColors  = sevLabels.map(k => SEV_COLORS[k] || '#aaa');
  const chartId    = team.name.replace(/\s+/g, '_');

  const serviceRows = topServices.map(([svc, probs]) => {
    const open = probs.filter(p => p.status === 'OPEN').length;
    const avgDur = Math.round(
      probs.reduce((s, p) => s + (p.endTime === -1 ? now - p.startTime : p.endTime - p.startTime), 0)
      / probs.length / 60000
    );
    const topSev = ['ERROR','AVAILABILITY','PERFORMANCE','RESOURCE_CONTENTION'].find(s => probs.some(p => p.severityLevel === s)) || 'UNKNOWN';
    const sevColor = SEV_COLORS[topSev] || '#aaa';
    return `<tr>
      <td>${svc}</td>
      <td class="num">${probs.length}</td>
      <td class="num open">${open}</td>
      <td class="num">${avgDur}m avg</td>
      <td><span class="badge" style="background:${sevColor}">${topSev}</span></td>
    </tr>`;
  }).join('');

  return `
  <div class="team-section">
    <div class="team-header" style="border-left: 5px solid ${team.color}">
      <h2>${team.name}</h2>
      <span class="total-badge">${problems.length} alerts</span>
    </div>
    <div class="team-grid">
      <div class="chart-box">
        <h3>Severity Breakdown</h3>
        <canvas id="${chartId}_sev" height="220"></canvas>
      </div>
      <div class="table-box">
        <h3>Top Services by Alert Count</h3>
        <table>
          <thead><tr><th>Service</th><th>Alerts</th><th>Open</th><th>Avg Duration</th><th>Severity</th></tr></thead>
          <tbody>${serviceRows}</tbody>
        </table>
      </div>
    </div>
    <script>
      new Chart(document.getElementById('${chartId}_sev'), {
        type: 'doughnut',
        data: {
          labels: ${JSON.stringify(sevLabels)},
          datasets: [{ data: ${JSON.stringify(sevValues)}, backgroundColor: ${JSON.stringify(sevColors)}, borderWidth: 2 }]
        },
        options: { plugins: { legend: { position: 'right' } }, cutout: '60%' }
      });
    </script>
  </div>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SRE Alert Report — ${fromStr} to ${toStr}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f6fa; color: #2d3436; margin: 0; padding: 0; }
    .header { background: linear-gradient(135deg, #2d3436, #636e72); color: white; padding: 32px 40px; }
    .header h1 { margin: 0 0 6px; font-size: 1.8rem; }
    .header p  { margin: 0; opacity: 0.7; font-size: 0.95rem; }
    .container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    .card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,.07); }
    .card h2 { margin: 0 0 16px; font-size: 1.1rem; color: #636e72; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #f0f0f0; color: #636e72; font-size: 0.8rem; text-transform: uppercase; letter-spacing: .4px; }
    td { padding: 10px 12px; border-bottom: 1px solid #f8f8f8; }
    tr:last-child td { border-bottom: none; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .open { color: #e15759; font-weight: 600; }
    .resolved { color: #59a14f; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; color: white; font-size: 0.75rem; font-weight: 600; }
    .team-section { background: white; border-radius: 12px; padding: 28px; box-shadow: 0 2px 8px rgba(0,0,0,.07); margin-bottom: 24px; }
    .team-header { display: flex; align-items: center; justify-content: space-between; padding-left: 16px; margin-bottom: 20px; }
    .team-header h2 { margin: 0; font-size: 1.2rem; }
    .total-badge { background: #f0f0f0; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; color: #636e72; }
    .team-grid { display: grid; grid-template-columns: 260px 1fr; gap: 24px; align-items: start; }
    .chart-box h3, .table-box h3 { margin: 0 0 12px; font-size: 0.9rem; color: #636e72; text-transform: uppercase; letter-spacing: .4px; }
    .generated { text-align: center; color: #b2bec3; font-size: 0.8rem; padding: 24px 0; }
    @media (max-width: 768px) {
      .summary-grid, .team-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>SRE Alert Report</h1>
    <p>${fromStr} &rarr; ${toStr} &nbsp;|&nbsp; Generated ${new Date().toLocaleString()}</p>
  </div>
  <div class="container">

    <div class="summary-grid">
      <div class="card">
        <h2>Alerts by Team</h2>
        <canvas id="teamChart" height="200"></canvas>
      </div>
      <div class="card">
        <h2>Summary</h2>
        <table>
          <thead><tr><th>Team</th><th>Total</th><th>Open</th><th>Resolved</th><th>🔴 Error %</th></tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-bottom: 24px;">
      <h2>Alert Timeline — All Teams</h2>
      <canvas id="timelineChart" height="120"></canvas>
    </div>

    ${teamSections}

    <p class="generated">Generated by sre_report_html.js &nbsp;|&nbsp; Data from Dynatrace &nbsp;|&nbsp; Cache: ${new Date(cache.cachedAt).toLocaleString()}</p>
  </div>

  <script>
    new Chart(document.getElementById('teamChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(TEAMS.map(t => t.name))},
        datasets: [{
          label: 'Alerts',
          data: ${JSON.stringify(teamData.map(d => d.problems.length))},
          backgroundColor: ${JSON.stringify(TEAMS.map(t => t.color))},
          borderRadius: 6,
        }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    new Chart(document.getElementById('timelineChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(dayLabels)},
        datasets: ${JSON.stringify(timelineDatasets)}
      },
      options: {
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        interaction: { mode: 'index', intersect: false }
      }
    });
  </script>
</body>
</html>`;

const outFile = path.join(__dirname, 'sre_report.html');
fs.writeFileSync(outFile, html);
console.log(`Report written to: ${outFile}`);
console.log(`Open in browser: file:///${outFile.replace(/\\/g, '/')}`);
