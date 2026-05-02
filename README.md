# PA Generation Queue Analysis

Build Philly Now research site analyzing the **70 Pennsylvania generation projects** (1,583 MW summer-peak) with executed PJM Generation Interconnection Agreements that are stuck on state and local permitting — and the federal tax-credit cliff their solar/wind subset faces under OBBBA.

Live site: _Netlify URL pending_
Source memo: [`docs/memo.md`](docs/memo.md) (added in a later phase)

## Local development

```bash
npm run dev
```

This runs `npx serve` on port 8080. Open http://localhost:8080.

The site is fully static — no build step. Every file under the repo root is served as-is.

## Repo layout

```
.
├── index.html              # Single-page site
├── css/main.css            # BPN brand tokens (Fraunces + Hanken Grotesk)
├── js/app.js               # MapLibre map, Chart.js charts, threshold slider, filters
└── data/
    ├── projects.json           # 70 GIA-posted projects with senator + house attribution
    ├── threshold-analysis.json # Cuts at 5/10/15/20/25/50/100 MW
    ├── fuel-mix.json           # All-active queue fuel-mix breakdown
    ├── by-county.json          # County rollup
    ├── county-centroids.json   # PA county centroid lookup
    └── csv/                    # Public download copies of the above
```

## Data definitions

- **Active PA queue** — 340 projects, 10,421 MW. Excludes Withdrawn/In Service/Deactivated; includes Active, Engineering and Procurement, Suspended, Under Construction, Partially in Service.
- **GIA-posted urgent universe** — 70 projects, 1,583 MW. Subset of active where the Generation Interconnection Agreement column shows "Document Posted". Engineering review complete; binding constraint is now state and local permitting.
- **Federal cliff exposure** — solar and wind only. Under OBBBA these technologies must "begin construction" (per IRS Notice 2025-42's Physical Work Test) by July 4, 2026, or be placed in service by December 31, 2027. Standalone storage and nuclear remain on the original IRA timeline.

## Items still pending verification

1. **PA Senate + House district attribution** — for each project, we attach **every** state Senate and House district that overlaps the project's county. Where parcel-level coordinates are available, the attribution is point-in-polygon. Where only county centroids are available, the project lists all districts whose boundaries cross the county. The methodology page documents which is which per project.
2. **Project geometry** — most points are county centroids with mathematical jitter. Phase 6 attempts parcel-level lat/lon for top projects via PJM Queue Active List + state PUC + zoning records.
3. **MW Capacity vs MW Energy** — HB 502 says "capacity"; we treat that as PJM's MW Capacity (summer net). Confirm with bill drafters.

## Deploy (Netlify)

This repo is configured for Netlify drag-and-drop or Git-based deploys. `netlify.toml` sets the publish directory to repo root.

To connect via Git: in Netlify, "Add new site" → "Import an existing project" → connect to GitHub → pick `jongeeting/pa-interconnection`. No build command needed; publish directory is `.`.

## Credits

Initial analysis published May 2026 by [Build Philly Now](https://buildphillynow.substack.com) in collaboration with researchers at the University of Pennsylvania ENVS 5100 program — Brandon Licata, Nechama Lowy, Lexi Luong, Anna Phillips, Andrew Weng, Jie Ying. The threshold-analysis insight (lower the HB 502 floor from 25 MW to 10 MW) is the Penn group's. BPN's contributions are the federal-cliff overlay, the all-fuels framing of the active queue, and the political/coalition mapping.

Data sources: PJM Planning Queues file (legacy queue snapshot, via RMI), Pennsylvania General Assembly bill records, IRS Notice 2025-42, OBBBA / H.R. 1 (2025).

## License

Content (text, data, charts) — Creative Commons Attribution 4.0 International (CC-BY-4.0).
Code — MIT.
