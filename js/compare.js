/* Three-city comparison section: radar, dimension-score table, city summaries.
 *
 * Data rules (frozen V1):
 * - Only percentile scores already present in city_explorer.csv are used.
 * - Missing values are never drawn as zero: radar polygons skip axes without
 *   data (a hollow marker marks the gap), table cells show a "no data" badge.
 * - Every number carries its observation year in secondary detail; geography
 *   scope (FUA composite vs city-core survey) is always labelled.
 */

import { esc, fmtNum, has } from "./lib/util.js";
import { state, SELECTION_COLORS } from "./state.js";
import { showHTMLTip, moveTip, hideTip } from "./tooltip.js";

/* Radar dimensions (fixed by the comparison brief); registry IDs are the
 * metadata indicator IDs — values are read via each def's valueCol. */
const DIMS = [
  "environment_score",
  "mobility_score",
  "economic_opportunity_score",
  "perceived_safety",
  "community",
  "life_satisfaction",
];

/* explorer column of a dimension's percentile score (registry-mediated) */
const val = (city, dimId) => {
  const def = state.registry.get(dimId);
  return def ? city[def.valueCol] : undefined;
};

/* component indicators behind each composite (for cell tooltips) */
const COMPONENTS = {
  environment_score: ["pm25", "green_area"],
  mobility_score: ["public_transport_access"],
  economic_opportunity_score: ["employment_rate", "unemployment_rate"],
};

const SHORT = {
  environment_score: "Environment",
  mobility_score: "Mobility",
  economic_opportunity_score: "Economic Opportunity",
  perceived_safety: "Perceived Safety",
  community: "Community & Trust",
  life_satisfaction: "Life Satisfaction",
};

const FLOW = {
  environment_score: "environment",
  mobility_score: "mobility",
  economic_opportunity_score: "economic opportunity",
  perceived_safety: "perceived safety",
  community: "community",
  life_satisfaction: "life satisfaction",
};

const geoTag = (def) => /fua/i.test(def.geoLevel) ? "FUA" : "City core";

export function createCompare(radarEl, tableEl, summEl) {
  let W = 0, H = 0;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  radarEl.appendChild(svg);
  const gRings = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const gAxes = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const gPolys = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const gMarks = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const gLabels = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.append(gRings, gAxes, gPolys, gMarks, gLabels);

  const pt = (i, frac, R, cx, cy) => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return [cx + R * frac * Math.cos(a), cy + R * frac * Math.sin(a)];
  };

  function renderStatic(R, cx, cy, narrow = false) {
    // rings + spokes + labels (static per size)
    gRings.replaceChildren();
    gAxes.replaceChildren();
    gLabels.replaceChildren();
    for (const lv of [25, 50, 75, 100]) {
      const pts = DIMS.map((_, i) => pt(i, lv / 100, R, cx, cy).map((v) => v.toFixed(1)).join(",")).join(" ");
      d3.select(gRings).append("polygon")
        .attr("points", pts)
        .attr("class", "radar-ring");
    }
    for (let i = 0; i < DIMS.length; i++) {
      const [x, y] = pt(i, 1, R, cx, cy);
      d3.select(gAxes).append("line")
        .attr("x1", cx).attr("y1", cy).attr("x2", x).attr("y2", y)
        .attr("class", "radar-spoke");
      const [lx, ly] = pt(i, 1, R + (narrow ? 10 : 14), cx, cy);
      const def = state.registry.get(DIMS[i]);
      const anchor = Math.abs(Math.cos(((-90 + i * 60) * Math.PI) / 180)) < 0.35 ? "middle" : (Math.cos(((-90 + i * 60) * Math.PI) / 180) > 0 ? "start" : "end");
      const t = d3.select(gLabels).append("text")
        .attr("class", "radar-label")
        .attr("x", lx).attr("y", ly)
        .attr("text-anchor", anchor);
      // narrow widths: wrap multi-word axis names onto a second line so the
      // longest labels stay inside the viewBox; desktop keeps single lines
      const words = SHORT[DIMS[i]].split(" ");
      const nameLines = narrow && words.length > 1 ? [words[0], words.slice(1).join(" ")] : [SHORT[DIMS[i]]];
      const dy0 = Math.sin(((-90 + i * 60) * Math.PI) / 180) < -0.3 ? "-0.3em" : "0.3em";
      nameLines.forEach((line, li) => {
        t.append("tspan").attr("x", lx).attr("dy", li === 0 ? dy0 : "1.05em").text(line);
      });
      t.append("tspan").attr("x", lx).attr("dy", "1.05em").attr("class", "radar-geo").text(geoTag(def));
    }
    // ring value labels along the top spoke
    for (const lv of [50, 100]) {
      const [x, y] = pt(0, lv / 100, R, cx, cy);
      d3.select(gLabels).append("text")
        .attr("class", "radar-ringlabel num")
        .attr("x", x + 4).attr("y", y + 3)
        .text(lv);
    }
  }

  function radar(selection) {
    const r = radarEl.getBoundingClientRect();
    W = Math.max(280, r.width); H = Math.max(280, r.height);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    // phone widths: bigger label reserve + tighter offset so wrapped axis
    // labels stay inside the viewBox (desktop/tablet keep the 52px reserve)
    const narrow = W < 520;
    const R = Math.min(W, H) / 2 - (narrow ? 76 : 52);
    const cx = W / 2, cy = H / 2 + 4;
    renderStatic(R, cx, cy, narrow);

    gPolys.replaceChildren();
    gMarks.replaceChildren();

    for (const id of selection) {
      const city = state.cities.get(id);
      const slot = selection.indexOf(id);
      const avail = [], missing = [];
      DIMS.forEach((dim, i) => {
        (has(val(city, dim)) ? avail : missing).push([dim, i]);
      });
      if (avail.length >= 2) {
        const pts = avail.map(([, i]) => pt(i, +val(city, DIMS[i]) / 100, R, cx, cy).map((v) => v.toFixed(1)).join(",")).join(" ");
        d3.select(gPolys).append("polygon")
          .attr("points", pts)
          .attr("class", `radar-poly sel-${slot}`)
          .attr("data-id", id)
          .on("pointerenter", function (event) { showHTMLTip(cityTipHTML(city, selection), event.clientX, event.clientY); d3.select(this).raise(); })
          .on("pointermove", function (event) { moveTip(event.clientX, event.clientY); })
          .on("pointerleave", () => hideTip());
        for (const [dim, i] of avail) {
          const [x, y] = pt(i, +val(city, dim) / 100, R, cx, cy);
          d3.select(gPolys).append("circle")
            .attr("cx", x).attr("cy", y).attr("r", 2.6)
            .attr("class", `radar-vertex sel-${slot}`)
            .on("pointerenter", function (event) { showHTMLTip(dimTipHTML(id, dim), event.clientX, event.clientY); })
            .on("pointermove", function (event) { moveTip(event.clientX, event.clientY); })
            .on("pointerleave", () => hideTip());
        }
      }
      for (const [dim, i] of missing) {
        const [x, y] = pt(i, 0.97, R, cx, cy);
        d3.select(gMarks).append("circle")
          .attr("cx", x).attr("cy", y).attr("r", 3.2)
          .attr("class", "radar-missing")
          .on("pointerenter", function (event) {
            showHTMLTip(`<div class="tip-head"><div><div class="tip-city">${esc(city.city)} — ${esc(SHORT[dim])}</div><div class="tip-cc">no data</div></div></div><p class="caveat">No percentile score in the frozen export for this city${/city/i.test(geoTag(state.registry.get(dim))) ? " (city-core survey covers ~80 of 391 cities, 2023 wave)" : ""}. The polygon skips this axis — it is not drawn to zero.</p>`, event.clientX, event.clientY);
          })
          .on("pointerleave", () => hideTip());
      }
    }
  }

  function cityTipHTML(city, selection) {
    return `<div class="tip-head"><div><div class="tip-city">${esc(city.city)}</div><div class="tip-cc">${esc(city.country_name)} · ${esc(city.country_code)} · ${esc(city.urban_system_id)}</div></div></div>
    <table>${DIMS.map((d) => {
      const v = has(val(city, d)) ? `<b class="num">${fmtNum(val(city, d), 1)}</b>` : `<span class="badge nodata">no data</span>`;
      return `<tr><td class="k">${esc(SHORT[d])} <span class="badge">${esc(geoTag(state.registry.get(d)))}</span></td><td class="v">${v}</td></tr>`;
    }).join("")}</table>`;
  }

  function dimTipHTML(cityId, dim) {
    const city = state.cities.get(cityId);
    const def = state.registry.get(dim);
    const rows = [];
    const comps = COMPONENTS[dim];
    if (comps) {
      for (const cid of comps) {
        const c = state.registry.get(cid);
        const raw = has(city[c.valueCol]) ? `${fmtNum(city[c.valueCol], 1)} ${esc(c.unit)}` : `<span class="badge nodata">no data</span>`;
        const score = has(city[c.scoreCol]) ? `<b class="num">${fmtNum(city[c.scoreCol], 1)}</b> / 100` : `<span class="badge nodata">no data</span>`;
        const year = (c.yearCols || []).filter((k) => has(city[k])).map((k) => String(city[k])).join(" · ");
        rows.push(`<tr><td class="k">${esc(c.label)}</td><td class="v"><span class="val">${raw}</span>${year ? ` <span class="score-line">obs. ${esc(year)}</span>` : ""}<div class="score-line">component percentile ${score}</div></td></tr>`);
      }
    } else if (def.scoreCol && has(city[def.valueCol])) {
      rows.push(`<tr><td class="k">Raw value</td><td class="v"><span class="val num">${fmtNum(city[def.valueCol], 1)}</span> <span class="score-line">${esc(def.unit)}</span></td></tr>`);
    } else if (!def.scoreCol) {
      rows.push(`<tr><td class="k">Raw survey share</td><td class="v"><span class="score-line">not in the explorer export (see city_comparison_long.csv)</span></td></tr>`);
    }
    const years = (def.yearCols || []).filter((k) => has(city[k])).map((k) => String(city[k]));
    const score = has(city[dim]) ? `<b class="num">${fmtNum(city[dim], 1)}</b> / 100` : `<span class="badge nodata">no data</span>`;
    return `<div class="tip-head"><div><div class="tip-city">${esc(city.city)} — ${esc(def.label)}</div><div class="tip-cc">${esc(geoTag(def))} · percentile score (0–100, higher = better)</div></div></div>
    <table><tr><td class="k">Percentile score</td><td class="v">${score}</td></tr>${rows.join("")}${years.length ? `<tr><td class="k">Observation year${years.length > 1 ? "s" : ""}</td><td class="v num">${esc(years.join(" · "))}</td></tr>` : ""}</table>
    <div class="caveat"><b>Source:</b> ${esc(def.source)}${def.caveat ? `. ${esc(def.caveat)}` : ""}</div>`;
  }

  function table(selection) {
    if (!selection.length) {
      tableEl.innerHTML = `<p class="compare-empty">Select up to 3 cities to compare their dimension scores.</p>`;
      return;
    }
    const head = `<tr><th class="dim-h">Dimension</th>${selection.map((id, i) => {
      const c = state.cities.get(id);
      return `<th class="city-h"><span class="city-dot sel-${i}"></span>${esc(c.city)}</th>`;
    }).join("")}<th class="geo-h">Geo</th></tr>`;
    const body = DIMS.map((dim) => {
      const def = state.registry.get(dim);
      const cells = selection.map((id, i) => {
        const city = state.cities.get(id);
        if (!has(val(city, dim))) return `<td class="score-cell"><span class="badge nodata">no data</span></td>`;
        const v = +val(city, dim);
        const mix = v >= 50
          ? `color-mix(in oklab, var(--teal) ${Math.min(36, Math.round((v - 50) * 0.72))}%, transparent)`
          : `color-mix(in oklab, var(--coral) ${Math.min(36, Math.round((50 - v) * 0.72))}%, transparent)`;
        const years = [...new Set((def.yearCols || []).filter((k) => has(city[k])).map((k) => String(city[k])))];
        return `<td class="score-cell sel-outline-${i}" style="background:${mix}" data-city="${esc(id)}" data-dim="${dim}"><span class="score num">${fmtNum(v, 0)}</span>${years.length ? `<small class="cell-year num">${esc(years.join("·"))}</small>` : ""}</td>`;
      }).join("");
      return `<tr><td class="dim-name">${esc(SHORT[dim])}</td>${cells}<td class="geo-cell"><span class="badge">${esc(geoTag(def))}</span></td></tr>`;
    }).join("");
    tableEl.innerHTML = `<table class="cmp-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;

    tableEl.querySelectorAll(".score-cell[data-city]").forEach((td) => {
      td.addEventListener("pointerenter", (ev) => showHTMLTip(dimTipHTML(td.dataset.city, td.dataset.dim), ev.clientX, ev.clientY));
      td.addEventListener("pointermove", (ev) => moveTip(ev.clientX, ev.clientY));
      td.addEventListener("pointerleave", () => hideTip());
    });
  }

  function summaries(selection) {
    if (!selection.length) {
      summEl.innerHTML = `<p class="compare-empty">Select up to 3 cities to see short, data-grounded summaries.</p>`;
      return;
    }
    summEl.innerHTML = selection.map((id, i) => {
      const city = state.cities.get(id);
      const entries = DIMS.filter((d) => has(val(city, d))).map((d) => ({ id: d, v: +val(city, d) }));
      const strong = entries.filter((e) => e.v >= 67).sort((a, b) => b.v - a.v);
      const weak = entries.filter((e) => e.v <= 33).sort((a, b) => a.v - b.v);
      const mid = entries.length - strong.length - weak.length;
      const parts = [];
      if (strong.length) parts.push(`Strong ${strong.map((e) => FLOW[e.id]).join(" and ")}`);
      if (weak.length) parts.push(`${parts.length ? "weaker" : "Weak"} ${weak.map((e) => FLOW[e.id]).join(" and ")}`);
      if (!parts.length) parts.push("Mid-range across available dimensions");
      const best = entries.slice().sort((a, b) => b.v - a.v)[0];
      const worst = entries.slice().sort((a, b) => a.v - b.v)[0];
      const tags = [
        ...strong.slice(0, 2).map((e) => `<span class="tag tag-teal">Strong ${esc(SHORT[e.id])}</span>`),
        ...weak.slice(0, 2).map((e) => `<span class="tag tag-coral">Weaker ${esc(SHORT[e.id])}</span>`),
      ];
      if (entries.length < DIMS.length) tags.push(`<span class="tag tag-neutral">${entries.length} of ${DIMS.length} dims available</span>`);
      return `<div class="sum-card">
        <span class="sum-bar sel-bg-${i}"></span>
        <div class="sum-main">
          <div class="sum-name">${esc(city.city)} <span class="sum-cc num">${esc(city.country_code)}</span></div>
          <p class="sum-text">${esc(parts.join("; "))}.${best && worst && best.id !== worst.id ? ` Highest: ${esc(SHORT[best.id])} <b class="num">${fmtNum(best.v, 0)}</b> · lowest: ${esc(SHORT[worst.id])} <b class="num">${fmtNum(worst.v, 0)}</b>.` : ""}</p>
          <div class="sum-tags">${tags.join("")}</div>
        </div>
      </div>`;
    }).join("") + `<p class="viz-note" style="margin-top:10px">Bands: ≥67 strong · ≤33 weak (display convention on percentile scores 0–100; higher = better outcome). Percentile pools are per indicator, not the 391-city subset.</p>`;
  }

  function legend(selection) {
    const el = document.getElementById("radar-legend");
    if (!el) return;
    el.innerHTML = selection.length
      ? selection.map((id, i) => {
        const c = state.cities.get(id);
        return `<span class="legend-item"><span class="city-dot sel-${i}"></span>${esc(c.city)}</span>`;
      }).join("")
      : `<span class="chips-hint">no cities selected</span>`;
  }

  function update(selection) {
    radar(selection);
    table(selection);
    summaries(selection);
    legend(selection);
  }

  return { update };
}
