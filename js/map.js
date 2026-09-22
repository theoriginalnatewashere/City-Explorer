/* European city map (SVG via d3 + topojson).
 * Same population radius scale, same selection treatment as the scatter.
 * Zoom/pan; selecting a city from search pans here. */

import { showTip, moveTip, hideTip } from "./tooltip.js";
import { toggleSelect, state } from "./state.js";

const T = 450;

// Continental-Europe frame. Overseas FUAs in the frozen data (Fort-de-France,
// Martinique) sit outside this frame — the map pans to any selected city.
// Ring is CLOCKWISE: d3's spherical winding convention (CCW would mean the
// whole sphere minus this rectangle -> degenerate fit).
const FRAME_BBOX = { type: "Polygon", coordinates: [[[-25, 33], [-25, 72], [45, 72], [45, 33], [-25, 33]]] };

export function createMap(container, world) {
  const root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  container.appendChild(root);

  const gRoot = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const gCountries = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const gDots = document.createElementNS("http://www.w3.org/2000/svg", "g");
  gRoot.append(gCountries, gDots);
  root.appendChild(gRoot);

  const features = topojson.feature(world, world.objects.countries).features;
  const zoom = d3.zoom().scaleExtent([1, 12]).on("zoom", (event) => {
    gRoot.setAttribute("transform", event.transform);
    const k = event.transform.k;
    d3.select(gDots).selectAll("circle.dot").attr("r", (d) => (d.__r / k) || 3);
    d3.select(gDots).selectAll("text.dot-label").attr("transform", (d) => `translate(${d.__x},${d.__y}) scale(${1 / k}) translate(0,-8)`);
  });
  d3.select(root).call(zoom).on("dblclick.zoom", null);

  // zoom buttons
  const zc = document.createElement("div");
  zc.className = "map-zoom";
  zc.innerHTML = `<button type="button" aria-label="Zoom in" data-z="1">+</button><button type="button" aria-label="Zoom out" data-z="-1">−</button><button type="button" aria-label="Reset view" data-z="0">⤾</button>`;
  container.appendChild(zc);
  zc.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.z === "0") { d3.select(root).transition().duration(T).call(zoom.transform, d3.zoomIdentity); return; }
    d3.select(root).transition().duration(200).call(zoom.scaleBy, b.dataset.z === "1" ? 1.6 : 1 / 1.6);
  });

  let W = 0, H = 0;
  const projection = d3.geoConicConformal().parallels([43, 62]).rotate([-10, 0]);
  const path = d3.geoPath(projection);

  function size() {
    const r = container.getBoundingClientRect();
    W = Math.max(320, r.width); H = Math.max(320, r.height);
    root.setAttribute("viewBox", `0 0 ${W} ${H}`);
    projection.fitExtent([[6, 6], [W - 6, H - 6]], FRAME_BBOX);
    d3.select(gCountries).selectAll("path").attr("d", path);
  }

  size();

  d3.select(gCountries).selectAll("path")
    .data(features)
    .join("path")
    .attr("class", "map-country")
    .attr("d", path);

  function project(cityId) {
    const c = state.coordinates.get(cityId);
    if (!c) return null;
    return projection([+c.lon, +c.lat]);
  }

  function update(sel, rScale) {
    size(); // refit projection + viewBox to the current container before re-projecting dots (same pattern as scatter)
    const dots = d3.select(gDots).selectAll("circle.dot").data(sel.mappable, (d) => d.id);
    dots.join(
      (enter) => enter.append("circle").attr("class", "dot").attr("r", 0)
        .on("pointerenter", function (event, d) { showTip(d.city, event.clientX, event.clientY); d3.select(this).raise(); })
        .on("pointermove", function (event) { moveTip(event.clientX, event.clientY); })
        .on("pointerleave", () => hideTip())
        .on("click", function (event, d) { event.stopPropagation(); toggleSelect(d.id); }),
      (upd) => upd,
      (exit) => exit.transition().duration(200).attr("r", 0).remove()
    )
      .attr("data-id", (d) => d.id)
      .attr("aria-hidden", "true")
      .attr("class", (d) => {
        const s = sel.selectedSlot ? sel.selectedSlot.get(d.id) : -1;
        return "dot" + ((!d.hasX || !d.hasY) ? " missing" : "") + (s >= 0 ? " selected sel-" + s : "");
      })
      .each(function (d) {
        const p = project(d.id) || [0, 0];
        d.__x = p[0]; d.__y = p[1]; d.__r = rScale(+d.city.population_raw) || 3;
      })
      .transition().duration(T)
      .attr("cx", (d) => d.__x)
      .attr("cy", (d) => d.__y)
      .attr("r", (d) => d.__r);

    const labels = d3.select(gDots).selectAll("text.dot-label")
      .data(sel.mappable.filter((d) => sel.selectedSet.has(d.id)), (d) => d.id);
    labels.join(
      (enter) => enter.append("text").attr("class", "dot-label"),
      (upd) => upd,
      (exit) => exit.remove()
    )
      .attr("text-anchor", "middle")
      .text((d) => d.city.city)
      .attr("transform", (d) => `translate(${d.__x},${d.__y}) scale(1) translate(0,-8)`);
  }

  function panTo(cityId) {
    const p = project(cityId);
    if (!p) return false;
    const k = Math.max(1, d3.zoomTransform(root).k || 1);
    const target = d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-p[0], -p[1]);
    d3.select(root).transition().duration(600).call(zoom.transform, target);
    return true;
  }

  return { update, panTo, rescale: size };
}
