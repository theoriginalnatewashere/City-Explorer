/* Explore view assembler: loads the frozen V1 exports (byte-identical copies),
 * builds the metadata-driven controls, and keeps scatter + map linked. */

import { parseCSV } from "./lib/csv.js";
import { esc, has, debounce } from "./lib/util.js";
import {
  state, subscribe, notify, toggleSelect, clearSelection,
  setAxes, setCountryFilter, isFilteredOut, hasValue, MAX_SELECTION, SELECTION_COLORS,
} from "./state.js";
import { buildRegistry, GROUPS, POPULATION } from "./registry.js";
import { createScatter } from "./scatter.js";
import { createMap } from "./map.js";
import { createCompare } from "./compare.js";

const BASE = document.documentElement.dataset.base || "";

async function fetchText(p) { return (await fetch(p)).text(); }
async function fetchJSON(p) { return (await fetch(p)).json(); }

const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/* ---------- boot ---------- */
const [explorerCSV, metadataCSV, world] = await Promise.all([
  fetchText(`${BASE}data/city_explorer.csv`),
  fetchText(`${BASE}data/indicator_metadata.csv`),
  fetchJSON(`${BASE}assets/geo/countries-50m.json`),
]);

const cityRows = parseCSV(explorerCSV);
const metaRows = parseCSV(metadataCSV);
const defs = buildRegistry(metaRows, Object.keys(cityRows[0] || {}));

state.cities = new Map(cityRows.map((r) => [r.urban_system_id, r]));
state.registry = new Map(defs.map((d) => [d.id, d]));

// coordinates (presentation-layer lookup; see data/PROVENANCE.md)
const coordRows = parseCSV(await fetchText(`${BASE}data/city_coordinates.csv`));
state.coordinates = new Map(coordRows.map((r) => [r.urban_system_id, r]));

// country list with counts, sorted by name
{
  const m = new Map();
  for (const c of cityRows) {
    if (!m.has(c.country_code)) m.set(c.country_code, { code: c.country_code, name: c.country_name, n: 0 });
    m.get(c.country_code).n++;
  }
  state.countries = [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// shared population radius scale (bubble size = population, both views)
{
  const pops = cityRows.map((r) => +r.population_raw).filter(Number.isFinite);
  state.radiusScale = d3.scaleSqrt().domain(d3.extent(pops)).range([2.5, 13]);
}

/* ---------- static chrome ---------- */
document.getElementById("app").innerHTML = `
  <header class="explorer-bar">
    <div class="explorer-title">
      <h1>Quality-of-Life City Explorer</h1>
      <p class="sub"><span class="num">${cityRows.length}</span> European functional urban areas · OECD / Eurostat · <span class="num">v1</span> pipeline (frozen)</p>
    </div>
    <div class="explorer-controls">
      <label>X axis <select id="axis-x" class="field"></select></label>
      <label>Y axis <select id="axis-y" class="field"></select></label>
      <label>Country
        <div class="popover-anchor">
          <button type="button" id="country-btn" class="field" aria-haspopup="true" aria-expanded="false"></button>
          <div id="country-pop" class="popover" hidden></div>
        </div>
      </label>
      <label>Search city
        <div class="search-wrap">
          <input id="search" class="field" type="text" autocomplete="off" placeholder="City name…" aria-label="Search city" />
          <div id="search-suggest" class="search-suggest" hidden></div>
        </div>
      </label>
    </div>
  </header>
  <div class="chips-row" id="chips-row" aria-live="polite"><div class="chips-inner" id="chips"></div><div class="chips-meta num" id="sel-count"></div></div>
  <main class="viz-grid">
    <section class="viz-panel" aria-label="Scatterplot">
      <div class="viz-head"><h2>Which cities perform similarly?</h2><div class="viz-count" id="scatter-count"></div></div>
      <div class="viz-note" id="scatter-note"></div>
      <div class="viz-body" id="scatter-body"></div>
    </section>
    <section class="viz-panel" aria-label="Map">
      <div class="viz-head"><h2>Where are they?</h2><div class="viz-count" id="map-count"></div></div>
      <div class="viz-note">same cities · circle area = population · <span style="font-style:italic">dashed</span> = no value for a current axis (never zero)</div>
      <div class="viz-body" id="map-body"></div>
    </section>
  </main>
  <section class="compare-grid" aria-label="Three-city comparison">
    <div class="viz-panel" id="panel-radar">
      <div class="viz-head"><h2>City Comparison</h2><span class="tick-label">radar</span></div>
      <div class="viz-note">How do the selected cities compare across six percentile-based dimensions? Environment, Mobility and Economic Opportunity are <b>FUA composites</b>; Safety, Community and Life Satisfaction are <b>city-core survey</b> percentiles (2023 wave, ~80 of 391 cities). Polygons skip axes without data — hollow marker = no data, never zero.</div>
      <div class="radar-body" id="radar-body"></div>
      <div class="radar-legend" id="radar-legend"></div>
    </div>
    <div class="viz-panel" id="panel-table">
      <div class="viz-head"><h2>Dimension Scores</h2></div>
      <div class="viz-note">Percentile scores (0–100) · higher = better · shading highlights strong/weak cells · hover a cell for raw value, unit, year, source &amp; caveat</div>
      <div class="table-body" id="table-body"></div>
    </div>
    <div class="viz-panel" id="panel-summ">
      <div class="viz-head"><h2>City Summaries</h2></div>
      <div class="viz-note">Generated only from the selected cities' available percentile scores.</div>
      <div class="summ-body" id="summ-body"></div>
    </div>
  </section>
  <footer class="explorer-footer">
    <details class="howto">
      <summary>How to read this data</summary>
      <p class="note"><b>Reading the data.</b> Values are rendered as-is from the frozen v1 pipeline — raw values, percentile scores (0–100, higher = better outcome), observation years and staleness flags stay separate; indicators do <b>not</b> share one reference year (hover a city or a table cell for each value's year and geography: FUA vs city-core survey). Composite scores require all their components, so a missing component means no score — never zero. Map dots are positioned by a separate coordinate lookup (see <b>data/PROVENANCE.md</b>); every displayed value comes from the frozen CSVs.</p>
    </details>
    <p class="footer-line">Values are from the frozen v1 pipeline (OECD / Eurostat) · percentile scores 0–100, higher = better outcome · indicators use different reference years and geographies (FUA vs city-core survey)</p>
  </footer>
`;

/* ---------- controls ---------- */
const selX = document.getElementById("axis-x");
const selY = document.getElementById("axis-y");
for (const g of GROUPS) {
  const ogX = document.createElement("optgroup"); ogX.label = g;
  const ogY = document.createElement("optgroup"); ogY.label = g;
  for (const d of defs.filter((x) => x.group === g)) {
    ogX.append(new Option(d.label, d.id));
    ogY.append(new Option(d.label, d.id));
  }
  selX.append(ogX); selY.append(ogY);
}
selX.value = state.xId;
selY.value = state.yId;
selX.addEventListener("change", () => setAxes(selX.value, selY.value === selX.value ? state.xId : selY.value));
selY.addEventListener("change", () => setAxes(selX.value === selY.value ? state.yId : selX.value, selY.value));

// country filter popover
const countryBtn = document.getElementById("country-btn");
const countryPop = document.getElementById("country-pop");
function renderCountryButton() {
  countryBtn.textContent = state.countryFilter
    ? `${state.countryFilter.size} countr${state.countryFilter.size === 1 ? "y" : "ies"}`
    : "All countries";
}
function renderCountryPop() {
  const rows = state.countries.map((c) => `
    <button type="button" class="popover-row" data-cc="${c.code}" role="menuitemcheckbox" aria-checked="${state.countryFilter ? state.countryFilter.has(c.code) : false}">
      <span>${esc(c.name)}</span><span class="n num">${c.n}</span>
    </button>`).join("");
  countryPop.innerHTML = `
    <div class="popover-head"><span class="tick-label">Filter both views</span>
      <button type="button" class="linklike" id="country-all">All</button></div>${rows}`;
}
renderCountryButton();
renderCountryPop();
countryBtn.addEventListener("click", () => {
  countryPop.hidden = !countryPop.hidden;
  countryBtn.setAttribute("aria-expanded", String(!countryPop.hidden));
});
countryPop.addEventListener("click", (ev) => {
  const all = ev.target.closest("#country-all");
  if (all) { setCountryFilter(null); return; }
  const row = ev.target.closest(".popover-row");
  if (!row) return;
  const next = new Set(state.countryFilter || []);
  const cc = row.dataset.cc;
  if (next.has(cc)) next.delete(cc); else next.add(cc);
  setCountryFilter(next.size ? next : null);
});
document.addEventListener("click", (ev) => {
  if (!countryPop.hidden && !ev.target.closest(".popover-anchor")) {
    countryPop.hidden = true;
    countryBtn.setAttribute("aria-expanded", "false");
  }
});

// search with suggestions
const searchInput = document.getElementById("search");
const suggest = document.getElementById("search-suggest");
let suggestList = [];
let suggestIdx = -1;

function renderSuggestions() {
  if (!suggestList.length) { suggest.hidden = true; return; }
  suggest.innerHTML = suggestList.map((c, i) => `
    <button type="button" class="popover-row ${i === suggestIdx ? "active" : ""}" data-id="${c.urban_system_id}">
      <span>${esc(c.city)}</span><span class="cc">${esc(c.country_code)}</span><span class="n num">${(+c.population_raw).toLocaleString("en-US")}</span>
    </button>`).join("");
  suggest.hidden = false;
}
searchInput.addEventListener("input", () => {
  const q = norm(searchInput.value.trim());
  if (q.length < 2) { suggestList = []; renderSuggestions(); return; }
  suggestList = cityRows
    .filter((c) => norm(c.city).includes(q))
    .sort((a, b) => (norm(a.city).startsWith(q) ? 0 : 1) - (norm(b.city).startsWith(q) ? 0 : 1) || +b.population_raw - +a.population_raw)
    .slice(0, 8);
  suggestIdx = suggestList.length ? 0 : -1;
  renderSuggestions();
});
searchInput.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowDown") { suggestIdx = Math.min(suggestIdx + 1, suggestList.length - 1); renderSuggestions(); ev.preventDefault(); }
  else if (ev.key === "ArrowUp") { suggestIdx = Math.max(suggestIdx - 1, 0); renderSuggestions(); ev.preventDefault(); }
  else if (ev.key === "Enter") {
    const c = suggestList[suggestIdx];
    if (c) { pickSuggestion(c); }
  } else if (ev.key === "Escape") { suggestList = []; renderSuggestions(); }
});
suggest.addEventListener("click", (ev) => {
  const row = ev.target.closest(".popover-row");
  if (!row) return;
  const c = state.cities.get(row.dataset.id);
  if (c) pickSuggestion(c);
});
function pickSuggestion(c) {
  if (!state.selection.includes(c.urban_system_id)) toggleSelect(c.urban_system_id);
  mapView.panTo(c.urban_system_id);
  searchInput.value = "";
  suggestList = [];
  renderSuggestions();
  searchInput.blur();
}
document.addEventListener("click", (ev) => {
  if (!suggest.hidden && !ev.target.closest(".search-wrap")) { suggest.hidden = true; }
});

/* ---------- views ---------- */
const scatter = createScatter(document.getElementById("scatter-body"));
const mapView = createMap(document.getElementById("map-body"), world);

function selectionPacket() {
  const xDef = state.registry.get(state.xId);
  const yDef = state.registry.get(state.yId);
  const visible = cityRows.filter((c) => !isFilteredOut(c));
  const selectedSet = new Set(state.selection);
  const selectedSlot = new Map(state.selection.map((id, i) => [id, i]));
  const plotted = visible.filter((c) => hasValue(c, xDef.id) && hasValue(c, yDef.id))
    .map((city) => ({ id: city.urban_system_id, city }));
  const mappable = visible.filter((c) => state.coordinates.has(c.urban_system_id))
    .map((city) => ({ id: city.urban_system_id, city, hasX: hasValue(city, xDef.id), hasY: hasValue(city, yDef.id) }));
  return { xDef, yDef, plotted, mappable, selectedSet, selectedSlot, visible, citiesById: state.cities };
}

function renderChips() {
  const chips = document.getElementById("chips");
  if (!state.selection.length) {
    chips.innerHTML = `<span class="chips-hint">Click cities to pin up to <b class="num">${MAX_SELECTION}</b> — the selection persists and drives the comparison below. Search and <kbd>Enter</kbd> also selects.</span>`;
    return;
  }
  chips.innerHTML = state.selection.map((id, i) => {
    const c = state.cities.get(id);
    return `<span class="chip"><span class="chip-dot" style="background:${SELECTION_COLORS[i].css}"></span>${esc(c.city)} <span class="chip-cc">${esc(c.country_code)}</span><button type="button" data-unselect="${id}" aria-label="Remove ${esc(c.city)}">✕</button></span>`;
  }).join("") + `<button type="button" class="chips-clear" id="chips-clear">Clear</button>`;
}

function renderSelCount() {
  const n = state.selection.length;
  document.getElementById("sel-count").innerHTML =
    `${n} of ${MAX_SELECTION} cities selected`;
}
document.getElementById("chips").addEventListener("click", (ev) => {
  const un = ev.target.closest("[data-unselect]");
  if (un) { toggleSelect(un.dataset.unselect); return; }
  if (ev.target.closest("#chips-clear")) clearSelection();
});

function renderCountsAndNotes(p) {
  document.getElementById("scatter-count").innerHTML =
    `<span class="num">${p.plotted.length}</span> of <span class="num">${p.visible.length}</span> cities plotted`;
  const missing = p.visible.filter((c) => !hasValue(c, p.xDef.id) || !hasValue(c, p.yDef.id));
  document.getElementById("scatter-note").innerHTML = missing.length
    ? `<b>${missing.length}</b> cities not drawn — no value for ${esc(p.xDef.label)} or ${esc(p.yDef.label)} (shown as gaps, never zero). <details><summary>list</summary><span class="missing-list">${missing.map((c) => esc(c.city)).join(" · ")}</span></details>`
    : `all cities plotted`;
  document.getElementById("map-count").innerHTML =
    `<span class="num">${p.mappable.length}</span> cities plotted`;
}

function updateAll() {
  const p = selectionPacket();
  scatter.update({ xDef: p.xDef, yDef: p.yDef, plotted: p.plotted, selectedSet: p.selectedSet, selectedSlot: p.selectedSlot }, state.radiusScale);
  mapView.update(p, state.radiusScale);
  compare.update(state.selection);
  renderChips();
  renderSelCount();
  renderCountsAndNotes(p);
  renderCountryButton();
  renderCountryPop();
}

subscribe(updateAll);

// resize
const ro = new ResizeObserver(debounce(() => updateAll(), 120));
ro.observe(document.getElementById("scatter-body"));
ro.observe(document.getElementById("map-body"));
ro.observe(document.getElementById("radar-body"));

/* ---------- three-city comparison section ---------- */
const compare = createCompare(
  document.getElementById("radar-body"),
  document.getElementById("table-body"),
  document.getElementById("summ-body")
);

updateAll();
