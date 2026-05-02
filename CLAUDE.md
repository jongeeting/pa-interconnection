# Project context for Claude (and humans)

This is the **PA Generation Queue / Federal Tax Cliff** site for [Build Philly Now](https://buildphillynow.substack.com).

## What the site argues

Of Pennsylvania's 340 active PJM-queued generation projects (10,421 MW), **70 have executed Generation Interconnection Agreements** (1,583 MW summer-peak). For these, engineering review is complete — the binding constraint is now state and local permitting, not PJM. Of the 70, **64 are solar/wind** exposed to OBBBA's federal tax-credit cliff (begin construction by July 4, 2026; placed in service by Dec 31, 2027).

**Policy ask:** lower HB 502's eligibility threshold from 25 MW to 10 MW. This expands cliff-exposed coverage from 17 of 64 projects to 55 of 64.

## Authorial voice

- **Voice:** policy-research, not advocacy. Specific, sourced, defensible. Hot takes that outrun the data get cut.
- **Don't conflate scopes.** PJM-wide ≠ PA. Legacy queue ≠ Cycle 1. 2022 snapshot ≠ today. Copy must explicitly say which.
- **Don't add features the user didn't ask for.** No speculative dashboards, no extra charts, no new fuel taxonomies. Bug fixes are bug fixes.
- **Brand tokens — DO NOT change:** green `#00844d`, beige bg `#eae7e4`, card `#f5f3f1`, gold `#c99b2e`, red `#b23a2f`. Type stack: Fraunces (display) + Hanken Grotesk (body). Section structure mirrors https://bpn-oz-analysis.netlify.app/.
- **Co-authors.** Penn ENVS 5100 Group 4 (Brandon Licata, Nechama Lowy, Lexi Luong, Anna Phillips, Andrew Weng, Jie Ying). Their December 2025 brief "Pennsylvania and PJM: Speeding Up Interconnection" had 6 policy recommendations; the HB 502 threshold-amendment piece (their #2) is what BPN extended into a memo + site. They originated the threshold-analysis methodology (their cuts are at slightly different scopes — they report % of solar in active queue, BPN reports % of GIA-posted urgent universe). Currently credited for the threshold-analysis insight specifically. Per Jon (May 2026), they will become full co-authors after collab in coming weeks; update footer attribution then.

## Canonical data derivation (the 91 ready-to-build projects)

Source: **PJMReadytoBuild.xlsx** — PJM "Ready to Build" snapshot dated March 2026, shared by Nicholas Birkhead. This is PJM's own published list of projects with executed Generation Interconnection Agreements that have not yet reached commercial operation. Full list spans all of PJM (495 projects, ≈54 GW MW Energy — matches PJM's public figure). PA subset: **91 projects, 1,758 MW summer / 3,365 MW winter.**

To reproduce: take the `ReadytoBuild` tab and filter `State == "PA"`. The previous version of this site used the legacy PJM Planning Queues file via Penn Group 4 / RMI, which is now superseded.

Status mix: 45 E&P / 27 Suspended / 17 Under Construction / 2 Partially in Service - Under Construction.
Fuel mix: 77 Solar / 7 Solar+Storage / 5 Storage / 1 Wind / 1 Nuclear (Peach Bottom Unit #2 or #3).
Cliff-exposed (solar + wind only): **78 projects, 1,415 MW.**

Project IDs annotated `AF2-050 - moved to TC1` indicate the project has migrated from legacy queue review into PJM's Cycle 1 (or Cycle 2) reformed-process review. Nine PA projects carry this annotation. The `moved_to_cycle` field on each project record preserves it.

The earlier 70-project / 1,583 MW analysis (Q4 2025 / early 2026 snapshot) is preserved in the v3 git history if you need to compare.

Project `name` should match xlsx `Commercial Name` (developer-facing). Where empty, fall back to xlsx `Name` (utility/PJM internal name) — this happens for one project, `AF1-302` → `Brookville-Squab Hollow 138 kV`.

## Repo layout

```
index.html              Single-page site
memo.html               (Phase 7) Long-form policy memo
css/main.css            BPN brand tokens
js/app.js               Map, charts, filters, slider — vanilla JS
data/
  projects.json             70 GIA-posted projects, with attribution
  threshold-analysis.json   Cuts at 5/10/15/20/25/50/100 MW × 3 scopes
  fuel-mix.json             PA active queue fuel mix
  by-county.json            County rollup
  county-centroids.json     PA county centroid lookup
  queue-mix-comparison.json PJM-wide vs PA legacy + Cycle 1 mix
  csv/                      Public CSV downloads
.claude/launch.json     Dev preview config (port 8080)
netlify.toml            Static-site deploy config
```

## Dev

```bash
npm run dev   # npx serve on :8080
```

No build step. All static.

## Open verification items

1. **Senate + House district attribution.** County-level proxy currently. Phase 4–5 work: attach all overlapping districts per project. Use authoritative shapefiles from the [PA Spatial Data Access portal](https://www.pasda.psu.edu/) or [PA OpenData](https://data.pa.gov/). Where parcel lat/lon is sourced, switch to point-in-polygon for that specific project.
2. **Project geometry.** Most projects pinned to jittered county centroids. PJM Queue Active List + state PUC + zoning records can yield parcel-level locations for the larger ones. Realistic recovery rate: 10–20 of 70.
3. **MW Capacity vs MW Energy.** HB 502 says "capacity" — currently interpreted as PJM's MW Capacity (summer net). Confirm with bill drafters.
4. **"Stuck on permitting" inference for Suspended projects.** Not directly verified at the project level. FOIL or developer outreach would confirm.

## Senator-data corrections that need to land in Phase 4

Past versions (and the v3 memo's example list) contained at least one error: Crawford County's senator is **Sen. Michele Brooks (SD-50, R)**, not Sen. Dan Laughlin (SD-49, who represents Erie). The data file already has Brooks correctly — the memo had Laughlin and was silently corrected when memo.html was generated.

When updating senator data: cross-check every county against authoritative current-period PA Senate maps. PA's 50 Senate districts and 203 House districts both follow post-2022 redistricting boundaries.

## External references

- **Heatmap, "Where Did All the Solar Go?"** (April 30, 2026) — https://heatmap.news/energy/pjm-queue-natural-gas. Source for PJM-wide 2022 vs Cycle 1 mix charts and the 103 GW → 23 GW attrition stat.
- **PJM Planning Queues** — public PDFs of every project's Feasibility, System Impact, Facilities Study, GIA, and CSA are linked from each project record (see `gia_url` field).
- **HB 502 (RESET Board / CRES bill)** — Rep. Mandy Steele (D-Allegheny), introduced April 2025 as part of Shapiro's Lightning Plan.
- **H.R. 8477 (American Energy Dominance Act)** — Fitzpatrick (R-PA-1), Lawler (R-NY-17), Miller (R-OH-7), Carey (R-OH-15); introduced April 23, 2026; would remove OBBBA's accelerated 45Y/48E deadlines.

## Future direction (not in v3 scope)

**Cross-venue project tracker.** Eventually BPN intends to build a publicly-accessible tracker that follows each PA generation project across every venue it passes through:

- PJM interconnection queue
- State agency permits (DEP Chapter 102 / 105, PennDOT HOP, PUC siting)
- County Conservation District review (where DEP Chapter 102 review is delegated locally)
- County Planning Commission
- Township zoning hearing board
- Federal NEPA review (where applicable)

The data lives across 67 counties × ~2,500 municipalities; no canonical consolidation exists today. The state-side tools published since 2024 (DEP permit tracker, PennDOT KPI dashboard, PAyback) cover only the state-agency layer. The local-permitting layer is fragmented and is where most of the 70 GIA-posted projects are actually stuck.

Out of scope for this v3. Captured here so future sessions know it's the eventual destination.

A spot-check during v3 development confirmed Hoodlebug Solar Energy Center (PJM AF1-272, Indiana County) appeared on Indiana County Planning Commission's July 2025 agenda — six years after PJM submission, still in local zoning review.

## Deploy

GitHub: https://github.com/jongeeting/pa-interconnection (public).
Netlify: configured via `netlify.toml`. Publish dir is repo root, no build command.
