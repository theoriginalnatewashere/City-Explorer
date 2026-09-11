/* Central state for the Explore view + tiny pub/sub.
 * Single source of truth so the scatter and the map stay linked. */

import { has } from "./lib/util.js";

export const MAX_SELECTION = 3;

/* persistent per-slot city colors (slot = position in the selection):
   1st selected → coral, 2nd → teal, 3rd → slate. Used by chips, scatter,
   map, radar, table and summaries so a city reads as one color everywhere. */
export const SELECTION_COLORS = [
  { token: "coral", css: "var(--coral)" },
  { token: "teal", css: "var(--teal)" },
  { token: "slate", css: "var(--slate)" },
];

const listeners = new Set();

export const state = {
  xId: "environment_score",
  yId: "mobility_score",
  selection: [],            // array of urban_system_id, newest last, max 3
  countryFilter: null,      // null = all countries, else Set of country_code
  // raw rows keyed by id (filled by main.js)
  cities: new Map(),
  coordinates: new Map(),
  registry: new Map(),      // variable id -> definition (metadata-driven)
  countries: [],            // [{code, name, n}] sorted by name
};

export function subscribe(fn) { listeners.add(fn); }

export function notify(reason) {
  for (const fn of listeners) fn(reason);
}

export function toggleSelect(id) {
  const i = state.selection.indexOf(id);
  if (i >= 0) state.selection.splice(i, 1);
  else {
    state.selection.push(id);
    if (state.selection.length > MAX_SELECTION) state.selection.shift(); // FIFO replace
  }
  notify("selection");
}

export function clearSelection() {
  if (state.selection.length) { state.selection = []; notify("selection"); }
}

export function isFilteredOut(city) {
  return state.countryFilter ? !state.countryFilter.has(city.country_code) : false;
}

/* does the city carry a usable value for the given variable id? */
export function hasValue(city, varId) {
  const v = state.registry.get(varId);
  if (!v) return false;
  return has(city[v.valueCol]);
}

export function setAxes(xId, yId) {
  if (state.xId === xId && state.yId === yId) return;
  state.xId = xId;
  state.yId = yId;
  notify("axes");
}

export function setCountryFilter(set) {
  state.countryFilter = set;
  notify("filter");
}
