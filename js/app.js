// Build Philly Now — PA Generation Queue site
// Map + interactive threshold + charts

const FUEL_COLORS = {
  'Solar':         '#c99b2e',
  'Solar+Storage': '#d97706',
  'Wind':          '#0891b2',
  'Storage':       '#7e6dab',
  'Nuclear':       '#b23a2f',
  'Natural Gas':   '#6b6661',
  'Other':         '#a9a39a',
};

const STATE = {
  threshold: 10,        // current MW threshold
  showFuels: new Set(), // which fuel groups to show
  cliffOnly: false,
};

let projects = [];
let thresholdData = null;
let fuelMix = null;
let countyData = null;
let mixComparison = null;
let senateGeojson = null;
let houseGeojson = null;
let cosponsorData = null;
let map = null;
let markers = [];
let chamberMap = null;
const CHAMBER_STATE = { chamber: 'senate', view: 'capacity', selected: null };

async function init() {
  const [p, t, f, c, mc, sg, hg, cs] = await Promise.all([
    fetch('data/projects.json').then(r => r.json()),
    fetch('data/threshold-analysis.json').then(r => r.json()),
    fetch('data/fuel-mix.json').then(r => r.json()),
    fetch('data/by-county.json').then(r => r.json()),
    fetch('data/queue-mix-comparison.json').then(r => r.json()),
    fetch('data/pa-senate-districts.geojson').then(r => r.json()),
    fetch('data/pa-house-districts.geojson').then(r => r.json()),
    fetch('data/hb502-cosponsors.json').then(r => r.json()).catch(() => ({ senate: {}, house: {} })),
  ]);
  projects = p;
  thresholdData = t;
  fuelMix = f;
  countyData = c;
  mixComparison = mc;
  senateGeojson = sg;
  houseGeojson = hg;
  cosponsorData = cs;
  bakeCosponsorIntoGeoJson();

  // Initialize fuel filter set with all fuels present
  new Set(projects.map(p => p.fuel_group)).forEach(fg => STATE.showFuels.add(fg));

  buildHeroStats();
  buildBriefSection();
  buildMap();
  buildFuelFilters();
  buildThresholdSlider();
  buildThresholdTable();
  buildCharts();
  buildChamberMap();
  buildTopProjectsTable();
  refresh();
}

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmt1(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

function buildHeroStats() {
  const el = document.getElementById('hero-stats');
  if (!el) return;
  const cliff = projects.filter(p => p.cliff_exposed);
  const cliffMW = cliff.reduce((s, p) => s + p.mw_capacity, 0);
  const suspended = projects.filter(p => p.status === 'Suspended');
  const counties = new Set(projects.map(p => p.county)).size;
  el.innerHTML = `
    <div class="stat">
      <div class="stat-num">${projects.length}</div>
      <div class="stat-label">PA projects with executed PJM Generation Interconnection Agreements</div>
    </div>
    <div class="stat">
      <div class="stat-num">${fmt(projects.reduce((s,p)=>s+p.mw_capacity,0))} <span style="font-size:1.1rem;font-weight:500;color:var(--bpn-muted)">MW</span></div>
      <div class="stat-label">Summer-peak capacity stuck in state and local permitting</div>
    </div>
    <div class="stat">
      <div class="stat-num">${cliff.length} <span style="font-size:1.1rem;font-weight:500;color:var(--bpn-muted)">/ ${fmt(cliffMW)} MW</span></div>
      <div class="stat-label">Solar &amp; wind projects exposed to OBBBA's federal tax credit cliff</div>
    </div>
    <div class="stat">
      <div class="stat-num">${counties}</div>
      <div class="stat-label">PA counties with at-risk projects, mostly Republican-represented</div>
    </div>
  `;
}

function buildBriefSection() {
  // Already in static HTML
}

function buildMap() {
  if (typeof maplibregl === 'undefined') return;

  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'carto-light': {
          type: 'raster',
          tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
                  'https://cartodb-basemaps-b.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
                  'https://cartodb-basemaps-c.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors © CARTO'
        }
      },
      layers: [{ id: 'carto-light', type: 'raster', source: 'carto-light' }]
    },
    center: [-77.7, 41.0],
    zoom: 6.4,
    attributionControl: { compact: true }
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  map.on('load', () => {
    renderMarkers();
  });
}

function clearMarkers() {
  markers.forEach(m => m.remove());
  markers = [];
}

function projectVisible(p) {
  if (!STATE.showFuels.has(p.fuel_group)) return false;
  if (STATE.cliffOnly && !p.cliff_exposed) return false;
  return true;
}

function projectMeetsThreshold(p) {
  return p.mw_capacity >= STATE.threshold;
}

function renderMarkers() {
  if (!map) return;
  clearMarkers();
  projects.forEach(p => {
    if (!projectVisible(p)) return;

    const meets = projectMeetsThreshold(p);
    const color = FUEL_COLORS[p.fuel_group] || '#888';
    const opacity = meets ? 0.95 : 0.30;
    const size = Math.max(10, Math.min(36, 8 + Math.sqrt(p.mw_capacity) * 2.6));

    const el = document.createElement('div');
    el.className = 'map-marker';
    el.style.cssText = `
      width: ${size}px; height: ${size}px;
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
      opacity: ${opacity};
      cursor: pointer;
      transition: transform 100ms ease;
    `;
    el.addEventListener('mouseenter', () => el.style.transform = 'scale(1.15)');
    el.addEventListener('mouseleave', () => el.style.transform = 'scale(1)');
    el.addEventListener('click', () => showProjectCard(p));

    const m = new maplibregl.Marker({ element: el })
      .setLngLat([p.lon, p.lat])
      .addTo(map);
    markers.push(m);
  });
  updateThresholdReadout();
}

function legPill(party) {
  if (!party) return '<span class="party-pill party-V" title="Vacant">V</span>';
  return `<span class="party-pill party-${party}">${party}</span>`;
}

function legRow(district, name, party, overlap_pct, chamber) {
  const prefix = chamber === 'senate' ? 'SD' : 'HD';
  const pad = chamber === 'senate' ? 2 : 3;
  const pill = legPill(party);
  const pct = overlap_pct > 0 ? `<span class="dist-pct">${Math.round(overlap_pct)}%</span>` : '';
  return `<li class="dist-item">${pill}<span class="dist-name"><strong>${name}</strong></span><span class="dist-num">${prefix}-${String(district).padStart(pad,'0')}</span>${pct}</li>`;
}

function showProjectCard(p) {
  const el = document.getElementById('proj-card');
  if (!el) return;

  const cliffMark = p.cliff_exposed
    ? '<span style="color:var(--bpn-red);font-weight:600">Yes</span>'
    : '<span style="color:var(--bpn-muted)">No</span>';

  const submitted = p.submitted ? new Date(p.submitted).toLocaleDateString(undefined, {year:'numeric', month:'short'}) : '—';

  const giaLink = p.gia_url
    ? `<a class="proj-doc-link" href="${p.gia_url}" target="_blank" rel="noopener noreferrer">View PJM agreement (PDF) →</a>`
    : '';

  const sens = (p.senators || []).map(s => legRow(s.district, s.name, s.party, s.overlap_pct, 'senate')).join('');
  const reps = (p.house_reps || []).map(h => legRow(h.district, h.name, h.party, h.overlap_pct, 'house')).join('');
  const districtsBlock = (sens || reps)
    ? `<div class="districts-block">
         <div class="districts-label">Regional representatives</div>
         <div class="districts-sub">All state legislators whose districts cover ${p.county} County. Percentages show share of county area in each district.</div>
         ${sens ? `<div class="districts-section"><div class="districts-section-h">State Senate</div><ul class="dist-list">${sens}</ul></div>` : ''}
         ${reps ? `<div class="districts-section"><div class="districts-section-h">State House</div><ul class="dist-list">${reps}</ul></div>` : ''}
       </div>`
    : '';

  el.innerHTML = `
    <h3>${p.name}</h3>
    <div class="proj-meta">${p.county} County · PJM ID ${p.id}</div>
    <div class="proj-stat"><span class="proj-stat-label">Fuel</span><span class="proj-stat-value">${p.fuel}</span></div>
    <div class="proj-stat"><span class="proj-stat-label">Capacity (summer)</span><span class="proj-stat-value">${fmt1(p.mw_capacity)} MW</span></div>
    <div class="proj-stat"><span class="proj-stat-label">Energy (winter)</span><span class="proj-stat-value">${fmt1(p.mw_energy)} MW</span></div>
    <div class="proj-stat"><span class="proj-stat-label">Status</span><span class="proj-stat-value">${p.status}</span></div>
    <div class="proj-stat"><span class="proj-stat-label">Submitted to PJM</span><span class="proj-stat-value">${submitted}</span></div>
    <div class="proj-stat"><span class="proj-stat-label">Federal cliff exposed</span><span class="proj-stat-value">${cliffMark}</span></div>
    <div class="proj-stat"><span class="proj-stat-label">CSA executed</span><span class="proj-stat-value">${p.csa_posted ? 'Yes' : 'No'}</span></div>
    ${districtsBlock}
    ${giaLink}
  `;
}

function buildFuelFilters() {
  const el = document.getElementById('fuel-filters');
  if (!el) return;
  const fuels = ['Solar', 'Solar+Storage', 'Wind', 'Storage', 'Nuclear'];
  el.innerHTML = fuels.map(fg => {
    const count = projects.filter(p => p.fuel_group === fg).length;
    if (count === 0) return '';
    const color = FUEL_COLORS[fg];
    return `<label>
      <input type="checkbox" data-fuel="${fg}" checked>
      <span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;margin-right:2px"></span>
      ${fg} <span style="color:var(--bpn-muted);font-size:0.85rem">(${count})</span>
    </label>`;
  }).join('');
  el.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', e => {
      const fg = e.target.dataset.fuel;
      if (e.target.checked) STATE.showFuels.add(fg);
      else STATE.showFuels.delete(fg);
      renderMarkers();
    });
  });

  const cliff = document.getElementById('cliff-only');
  if (cliff) {
    cliff.addEventListener('change', e => {
      STATE.cliffOnly = e.target.checked;
      renderMarkers();
    });
  }
}

function buildThresholdSlider() {
  const slider = document.getElementById('threshold-slider');
  if (!slider) return;
  slider.value = STATE.threshold;
  slider.addEventListener('input', e => {
    STATE.threshold = parseInt(e.target.value, 10);
    document.getElementById('threshold-value').textContent = `≥ ${STATE.threshold} MW`;
    renderMarkers();
    updateThresholdReadout();
    highlightThresholdRow();
  });
  document.getElementById('threshold-value').textContent = `≥ ${STATE.threshold} MW`;
}

function updateThresholdReadout() {
  const el = document.getElementById('threshold-readout');
  if (!el) return;
  const visible = projects.filter(p => projectVisible(p));
  const meet = visible.filter(p => projectMeetsThreshold(p));
  const meetMW = meet.reduce((s, p) => s + p.mw_capacity, 0);
  const totalMW = visible.reduce((s, p) => s + p.mw_capacity, 0);
  const pct = visible.length > 0 ? Math.round(100 * meet.length / visible.length) : 0;
  el.innerHTML = `At <strong>≥ ${STATE.threshold} MW</strong>, HB 502 would cover <strong>${meet.length} of ${visible.length}</strong> visible projects (${pct}%) — <strong>${fmt(meetMW)} of ${fmt(totalMW)} MW</strong>.`;
}

function buildThresholdTable() {
  const el = document.getElementById('threshold-table-host');
  if (!el || !thresholdData) return;
  const data = thresholdData.cliff_exposed;  // Cliff-exposed is the headline cut
  let html = `
    <h3>Cliff-exposed PA solar &amp; wind projects covered at each threshold</h3>
    <p class="chart-sub">Of the ${data.total_projects} GIA-posted PA solar/wind projects (${fmt(data.total_mw)} MW summer capacity)
    that face the OBBBA federal tax credit cliff, this is how many would qualify for HB 502 fast-track at each threshold.</p>
    <table class="threshold-table">
      <thead><tr>
        <th>Threshold</th><th class="num">Projects covered</th><th class="num">MW covered</th><th class="num">% of MW</th>
      </tr></thead>
      <tbody id="threshold-table-body">
  `;
  data.cuts.forEach(c => {
    html += `<tr data-threshold="${c.threshold}"><td>≥ ${c.threshold} MW</td>
      <td class="num">${c.projects} <span class="pct">(${c.pct_projects}%)</span></td>
      <td class="num">${fmt(c.mw_capacity)}</td>
      <td class="num">${c.pct_mw}%</td></tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
  highlightThresholdRow();
}

function highlightThresholdRow() {
  const rows = document.querySelectorAll('#threshold-table-body tr');
  rows.forEach(r => r.classList.remove('highlight'));
  // Find the row matching closest cut to current threshold
  const cuts = thresholdData.cliff_exposed.cuts.map(c => c.threshold);
  let target = cuts[0];
  for (const t of cuts) {
    if (STATE.threshold >= t) target = t;
  }
  const row = document.querySelector(`#threshold-table-body tr[data-threshold="${target}"]`);
  if (row) row.classList.add('highlight');
}

function buildCharts() {
  // Threshold sensitivity chart (3 series: all active, GIA-posted, cliff-exposed)
  buildThresholdChart();
  // PA-vs-PJM mix comparison
  buildMixComparisonChart();
  // Fuel mix chart
  buildFuelMixChart();
  // County rankings chart
  buildCountyChart();
  // Status breakdown
  buildStatusChart();
}

function buildMixComparisonChart() {
  const ctx = document.getElementById('chart-mix-comparison');
  if (!ctx || !mixComparison) return;

  // Three-bar 100% stacked horizontal: PA legacy, PJM-wide 2022, PJM Cycle 1 (2026 expected)
  const fuelOrder = ['Natural Gas', 'Solar', 'Solar+Storage', 'Storage', 'Wind', 'Nuclear', 'Other'];
  const series = [
    { key: 'pa_legacy_active' },
    { key: 'pjm_2022_full_queue' },
    { key: 'pjm_cycle1_2026' },
  ];

  const labels = series.map(s => mixComparison[s.key].label);
  const datasets = fuelOrder.map(fuel => ({
    label: fuel,
    backgroundColor: FUEL_COLORS[fuel] || '#a9a39a',
    borderColor: 'white',
    borderWidth: 1,
    data: series.map(s => {
      const f = (mixComparison[s.key].fuels || []).find(x => x.fuel === fuel);
      return f ? f.pct : 0;
    }),
  }));

  new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Hanken Grotesk' }, boxWidth: 12, padding: 10 } },
        tooltip: {
          titleFont: { family: 'Hanken Grotesk' }, bodyFont: { family: 'Hanken Grotesk' },
          callbacks: {
            label: (ctx) => {
              const seriesKey = series[ctx.dataIndex].key;
              const fuel = ctx.dataset.label;
              const f = (mixComparison[seriesKey].fuels || []).find(x => x.fuel === fuel);
              if (!f || !f.pct) return null;
              return `${fuel}: ${f.pct}% (${fmt(f.mw)} MW)`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true, min: 0, max: 100,
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: {
            font: { family: 'Hanken Grotesk' },
            callback: (v) => v + '%'
          }
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { family: 'Hanken Grotesk', size: 12 }, color: '#1a1a1a' }
        }
      }
    }
  });

  // Caption: total MW for each
  const cap = document.getElementById('chart-mix-comparison-caption');
  if (cap) {
    cap.innerHTML = series.map(s => {
      const d = mixComparison[s.key];
      const lbl = d.label_long || d.label;
      return `<div class="caption-row"><strong>${lbl}:</strong> ${fmt(d.total_mw)} MW total ${d.source_label ? '· <span class="caption-src">' + d.source_label + '</span>' : ''}</div>`;
    }).join('');
  }
}

function buildThresholdChart() {
  const ctx = document.getElementById('chart-threshold');
  if (!ctx || !thresholdData) return;
  const labels = thresholdData.cliff_exposed.cuts.map(c => `≥${c.threshold}`);
  const datasets = [
    {
      label: 'All active PA queue',
      data: thresholdData.all_active.cuts.map(c => c.projects),
      backgroundColor: 'rgba(107, 102, 97, 0.85)',
      borderColor: '#6b6661',
    },
    {
      label: 'GIA-posted (engineering complete)',
      data: thresholdData.gia_posted.cuts.map(c => c.projects),
      backgroundColor: 'rgba(0, 132, 77, 0.85)',
      borderColor: '#00844d',
    },
    {
      label: 'Federal cliff-exposed (solar + wind)',
      data: thresholdData.cliff_exposed.cuts.map(c => c.projects),
      backgroundColor: 'rgba(178, 58, 47, 0.85)',
      borderColor: '#b23a2f',
    },
  ];
  new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Hanken Grotesk' }, boxWidth: 12, padding: 12 } },
        tooltip: { titleFont: { family: 'Hanken Grotesk' }, bodyFont: { family: 'Hanken Grotesk' } }
      },
      scales: {
        x: { title: { display: true, text: 'HB 502 capacity threshold (MW)', font: { family: 'Hanken Grotesk', size: 12 } },
             grid: { display: false }, ticks: { font: { family: 'Hanken Grotesk' } } },
        y: { title: { display: true, text: 'Projects covered', font: { family: 'Hanken Grotesk', size: 12 } },
             grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { family: 'Hanken Grotesk' } } }
      }
    }
  });
}

function buildFuelMixChart() {
  const ctx = document.getElementById('chart-fuel-mix');
  if (!ctx || !fuelMix) return;
  const labels = fuelMix.fuels.map(f => f.fuel_group);
  const values = fuelMix.fuels.map(f => f.mw_capacity);
  const colors = labels.map(l => FUEL_COLORS[l] || '#a9a39a');
  new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#f5f3f1', borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '55%',
      plugins: {
        legend: { position: 'right', labels: { font: { family: 'Hanken Grotesk' }, boxWidth: 12, padding: 10 } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${fmt(ctx.parsed)} MW (${Math.round(100*ctx.parsed/values.reduce((s,v)=>s+v,0))}%)`
          }
        }
      }
    }
  });
}

function buildCountyChart() {
  const ctx = document.getElementById('chart-counties');
  if (!ctx || !countyData) return;
  const top = countyData.slice(0, 14);
  // Color by dominant senator's party (multi-senator counties: highest overlap %)
  function dominantParty(c) {
    const s = (c.senators || [])[0];
    return s ? s.party : 'R';
  }
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(c => c.county),
      datasets: [{
        label: 'MW Capacity (GIA-posted)',
        data: top.map(c => c.mw_capacity),
        backgroundColor: top.map(c => dominantParty(c) === 'D' ? '#1e5f9c' : '#b23a2f'),
        borderColor: 'rgba(0,0,0,0.05)',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (c) => {
              const item = top[c.dataIndex];
              const sens = (item.senators || []).map(s => `Sen. ${s.name} (SD-${s.district}, ${s.party})`);
              return sens.length ? sens : '';
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'MW summer capacity', font: { family: 'Hanken Grotesk', size: 11 } },
             grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { family: 'Hanken Grotesk' } } },
        y: { grid: { display: false }, ticks: { font: { family: 'Hanken Grotesk' } } }
      }
    }
  });
}

function buildStatusChart() {
  const ctx = document.getElementById('chart-status');
  if (!ctx) return;
  const counts = {};
  projects.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
  const order = ['Engineering and Procurement', 'Suspended', 'Under Construction', 'Partially in Service - Under Construction'];
  const labels = order.filter(s => counts[s]);
  const colorMap = {
    'Engineering and Procurement': '#c99b2e',
    'Suspended': '#b23a2f',
    'Under Construction': '#00844d',
    'Partially in Service - Under Construction': '#7e6dab',
  };
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Projects',
        data: labels.map(l => counts[l]),
        backgroundColor: labels.map(l => colorMap[l] || '#888'),
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { family: 'Hanken Grotesk' } }, grid: { color: 'rgba(0,0,0,0.06)' } },
        y: { ticks: { font: { family: 'Hanken Grotesk' } }, grid: { display: false } }
      }
    }
  });
}

function buildSenatorTargets() {
  const el = document.getElementById('senator-targets');
  if (!el) return;
  buildLegislatorTargets(el, 'senate');
}

function buildHouseTargets() {
  const el = document.getElementById('house-targets');
  if (!el) return;
  buildLegislatorTargets(el, 'house');
}

// chamber: 'senate' or 'house'
// Each project contributes to every legislator whose district covers any
// portion of the project's county. MW shown is the project's full MW since
// we don't know which sub-portion of the county the project is in.
function buildLegislatorTargets(el, chamber) {
  const fieldName = chamber === 'senate' ? 'senators' : 'house_reps';
  const prefix = chamber === 'senate' ? 'Sen.' : 'Rep.';
  const distPrefix = chamber === 'senate' ? 'SD' : 'HD';
  const distPad = chamber === 'senate' ? 2 : 3;

  const byLeg = {};
  projects.forEach(p => {
    (p[fieldName] || []).forEach(l => {
      const k = `${l.name}|${l.district}`;
      if (!byLeg[k]) byLeg[k] = {
        name: l.name, party: l.party, district: l.district,
        projects: 0, mw: 0, counties: new Set()
      };
      byLeg[k].projects += 1;
      byLeg[k].mw += p.mw_capacity;
      byLeg[k].counties.add(p.county);
    });
  });
  const list = Object.values(byLeg).sort((a,b) => b.mw - a.mw);
  if (list.length === 0) {
    el.innerHTML = '<div style="color:var(--bpn-muted)">No legislators attached.</div>';
    return;
  }
  el.innerHTML = list.map(s => {
    const partyClass = s.party ? `party-${s.party}-card` : '';
    const partyLabel = s.party === 'R' ? 'Republican' : s.party === 'D' ? 'Democrat' : 'Vacant';
    const distLabel = `${distPrefix}-${String(s.district).padStart(distPad, '0')}`;
    const titleName = s.name === 'Vacant' ? `${distLabel} (Vacant seat)` : `${prefix} ${s.name}`;
    return `
    <div class="sen-card ${partyClass}">
      <div class="sen-name">${titleName}</div>
      <div class="sen-meta">${distLabel} · ${partyLabel}</div>
      <div class="sen-stat"><span>Projects in district</span><span class="sen-stat-num">${s.projects}</span></div>
      <div class="sen-stat"><span>MW at risk</span><span class="sen-stat-num">${fmt1(s.mw)}</span></div>
      <div class="sen-stat"><span>Counties</span><span class="sen-stat-num">${s.counties.size}</span></div>
      <div style="font-size:0.78rem;color:var(--bpn-muted);margin-top:8px">${[...s.counties].join(', ')}</div>
    </div>`;
  }).join('');
}

// Stuck-MW choropleth — sequential green palette
const CAP_BUCKETS = [
  { max: 0,    fill: '#eae7e4', label: 'No GIA-posted projects' },
  { max: 50,   fill: '#d9e8df', label: '< 50 MW' },
  { max: 100,  fill: '#9bc3a8', label: '50–100 MW' },
  { max: 200,  fill: '#4f9c72', label: '100–200 MW' },
  { max: 9e9,  fill: '#00844d', label: '200+ MW' },
];

const SPONSOR_COLORS = {
  prime:        { fill: '#00844d', label: 'Prime sponsor (HB 502 / SB 502)' },
  cosponsor:    { fill: '#9bc3a8', label: 'Cosponsor (HB 502 / SB 502)' },
  not_signed:   { fill: '#eae7e4', label: 'Not on either bill' },
  vacant:       { fill: '#cccccc', label: 'Vacant seat' },
};

function bakeCosponsorIntoGeoJson() {
  if (!cosponsorData) return;
  function tag(features, chamber) {
    const map = (cosponsorData.by_chamber_district || {})[chamber] || {};
    features.forEach(f => {
      const d = String(f.properties.district);
      const entry = map[d];
      let status = 'not_signed';
      if (f.properties.party === null || f.properties.name === 'Vacant') status = 'vacant';
      else if (entry) {
        // If they're prime on either bill, "prime"; otherwise "cosponsor"
        const roles = (entry.bills || []).map(b => b.role);
        status = roles.includes('prime') ? 'prime' : 'cosponsor';
      }
      f.properties.cosponsor_status = status;
      f.properties.cosponsor_bills = entry ? entry.bills : [];
    });
  }
  if (senateGeojson?.features) tag(senateGeojson.features, 'senate');
  if (houseGeojson?.features) tag(houseGeojson.features, 'house');
}

function buildChamberMap() {
  const container = document.getElementById('chamber-map');
  if (!container || !senateGeojson || !houseGeojson || typeof maplibregl === 'undefined') return;

  chamberMap = new maplibregl.Map({
    container: 'chamber-map',
    style: {
      version: 8,
      sources: {
        'carto-light': {
          type: 'raster',
          tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
                  'https://cartodb-basemaps-b.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap © CARTO'
        }
      },
      layers: [{ id: 'carto-light', type: 'raster', source: 'carto-light', paint: { 'raster-opacity': 0.5 } }]
    },
    center: [-77.7, 41.0],
    zoom: 6.4,
    attributionControl: { compact: true }
  });
  chamberMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  chamberMap.on('load', () => {
    chamberMap.addSource('senate-districts', { type: 'geojson', data: senateGeojson });
    chamberMap.addSource('house-districts',  { type: 'geojson', data: houseGeojson  });

    addChamberLayers('senate', true);
    addChamberLayers('house',  false);

    setupChamberInteractions();
    wireToggles();
    refreshChamberStyling();
    setInitialSelection();
  });
}

function fillExpression(view) {
  if (view === 'cosponsors') {
    return [
      'match', ['get', 'cosponsor_status'],
      'prime',      SPONSOR_COLORS.prime.fill,
      'cosponsor',  SPONSOR_COLORS.cosponsor.fill,
      'vacant',     SPONSOR_COLORS.vacant.fill,
      SPONSOR_COLORS.not_signed.fill,
    ];
  }
  // capacity
  return [
    'step', ['get', 'mw_capacity'],
    CAP_BUCKETS[0].fill, 0.001,
    CAP_BUCKETS[1].fill, 50,
    CAP_BUCKETS[2].fill, 100,
    CAP_BUCKETS[3].fill, 200,
    CAP_BUCKETS[4].fill,
  ];
}

function addChamberLayers(chamber, visible) {
  const src = `${chamber}-districts`;
  const vis = visible ? 'visible' : 'none';
  chamberMap.addLayer({
    id: `${chamber}-fill`,
    type: 'fill',
    source: src,
    layout: { visibility: vis },
    paint: {
      'fill-color': fillExpression(CHAMBER_STATE.view),
      'fill-opacity': 0.85,
    }
  });
  chamberMap.addLayer({
    id: `${chamber}-line`,
    type: 'line',
    source: src,
    layout: { visibility: vis },
    paint: { 'line-color': '#1a1a1a', 'line-width': 0.5, 'line-opacity': 0.35 }
  });
  chamberMap.addLayer({
    id: `${chamber}-hover`,
    type: 'line',
    source: src,
    layout: { visibility: vis },
    paint: { 'line-color': '#1a1a1a', 'line-width': 2.5 },
    filter: ['==', ['get', 'district'], -1],
  });
  chamberMap.addLayer({
    id: `${chamber}-selected`,
    type: 'line',
    source: src,
    layout: { visibility: vis },
    paint: { 'line-color': 'var(--bpn-green)'.replace('var(--bpn-green)','#00844d'), 'line-width': 3 },
    filter: ['==', ['get', 'district'], -1],
  });
}

function setupChamberInteractions() {
  let tooltip = document.querySelector('.district-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'district-tooltip';
    document.body.appendChild(tooltip);
  }

  ['senate', 'house'].forEach(chamber => {
    const fillId = `${chamber}-fill`;

    chamberMap.on('mousemove', fillId, (e) => {
      chamberMap.getCanvas().style.cursor = 'pointer';
      const f = e.features[0];
      if (!f) return;
      chamberMap.setFilter(`${chamber}-hover`, ['==', ['get', 'district'], f.properties.district]);

      const p = f.properties;
      const counties = JSON.parse(p.counties || '[]');
      const partyLabel = p.party === 'R' ? 'Republican' : p.party === 'D' ? 'Democrat' : 'Vacant';
      const partyClass = p.party ? `party-${p.party}` : 'party-V';
      const distLabel = chamber === 'senate'
        ? `SD-${String(p.district).padStart(2,'0')}`
        : `HD-${String(p.district).padStart(3,'0')}`;
      tooltip.innerHTML = `
        <div class="tt-name">${distLabel} · ${p.name}</div>
        <div class="tt-meta"><span class="party-pill ${partyClass}">${p.party || 'V'}</span> ${partyLabel}</div>
        <div class="tt-stat"><span>Projects</span><strong>${p.projects}</strong></div>
        <div class="tt-stat"><span>MW at risk</span><strong>${fmt1(p.mw_capacity)}</strong></div>
        ${counties.length ? `<div class="tt-stat" style="display:block;margin-top:6px"><span style="color:var(--bpn-muted);font-size:0.74rem">Counties: ${counties.join(', ')}</span></div>` : ''}
      `;
      tooltip.classList.add('visible');
      tooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
      tooltip.style.top  = (e.originalEvent.clientY + 14) + 'px';
    });

    chamberMap.on('mouseleave', fillId, () => {
      chamberMap.getCanvas().style.cursor = '';
      chamberMap.setFilter(`${chamber}-hover`, ['==', ['get', 'district'], -1]);
      tooltip.classList.remove('visible');
    });

    chamberMap.on('click', fillId, (e) => {
      const f = e.features[0];
      if (!f) return;
      selectDistrict(chamber, f.properties.district);
    });
  });
}

function wireToggles() {
  document.querySelectorAll('.toggle-btn[data-chamber]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.chamber;
      if (c === CHAMBER_STATE.chamber) return;
      CHAMBER_STATE.chamber = c;
      document.querySelectorAll('.toggle-btn[data-chamber]').forEach(b => b.classList.toggle('active', b === btn));
      refreshChamberStyling();
      setInitialSelection();
    });
  });
  document.querySelectorAll('.toggle-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v === CHAMBER_STATE.view) return;
      CHAMBER_STATE.view = v;
      document.querySelectorAll('.toggle-btn[data-view]').forEach(b => b.classList.toggle('active', b === btn));
      refreshChamberStyling();
    });
  });
}

function refreshChamberStyling() {
  if (!chamberMap) return;
  const c = CHAMBER_STATE.chamber;
  const other = c === 'senate' ? 'house' : 'senate';
  ['fill', 'line', 'hover', 'selected'].forEach(suf => {
    chamberMap.setLayoutProperty(`${c}-${suf}`,     'visibility', 'visible');
    chamberMap.setLayoutProperty(`${other}-${suf}`, 'visibility', 'none');
  });
  // Update fill paint expression for current view
  ['senate', 'house'].forEach(ch => {
    chamberMap.setPaintProperty(`${ch}-fill`, 'fill-color', fillExpression(CHAMBER_STATE.view));
  });
  refreshLegend();
}

function refreshLegend() {
  const legend = document.getElementById('chamber-map-legend');
  if (!legend) return;
  const chamberLabel = CHAMBER_STATE.chamber === 'senate' ? 'Senate' : 'House';
  if (CHAMBER_STATE.view === 'cosponsors') {
    const rows = ['prime','cosponsor','not_signed','vacant'].map(k => {
      const c = SPONSOR_COLORS[k];
      return `<div class="legend-row"><span class="legend-swatch" style="background:${c.fill}"></span><span>${c.label}</span></div>`;
    }).join('');
    legend.innerHTML = `<div class="legend-title">${chamberLabel} sponsorship of HB 502 / SB 502</div>${rows}`;
  } else {
    const rows = CAP_BUCKETS.map(b => `<div class="legend-row"><span class="legend-swatch" style="background:${b.fill}"></span><span>${b.label}</span></div>`).join('');
    legend.innerHTML = `<div class="legend-title">Stuck capacity by ${chamberLabel} district</div>${rows}`;
  }
}

function setInitialSelection() {
  const gj = CHAMBER_STATE.chamber === 'senate' ? senateGeojson : houseGeojson;
  if (!gj) return;
  const top = gj.features
    .filter(f => f.properties.mw_capacity > 0)
    .sort((a, b) => b.properties.mw_capacity - a.properties.mw_capacity)[0];
  if (top) selectDistrict(CHAMBER_STATE.chamber, top.properties.district);
}

function selectDistrict(chamber, district) {
  CHAMBER_STATE.selected = { chamber, district };
  if (chamberMap) chamberMap.setFilter(`${chamber}-selected`, ['==', ['get', 'district'], district]);
  renderDistrictDetail(chamber, district);
}

function renderDistrictDetail(chamber, district) {
  const el = document.getElementById('district-detail');
  if (!el) return;
  const gj = chamber === 'senate' ? senateGeojson : houseGeojson;
  const f = gj.features.find(ft => ft.properties.district === district);
  if (!f) {
    el.innerHTML = `<div class="district-detail-empty">District not found.</div>`;
    return;
  }
  const p = f.properties;
  const distLabel = chamber === 'senate'
    ? `SD-${String(p.district).padStart(2, '0')}`
    : `HD-${String(p.district).padStart(3, '0')}`;
  const titlePrefix = chamber === 'senate' ? 'Sen.' : 'Rep.';
  const partyClass = p.party ? `party-${p.party}` : 'party-V';
  const partyLabel = p.party === 'R' ? 'Republican' : p.party === 'D' ? 'Democrat' : 'Vacant';

  // Cosponsor tag
  let coTag = '<span class="dd-cosponsor-tag not-signed">Not on HB 502 / SB 502</span>';
  if (p.cosponsor_status === 'prime') {
    const bills = (typeof p.cosponsor_bills === 'string' ? JSON.parse(p.cosponsor_bills) : p.cosponsor_bills) || [];
    const primeOf = bills.filter(b => b.role === 'prime').map(b => b.bill).join(', ');
    coTag = `<span class="dd-cosponsor-tag sponsor">Prime sponsor — ${primeOf}</span>`;
  } else if (p.cosponsor_status === 'cosponsor') {
    const bills = (typeof p.cosponsor_bills === 'string' ? JSON.parse(p.cosponsor_bills) : p.cosponsor_bills) || [];
    const billStr = bills.map(b => b.bill).join(', ');
    coTag = `<span class="dd-cosponsor-tag cosponsor">Cosponsor — ${billStr}</span>`;
  }

  // Projects in this district (lookup via senators[] or house_reps[] on each project)
  const fieldName = chamber === 'senate' ? 'senators' : 'house_reps';
  const projsInDist = projects.filter(pr => (pr[fieldName] || []).some(l => l.district === district));
  projsInDist.sort((a, b) => b.mw_capacity - a.mw_capacity);

  const counties = (typeof p.counties === 'string' ? JSON.parse(p.counties) : p.counties) || [];
  const titleName = p.name === 'Vacant' ? `${distLabel} (Vacant seat)` : `${titlePrefix} ${p.name}`;

  el.innerHTML = `
    <div class="dd-header">
      <div>
        <h3 class="dd-title">${titleName}</h3>
        <div class="dd-meta"><span class="party-pill ${partyClass}">${p.party || 'V'}</span>
          ${distLabel} · ${partyLabel}${counties.length ? ' · Counties: ' + counties.join(', ') : ''}</div>
      </div>
      <div>${coTag}</div>
    </div>
    <div class="dd-stats">
      <div><div class="dd-stat-num">${p.projects}</div><div class="dd-stat-label">Projects in district</div></div>
      <div><div class="dd-stat-num">${fmt1(p.mw_capacity)}</div><div class="dd-stat-label">MW at risk</div></div>
      <div><div class="dd-stat-num">${counties.length}</div><div class="dd-stat-label">Counties touched</div></div>
    </div>
    ${projsInDist.length ? `<ul class="dd-projects-list">
      ${projsInDist.slice(0, 12).map(pr => `<li>
        <span class="dd-fuel-dot" style="background:${FUEL_COLORS[pr.fuel_group] || '#888'}"></span>
        <span class="dd-proj-name">${pr.name}</span>
        <span class="dd-proj-county">${pr.county} · ${pr.fuel_group}</span>
        <span class="dd-proj-mw">${fmt1(pr.mw_capacity)} MW</span>
      </li>`).join('')}
      ${projsInDist.length > 12 ? `<li><span></span><span style="color:var(--bpn-muted);font-style:italic">+ ${projsInDist.length - 12} more</span><span></span><span></span></li>` : ''}
    </ul>` : ''}
  `;
}

function buildTopProjectsTable() {
  const el = document.getElementById('top-projects-host');
  if (!el) return;
  const top = projects.slice(0, 20);
  let html = `<table class="threshold-table">
    <thead><tr>
      <th>Project</th><th>County</th><th>Fuel</th>
      <th class="num">MW Cap</th><th>Status</th><th>Senator</th>
    </tr></thead><tbody>`;
  top.forEach(p => {
    const ps = p.primary_senator;
    const partyPill = ps?.party ? `<span class="party-pill party-${ps.party}" style="margin-right:6px">${ps.party}</span>` : '';
    const senCell = ps
      ? `${partyPill}${ps.name} <small style="color:var(--bpn-muted)">SD-${ps.district}</small>`
      : '<span style="color:var(--bpn-muted)">—</span>';
    html += `<tr>
      <td><strong>${p.name}</strong><br><small>${p.id}</small></td>
      <td>${p.county}</td>
      <td><span style="display:inline-block;width:8px;height:8px;background:${FUEL_COLORS[p.fuel_group]||'#888'};border-radius:50%;margin-right:6px"></span>${p.fuel_group}</td>
      <td class="num">${fmt1(p.mw_capacity)}</td>
      <td style="font-size:0.85rem">${p.status}</td>
      <td>${senCell}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function refresh() {
  // Already called individually; this is the post-init hook
}

// Map each section to its corresponding nav-link group
const NAV_SECTIONS = {
  'charts':           'overview',
  'context':          'overview',
  'brief':            'projects',
  'explore':          'projects',
  'top-projects':     'projects',
  'threshold':        'policy',
  'counterarguments': 'policy',
  'districts':        'politics',
  'methodology':      null,
  'downloads':        'downloads',
};

function setupActiveNavObserver() {
  const links = [...document.querySelectorAll('.nav-links a[data-nav]')];
  if (!links.length) return;

  function setActive(group) {
    links.forEach(a => a.classList.toggle('active', a.dataset.nav === group));
  }

  // State: track which sections are currently in the observed band
  const visibleSet = new Set();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) visibleSet.add(e.target.id);
      else visibleSet.delete(e.target.id);
    });
    if (visibleSet.size === 0) {
      // No section in the active band: at top of page, in hero, or between sections.
      links.forEach(a => a.classList.remove('active'));
      return;
    }
    // Of the visible ones, pick the LAST in DOM order — this is the deepest section
    // the user has scrolled into. (When two sections briefly co-exist in the band
    // during scroll, the deeper one is what the user just landed on.)
    const orderedIds = Object.keys(NAV_SECTIONS);
    const visibleInOrder = orderedIds.filter(id => visibleSet.has(id));
    const current = visibleInOrder[visibleInOrder.length - 1];
    if (current) {
      const group = NAV_SECTIONS[current];
      if (group) setActive(group);
      else links.forEach(a => a.classList.remove('active'));
    }
  }, {
    // Active when section's top is between nav and 40% down viewport
    rootMargin: '-80px 0px -60% 0px',
    threshold: 0,
  });
  Object.keys(NAV_SECTIONS).forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  setupActiveNavObserver();
});
