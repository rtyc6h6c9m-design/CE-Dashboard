/* =========================================================================
   Full Circle — UK Circular Economy Research Ecosystem
   Static dashboard. All filtering and rendering happens in the browser
   against JSON extracted from ce_ecosystem.db.
   ========================================================================= */
'use strict';

const DATA = {};
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ------------------------------------------------------------------ colour */

const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let C = {};
function readPalette() {
  C = {
    s1: cssVar('--series-1'), s2: cssVar('--series-2'), s3: cssVar('--series-3'),
    neutral: cssVar('--series-neutral'),
    text: cssVar('--text-primary'), sec: cssVar('--text-secondary'), muted: cssVar('--text-muted'),
    grid: cssVar('--gridline'), base: cssVar('--baseline'), surface: cssVar('--surface'),
    sunk: cssVar('--surface-sunk'), border: cssVar('--border'),
    seq: [cssVar('--seq-200'), cssVar('--seq-350'), cssVar('--seq-450'), cssVar('--seq-600')],
  };
}

/* Sector classes are capped at three hues plus neutral: no four-hue set
   clears the all-pairs colour-vision gate in both light and dark modes. */
const SECTOR = {
  education:  { key: 'education', label: 'Higher education',      colour: () => C.s1 },
  company:    { key: 'company',   label: 'Company',               colour: () => C.s2 },
  government: { key: 'public',    label: 'Public & third sector', colour: () => C.s3 },
  nonprofit:  { key: 'public',    label: 'Public & third sector', colour: () => C.s3 },
  facility:   { key: 'public',    label: 'Public & third sector', colour: () => C.s3 },
  other:      { key: 'other',     label: 'Other / unknown',       colour: () => C.neutral },
  unknown:    { key: 'other',     label: 'Other / unknown',       colour: () => C.neutral },
};
const sectorOf = t => SECTOR[t] || SECTOR.unknown;
const SECTOR_ORDER = ['education', 'company', 'public', 'other'];
const SECTOR_LABEL = { education: 'Higher education', company: 'Company',
                       public: 'Public & third sector', other: 'Other / unknown' };
const sectorColour = k => ({ education: C.s1, company: C.s2, public: C.s3, other: C.neutral }[k] || C.neutral);

/* Cluster colouring cycles a deliberately low-chroma ramp: clusters are an
   exploratory aid with no fixed identity, so they are not given series hues. */
function clusterColour(i) {
  if (i < 0) return C.neutral;
  const h = (i * 47) % 360;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') &&
      matchMedia('(prefers-color-scheme: dark)').matches);
  return `hsl(${h} 42% ${dark ? 62 : 44}%)`;
}

/* ------------------------------------------------------------------ format */

const fmtInt = n => (n == null ? '—' : d3.format(',')(Math.round(n)));
const fmtPct = n => (n == null ? '—' : d3.format('.1f')(n) + '%');
function fmtGBP(v, long) {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (long) return '£' + d3.format(',')(Math.round(v));
  if (a >= 1e9) return '£' + d3.format('.2f')(v / 1e9) + 'bn';
  if (a >= 1e6) return '£' + d3.format('.1f')(v / 1e6) + 'M';
  if (a >= 1e3) return '£' + d3.format('.0f')(v / 1e3) + 'k';
  return '£' + d3.format(',')(Math.round(v));
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const OUTPUT_TYPE_LABEL = {
  publication: 'Publication', policy_influence: 'Policy influence',
  database_or_model: 'Database or model', artistic_and_creative_product: 'Artistic & creative product',
  research_material: 'Research material', creative_product: 'Creative product',
  software_and_technical_product: 'Software & technical product',
  intellectual_property: 'Intellectual property', spinout: 'Spin-out', product: 'Product', other: 'Other',
};
const outLabel = t => OUTPUT_TYPE_LABEL[t] || (t || 'Other');

/* ------------------------------------------------------------------ tooltip */

const tip = $('#tip');
function showTip(html, ev) {
  tip.innerHTML = html;
  tip.style.opacity = 1;
  tip.setAttribute('aria-hidden', 'false');
  moveTip(ev);
}
function moveTip(ev) {
  const pad = 14, r = tip.getBoundingClientRect();
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + r.width  > innerWidth  - 8) x = ev.clientX - r.width  - pad;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top  = Math.max(8, y) + 'px';
}
function hideTip() { tip.style.opacity = 0; tip.setAttribute('aria-hidden', 'true'); }
const tipRow = (k, v) => `<span class="r"><span>${esc(k)}</span><b>${esc(v)}</b></span>`;

/* ------------------------------------------------------------------ state */

const state = {
  view: 'overview',
  search: '', yearFrom: null, yearTo: null,
  funder: '', discipline: '', orgtype: '', output: '',
  net: 'consortium', netColour: 'type', netWeight: 1, netLabels: true, netDim: true,
  netPinned: null,
  sort: 'v', sortDir: -1, page: 0, pageSize: 40, selectedProject: null,
  flowTopN: 8,
};
let filtered = [];          // indices of matching projects
let filteredSet = new Set();

function applyFilters() {
  const P = DATA.projects;
  const q = state.search.trim().toLowerCase();
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (state.yearFrom != null && (p.sy == null || p.sy < state.yearFrom)) continue;
    if (state.yearTo   != null && (p.sy == null || p.sy > state.yearTo))   continue;
    if (state.funder && p.fu !== state.funder) continue;
    if (state.discipline && p.d !== state.discipline) continue;
    if (state.orgtype && sectorOf(p.lt).key !== state.orgtype) continue;
    if (state.output === 'pub'  && !p.hp) continue;
    if (state.output === 'out'  && !(p.no > 0)) continue;
    if (state.output === 'none' && p.no > 0) continue;
    if (q) {
      const inst = p.li != null ? DATA.institutions[p.li].n : '';
      const hay = (p.ti || '') + ' ' + (p.g || '') + ' ' + (inst || '') +
                  ' ' + (p.fu || '') + ' ' + (p.d || '');
      if (!hay.toLowerCase().includes(q)) continue;
    }
    out.push(i);
  }
  filtered = out;
  filteredSet = new Set(out);
}

const isFiltering = () => !!(state.search || state.funder || state.discipline ||
  state.orgtype || state.output ||
  state.yearFrom !== DATA.yearMin || state.yearTo !== DATA.yearMax);

/* ------------------------------------------------------------------ charts */

function svgSetup(sel, height, margin) {
  const el = $(sel);
  const width = Math.max(280, el.clientWidth || el.parentElement.clientWidth - 40);
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.setAttribute('height', height);
  el.style.height = height + 'px';
  const svg = d3.select(el);
  svg.selectAll('*').remove();
  return { svg, width, height, iw: width - margin.l - margin.r, ih: height - margin.t - margin.b,
           g: svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`) };
}

/* Vertical bars over a time axis. One series, so no legend: the title names it. */
function barChartTime(sel, data, { value, label, format, tipLabel }) {
  const m = { t: 12, r: 8, b: 26, l: 54 };
  const { g, iw, ih } = svgSetup(sel, 216, m);
  if (!data.length) return;

  const x = d3.scaleBand().domain(data.map(d => d.year)).range([0, iw]).padding(0.26);
  const y = d3.scaleLinear().domain([0, d3.max(data, value) || 1]).nice(5).range([ih, 0]);

  g.selectAll('.grid-line').data(y.ticks(5)).join('line')
    .attr('class', 'grid-line').attr('x1', 0).attr('x2', iw)
    .attr('y1', d => y(d)).attr('y2', d => y(d));

  g.selectAll('.ylab').data(y.ticks(5)).join('text')
    .attr('class', 'axis-label').attr('x', -9).attr('y', d => y(d))
    .attr('dy', '0.32em').attr('text-anchor', 'end')
    .text(d => format ? format(d) : fmtInt(d));

  const years = data.map(d => d.year);
  const step = years.length > 14 ? Math.ceil(years.length / 9) : 1;
  g.selectAll('.xlab').data(years.filter((d, i) => i % step === 0)).join('text')
    .attr('class', 'axis-label').attr('x', d => x(d) + x.bandwidth() / 2)
    .attr('y', ih + 17).attr('text-anchor', 'middle').text(d => d);

  g.append('line').attr('class', 'base-line').attr('x1', 0).attr('x2', iw).attr('y1', ih).attr('y2', ih);

  /* 4px rounded data-end anchored to the baseline */
  g.selectAll('.bar').data(data).join('path')
    .attr('class', 'bar hoverable')
    .attr('fill', C.s1)
    .attr('d', d => {
      const bw = x.bandwidth(), bx = x(d.year), v = value(d);
      const by = y(v), h = Math.max(0, ih - by);
      if (h <= 0) return '';
      const r = Math.min(4, bw / 2, h);
      return `M${bx},${ih} L${bx},${by + r} Q${bx},${by} ${bx + r},${by}
              L${bx + bw - r},${by} Q${bx + bw},${by} ${bx + bw},${by + r} L${bx + bw},${ih} Z`;
    })
    .on('mousemove', (ev, d) => showTip(
      `<span class="t">${d.year}</span>` + tipRow(tipLabel || label, format ? format(value(d)) : fmtInt(value(d))), ev))
    .on('mouseleave', hideTip);
}

/* Horizontal bars, one series (slot 1) — never a value-ramp on nominal categories. */
function barChartH(sel, data, { format, height, highlight }) {
  const m = { t: 4, r: 62, b: 4, l: 148 };
  const h = height || Math.max(120, data.length * 25 + 8);
  const { g, iw, ih } = svgSetup(sel, h, m);
  if (!data.length) return;

  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.value) || 1]).range([0, iw]);
  const y = d3.scaleBand().domain(data.map(d => d.label)).range([0, ih]).padding(0.28);

  g.selectAll('.cat').data(data).join('text')
    .attr('class', 'cat-label').attr('x', -10).attr('y', d => y(d.label) + y.bandwidth() / 2)
    .attr('dy', '0.32em').attr('text-anchor', 'end')
    .text(d => d.label.length > 22 ? d.label.slice(0, 21) + '…' : d.label)
    .append('title').text(d => d.label);

  g.selectAll('.bar').data(data).join('path')
    .attr('class', 'bar hoverable')
    .attr('fill', d => highlight && highlight(d) ? C.s2 : C.s1)
    .attr('d', d => {
      const bh = y.bandwidth(), by = y(d.label), w = Math.max(0, x(d.value));
      if (w <= 0.5) return `M0,${by} L0.5,${by} L0.5,${by + bh} L0,${by + bh} Z`;
      const r = Math.min(4, bh / 2, w);
      return `M0,${by} L${w - r},${by} Q${w},${by} ${w},${by + r}
              L${w},${by + bh - r} Q${w},${by + bh} ${w - r},${by + bh} L0,${by + bh} Z`;
    })
    .on('mousemove', (ev, d) => showTip(
      `<span class="t">${esc(d.label)}</span>` +
      tipRow('Value', format ? format(d.value) : fmtInt(d.value)) +
      (d.extra || ''), ev))
    .on('mouseleave', hideTip);

  /* Selective direct labels: the value at each bar end, never inside a short bar. */
  g.selectAll('.vl').data(data).join('text')
    .attr('class', 'val-label').attr('x', d => x(d.value) + 7)
    .attr('y', d => y(d.label) + y.bandwidth() / 2).attr('dy', '0.32em')
    .text(d => format ? format(d.value) : fmtInt(d.value));
}

/* Grouped horizontal bars, two series — legend is in the HTML above the chart. */
function groupedBarH(sel, data, series) {
  const m = { t: 18, r: 52, b: 4, l: 158 };
  const h = Math.max(150, data.length * 38 + 22);
  const { g, iw, ih } = svgSetup(sel, h, m);
  if (!data.length) return;

  const x = d3.scaleLinear().domain([0, 100]).range([0, iw]);
  const y = d3.scaleBand().domain(data.map(d => d.label)).range([0, ih]).padding(0.3);
  const ys = d3.scaleBand().domain(series.map(s => s.key)).range([0, y.bandwidth()]).padding(0.22);

  g.selectAll('.grid-line').data(x.ticks(5)).join('line')
    .attr('class', 'grid-line').attr('y1', 0).attr('y2', ih)
    .attr('x1', d => x(d)).attr('x2', d => x(d));

  g.selectAll('.xlab').data(x.ticks(5)).join('text')
    .attr('class', 'axis-label').attr('x', d => x(d)).attr('y', -4)
    .attr('text-anchor', 'middle').text(d => d + '%');

  g.selectAll('.cat').data(data).join('text')
    .attr('class', 'cat-label').attr('x', -10).attr('y', d => y(d.label) + y.bandwidth() / 2)
    .attr('dy', '0.32em').attr('text-anchor', 'end')
    .text(d => d.label.length > 24 ? d.label.slice(0, 23) + '…' : d.label)
    .append('title').text(d => d.label);

  const rows = [];
  data.forEach(d => series.forEach(s => rows.push({ d, s })));

  g.selectAll('.bar').data(rows).join('path')
    .attr('class', 'bar hoverable').attr('fill', r => r.s.colour())
    .attr('d', r => {
      const bh = ys.bandwidth(), by = y(r.d.label) + ys(r.s.key);
      const w = Math.max(0, x(r.d[r.s.key] || 0));
      if (w <= 0.5) return `M0,${by} L1,${by} L1,${by + bh} L0,${by + bh} Z`;
      const rr = Math.min(3, bh / 2, w);
      return `M0,${by} L${w - rr},${by} Q${w},${by} ${w},${by + rr}
              L${w},${by + bh - rr} Q${w},${by + bh} ${w - rr},${by + bh} L0,${by + bh} Z`;
    })
    .on('mousemove', (ev, r) => showTip(
      `<span class="t">${esc(r.d.label)}</span>` +
      series.map(s => tipRow(s.label, fmtPct(r.d[s.key]))).join('') +
      `<span class="m">${fmtInt(r.d.n)} projects</span>`, ev))
    .on('mouseleave', hideTip);

  g.selectAll('.vl').data(rows).join('text')
    .attr('class', 'val-label')
    .attr('x', r => x(r.d[r.s.key] || 0) + 6)
    .attr('y', r => y(r.d.label) + ys(r.s.key) + ys.bandwidth() / 2).attr('dy', '0.32em')
    .text(r => d3.format('.0f')(r.d[r.s.key] || 0) + '%');
}

/* ------------------------------------------------------------------ tables */

function renderTableView(id, columns, rows) {
  const host = $('#' + id + '-table');
  if (!host) return;
  host.innerHTML = `<div class="tablewrap"><table class="tableview">
    <thead><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

/* ------------------------------------------------------------------ overview */

function renderOverview() {
  const P = DATA.projects;
  const rows = filtered.map(i => P[i]);

  /* stat tiles */
  const nFunded  = rows.filter(p => p.fa).length;
  const funding  = d3.sum(rows, p => p.fa ? (p.v || 0) : 0);
  const withPub  = rows.filter(p => p.hp).length;
  /* Distinct outputs, not the sum of per-project counts: an output linked to
     two projects must not be counted twice. */
  const distinctOut = new Set();
  for (const i of filtered) {
    const os = DATA.outcomesByProject.get(i);
    if (os) for (const o of os) distinctOut.add(o);
  }
  const insts = new Set();
  rows.forEach(p => { if (p.li != null) insts.add(p.li); });

  const tiles = [
    { k: 'Projects', v: fmtInt(rows.length),
      d: rows.length === P.length ? 'The whole dataset' : `of ${fmtInt(P.length)} in the dataset` },
    { k: 'Funding awarded', v: fmtGBP(funding),
      d: `across ${fmtInt(nFunded)} projects with an award value` },
    { k: 'With a publication', v: fmtInt(withPub),
      d: rows.length ? fmtPct(withPub / rows.length * 100) + ' of projects shown' : '—' },
    { k: 'Distinct outputs', v: fmtInt(distinctOut.size), d: 'all four sources, deduplicated' },
    { k: 'Lead organisations', v: fmtInt(insts.size), d: 'distinct institutions leading' },
  ];
  $('#stat-tiles').innerHTML = tiles.map(t => `<div class="card stat">
    <span class="k">${esc(t.k)}</span><span class="v">${t.v}</span><span class="d">${esc(t.d)}</span></div>`).join('');

  /* headline callout */
  const noOut = rows.filter(p => !(p.no > 0)).length;
  const g = gini(rows.map(p => p.no || 0));
  $('#headline-callout').innerHTML =
    `<b>${fmtPct(rows.length ? noOut / rows.length * 100 : 0)} of the projects shown</b>
     (${fmtInt(noOut)} of ${fmtInt(rows.length)}) produced no output that any of the four sources can find,
     and output across the rest is highly concentrated — a Gini coefficient of
     <b>${d3.format('.3f')(g)}</b>. Concentration this high is normal in research output, but it means an
     average is a poor summary of this ecosystem: read the distribution, not the mean.`;

  /* funding + projects by year */
  const byYear = d3.rollup(rows.filter(p => p.sy != null), v => ({
    funding: d3.sum(v, p => p.fa ? (p.v || 0) : 0), n: v.length,
  }), p => p.sy);
  const years = Array.from(byYear, ([year, o]) => ({ year, ...o })).sort((a, b) => a.year - b.year);

  barChartTime('#chart-funding-year', years,
    { value: d => d.funding, label: 'Funding', format: v => fmtGBP(v) });
  renderTableView('chart-funding-year', ['Start year', 'Funding', 'Projects'],
    years.map(d => [d.year, fmtGBP(d.funding, true), fmtInt(d.n)]));

  barChartTime('#chart-projects-year', years, { value: d => d.n, label: 'Projects' });
  renderTableView('chart-projects-year', ['Start year', 'Projects'],
    years.map(d => [d.year, fmtInt(d.n)]));

  /* funders */
  const byFunder = Array.from(
    d3.rollup(rows, v => ({ funding: d3.sum(v, p => p.fa ? (p.v || 0) : 0), n: v.length }), p => p.fu || 'Unknown'),
    ([label, o]) => ({ label, value: o.funding, n: o.n,
                       extra: `<span class="m">${fmtInt(o.n)} projects</span>` }))
    .sort((a, b) => b.value - a.value);
  const topFunders = byFunder.slice(0, 10);
  if (byFunder.length > 10) {
    const rest = byFunder.slice(10);
    topFunders.push({ label: 'Other funders', value: d3.sum(rest, d => d.value),
      n: d3.sum(rest, d => d.n),
      extra: `<span class="m">${rest.length} funders, ${fmtInt(d3.sum(rest, d => d.n))} projects</span>` });
  }
  barChartH('#chart-funders', topFunders, { format: v => fmtGBP(v) });
  renderTableView('chart-funders', ['Funder', 'Funding', 'Projects'],
    byFunder.map(d => [d.label, fmtGBP(d.value, true), fmtInt(d.n)]));

  /* disciplines */
  const byDisc = Array.from(d3.rollup(rows, v => v.length, p => p.d || 'Unclassified'),
    ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  barChartH('#chart-disciplines', byDisc.slice(0, 10), {});
  renderTableView('chart-disciplines', ['Discipline', 'Projects'],
    byDisc.map(d => [d.label, fmtInt(d.value)]));

  /* the reporting-regime chart */
  const regimes = Array.from(
    d3.rollup(rows, v => ({
      n: v.length,
      partners: v.filter(p => (p.np || 0) > 0).length / v.length * 100,
      pubs: v.filter(p => p.hp).length / v.length * 100,
    }), p => p.fu || 'Unknown'),
    ([label, o]) => ({ label, ...o }))
    .filter(d => d.n >= 15).sort((a, b) => b.n - a.n).slice(0, 9);

  groupedBarH('#chart-regimes', regimes, [
    { key: 'partners', label: 'Names partners to GtR', colour: () => C.s1 },
    { key: 'pubs',     label: 'Has a findable publication', colour: () => C.s2 },
  ]);
  renderTableView('chart-regimes',
    ['Funder', 'Projects', 'Names partners', 'Has a publication'],
    regimes.map(d => [d.label, fmtInt(d.n), fmtPct(d.partners), fmtPct(d.pubs)]));
}

function gini(values) {
  const v = values.filter(x => x != null).slice().sort((a, b) => a - b);
  const n = v.length;
  if (!n) return 0;
  const total = d3.sum(v);
  if (!total) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * v[i];
  return (2 * cum) / (n * total) - (n + 1) / n;
}

/* ------------------------------------------------------------------ flows */

function renderFlows() {
  const P = DATA.projects;
  const rows = filtered.map(i => P[i]);

  /* --- sankey: funder → project discipline → output discipline --- */
  /* Keys join on U+0001: funder and discipline names both contain spaces,
     so any printable separator would shatter them on split. */
  const SEP = '\u0001';
  const fields = DATA.flow.fields;
  const counts = new Map();          // "funder|projField|outField" → n
  for (const [pi, fi] of DATA.flow.rows) {
    if (!filteredSet.has(pi)) continue;
    const p = P[pi];
    const key = (p.fu || 'Unknown') + SEP + (p.d || 'Unclassified') + SEP + fields[fi];
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const funderTotals = new Map();
  for (const [k, n] of counts) {
    const f = k.split(SEP)[0];
    funderTotals.set(f, (funderTotals.get(f) || 0) + n);
  }
  const topN = state.flowTopN;
  const keepFunders = new Set(
    Array.from(funderTotals).sort((a, b) => b[1] - a[1])
      .slice(0, topN || funderTotals.size).map(d => d[0]));

  const nodeIdx = new Map(), nodes = [], links = [];
  /* `lyr`, not `layer`: d3-sankey writes its own `layer` onto every node. */
  const nodeId = (lyr, name) => {
    const key = lyr + SEP + name;
    if (!nodeIdx.has(key)) {
      nodeIdx.set(key, nodes.length);
      nodes.push({ name, lyr });
    }
    return nodeIdx.get(key);
  };
  const l1 = new Map(), l2 = new Map();
  for (const [k, n] of counts) {
    let [funder, pf, of_] = k.split(SEP);
    if (topN && !keepFunders.has(funder)) funder = 'Other funders';
    const a = funder + SEP + pf, b = pf + SEP + of_;
    l1.set(a, (l1.get(a) || 0) + n);
    l2.set(b, (l2.get(b) || 0) + n);
  }
  for (const [k, v] of l1) {
    const [f, pf] = k.split(SEP);
    links.push({ source: nodeId(0, f), target: nodeId(1, pf), value: v });
  }
  for (const [k, v] of l2) {
    const [pf, of_] = k.split(SEP);
    links.push({ source: nodeId(1, pf), target: nodeId(2, of_), value: v });
  }

  const el = $('#chart-sankey');
  const width = Math.max(320, el.clientWidth || 900);
  const height = Math.max(420, Math.min(760, nodes.length * 16 + 120));
  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.style.height = height + 'px';
  const svg = d3.select(el); svg.selectAll('*').remove();

  $('#flow-note').textContent =
    `${fmtInt(d3.sum(links.filter(l => nodes[l.source].lyr === 0), l => l.value))} project-to-output links ` +
    `from ${fmtInt(rows.length)} projects currently shown.`;

  if (!links.length) {
    svg.append('text').attr('x', width / 2).attr('y', height / 2).attr('text-anchor', 'middle')
      .attr('fill', C.muted).style('font-size', '13px')
      .text('No project-to-output links match the current filters.');
    renderTableView('chart-sankey', ['Funder', 'Project discipline', 'Output discipline', 'Links'], []);
    return;
  }

  const m = { t: 16, r: 4, b: 16, l: 4 };
  const sankey = d3.sankey()
    .nodeId(d => d.index).nodeWidth(11).nodePadding(9)
    .nodeSort((a, b) => b.value - a.value)
    .extent([[m.l, m.t], [width - m.r, height - m.b]]);
  const graph = sankey({ nodes: nodes.map(d => ({ ...d })), links: links.map(d => ({ ...d })) });

  /* Links share one hue at low opacity, lifted on hover: a categorical hue per
     band would exceed the safe slot count many times over. */
  const linkG = svg.append('g').attr('fill', 'none');
  linkG.selectAll('path').data(graph.links).join('path')
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', C.s1)
    .attr('stroke-opacity', 0.16)
    .attr('stroke-width', d => Math.max(1, d.width))
    .style('cursor', 'pointer')
    .on('mousemove', function (ev, d) {
      d3.select(this).attr('stroke-opacity', 0.5);
      showTip(`<span class="t">${esc(d.source.name)} → ${esc(d.target.name)}</span>` +
        tipRow('Links', fmtInt(d.value)), ev);
    })
    .on('mouseleave', function () { d3.select(this).attr('stroke-opacity', 0.16); hideTip(); });

  svg.append('g').selectAll('rect').data(graph.nodes).join('rect')
    .attr('x', d => d.x0).attr('y', d => d.y0)
    .attr('width', d => d.x1 - d.x0).attr('height', d => Math.max(1, d.y1 - d.y0))
    .attr('rx', 2.5)
    /* Middle layer is neutral: it is a pass-through, not a third category. */
    .attr('fill', d => [C.s1, C.muted, C.s2][d.lyr] || C.neutral)
    .style('cursor', 'pointer')
    .on('mousemove', (ev, d) => showTip(
      `<span class="t">${esc(d.name)}</span>` +
      tipRow(['Funder', 'Project discipline', 'Output discipline'][d.lyr], fmtInt(d.value)), ev))
    .on('mouseleave', hideTip);

  svg.append('g').selectAll('text').data(graph.nodes).join('text')
    .attr('x', d => d.lyr === 2 ? d.x0 - 7 : d.x1 + 7)
    .attr('y', d => (d.y0 + d.y1) / 2).attr('dy', '0.32em')
    .attr('text-anchor', d => d.lyr === 2 ? 'end' : 'start')
    .attr('fill', C.sec).style('font-size', '11.5px')
    .style('pointer-events', 'none')
    .text(d => (d.y1 - d.y0) < 9 ? '' : (d.name.length > 26 ? d.name.slice(0, 25) + '…' : d.name));

  renderTableView('chart-sankey',
    ['Funder', 'Project discipline', 'Output discipline', 'Links'],
    Array.from(counts).map(([k, n]) => [...k.split(SEP), fmtInt(n)])
      .sort((a, b) => +b[3].replace(/,/g, '') - +a[3].replace(/,/g, '')).slice(0, 200));

  /* --- output types --- */
  const outCounts = new Map();
  const seen = new Set();
  for (const [pi, oi] of DATA.projectOutcomes) {
    if (!filteredSet.has(pi) || seen.has(oi)) continue;
    seen.add(oi);
    const t = outLabel(DATA.outcomes[oi].ty);
    outCounts.set(t, (outCounts.get(t) || 0) + 1);
  }
  const outRows = Array.from(outCounts, ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  barChartH('#chart-outtypes', outRows, { height: Math.max(140, outRows.length * 25 + 8) });
  renderTableView('chart-outtypes', ['Output type', 'Distinct outputs'],
    outRows.map(d => [d.label, fmtInt(d.value)]));

  /* --- Lorenz curve --- */
  lorenz('#chart-lorenz', rows.map(p => p.no || 0));
}

function lorenz(sel, values) {
  const m = { t: 12, r: 12, b: 30, l: 46 };
  const { g, iw, ih } = svgSetup(sel, 264, m);
  const v = values.slice().sort((a, b) => b - a);
  const total = d3.sum(v);
  const n = v.length;
  if (!n || !total) {
    g.append('text').attr('x', iw / 2).attr('y', ih / 2).attr('text-anchor', 'middle')
      .attr('fill', C.muted).style('font-size', '13px').text('No output in the current selection.');
    renderTableView('chart-lorenz', ['Top share of projects', 'Share of output'], []);
    return;
  }
  const pts = [[0, 0]];
  let cum = 0;
  for (let i = 0; i < n; i++) { cum += v[i]; pts.push([(i + 1) / n, cum / total]); }

  const x = d3.scaleLinear().domain([0, 1]).range([0, iw]);
  const y = d3.scaleLinear().domain([0, 1]).range([ih, 0]);

  g.selectAll('.grid-line').data(y.ticks(5)).join('line')
    .attr('class', 'grid-line').attr('x1', 0).attr('x2', iw).attr('y1', d => y(d)).attr('y2', d => y(d));
  g.selectAll('.ylab').data(y.ticks(5)).join('text')
    .attr('class', 'axis-label').attr('x', -8).attr('y', d => y(d)).attr('dy', '0.32em')
    .attr('text-anchor', 'end').text(d => d3.format('.0%')(d));
  g.selectAll('.xlab').data(x.ticks(5)).join('text')
    .attr('class', 'axis-label').attr('x', d => x(d)).attr('y', ih + 17)
    .attr('text-anchor', 'middle').text(d => d3.format('.0%')(d));
  g.append('line').attr('class', 'base-line').attr('x1', 0).attr('x2', iw).attr('y1', ih).attr('y2', ih);

  g.append('line').attr('x1', 0).attr('y1', ih).attr('x2', iw).attr('y2', 0)
    .attr('stroke', C.base).attr('stroke-width', 1);

  g.append('path').datum(pts)
    .attr('fill', 'none').attr('stroke', C.s1).attr('stroke-width', 2)
    .attr('stroke-linejoin', 'round')
    .attr('d', d3.line().x(d => x(d[0])).y(d => y(d[1])));

  const at = f => { const i = Math.max(1, Math.round(f * n)); return pts[i] ? pts[i][1] : 0; };
  const marks = [0.05, 0.10, 0.25].map(f => ({ f, share: at(f) }));

  g.selectAll('.mk').data(marks).join('circle')
    .attr('cx', d => x(d.f)).attr('cy', d => y(d.share)).attr('r', 4)
    .attr('fill', C.s2).attr('stroke', C.surface).attr('stroke-width', 2);

  /* Direct-label the top-5% point only; the rest are in the table view. */
  const top = marks[0];
  g.append('text').attr('class', 'val-label')
    .attr('x', x(top.f) + 10).attr('y', y(top.share)).attr('dy', '0.32em')
    .attr('fill', C.text)
    .text(`top 5% hold ${d3.format('.0%')(top.share)}`);

  g.append('text').attr('class', 'axis-label')
    .attr('x', iw).attr('y', ih - 6).attr('text-anchor', 'end')
    .text(`Gini ${d3.format('.3f')(gini(values))}`);

  renderTableView('chart-lorenz', ['Top share of projects', 'Share of all output'],
    [0.05, 0.10, 0.25, 0.50, 1.0].map(f => [d3.format('.0%')(f), d3.format('.1%')(at(f))]));
}

/* ------------------------------------------------------------------ network */

const net = {
  canvas: null, ctx: null, transform: d3.zoomIdentity, zoom: null,
  nodes: [], edges: [], hover: null, dpr: 1, w: 0, h: 0,
};

function currentNetwork() {
  if (state.net === 'consortium') {
    return {
      layout: DATA.layoutConsortium, entities: DATA.institutions,
      edges: DATA.consortiumEdges, unit: 'projects',
      label: e => e.n,
      matches: idx => DATA.instProjects.has(idx) &&
        DATA.instProjects.get(idx).some(p => filteredSet.has(p)),
      colourOf: (e, l) => state.netColour === 'community'
        ? clusterColour(l[2]) : sectorColour(sectorOf(e.t).key),
      sizeOf: (e, l) => 2.2 + Math.sqrt(l[3]) * 1.05,
    };
  }
  return {
    layout: DATA.layoutCoauthor, entities: DATA.authors,
    edges: DATA.coauthorEdges, unit: 'outputs',
    label: e => e.n,
    matches: idx => (DATA.authors[idx].p || []).some(p => filteredSet.has(p)),
    colourOf: (e, l) => state.netColour === 'community' ? clusterColour(l[2]) : C.s1,
    sizeOf: (e, l) => 1.8 + Math.sqrt(l[3]) * 0.8,
  };
}

function buildNetwork() {
  const cfg = currentNetwork();
  const nodes = [];
  for (let i = 0; i < cfg.entities.length; i++) {
    const l = cfg.layout.nodes[i];
    if (!l) continue;
    nodes.push({ i, x: l[0], y: l[1], comm: l[2], deg: l[3], wdeg: l[4],
                 e: cfg.entities[i], r: cfg.sizeOf(cfg.entities[i], l) });
  }
  const keep = new Set(nodes.map(n => n.i));
  const edges = cfg.edges
    .filter(e => e[2] >= state.netWeight && keep.has(e[0]) && keep.has(e[1]));

  /* When the weight threshold rises, drop nodes it strands. */
  if (state.netWeight > 1) {
    const live = new Set();
    edges.forEach(e => { live.add(e[0]); live.add(e[1]); });
    net.nodes = nodes.filter(n => live.has(n.i));
  } else {
    net.nodes = nodes;
  }
  net.edges = edges;
  net.byIndex = new Map(net.nodes.map(n => [n.i, n]));
  net.cfg = cfg;

  const dimming = state.netDim && isFiltering();
  net.nodes.forEach(n => { n.on = dimming ? cfg.matches(n.i) : true; });

  $('#net-stats').textContent =
    `${fmtInt(net.nodes.length)} nodes · ${fmtInt(net.edges.length)} links`;
  $('#net-weight-unit').textContent = cfg.unit;
}

function resizeNetCanvas() {
  const c = net.canvas;
  const w = c.parentElement.clientWidth;
  const h = Math.max(430, Math.min(660, Math.round(innerHeight * 0.62)));
  net.dpr = Math.min(2, devicePixelRatio || 1);
  c.width = Math.round(w * net.dpr);
  c.height = Math.round(h * net.dpr);
  c.style.height = h + 'px';
  net.w = w; net.h = h;
}

function drawNetwork() {
  const { ctx, transform: t } = net;
  if (!ctx) return;
  ctx.save();
  ctx.setTransform(net.dpr, 0, 0, net.dpr, 0, 0);
  ctx.clearRect(0, 0, net.w, net.h);

  const scale = Math.min(net.w, net.h) * 0.46;
  const cx = net.w / 2, cy = net.h / 2;
  const px = n => cx + n.x * scale, py = n => cy + n.y * scale;

  ctx.translate(t.x, t.y); ctx.scale(t.k, t.k);

  const dimming = net.nodes.some(n => !n.on);
  const hoverNode = net.hover != null ? net.byIndex.get(net.hover) : null;
  const nbrs = new Set();
  if (hoverNode) {
    net.edges.forEach(e => {
      if (e[0] === hoverNode.i) nbrs.add(e[1]);
      else if (e[1] === hoverNode.i) nbrs.add(e[0]);
    });
  }

  /* edges */
  ctx.lineCap = 'round';
  for (const e of net.edges) {
    const a = net.byIndex.get(e[0]), b = net.byIndex.get(e[1]);
    if (!a || !b) continue;
    const lit = hoverNode && (e[0] === hoverNode.i || e[1] === hoverNode.i);
    const active = (!dimming || (a.on && b.on));
    let alpha = active ? 0.32 : 0.05;
    if (hoverNode) alpha = lit ? 0.85 : (active ? 0.07 : 0.03);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = lit ? C.s2 : C.neutral;
    ctx.lineWidth = Math.max(0.5, Math.min(3.2, Math.sqrt(e[2]) * 0.7)) / t.k;
    ctx.beginPath();
    ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b));
    ctx.stroke();
  }

  /* nodes — 2px surface ring so overlapping marks stay separable */
  const ringW = 1.6 / t.k;
  for (const n of net.nodes) {
    const isHover = hoverNode && (n.i === hoverNode.i);
    const isNbr = nbrs.has(n.i);
    let alpha = n.on ? 1 : 0.13;
    if (hoverNode && !isHover && !isNbr) alpha *= 0.32;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = net.cfg.colourOf(n.e, [n.x, n.y, n.comm, n.deg]);
    ctx.beginPath();
    ctx.arc(px(n), py(n), (isHover ? n.r * 1.5 : n.r) / Math.sqrt(t.k), 0, 6.284);
    ctx.fill();
    if (t.k > 0.9 || isHover) {
      ctx.strokeStyle = C.sunk; ctx.lineWidth = ringW; ctx.stroke();
    }
  }

  /* Labels: most-connected first, and a label is only drawn if its box clears
     every box already drawn. Without this the dense core collapses into mush. */
  if (state.netLabels) {
    const budget = Math.round(18 + t.k * 30);
    const ranked = net.nodes.filter(n => n.on).sort((a, b) => b.deg - a.deg).slice(0, budget * 3);
    const fs = Math.max(9, 11.5 / Math.sqrt(t.k));
    ctx.globalAlpha = 1;
    ctx.font = `${fs}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3 / t.k; ctx.strokeStyle = C.sunk;

    const boxes = [];
    let drawn = 0;
    for (const n of ranked) {
      if (drawn >= budget) break;
      const name = net.cfg.label(n.e) || '';
      if (!name) continue;
      const short = name.length > 28 ? name.slice(0, 27) + '…' : name;
      const w = ctx.measureText(short).width;
      const cx2 = px(n), ty = py(n) - (n.r / Math.sqrt(t.k)) - 3 / t.k;
      const box = { x0: cx2 - w / 2, x1: cx2 + w / 2, y0: ty - fs, y1: ty + fs * 0.25 };
      /* screen-space cull: skip anything off-canvas entirely */
      const sx = box.x0 * t.k + t.x, sy = box.y0 * t.k + t.y;
      if (sx > net.w || sy > net.h || box.x1 * t.k + t.x < 0 || box.y1 * t.k + t.y < 0) continue;
      if (boxes.some(b => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1))) continue;
      boxes.push(box);
      ctx.strokeText(short, cx2, ty);
      ctx.fillStyle = C.text;
      ctx.fillText(short, cx2, ty);
      drawn++;
    }
  }

  if (hoverNode) {
    ctx.globalAlpha = 1;
    ctx.font = `600 ${Math.max(10, 12 / Math.sqrt(t.k))}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const name = net.cfg.label(hoverNode.e) || '';
    const ty = py(hoverNode) - (hoverNode.r * 1.5 / Math.sqrt(t.k)) - 4 / t.k;
    ctx.lineWidth = 3.5 / t.k; ctx.strokeStyle = C.sunk;
    ctx.strokeText(name, px(hoverNode), ty);
    ctx.fillStyle = C.text;
    ctx.fillText(name, px(hoverNode), ty);
  }
  ctx.restore();
}

function netHitTest(mx, my) {
  const t = net.transform;
  const scale = Math.min(net.w, net.h) * 0.46;
  const cx = net.w / 2, cy = net.h / 2;
  const x = (mx - t.x) / t.k, y = (my - t.y) / t.k;
  let best = null, bestD = Infinity;
  for (const n of net.nodes) {
    const nx = cx + n.x * scale, ny = cy + n.y * scale;
    const d = (nx - x) ** 2 + (ny - y) ** 2;
    const r = Math.max(n.r / Math.sqrt(t.k), 7 / t.k);
    if (d < r * r && d < bestD) { bestD = d; best = n; }
  }
  return best;
}

function netDetailHTML(n) {
  const e = n.e;
  if (state.net === 'consortium') {
    const projs = (DATA.instProjects.get(n.i) || []);
    const shown = projs.filter(p => filteredSet.has(p));
    const partners = [];
    for (const ed of net.edges) {
      if (ed[0] === n.i) partners.push([ed[1], ed[2]]);
      else if (ed[1] === n.i) partners.push([ed[0], ed[2]]);
    }
    partners.sort((a, b) => b[1] - a[1]);
    const sec = sectorOf(e.t);
    return `
      <h3>${esc(e.n)}</h3>
      <div class="meta">
        <span class="pill ${sec.key}">${esc(sec.label)}</span>
        ${e.ct ? ' · ' + esc(e.ct) : ''}${e.c ? ', ' + esc(e.c) : ''}
      </div>
      <dl class="kv">
        <dt>Projects</dt><dd>${fmtInt(e.np)}${shown.length !== projs.length ? ` <span style="color:var(--text-muted)">(${fmtInt(shown.length)} in current filter)</span>` : ''}</dd>
        <dt>As lead</dt><dd>${fmtInt(e.nl)}</dd>
        <dt>As partner</dt><dd>${fmtInt(e.npa)}</dd>
        <dt>Funding led</dt><dd>${fmtGBP(e.f, true)}</dd>
        <dt>Outputs led</dt><dd>${fmtInt(e.o)}</dd>
        <dt>Co-partners</dt><dd>${fmtInt(partners.length)}</dd>
        ${e.ror ? `<dt>ROR</dt><dd><a href="${esc(e.ror)}" rel="noopener" target="_blank">${esc(String(e.ror).replace('https://ror.org/', ''))}</a></dd>` : ''}
      </dl>
      ${partners.length ? `<h4>Most frequent partners</h4><ul>${partners.slice(0, 10).map(([j, w]) => {
        const o = DATA.institutions[j];
        return `<li>${esc(o.n)} <span style="color:var(--text-muted)">· ${w} shared project${w > 1 ? 's' : ''}</span></li>`;
      }).join('')}</ul>` : ''}
      ${shown.length ? `<h4>Projects</h4><ul>${shown.slice(0, 12).map(p => {
        const pr = DATA.projects[p];
        return `<li>${esc(pr.ti || pr.g)}<br><span style="color:var(--text-muted)">${esc(pr.fu || '')} · ${pr.sy || '—'} · ${fmtGBP(pr.v)}</span></li>`;
      }).join('')}${shown.length > 12 ? `<li style="color:var(--text-muted)">…and ${fmtInt(shown.length - 12)} more</li>` : ''}</ul>` : ''}
    `;
  }
  const projs = (e.p || []).filter(p => filteredSet.has(p));
  const coauth = [];
  for (const ed of net.edges) {
    if (ed[0] === n.i) coauth.push([ed[1], ed[2]]);
    else if (ed[1] === n.i) coauth.push([ed[0], ed[2]]);
  }
  coauth.sort((a, b) => b[1] - a[1]);
  return `
    <h3>${esc(e.n)}</h3>
    <div class="meta">${e.o ? `<a href="https://orcid.org/${esc(String(e.o).replace('https://orcid.org/', ''))}" rel="noopener" target="_blank">ORCID ${esc(String(e.o).replace('https://orcid.org/', ''))}</a>` : 'No ORCID on record'}</div>
    <dl class="kv">
      <dt>Outputs</dt><dd>${fmtInt(e.no)}</dd>
      <dt>Linked projects</dt><dd>${fmtInt(e.npj)}</dd>
      <dt>Co-authors</dt><dd>${fmtInt(coauth.length)}</dd>
      <dt>Identity</dt><dd>${e.it === 'orcid' ? 'ORCID-resolved' : e.it === 'native_id' ? 'Source identifier' : 'Name match only'}</dd>
    </dl>
    ${e.it !== 'orcid' ? `<div class="callout" style="margin:12px 0 0;padding:9px 11px;font-size:12px">This identity was resolved without an ORCID, so it may merge or split people who share a name.</div>` : ''}
    ${coauth.length ? `<h4>Frequent co-authors</h4><ul>${coauth.slice(0, 10).map(([j, w]) =>
      `<li>${esc(DATA.authors[j].n)} <span style="color:var(--text-muted)">· ${w} shared output${w > 1 ? 's' : ''}</span></li>`).join('')}</ul>` : ''}
    ${projs.length ? `<h4>Projects</h4><ul>${projs.slice(0, 10).map(p => {
      const pr = DATA.projects[p];
      return `<li>${esc(pr.ti || pr.g)}<br><span style="color:var(--text-muted)">${esc(pr.fu || '')} · ${pr.sy || '—'}</span></li>`;
    }).join('')}</ul>` : ''}
  `;
}

function renderNetLegend() {
  const host = $('#net-legend');
  if (state.netColour === 'community') {
    host.innerHTML = `<div style="font-weight:600;margin-bottom:4px">Clusters</div>
      <div style="color:var(--text-muted);line-height:1.45">
        ${fmtInt(net.cfg.layout.n_communities)} clusters detected by modularity.
        Colours distinguish neighbouring clusters only — they carry no fixed meaning.
      </div>`;
    return;
  }
  if (state.net === 'coauthor') {
    host.innerHTML = `<div style="font-weight:600;margin-bottom:4px">Authors</div>
      <div style="color:var(--text-muted);line-height:1.45">
        Node size is number of co-authors. Author affiliation is not recorded in the
        source data, so sector cannot be shown here — switch to Clusters.
      </div>`;
    return;
  }
  host.innerHTML = `<div class="legend">${SECTOR_ORDER.map(k =>
    `<span class="item"><span class="swatch" style="background:${sectorColour(k)}"></span>${esc(SECTOR_LABEL[k])}</span>`
  ).join('')}</div>`;
}

function renderNetTable() {
  const rank = net.nodes.slice().sort((a, b) => b.deg - a.deg).slice(0, 25);
  const t = $('#net-table');
  if (state.net === 'consortium') {
    $('#net-table-title').textContent = 'Most connected organisations';
    t.innerHTML = `<thead><tr><th>Organisation</th><th>Sector</th><th>Partners</th>
      <th>Projects</th><th>Funding led</th></tr></thead><tbody>${rank.map(n => {
      const e = n.e, s = sectorOf(e.t);
      return `<tr><td>${esc(e.n)}</td><td>${esc(s.label)}</td><td>${fmtInt(n.deg)}</td>
        <td>${fmtInt(e.np)}</td><td>${fmtGBP(e.f)}</td></tr>`;
    }).join('')}</tbody>`;
  } else {
    $('#net-table-title').textContent = 'Most connected authors';
    t.innerHTML = `<thead><tr><th>Author</th><th>Identity</th><th>Co-authors</th>
      <th>Outputs</th><th>Projects</th></tr></thead><tbody>${rank.map(n => {
      const e = n.e;
      return `<tr><td>${esc(e.n)}</td><td>${e.it === 'orcid' ? 'ORCID' : e.it === 'native_id' ? 'Source ID' : 'Name only'}</td>
        <td>${fmtInt(n.deg)}</td><td>${fmtInt(e.no)}</td><td>${fmtInt(e.npj)}</td></tr>`;
    }).join('')}</tbody>`;
  }
}

function renderNetwork() {
  buildNetwork();
  resizeNetCanvas();
  drawNetwork();
  renderNetLegend();
  renderNetTable();

  const M = DATA.meta;
  $('#net-caveat').innerHTML = state.net === 'consortium'
    ? `<b>Read this before reading the network.</b> Partner organisations are named to Gateway to
       Research by some funders and not others — EPSRC, BBSRC, NERC, AHRC and ESRC name none at all.
       Only <b>309 of 1,640 projects (18.8%)</b> list any partner, and 208 of those are Innovate UK.
       This is therefore a map of <b>collaborative R&amp;D consortia</b>, and it is company-dominated
       for that reason, not because UK circular economy research is industry-led. For the academic
       half of the ecosystem, switch to the co-authorship network.`
    : `<b>Read this before reading the network.</b> Two researchers are linked when they appear on at
       least ${M.networks.coauthor.min_weight} of the same outputs. This view covers only the
       ${fmtInt(M.headline.with_publication)} projects with a findable publication, so it is the
       complement of the consortium network rather than the same ecosystem seen twice.
       ${M.networks.coauthor.hyperauthor_papers_excluded} papers with more than
       ${M.networks.coauthor.hyperauthor_cutoff} authors are excluded from edge construction.
       Identities without an ORCID may merge people who share a name.`;

  if (state.netPinned != null && net.byIndex.has(state.netPinned)) {
    $('#net-detail').innerHTML = netDetailHTML(net.byIndex.get(state.netPinned));
  } else {
    state.netPinned = null;
    $('#net-detail').innerHTML =
      '<div class="empty">Hover a node to preview it.<br>Click to pin its details here.</div>';
  }
}

function initNetwork() {
  net.canvas = $('#net-canvas');
  net.ctx = net.canvas.getContext('2d');

  net.zoom = d3.zoom().scaleExtent([0.35, 14])
    .on('zoom', ev => { net.transform = ev.transform; drawNetwork(); });
  d3.select(net.canvas).call(net.zoom)
    .on('dblclick.zoom', null);

  net.canvas.addEventListener('mousemove', ev => {
    const r = net.canvas.getBoundingClientRect();
    const hit = netHitTest(ev.clientX - r.left, ev.clientY - r.top);
    const id = hit ? hit.i : null;
    if (id !== net.hover) { net.hover = id; drawNetwork(); }
    if (hit) {
      const e = hit.e;
      const html = state.net === 'consortium'
        ? `<span class="t">${esc(e.n)}</span>` +
          tipRow('Sector', sectorOf(e.t).label) + tipRow('Projects', fmtInt(e.np)) +
          tipRow('Partners', fmtInt(hit.deg)) + tipRow('Funding led', fmtGBP(e.f)) +
          '<span class="m">Click to pin details</span>'
        : `<span class="t">${esc(e.n)}</span>` +
          tipRow('Outputs', fmtInt(e.no)) + tipRow('Co-authors', fmtInt(hit.deg)) +
          tipRow('Projects', fmtInt(e.npj)) +
          '<span class="m">Click to pin details</span>';
      showTip(html, ev);
      net.canvas.style.cursor = 'pointer';
    } else {
      hideTip();
      net.canvas.style.cursor = '';
    }
  });
  net.canvas.addEventListener('mouseleave', () => {
    hideTip(); if (net.hover != null) { net.hover = null; drawNetwork(); }
  });
  net.canvas.addEventListener('click', ev => {
    const r = net.canvas.getBoundingClientRect();
    const hit = netHitTest(ev.clientX - r.left, ev.clientY - r.top);
    if (hit) {
      state.netPinned = hit.i;
      $('#net-detail').innerHTML = netDetailHTML(hit);
    }
  });

  $('#net-consortium').onclick = () => setNetwork('consortium');
  $('#net-coauthor').onclick   = () => setNetwork('coauthor');
  $('#net-colour').onchange = e => { state.netColour = e.target.value; renderNetLegend(); drawNetwork(); };
  $('#net-weight').oninput = e => {
    state.netWeight = +e.target.value;
    $('#net-weight-val').textContent = e.target.value;
    renderNetwork();
  };
  $('#net-labels').onchange = e => { state.netLabels = e.target.checked; drawNetwork(); };
  $('#net-dim').onchange = e => { state.netDim = e.target.checked; buildNetwork(); drawNetwork(); };
  $('#net-in').onclick  = () => d3.select(net.canvas).transition().duration(230).call(net.zoom.scaleBy, 1.6);
  $('#net-out').onclick = () => d3.select(net.canvas).transition().duration(230).call(net.zoom.scaleBy, 0.625);
  $('#net-fit').onclick = () => {
    d3.select(net.canvas).transition().duration(280).call(net.zoom.transform, d3.zoomIdentity);
    state.netPinned = null; renderNetwork();
  };
}

function setNetwork(which) {
  state.net = which;
  state.netPinned = null;
  const floor = which === 'coauthor' ? (DATA.meta.networks.coauthor.min_weight || 1) : 1;
  state.netWeight = floor;
  const sl = $('#net-weight');
  sl.min = floor; sl.max = floor + 9; sl.value = floor;
  $('#net-weight-val').textContent = String(floor);
  $('#net-consortium').setAttribute('aria-pressed', String(which === 'consortium'));
  $('#net-coauthor').setAttribute('aria-pressed', String(which === 'coauthor'));
  const sel = $('#net-colour');
  sel.value = which === 'coauthor' ? 'community' : 'type';
  state.netColour = sel.value;
  net.transform = d3.zoomIdentity;
  d3.select(net.canvas).call(net.zoom.transform, d3.zoomIdentity);
  renderNetwork();
}

/* ------------------------------------------------------------------ projects */

function renderProjects() {
  const P = DATA.projects;
  const key = state.sort, dir = state.sortDir;
  const rows = filtered.slice().sort((a, b) => {
    let va = P[a][key], vb = P[b][key];
    if (typeof va === 'string' || typeof vb === 'string') {
      va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
      return va < vb ? -dir : va > vb ? dir : 0;
    }
    va = va == null ? -Infinity : va; vb = vb == null ? -Infinity : vb;
    return (va - vb) * dir;
  });

  const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, pages - 1);
  const start = state.page * state.pageSize;
  const slice = rows.slice(start, start + state.pageSize);

  $('#proj-body').innerHTML = slice.map(i => {
    const p = P[i];
    const inst = p.li != null ? DATA.institutions[p.li] : null;
    const sec = sectorOf(p.lt);
    return `<tr data-i="${i}" ${state.selectedProject === i ? 'aria-selected="true"' : ''}>
      <td>
        <span class="t-title">${esc(p.ti || p.g || 'Untitled')}</span>
        <span class="t-sub">${inst ? esc(inst.n) : 'No institution resolved'}
          · <span class="pill ${sec.key}">${esc(sec.label)}</span></span>
      </td>
      <td>${esc(p.fu || '—')}<br><span class="t-sub">${esc(p.d || '—')}</span></td>
      <td class="num">${p.sy ?? '—'}</td>
      <td class="num">${p.fa ? fmtGBP(p.v) : '<span style="color:var(--text-muted)">n/a</span>'}</td>
      <td class="num">${fmtInt(p.no)}</td>
      <td class="num">${fmtInt(p.np)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="6"><div class="empty">No projects match these filters.</div></td></tr>`;

  $('#pg-info').textContent = rows.length
    ? `${fmtInt(start + 1)}–${fmtInt(Math.min(start + state.pageSize, rows.length))} of ${fmtInt(rows.length)}`
    : 'No results';
  $('#pg-prev').disabled = state.page === 0;
  $('#pg-next').disabled = state.page >= pages - 1;

  $$('#proj-body tr[data-i]').forEach(tr => {
    tr.onclick = () => { state.selectedProject = +tr.dataset.i; renderProjects(); renderProjectDetail(); };
  });

  $$('#proj-table th[data-sort]').forEach(th => {
    const k = th.dataset.sort;
    th.textContent = th.textContent.replace(/ [↑↓]$/, '') + (state.sort === k ? (dir === 1 ? ' ↑' : ' ↓') : '');
  });
  renderProjectDetail();
}

function renderProjectDetail() {
  const host = $('#proj-detail');
  const i = state.selectedProject;
  if (i == null || !filteredSet.has(i)) {
    host.innerHTML = '<div class="empty">Select a project to see its funder, partners and outputs.</div>';
    return;
  }
  const p = DATA.projects[i];
  const inst = p.li != null ? DATA.institutions[p.li] : null;
  const sec = sectorOf(p.lt);
  const partners = (DATA.projectInstitutions.get(i) || []).filter(l => l[1] === 0);
  const outs = (DATA.outcomesByProject.get(i) || []).map(o => DATA.outcomes[o]);
  const pubs = outs.filter(o => o.ty === 'publication');
  const others = outs.filter(o => o.ty !== 'publication');

  host.innerHTML = `
    <h3>${esc(p.ti || p.g || 'Untitled')}</h3>
    <div class="meta">
      ${p.u ? `<a href="${esc(p.u)}" rel="noopener" target="_blank">${esc(p.g)} on Gateway to Research ↗</a>` : esc(p.g || '')}
    </div>
    <dl class="kv">
      <dt>Funder</dt><dd>${esc(p.fu || '—')}</dd>
      <dt>Award</dt><dd>${p.fa ? fmtGBP(p.v, true) : 'No usable award value (typically a studentship)'}</dd>
      <dt>Category</dt><dd>${esc(p.gc || '—')}</dd>
      <dt>Period</dt><dd>${p.sy ?? '—'}–${p.ey ?? '—'}${p.dm ? ` (${fmtInt(p.dm)} months)` : ''}</dd>
      <dt>Status</dt><dd>${esc(p.st || '—')}</dd>
      <dt>Lead</dt><dd>${inst ? esc(inst.n) : '—'}<br><span class="pill ${sec.key}">${esc(sec.label)}</span></dd>
      <dt>Discipline</dt><dd>${esc(p.d || '—')}${p.dc != null ? ` <span style="color:var(--text-muted)">· confidence ${d3.format('.2f')(p.dc)}</span>` : ''}</dd>
      ${p.pi ? `<dt>Investigator</dt><dd>${esc(p.pi)} <span style="color:var(--text-muted)">· recorded as surname plus initial, which cannot reliably identify one person</span></dd>` : ''}
    </dl>

    ${p.ab ? `<h4>Abstract</h4><p class="abstract">${esc(p.ab)}${p.ab.length >= 600 ? '…' : ''}</p>` : ''}

    <h4>Partner organisations (${fmtInt(partners.length)})</h4>
    ${partners.length
      ? `<ul>${partners.map(l => {
          const o = DATA.institutions[l[0]];
          return `<li>${esc(o.n)} <span style="color:var(--text-muted)">· ${esc(sectorOf(o.t).label)}</span></li>`;
        }).join('')}</ul>`
      : `<p class="abstract">None named. ${['EPSRC','BBSRC','NERC','AHRC','ESRC'].includes(p.fu)
          ? `${esc(p.fu)} does not report partner organisations to Gateway to Research at all, so this is a gap in the source rather than a solo project.`
          : 'No partner organisation is recorded against this grant.'}</p>`}

    <h4>Outputs (${fmtInt(outs.length)})</h4>
    ${outs.length ? `<ul>
      ${pubs.slice(0, 12).map(o => `<li>${esc(o.ti || 'Untitled')}
        <br><span style="color:var(--text-muted)">${esc(o.s || outLabel(o.ty))}${o.y ? ' · ' + o.y : ''}${o.cc != null ? ' · ' + fmtInt(o.cc) + ' citations (OpenAlex)' : ''}</span>
        ${o.doi ? ` <a href="https://doi.org/${esc(o.doi)}" rel="noopener" target="_blank">DOI ↗</a>` : ''}</li>`).join('')}
      ${pubs.length > 12 ? `<li style="color:var(--text-muted)">…and ${fmtInt(pubs.length - 12)} more publications</li>` : ''}
      ${others.length ? `<li style="color:var(--text-muted);padding-top:8px">Plus ${fmtInt(others.length)} non-publication output${others.length > 1 ? 's' : ''}: ${esc(Array.from(new Set(others.map(o => outLabel(o.ty)))).join(', '))}</li>` : ''}
    </ul>` : `<p class="abstract">No output findable in Gateway to Research, OpenAlex, Scopus or Web of Science.
      ${p.fu === 'Innovate UK' ? 'Innovate UK reports no outputs to Gateway to Research at all, so absence here is weak evidence of absence.' : ''}</p>`}
  `;
}

function downloadCSV() {
  const P = DATA.projects;
  const cols = ['grant_reference', 'title', 'funder', 'grant_category', 'start_year', 'end_year',
    'award_gbp', 'award_available', 'lead_institution', 'lead_sector', 'lead_country',
    'discipline', 'discipline_confidence', 'n_partners', 'n_outputs', 'n_publications',
    'has_publication', 'gtr_url'];
  const lines = [cols.join(',')];
  const q = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  for (const i of filtered) {
    const p = P[i];
    const inst = p.li != null ? DATA.institutions[p.li] : null;
    lines.push([p.g, p.ti, p.fu, p.gc, p.sy, p.ey, p.fa ? p.v : '', p.fa ? 'yes' : 'no',
      inst ? inst.n : '', sectorOf(p.lt).label, p.lc, p.d, p.dc, p.np, p.no, p.npub,
      p.hp ? 'yes' : 'no', p.u].map(q).join(','));
  }
  lines.push('');
  lines.push('# Contains public sector information from UKRI Gateway to Research licensed under the Open Government Licence v3.0.');
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'full-circle-projects.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------------------------------------------ shell */

function renderCurrentView() {
  $('#match-count').innerHTML = isFiltering()
    ? `<b>${fmtInt(filtered.length)}</b> of ${fmtInt(DATA.projects.length)} projects`
    : `<b>${fmtInt(DATA.projects.length)}</b> projects`;
  if (state.view === 'overview') renderOverview();
  else if (state.view === 'network') renderNetwork();
  else if (state.view === 'flows') renderFlows();
  else if (state.view === 'projects') renderProjects();
}

function setView(v) {
  state.view = v;
  $$('nav.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  $$('.view').forEach(s => { s.hidden = s.id !== 'view-' + v; });
  $('#filterbar').hidden = (v === 'methods');
  renderCurrentView();
  history.replaceState(null, '', '#' + v);
}

function onFilterChange() {
  applyFilters();
  state.page = 0;
  renderCurrentView();
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function initTheme() {
  const saved = (() => { try { return localStorage.getItem('fc-theme'); } catch { return null; } })();
  if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  readPalette();
  $('#theme-btn').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const next = cur ? (cur === 'dark' ? 'light' : 'dark') : (sysDark ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('fc-theme', next); } catch { /* private mode */ }
    readPalette();
    renderCurrentView();
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.getAttribute('data-theme')) { readPalette(); renderCurrentView(); }
  });
}

function initFilters() {
  const P = DATA.projects;
  const funders = Array.from(new Set(P.map(p => p.fu).filter(Boolean))).sort();
  const discs = Array.from(new Set(P.map(p => p.d).filter(Boolean))).sort();
  $('#f-funder').insertAdjacentHTML('beforeend',
    funders.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join(''));
  $('#f-discipline').insertAdjacentHTML('beforeend',
    discs.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join(''));

  const ys = P.map(p => p.sy).filter(y => y != null);
  DATA.yearMin = Math.min(...ys); DATA.yearMax = Math.max(...ys);
  state.yearFrom = DATA.yearMin; state.yearTo = DATA.yearMax;
  $('#f-year-from').value = DATA.yearMin; $('#f-year-from').min = DATA.yearMin; $('#f-year-from').max = DATA.yearMax;
  $('#f-year-to').value   = DATA.yearMax; $('#f-year-to').min   = DATA.yearMin; $('#f-year-to').max   = DATA.yearMax;

  $('#f-search').oninput = debounce(e => { state.search = e.target.value; onFilterChange(); }, 220);
  $('#f-year-from').onchange = e => { state.yearFrom = e.target.value ? +e.target.value : null; onFilterChange(); };
  $('#f-year-to').onchange   = e => { state.yearTo   = e.target.value ? +e.target.value : null; onFilterChange(); };
  $('#f-funder').onchange     = e => { state.funder = e.target.value; onFilterChange(); };
  $('#f-discipline').onchange = e => { state.discipline = e.target.value; onFilterChange(); };
  $('#f-orgtype').onchange    = e => { state.orgtype = e.target.value; onFilterChange(); };
  $('#f-output').onchange     = e => { state.output = e.target.value; onFilterChange(); };
  $('#f-reset').onclick = () => {
    state.search = ''; state.funder = ''; state.discipline = ''; state.orgtype = ''; state.output = '';
    state.yearFrom = DATA.yearMin; state.yearTo = DATA.yearMax;
    $('#f-search').value = ''; $('#f-funder').value = ''; $('#f-discipline').value = '';
    $('#f-orgtype').value = ''; $('#f-output').value = '';
    $('#f-year-from').value = DATA.yearMin; $('#f-year-to').value = DATA.yearMax;
    onFilterChange();
  };
}

function initTableToggles() {
  $$('[data-table]').forEach(btn => {
    btn.onclick = () => {
      const host = $('#' + btn.dataset.table + '-table');
      const chart = $('#' + btn.dataset.table);
      const showing = !host.hidden;
      host.hidden = showing;
      chart.style.display = showing ? '' : 'none';
      btn.textContent = showing ? 'Table' : 'Chart';
    };
  });
}

function buildIndices() {
  DATA.instProjects = new Map();
  DATA.projectInstitutions = new Map();
  for (const [p, i, role] of DATA.projectInstitutionRows) {
    if (!DATA.instProjects.has(i)) DATA.instProjects.set(i, []);
    DATA.instProjects.get(i).push(p);
    if (!DATA.projectInstitutions.has(p)) DATA.projectInstitutions.set(p, []);
    DATA.projectInstitutions.get(p).push([i, role]);
  }
  DATA.outcomesByProject = new Map();
  for (const [p, o] of DATA.projectOutcomes) {
    if (!DATA.outcomesByProject.has(p)) DATA.outcomesByProject.set(p, []);
    DATA.outcomesByProject.get(p).push(o);
  }
}

function fillMethods() {
  const h = DATA.meta.headline;
  $('#m-projects').textContent = fmtInt(h.projects);
  $('#m-funding').textContent = fmtGBP(h.funding_gbp);
  const built = `Data extracted from the project database built ${DATA.meta.db_build}; ` +
                `this extract generated ${DATA.meta.built}. Elapsed-time fields use a fixed ` +
                `reference date of ${DATA.meta.reference_date}.`;
  $('#m-build').textContent = built;
  $('#foot-build').textContent = `Database build ${DATA.meta.db_build}.`;
}

async function boot() {
  initTheme();
  /* Flat layout: every data file sits beside index.html, so no directory prefix. */
  const j = async n => (await fetch(n)).json();
  const [meta, projects, institutions, projInst, consEdges, authors, caEdges,
         layoutC, layoutA, flow, aggregates, projOut] = await Promise.all([
    j('meta.json'), j('projects.json'), j('institutions.json'), j('project_institutions.json'),
    j('consortium_edges.json'), j('authors.json'), j('coauthor_edges.json'),
    j('layout_consortium.json'), j('layout_coauthor.json'), j('discipline_flow.json'),
    j('aggregates.json'), j('project_outcomes.json'),
  ]);
  Object.assign(DATA, {
    meta, projects: projects.rows, institutions: institutions.rows,
    projectInstitutionRows: projInst.rows, consortiumEdges: consEdges.rows,
    authors: authors.rows, coauthorEdges: caEdges.rows,
    layoutConsortium: layoutC, layoutCoauthor: layoutA,
    flow, aggregates,
  });

  /* Outcome titles are by far the largest file and are only needed once a
     project is opened, so they load after first paint. The project-to-output
     link table is small and loads up front, because the headline counts and
     the output-type chart both depend on it. */
  DATA.outcomes = []; DATA.projectOutcomes = projOut.rows;
  buildIndices();
  initFilters();
  initNetwork();
  initTableToggles();
  fillMethods();
  applyFilters();

  $$('nav.tabs button').forEach(b => { b.onclick = () => setView(b.dataset.view); });
  $('#flow-topn').onchange = e => { state.flowTopN = +e.target.value; renderFlows(); };
  $('#pg-prev').onclick = () => { state.page--; renderProjects(); };
  $('#pg-next').onclick = () => { state.page++; renderProjects(); };
  $('#dl-csv').onclick = downloadCSV;
  $$('#proj-table th[data-sort]').forEach(th => {
    th.onclick = () => {
      const k = th.dataset.sort;
      if (state.sort === k) state.sortDir *= -1;
      else { state.sort = k; state.sortDir = (k === 'ti' || k === 'fu') ? 1 : -1; }
      state.page = 0; renderProjects();
    };
  });
  addEventListener('resize', debounce(() => {
    if (state.view === 'network') { resizeNetCanvas(); drawNetwork(); } else renderCurrentView();
  }, 180));

  const hash = location.hash.replace('#', '');
  setView(['overview', 'network', 'flows', 'projects', 'methods'].includes(hash) ? hash : 'overview');
  $('#loading').remove();

  DATA.outcomes = (await j('outcomes.json')).rows;
  if (state.view === 'flows' || state.view === 'projects') renderCurrentView();
}

boot().catch(err => {
  console.error(err);
  const l = $('#loading');
  if (l) l.innerHTML = '<p style="max-width:420px;text-align:center">Could not load the dataset. ' +
    'If you are opening this file directly from disk, run it through a local web server instead ' +
    '(<code>python3 -m http.server</code>) — browsers block data files loaded from <code>file://</code>.</p>';
});
