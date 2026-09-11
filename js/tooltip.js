/* Single shared tooltip overlay (hover + keyboard focus).
 * Content is composed from the frozen row + registry metadata only. */

import { esc, fmtNum, fmtInt, has } from "./lib/util.js";
import { state, hasValue } from "./state.js";
import { POPULATION } from "./registry.js";

let el = null;
let pinned = false;

function ensureEl() {
  if (!el) {
    el = document.createElement("div");
    el.className = "provenance-tip city-tip";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  return el;
}

function row(label, valueHTML) {
  return `<tr><td class="k">${label}</td><td class="v">${valueHTML}</td></tr>`;
}

function valueHTML(city, varDef) {
  const raw = city[varDef.valueCol];
  if (!has(raw)) {
    return `<span class="badge nodata">no data</span>`;
  }
  const digits = varDef.isScore ? 1 : 1;
  const v = fmtNum(raw, digits);
  const unit = varDef.isScore ? "" : ` <span class="score-line">${esc(varDef.unit)}</span>`;
  const score = varDef.scoreCol && has(city[varDef.scoreCol])
    ? `<div class="score-line">percentile score <b class="num">${fmtNum(city[varDef.scoreCol], 1)}</b> / 100</div>`
    : (varDef.isScore ? `<div class="score-line">percentile score / 100</div>` : "");
  const year = (varDef.yearCols || []).filter((c) => has(city[c]))
    .map((c) => String(city[c]).trim()).join(" · "); // years are identifiers — never thousands-formatted
  const yearTxt = year ? `<div class="score-line">obs. year <b class="num">${esc(year)}</b></div>` : "";
  const stale = varDef.stalenessCol && city[varDef.stalenessCol]
    ? `<span class="badge stale">${esc(city[varDef.stalenessCol]).replace(/_/g, " ")}</span>`
    : "";
  return `<span class="val num">${v}</span>${unit}${stale}${score}${yearTxt}`;
}

export function tipHTML(city) {
  const x = state.registry.get(state.xId);
  const y = state.registry.get(state.yId);
  const pop = has(city.population_raw)
    ? `${fmtInt(city.population_raw)} <span class="score-line">${esc(POPULATION.raw_unit)}</span>${has(city.population_year) ? ` <span class="score-line">· obs. ${fmtInt(city.population_year)}</span>` : ""}`
    : `<span class="badge nodata">no data</span>`;

  const coords = state.coordinates.get(city.urban_system_id);
  const coordLine = coords
    ? `<div class="score-line" style="margin-top:6px">geography: FUA centroid ≈ ${esc(coords.geonames_name)} <span class="score-line">(presentation lookup — see PROVENANCE.md)</span></div>`
    : "";

  const caveats = [];
  for (const v of [x, y]) {
    if (v && v.caveat && !caveats.some((c) => c.id === v.id)) caveats.push(v);
  }

  return `
    <div class="tip-head"><div>
      <div class="tip-city">${esc(city.city)}</div>
      <div class="tip-cc">${esc(city.country_name)} · ${esc(city.country_code)} · ${esc(city.urban_system_id)}</div>
    </div></div>
    <table>
      ${row(`X — ${esc(x.label)} <span class="badge">${esc(x.geoLevel)}</span>`, valueHTML(city, x))}
      ${row(`Y — ${esc(y.label)} <span class="badge">${esc(y.geoLevel)}</span>`, valueHTML(city, y))}
      ${row("Population (context)", pop)}
    </table>
    ${coordLine}
    ${caveats.map((v) => `<div class="caveat"><b>${esc(v.label)}:</b> ${esc(v.caveat)}</div>`).join("")}
  `;
}

export function showTip(city, clientX, clientY) {
  const node = ensureEl();
  node.innerHTML = tipHTML(city);
  positionAt(node, clientX, clientY);
}

function positionAt(node, clientX, clientY) {
  node.style.display = "block";
  const pad = 14;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  let left = clientX + pad;
  let top = clientY + pad;
  if (left + w > window.innerWidth - 8) left = clientX - w - pad;
  if (top + h > window.innerHeight - 8) top = clientY - h - pad;
  node.style.left = `${Math.max(8, left)}px`;
  node.style.top = `${Math.max(8, top)}px`;
}

export function moveTip(clientX, clientY) {
  if (!el || el.style.display === "none") return;
  positionAt(el, clientX, clientY);
}

/* generic variant for comparison cells (pre-composed HTML) */
export function showHTMLTip(html, clientX, clientY) {
  const node = ensureEl();
  node.innerHTML = html;
  positionAt(node, clientX, clientY);
}

export function hideTip(force = false) {
  if (!el) return;
  if (pinned && !force) return;
  el.style.display = "none";
}

export function setPinned(v) {
  pinned = v;
  if (!v) hideTip(true);
}
