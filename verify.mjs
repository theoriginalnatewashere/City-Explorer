/* Self-check for the city-explorer Explore-view prototype.
 * Run: node verify.mjs   (no browser, no deps)
 *
 * Asserts the workspace still holds all five frozen V1 files byte-identically,
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
import { renderAboutMe } from "./js/components/about.js";
import { authorProfile } from "./js/data/author-profile.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
let errors = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { errors++; console.error("  FAIL:", msg); } };

const EXPECTED_SHA = {
  "data/city_explorer.csv": "9878cfcd44f6b99c5652e794835f9012bfbb7022c7947646c3456bb6d0e5729a",
  "data/indicator_metadata.csv": "b8d97f625d20fc77df7b20e60e27d7d5330dc4cb28a462c4f2b71cbf1e6837ed",
  "data/city_profile_scores.csv": "a18e01ed815494da69869c33b568b7622deade5eff7214b1c55c7f0fb2125506",
  "data/city_profiles.csv": "f1f2c09dabea0529c60cfbab7c94c33027b56a83c50045a5bb8d696b3f9d4cd0",
  "data/city_comparison_long.csv": "9db5f5cc630be7aa4b4319fd3118f4bd9e958a845afd57f2839f1d4c0eaa89fd",
  "assets/author/nethan-profile.png": "ac82032b94a1824db4cbe131939c9ea96f44450288cb4690dac351b5e9d993f7",
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

// ---- 3. staged frozen V1 files (profile_scores / profiles / comparison_long) ----
console.log("3. staged frozen V1 files (profile_scores, profiles, comparison_long)");
const profileScores = parseCSV(readFileSync(join(ROOT, "data/city_profile_scores.csv"), "utf8"));
ok(profileScores.length === 763, `expected 763 rows, got ${profileScores.length}`);
ok(new Set(profileScores.map((r) => r.urban_system_id)).size === 763, "profile_scores urban_system_id unique");
const FLAGS = ["explorer_eligible", "environment_eligible", "mobility_eligible", "economic_eligible", "extended_profile_eligible", "radar_eligible"];
ok(profileScores.every((r) => FLAGS.every((f) => r[f] === "TRUE" || r[f] === "FALSE")), "six eligibility flags must be TRUE/FALSE");
const flagTrue = Object.fromEntries(FLAGS.map((f) => [f, profileScores.filter((r) => r[f] === "TRUE").length]));
ok(flagTrue.explorer_eligible === 391, `explorer_eligible TRUE expected 391, got ${flagTrue.explorer_eligible}`);
ok(flagTrue.extended_profile_eligible === 40, `extended_profile_eligible TRUE expected 40, got ${flagTrue.extended_profile_eligible}`);
const psById = new Map(profileScores.map((r) => [r.urban_system_id, r]));
ok(explorer.every((r) => psById.get(r.urban_system_id)?.explorer_eligible === "TRUE"), "every explorer city flagged explorer_eligible in profile_scores");
const profileScoresNumeric = ["environment_score", "environment_pm25_score", "environment_pm25_year", "environment_green_score", "environment_green_year", "mobility_score", "public_transport_score", "public_transport_year", "economic_opportunity_score", "employment_score", "employment_year", "unemployment_score", "unemployment_year", "perceived_safety_score", "perceived_safety_year", "community_score", "community_year", "life_satisfaction_score", "life_satisfaction_year", "housing_satisfaction_score", "housing_satisfaction_year", "profile_dimensions_available", "profile_coverage_pct", "n_perception_dimensions"];
ok(profileScoresNumeric.every((c) => profileScores.every((r) => r[c] === "" || Number.isFinite(Number(r[c])))), "profile_scores numeric columns empty-or-numeric");
ok(profileScores.every((r) => r.profile_coverage_pct === "" || (+r.profile_coverage_pct >= 0 && +r.profile_coverage_pct <= 100)), "profile_coverage_pct within 0..100");

const profilesRows = parseCSV(readFileSync(join(ROOT, "data/city_profiles.csv"), "utf8"));
ok(profilesRows.length === 40, `expected 40 rows, got ${profilesRows.length}`);
ok(new Set(profilesRows.map((r) => r.urban_system_id)).size === 40, "profiles urban_system_id unique");
ok(profilesRows.every((r) => psById.get(r.urban_system_id)?.radar_eligible === "TRUE"), "every extended-profile city flagged radar_eligible in profile_scores");
ok(profilesRows.every((r) => r.radar_eligible === "TRUE"), "profiles rows all radar_eligible=TRUE");
const profilesNumeric = ["environment_score", "mobility_score", "economic_opportunity_score", "perceived_safety_score", "perceived_safety_raw_share", "perceived_safety_year", "community_score", "community_raw_share", "community_year", "life_satisfaction_score", "life_satisfaction_raw_share", "life_satisfaction_year", "housing_satisfaction_score", "housing_satisfaction_raw_share", "housing_satisfaction_year", "n_perception_dimensions", "profile_dimensions_available", "profile_coverage_pct"];
ok(profilesNumeric.every((c) => profilesRows.every((r) => r[c] === "" || Number.isFinite(Number(r[c])))), "profiles numeric columns empty-or-numeric");

const comparisonLong = parseCSV(readFileSync(join(ROOT, "data/city_comparison_long.csv"), "utf8"));
ok(comparisonLong.length === 5363, `expected 5363 rows, got ${comparisonLong.length}`);
const explorerIds = new Set(explorer.map((r) => r.urban_system_id));
ok(comparisonLong.every((r) => explorerIds.has(r.urban_system_id)), "comparison_long ids all exist in explorer");
ok(new Set(comparisonLong.map((r) => r.urban_system_id)).size === 391, "comparison_long covers 391 cities");
ok(comparisonLong.every((r) => ["composite", "indicator", "perception_dimension", "context"].includes(r.measure_type)), "measure_type in known set");
const GEO_FOR = { composite: "fua (composite)", indicator: "fua", context: "fua", perception_dimension: "city_core" };
ok(comparisonLong.every((r) => r.geo_level === GEO_FOR[r.measure_type]), "geo_level matches measure_type");
const expectedMeasureCounts = { "composite|fua (composite)": 1173, "indicator|fua": 1955, "context|fua": 1955, "perception_dimension|city_core": 280 };
const measureCounts = {};
for (const r of comparisonLong) { const k = `${r.measure_type}|${r.geo_level}`; measureCounts[k] = (measureCounts[k] || 0) + 1; }
for (const [k, n] of Object.entries(expectedMeasureCounts)) ok(measureCounts[k] === n, `${k} expected ${n} rows, got ${measureCounts[k]}`);
const longNumeric = ["raw_value", "percentile_score", "observation_year", "data_age_years"];
ok(longNumeric.every((c) => comparisonLong.every((r) => r[c] === "" || Number.isFinite(Number(r[c])))), "comparison_long numeric columns empty-or-numeric");

// ---- 4. metadata + registry join ----
console.log("4. metadata + registry join");
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

// ---- 5. coordinate lookup ----
console.log("5. coordinate lookup (presentation layer)");
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

// ---- 6. assets present ----
console.log("6. vendored assets");
for (const rel of ["assets/vendor/d3.min.js", "assets/vendor/topojson-client.min.js", "assets/geo/countries-50m.json"]) {
  ok(statSync(join(ROOT, rel)).size > 1000, `${rel} present`);
}

// ---- 7. module syntax ----
console.log("7. module syntax");
const modules = ["js/main.js", "js/state.js", "js/registry.js", "js/tooltip.js", "js/scatter.js", "js/map.js", "js/components/about.js", "js/data/author-profile.js", "js/lib/csv.js", "js/lib/util.js"];
const tmp = tmpdir();
for (const m of modules) {
  const tmpFile = join(tmp, `verify-${m.replace(/[\\/]/g, "__")}.mjs`);
  writeFileSync(tmpFile, readFileSync(join(ROOT, m)), "utf8");
  try { execFileSync(process.execPath, ["--check", tmpFile], { stdio: "pipe" }); checks++; }
  catch (e) { checks++; errors++; console.error(`  FAIL: ${m}:`, e.stderr?.toString().split("\n")[0]); }
}

// ---- 8. AboutMe shared component ----
console.log("8. AboutMe shared component");
const aboutHTML = renderAboutMe(authorProfile);
ok(aboutHTML.includes('class="about"'), "about section rendered");
ok(aboutHTML.includes("NETHAN") && aboutHTML.includes("SUPAKITCHUMNAN"), "about renders author name");
ok(aboutHTML.includes("/assets/author/nethan-profile.png"), "about references the canonical portrait path");
ok(aboutHTML.includes("natewashere.com"), "about renders author links");
ok(authorProfile.image === "/assets/author/nethan-profile.png", "portrait path is site-root-absolute per convention");

console.log(`\n${errors === 0 ? "PASS" : "FAIL"}: ${checks} checks, ${errors} error(s)`);
process.exit(errors === 0 ? 0 : 1);
