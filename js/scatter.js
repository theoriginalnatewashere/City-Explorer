/* Interactive city scatterplot (SVG via d3).
 * One circle per plotted city; bubble area ∝ population (frozen context field).
 * Cities missing a value for the current X or Y are NOT drawn as zero — they
 * are reported to the caller so the panel can state the gap explicitly. */

import { showTip, moveTip, hideTip } from "./tooltip.js";
import { toggleSelect } from "./state.js";

const M = { top: 26, right: 18, bottom: 40, left: 52 };
const T = 450; // transition ms

export function createScatter(container) {
  const root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  root.setAttribute("class", "chart-svg");
  container.appendChild(root);
  const gGrid = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const gAxis = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const gDots = document.createElementNS("http://www.w3.org/2000/svg", "g");
  root.append(gGrid, gAxis, gDots);

  let W = 0, H = 0;
  const x = d3.scaleLinear();
  const y = d3.scaleLinear();

  function size() {
    const r = container.getBoundingClientRect();
    W = Math.max(320, r.width);
    H = Math.max(320, r.height);
    root.setAttribute("viewBox", `0 0 ${W} ${H}`);
  }

  function axisTitle(def, pos) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("class", pos === "y" ? "axis-title" : "axis-title");
    t.textContent = def.label;
    const u = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    u.setAttribute("class", "axis-unit");
    u.textContent = "  " + (def.isScore ? "percentile score (0–100)" : def.unit);
    t.appendChild(u);
    if (pos === "y") {
      t.setAttribute("x", M.left - 40);
      t.setAttribute("y", 14);
      t.setAttribute("text-anchor", "start");
    } else {
      t.setAttribute("x", W - M.right);
      t.setAttribute("y", H - 6);
      t.setAttribute("text-anchor", "end");
    }
    return t;
  }

  function renderAxes(xDef, yDef) {
    gAxis.replaceChildren();
    const gx = d3.select(gAxis).append("g")
      .attr("transform", `translate(0,${H - M.bottom})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(-4));
    const gy = d3.select(gAxis).append("g")
      .attr("transform", `translate(${M.left},0)`)
      .call(d3.axisLeft(y).ticks(6).tickSize(-4));
    d3.select(gAxis).selectAll("text").attr("class", "svg-tick");
    d3.select(gAxis).selectAll("line").attr("stroke", "var(--rule-soft)");
    d3.select(gAxis).selectAll("path.domain").attr("stroke", "var(--rule)");

    // hairline grid at ticks
    const grid = d3.select(gGrid).selectAll("line.gridline")
      .data([...gx.selectAll(".tick").data().map((v) => ["x", v]), ...gy.selectAll(".tick").data().map((v) => ["y", v])]);
    grid.join("line")
      .attr("class", "gridline")
      .attr("x1", (d) => (d[0] === "x" ? x(d[1]) : M.left))
      .attr("x2", (d) => (d[0] === "x" ? x(d[1]) : W - M.right))
      .attr("y1", (d) => (d[0] === "y" ? y(d[1]) : H - M.bottom))
      .attr("y2", (d) => (d[0] === "y" ? y(d[1]) : M.top))
      .attr("stroke", "var(--rule-soft)")
      .attr("stroke-width", 1);

    d3.select(gAxis).append(() => axisTitle(yDef, "y"));
    d3.select(gAxis).append(() => axisTitle(xDef, "x"));
  }

  function update(sel, rScale) {
    size();
    const xDef = sel.xDef, yDef = sel.yDef;
    const plotted = sel.plotted;       // [{city, id}] with both values
    const citiesById = sel.citiesById;

    const xt = plotted.map((c) => +c.city[xDef.valueCol]);
    const yt = plotted.map((c) => +c.city[yDef.valueCol]);
    if (!xt.length) { x.domain([0, 1]); y.domain([0, 1]); }
    else {
      const [x0, x1] = d3.extent(xt); const [y0, y1] = d3.extent(yt);
      x.domain([x0 - (x1 - x0) * 0.05, x1 + (x1 - x0) * 0.05]).nice();
      y.domain([y0 - (y1 - y0) * 0.05, y1 + (y1 - y0) * 0.05]).nice();
    }
    x.range([M.left, W - M.right]);
    y.range([H - M.bottom, M.top]);

    renderAxes(xDef, yDef);

    const t = d3.transition().duration(T).ease(d3.easeCubicOut);
    const dots = d3.select(gDots).selectAll("circle.dot").data(plotted, (d) => d.id);

    dots.join(
      (enter) => {
        const c = enter.append("circle")
          .attr("class", "dot")
          .attr("tabindex", 0)
          .attr("cx", (d) => x(+d.city[xDef.valueCol]))
          .attr("cy", (d) => y(+d.city[yDef.valueCol]))
          .attr("r", 0);
        return c;
      },
      (upd) => upd,
      (exit) => exit.transition(t).attr("r", 0).attr("fill-opacity", 0).remove()
    )
      .attr("data-id", (d) => d.id)
      .attr("aria-label", (d) => dotLabel(d, xDef, yDef))
      .attr("class", (d) => {
        const s = sel.selectedSlot ? sel.selectedSlot.get(d.id) : -1;
        return "dot" + (s >= 0 ? " selected sel-" + s : "");
      })
      .classed("missing", false)
      .on("pointerenter", function (event, d) {
        showTip(d.city, event.clientX, event.clientY);
        d3.select(this).raise();
      })
      .on("pointermove", function (event) {
        moveTip(event.clientX, event.clientY);
      })
      .on("pointerleave", () => hideTip())
      .on("click", function (event, d) {
        event.stopPropagation();
        toggleSelect(d.id);
      })
      .on("keydown", function (event, d) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleSelect(d.id);
        }
      })
      .transition(t)
      .attr("cx", (d) => x(+d.city[xDef.valueCol]))
      .attr("cy", (d) => y(+d.city[yDef.valueCol]))
      .attr("r", (d) => rScale(+d.city.population_raw) || 3);

    // selection labels
    const labels = d3.select(gDots).selectAll("text.dot-label")
      .data(plotted.filter((d) => sel.selectedSet.has(d.id)), (d) => d.id);
    labels.join(
      (enter) => enter.append("text").attr("class", "dot-label").attr("dy", -8),
      (upd) => upd,
      (exit) => exit.remove()
    )
      .attr("x", (d) => x(+d.city[xDef.valueCol]))
      .attr("y", (d) => y(+d.city[yDef.valueCol]))
      .attr("text-anchor", "middle")
      .text((d) => d.city.city);
  }

  return { update };
}

function dotLabel(d, xDef, yDef) {
  const c = d.city;
  const xv = c[xDef.valueCol] === "" ? "no data" : (+c[xDef.valueCol]).toLocaleString("en-US", { maximumFractionDigits: 1 });
  const yv = c[yDef.valueCol] === "" ? "no data" : (+c[yDef.valueCol]).toLocaleString("en-US", { maximumFractionDigits: 1 });
  return `${c.city}, ${c.country_name}. ${xDef.label}: ${xv}. ${yDef.label}: ${yv}. Click to toggle selection.`;
}
