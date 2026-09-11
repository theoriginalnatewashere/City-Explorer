/* Self-check for the city-explorer Explore-view prototype.
 * Run: node verify.mjs   (no browser, no deps)
 *
 * Asserts the prototype still consumes the frozen V1 data byte-identically,
 * the registry join is complete, and the coordinate lookup covers every city
 * within sanity bounds. Syntax-checks all ES modules. */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV } from "./js/lib/csv.js";
import { buildRegistry, GROUPS } from "./js/registry.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
let errors = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { errors++; console.error("  FAIL:", msg); } };

const EXPECTED_SHA = {
  "data/city_explorer.csv": "9878cfcd44f6b99c5652e794835f9012bfbb7022c7947646c3456bb6d0e5729a",
  "data/indicator_metadata.csv": "b8d97f625d20fc77df7b20e60e27d7d5330dc4cb28a462c4f2b71cbf1e6837ed",
};

// ---- 1. frozen inputs byte-identical ----
console.log("1. frozen data integrity");
for (const [rel, sha] of Object.entries(EXPECTED_SHA)) {
  const h = createHash("sha256").update(readFileSync(join(ROOT, rel))).digest("hex");
  ok(h === sha, `${rel} sha256 mismatch: ${h}`);
}

// ---- 2. explorer rows ----
console.log("2. city_explorer.csv shape");
const explorer = parseCSV(readFileSync(join(ROOT, "data/city_explorer.csv"), "utf8"));
ok(explorer.length === 391, `expected 391 rows, got ${explorer.length}`);
ok(explorer.every((r) => r.explorer_eligible === "TRUE"), "all rows must be explorer_eligible=TRUE");
ok(new Set(explorer.map((r) => r.urban_system_id)).size === 391, "urban_system_id must be unique");
ok(explorer.every((r) => r.city && r.country_code && r.country_name), "identity fields non-empty");

// numeric cells are either empty or numeric — never text
const numericCols = ["population_raw", "environment_score", "pm25_raw", "environment_pm25_score",
  "green_area_raw", "environment_green_score", "public_transport_raw", "public_transport_score",
  "employment_raw", "employment_score", "unemployment_raw", "unemployment_score",
  "perceived_safety_score", "community_score", "life_satisfaction_score", "housing_satisfaction_score",
  "commuting_pt_raw", "commuting_bike_raw", "commuting_walk_raw", "commuting_car_raw"];
for (const col of numericCols) {
  ok(explorer.every((r) => r[col] === "" || Number.isFinite(Number(r[col]))), `column ${col} must be empty-or-numeric`);
}

// ---- 3. metadata + registry join ----
console.log("3. metadata + registry join");
const metadata = parseCSV(readFileSync(join(ROOT, "data/indicator_metadata.csv"), "utf8"));
ok(metadata.length === 17, `expected 17 metadata rows, got ${metadata.length}`);
const header = Object.keys(explorer[0]);
let defs;
try { defs = buildRegistry(metadata, header); ok(defs.length === 16, `registry built (${defs.length} vars)`); }
catch (e) { checks++; errors++; console.error("  FAIL: registry join:", e.message); }
ok(GROUPS.length === 4, "four axis groups");
for (const d of (defs || [])) {
  ok(!!d.label && !!d.caveat && !!d.source, `metadata complete for ${d.id}`);
}

// comparison radar dimensions must be registry-backed percentile scores
// (registry IDs = metadata indicator IDs; values read via each def's valueCol)
const RADAR_DIMS = ["environment_score", "mobility_score", "economic_opportunity_score",
  "perceived_safety", "community", "life_satisfaction"];
for (const d of RADAR_DIMS) {
  const def = (defs || []).find((x) => x.id === d);
  ok(!!def, `radar dimension ${d} in registry`);
  if (def) ok(header.includes(def.valueCol) && Number.isFinite(+explorer[0][def.valueCol]) || explorer.some((r) => r[def.valueCol] !== ""), `radar dimension ${d} has data`);
}

// ---- 4. coordinate lookup ----
console.log("4. coordinate lookup (presentation layer)");
const coords = parseCSV(readFileSync(join(ROOT, "data/city_coordinates.csv"), "utf8"));
ok(coords.length === 391, `expected 391 coordinate rows, got ${coords.length}`);
const ids = new Set(explorer.map((r) => r.urban_system_id));
ok(coords.every((r) => ids.has(r.urban_system_id)), "coordinate ids must all exist in explorer");
ok(new Set(coords.map((r) => r.urban_system_id)).size === 391, "coordinate ids unique");
ok(coords.every((r) => Number.isFinite(+r.lat) && Number.isFinite(+r.lon)), "lat/lon numeric");
ok(coords.every((r) => +r.lat >= -70 && +r.lat <= 72 && +r.lon >= -70 && +r.lon <= 60), "lat/lon within sanity bounds");
ok(coords.every((r) => r.geonames_id !== ""), "every row resolves to a GeoNames place");
const martinique = coords.find((r) => r.city === "Fort-de-France");
ok(martinique && Math.abs(+martinique.lat - 14.6) < 0.5 && Math.abs(+martinique.lon + 61.08) < 0.5, "Fort-de-France resolved to Martinique");

// ---- 5. assets present ----
console.log("5. vendored assets");
for (const rel of ["assets/vendor/d3.min.js", "assets/vendor/topojson-client.min.js", "assets/geo/countries-50m.json"]) {
  ok(statSync(join(ROOT, rel)).size > 1000, `${rel} present`);
}

// ---- 6. module syntax ----
console.log("6. module syntax");
const modules = ["js/main.js", "js/state.js", "js/registry.js", "js/tooltip.js", "js/scatter.js", "js/map.js", "js/lib/csv.js", "js/lib/util.js"];
const tmp = tmpdir();
for (const m of modules) {
  const tmpFile = join(tmp, `verify-${m.replace(/[\\/]/g, "__")}.mjs`);
  writeFileSync(tmpFile, readFileSync(join(ROOT, m)), "utf8");
  try { execFileSync(process.execPath, ["--check", tmpFile], { stdio: "pipe" }); checks++; }
  catch (e) { checks++; errors++; console.error(`  FAIL: ${m}:`, e.stderr?.toString().split("\n")[0]); }
}

console.log(`\n${errors === 0 ? "PASS" : "FAIL"}: ${checks} checks, ${errors} error(s)`);
process.exit(errors === 0 ? 0 : 1);
