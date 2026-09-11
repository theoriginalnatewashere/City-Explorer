/* Axis-variable registry.
 *
 * Joins the frozen indicator_metadata.csv to the actual column names of
 * city_explorer.csv. All display names, units, geo scope, sources and caveats
 * come verbatim from the metadata file — nothing methodological is hard-coded
 * here. Only the structural column mapping (which CSV column holds which
 * role) lives in this file.
 */

const MAPPING = [
  // composites (percentile-based, no single observation year — component years retained)
  {
    id: "environment_score", group: "Composite scores", valueCol: "environment_score",
    scoreIsValue: true, yearCols: ["pm25_year", "green_area_year"],
  },
  {
    id: "mobility_score", group: "Composite scores", valueCol: "mobility_score",
    scoreIsValue: true, yearCols: ["public_transport_year"],
  },
  {
    id: "economic_opportunity_score", group: "Composite scores", valueCol: "economic_opportunity_score",
    scoreIsValue: true, yearCols: ["employment_year", "unemployment_year"],
  },
  // FUA indicators (raw value + percentile score + observation year)
  { id: "pm25", group: "FUA indicators", valueCol: "pm25_raw", scoreCol: "environment_pm25_score", yearCols: ["pm25_year"] },
  { id: "green_area", group: "FUA indicators", valueCol: "green_area_raw", scoreCol: "environment_green_score", yearCols: ["green_area_year"] },
  { id: "public_transport_access", group: "FUA indicators", valueCol: "public_transport_raw", scoreCol: "public_transport_score", yearCols: ["public_transport_year"] },
  { id: "employment_rate", group: "FUA indicators", valueCol: "employment_raw", scoreCol: "employment_score", yearCols: ["employment_year"] },
  { id: "unemployment_rate", group: "FUA indicators", valueCol: "unemployment_raw", scoreCol: "unemployment_score", yearCols: ["unemployment_year"] },
  // perception dimensions (city-core survey; percentile score + survey year only in this file)
  { id: "perceived_safety", group: "Perception (city-core survey)", valueCol: "perceived_safety_score", scoreIsValue: true, yearCols: ["perceived_safety_year"] },
  { id: "community", group: "Perception (city-core survey)", valueCol: "community_score", scoreIsValue: true, yearCols: ["community_year"] },
  { id: "life_satisfaction", group: "Perception (city-core survey)", valueCol: "life_satisfaction_score", scoreIsValue: true, yearCols: ["life_satisfaction_year"] },
  { id: "housing_satisfaction", group: "Perception (city-core survey)", valueCol: "housing_satisfaction_score", scoreIsValue: true, yearCols: ["housing_satisfaction_year"] },
  // commuting context (unscored, census vintages, staleness flags)
  { id: "commuting_public_transport", group: "Commuting context (unscored)", valueCol: "commuting_pt_raw", scoreCol: null, yearCols: ["commuting_pt_year"], stalenessCol: "commuting_pt_staleness" },
  { id: "commuting_bike", group: "Commuting context (unscored)", valueCol: "commuting_bike_raw", scoreCol: null, yearCols: ["commuting_bike_year"], stalenessCol: "commuting_bike_staleness" },
  { id: "commuting_walk", group: "Commuting context (unscored)", valueCol: "commuting_walk_raw", scoreCol: null, yearCols: ["commuting_walk_year"], stalenessCol: "commuting_walk_staleness" },
  { id: "commuting_car", group: "Commuting context (unscored)", valueCol: "commuting_car_raw", scoreCol: null, yearCols: ["commuting_car_year"], stalenessCol: "commuting_car_staleness" },
];

export const POPULATION = {
  id: "population",
  display_name: "Population (total)",
  raw_unit: "persons",
};

/**
 * Build the registry.
 * @param {Array} metadataRows rows of indicator_metadata.csv
 * @param {Array} header columns of city_explorer.csv (for column assertions)
 */
export function buildRegistry(metadataRows, header) {
  const meta = new Map(metadataRows.map((m) => [m.indicator, m]));
  const defs = [];

  for (const m of MAPPING) {
    const md = meta.get(m.id);
    if (!md) throw new Error(`registry id "${m.id}" has no row in indicator_metadata.csv`);

    const cols = [m.valueCol, ...(m.scoreCol ? [m.scoreCol] : []), ...(m.yearCols || []), ...(m.stalenessCol ? [m.stalenessCol] : [])];
    for (const c of cols) {
      if (!header.includes(c)) throw new Error(`column "${c}" (needed by ${m.id}) missing from city_explorer.csv`);
    }

    const isScore = !!m.scoreIsValue;
    defs.push({
      id: m.id,
      group: m.group,
      label: md.display_name,
      unit: md.raw_unit,
      geoLevel: md.geo_level,
      direction: md.direction,
      source: md.source,
      years: md.years,
      caveat: md.caveat,
      valueCol: m.valueCol,
      scoreCol: isScore ? null : m.scoreCol,
      stalenessCol: m.stalenessCol || null,
      yearCols: m.yearCols || [],
      isScore,             // the plotted value IS a percentile score
      isContext: md.measure_type === "context",
    });
  }

  // every metadata row must be either used or explicitly context (population)
  const used = new Set(MAPPING.map((m) => m.id));
  for (const id of meta.keys()) {
    if (!used.has(id) && id !== POPULATION.id) {
      throw new Error(`indicator_metadata row "${id}" is not mapped in the registry`);
    }
  }

  defs.sort((a, b) => groupOrder(a.group) - groupOrder(b.group));
  return defs;
}

function groupOrder(g) {
  const order = ["Composite scores", "FUA indicators", "Perception (city-core survey)", "Commuting context (unscored)"];
  return order.indexOf(g);
}

export const GROUPS = ["Composite scores", "FUA indicators", "Perception (city-core survey)", "Commuting context (unscored)"];
