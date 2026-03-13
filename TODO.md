# TODO — tksandbox

> Personal task tracker. Update as you go.

---

## In Progress
- [ ] 🔴 High: Define project goals for tksandbox

---

## Weblogic Decommissioning

### Provider Tracking — Weblogic → GKE Migration
> Track when each service/API has been migrated to GKE and is ready for consumers to use.

| Service / API | Provider Due Date | Status | Notes |
|---------------|:-----------------:|--------|-------|
| _(add service)_ | YYYY-MM-DD | 🔄 In Progress | |

### Consumer Tracking — Migration Adherence
> Track consumers and ensure they cut over by their committed due dates.

| Consumer | Service / API | Due Date | Status | Notes |
|----------|--------------|:--------:|--------|-------|
| _(add consumer)_ | _(add service)_ | YYYY-MM-DD | ⏳ Pending | |

**Status Key:** ✅ Done · 🔄 In Progress · ⏳ Pending · ⚠️ At Risk · ❌ Overdue

---

## SRE Reporting

> Bi-weekly reporting across observability and incident tools, grouped by team and service.

---

### Dynatrace — Alert Readability & Reporting

> Bi-weekly reporting on alerts per team, grouped by Service, with endpoint tracking and duration.

#### Goals
- [ ] 🔴 High: Improve readability of Dynatrace alerts
- [ ] 🔴 High: Build bi-weekly alert report (per team, grouped by Service)
- [ ] 🟡 Med: Add duration tracking per alert
- [ ] 🟡 Med: Add implicated endpoint tracking per alert
- [ ] 🟢 Low: Automate report generation / scheduling
- [ ] 🟡 Med: Ask Claude to help build out the Dynatrace alert report (API queries, grouping by service, endpoint tracking, bi-weekly format)

#### Bi-Weekly Alert Report Template

| Team | Service | Endpoint | Alert Name | Duration | Occurrences | Status |
|------|---------|----------|------------|:--------:|:-----------:|--------|
| _(team)_ | _(service)_ | _(endpoint)_ | _(alert)_ | 0m | 0 | ✅ Resolved |

**Cadence:** Bi-weekly &nbsp;|&nbsp; **Next Report:** _(set date)_

**Status Key:** ✅ Resolved · 🔄 Ongoing · ⚠️ Intermittent · ❌ Critical

---

### PagerDuty — Incident Reporting

> Bi-weekly incident reporting per team/service, cross-referenced with Dynatrace alerts.

#### Goals
- [ ] 🔴 High: Pull incident data via PagerDuty API (grouped by service/team)
- [ ] 🟡 Med: Track incident response times and escalations
- [ ] 🟡 Med: Cross-reference PagerDuty incidents with Dynatrace alerts
- [ ] 🟢 Low: Combine PagerDuty + Dynatrace into unified SRE bi-weekly report
- [ ] 🟡 Med: Ask Claude to help build PagerDuty reporting scripts

#### Prerequisites
- [ ] Obtain PagerDuty API key
- [ ] Confirm PagerDuty subdomain

---

### Confluence — Auto-Publish SRE Reports

> Automatically publish bi-weekly SRE reports to Confluence space: https://telus-cio.atlassian.net/wiki/spaces/CDS/pages/4823482607

#### Goals
- [ ] 🟡 Med: Explore using n8n as middleware to publish reports to Confluence (blocked: complete Dynatrace reporting first)
- [ ] 🟢 Low: Check if existing Bitbucket OAuth app can be extended with Confluence scopes (`read:confluence-content.all`, `write:confluence-content`) — requires admin
- [ ] 🟢 Low: In the interim, generate report locally and upload manually to Confluence

---

## Backlog
- [ ] 🟡 Med: Add README with project overview
- [ ] 🟢 Low: Explore Claude Code features

---

## Done
- [x] Clone repo from GitHub
- [x] Add .gitignore (Claude, OS, IDE, Node, Python, .env)

---

## Notes
<!-- Add any context, links, or ideas here -->
