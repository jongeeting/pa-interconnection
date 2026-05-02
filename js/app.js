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
let map = null;
let markers = [];

async function init() {
  const [p, t, f, c] = await Promise.all([
    fetch('data/projects.json').then(r => r.json()),
    fetch('data/threshold-analysis.json').then(r => r.json()),
    fetch('data/fuel-mix.json').then(r => r.json()),
    fetch('data/by-county.json').then(r => r.json()),
  ]);
  projects = p;
  thresholdData = t;
  fuelMix = f;
  countyData = c;

  // Initialize fuel filter set with all fuels present
  new Set(projects.map(p => p.fuel_group)).forEach(fg => STATE.showFuels.add(fg));

  buildHeroStats();
  buildBriefSection();
  buildMap();
  buildFuelFilters();
  buildThresholdSlider();
  buildThresholdTable();
  buildCharts();
  buildSenatorTargets();
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
      <div class="stat-label">Summer-peak capacity stuck behind state and local permitting</div>
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

function showProjectCard(p) {
  const el = document.getElementById('proj-card');
  if (!el) return;
  const partyClass = p.senator_party ? `party-${p.senator_party}` : '';
  const partyPill = p.senator_party
    ? `<span class="party-pill ${partyClass}">${p.senator_party}</span>`
    : '';
  const senTag = p.senator
    ? `<div class="senator-tag">${partyPill} <span><strong>Sen. ${p.senator}</strong> · District ${p.senate_district}</span></div>`
    : `<div style="font-size:0.82rem;color:var(--bpn-muted);margin-top:10px">Senator: not yet attributed</div>`;

  const cliffMark = p.cliff_exposed
    ? '<span style="color:var(--bpn-red);font-weight:600">Yes</span>'
    : '<span style="color:var(--bpn-muted)">No</span>';

  const submitted = p.submitted ? new Date(p.submitted).toLocaleDateString(undefined, {year:'numeric', month:'short'}) : '—';

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
    ${senTag}
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
  // Fuel mix chart
  buildFuelMixChart();
  // County rankings chart
  buildCountyChart();
  // Status breakdown
  buildStatusChart();
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
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(c => c.county),
      datasets: [{
        label: 'MW Capacity (GIA-posted)',
        data: top.map(c => c.mw_capacity),
        backgroundColor: top.map(c => c.senator_party === 'D' ? '#1e5f9c' : '#b23a2f'),
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
              return item.senator ? `Sen. ${item.senator} (${item.senator_party})` : '';
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
  // Aggregate by senator
  const bySen = {};
  projects.forEach(p => {
    if (!p.senator) return;
    const k = p.senator;
    if (!bySen[k]) bySen[k] = {
      senator: p.senator, party: p.senator_party, district: p.senate_district,
      projects: 0, mw: 0, counties: new Set()
    };
    bySen[k].projects += 1;
    bySen[k].mw += p.mw_capacity;
    bySen[k].counties.add(p.county);
  });
  const list = Object.values(bySen).sort((a,b) => b.mw - a.mw);
  el.innerHTML = list.map(s => `
    <div class="sen-card party-${s.party}-card">
      <div class="sen-name">Sen. ${s.senator}</div>
      <div class="sen-meta">District ${s.district} · ${s.party === 'R' ? 'Republican' : 'Democrat'}</div>
      <div class="sen-stat"><span>Projects in district</span><span class="sen-stat-num">${s.projects}</span></div>
      <div class="sen-stat"><span>MW at risk</span><span class="sen-stat-num">${fmt1(s.mw)}</span></div>
      <div class="sen-stat"><span>Counties</span><span class="sen-stat-num">${s.counties.size}</span></div>
      <div style="font-size:0.78rem;color:var(--bpn-muted);margin-top:8px">${[...s.counties].join(', ')}</div>
    </div>
  `).join('');
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
    const partyPill = p.senator_party ? `<span class="party-pill party-${p.senator_party}" style="margin-right:6px">${p.senator_party}</span>` : '';
    html += `<tr>
      <td><strong>${p.name}</strong><br><small>${p.id}</small></td>
      <td>${p.county}</td>
      <td><span style="display:inline-block;width:8px;height:8px;background:${FUEL_COLORS[p.fuel_group]||'#888'};border-radius:50%;margin-right:6px"></span>${p.fuel_group}</td>
      <td class="num">${fmt1(p.mw_capacity)}</td>
      <td style="font-size:0.85rem">${p.status}</td>
      <td>${partyPill}${p.senator || '<span style="color:var(--bpn-muted)">—</span>'}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function refresh() {
  // Already called individually; this is the post-init hook
}

document.addEventListener('DOMContentLoaded', init);
