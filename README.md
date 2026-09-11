# City Explorer — Explore-view prototype

Interactive exploratory prototype (not the final dashboard): two linked views over the
**frozen V1** Quality-of-Life City Explorer pipeline — an interactive city scatterplot
and a European city map. Data is rendered as-is; nothing is cleaned, rescored, or imputed.

## Serve

```sh
cd city-explorer
python -m http.server 8763     # ES modules + fetch require HTTP
# open http://localhost:8763/
node verify.mjs                # data-integrity + structure self-check (63 checks)
```

## Visualization library

- **D3.js 7.9.0** (vendored `assets/vendor/d3.min.js`, offline — no CDN at runtime):
  scales, shapes, axes, zoom, transitions for both views.
- **topojson-client 3.1** + **world-atlas 2.0.2** (Natural Earth 50m) for country outlines.
- Everything else is dependency-free vanilla ES modules styled with the workspace's
  modular `research-dashboard` design system (`styles/tokens.css` + `components.css`).

## Data fields used (frozen V1, byte-identical copies in `data/`)

| Source | Fields |
|---|---|
| `city_explorer.csv` (391 rows = BALANCED cohort, all `explorer_eligible`) | `urban_system_id, city, country_code, country_name` · `population_raw, population_year` (bubble size, context) · composites `environment_score, mobility_score, economic_opportunity_score` · FUA indicators `pm25_raw/+score/+year`, `green_area_raw/…`, `public_transport_raw/…`, `employment_raw/…`, `unemployment_raw/…` · perception scores `perceived_safety/community/life_satisfaction/housing_satisfaction (+year)` · commuting context `commuting_pt/bike/walk/car_raw (+year, +staleness)` |
| `indicator_metadata.csv` (17 rows) | **Drives all** display names, units, geo scope (`fua` vs `city_core`), direction, normalization, source, years, caveats — nothing methodological is hard-coded |
| `city_coordinates.csv` | **Presentation-layer only** (NOT part of frozen V1): lat/lon for map positioning. GeoNames CC-BY 4.0 lookup, documented in `data/PROVENANCE.md`; values shown never come from it |

Variables offered in the axis menus come only from fields actually present in
`city_explorer.csv` — composites (3), scored FUA indicators (5), city-core perception
dimensions (4), unscored commuting context (4). Population is reserved for bubble size.

## Interaction model

- **Axes**: X and Y freely selectable from the 16 variables (grouped menus); picking the
  variable already on the other axis swaps them. Bubble size is always population
  (area ∝ population, same scale in both views).
- **Tooltip** (hover anywhere): city, country, ISO + system id, and per axis — raw value +
  unit, percentile score (0–100), observation year, geo badge (FUA / city-core), staleness
  badge for census-vintage commuting, plus the metadata caveat. Missing values show a
  **"no data" badge — never zero**.
- **Selection**: click (or focus + Enter) toggles a city; up to **3** persist; a 4th
  replaces the oldest (FIFO). Chips bar shows the selection with remove buttons and Clear,
  plus an "N of 3 cities selected" counter. Colors are persistent per selection slot —
  1st = coral, 2nd = teal, 3rd = slate — and are identical in chips, scatter, map, radar,
  table and summaries.
- **Linkage**: selection made in either view emphasizes the city in the other
  (coral fill + ink ring + label in both). Country filter and search affect both views.
- **Country filter**: multi-select popover with per-country counts.
- **Search**: type ≥2 letters, ↑↓ + Enter; selecting pans the map to the city.
- **Map**: zoom (buttons or wheel), pan; dashed/hollow dots = city present but missing a
  value for the current axes (it can still be selected and compared on other axes).
- **Missing-data transparency**: the scatter states "N cities not drawn" with an
  expandable list; axes label their unit ("percentile score (0–100)" vs the metadata's
  raw unit); the footer states that indicators do not share one reference year.

## Three-city comparison (below the scatter + map row)

Driven entirely by the persistent selection — updates whenever a city is added,
removed, or replaced; works gracefully with 1–3 cities and shows hints when empty.

- **City Comparison radar** — six percentile dimensions from `city_explorer.csv` only:
  Environment, Mobility, Economic Opportunity (FUA composites) and Perceived Safety,
  Community & Trust, Life Satisfaction (city-core 2023 survey); axis labels carry the
  geography tag. Subtle rings (25/50/75/100), transparent fills, slot-colored outlines.
  **Missing dimensions are never drawn as zero**: the polygon skips that axis and a
  hollow marker on the spoke marks the gap (tooltip explains why). Panel footnote states
  the FUA vs city-core mix and the ~80-city survey coverage.
- **Dimension Scores table** — rows = the six dimensions, columns = selected cities
  (slot-colored headers). Percentile score prominent; small year subtext per cell
  (composites show their component years, e.g. "2025·2021"); a Geo column tags FUA vs
  city core. Light teal/coral shading (via `color-mix` on tokens) highlights strong/weak
  cells. Hovering a cell opens a tooltip with raw value + unit, component percentiles,
  observation year(s), geography, source and the metadata caveat. Missing = "no data"
  badge — never zero.
- **City Summaries** — one card per selected city (slot-colored bar): a generated,
  data-grounded takeaway built only from available percentile scores
  ("Strong perceived safety and life satisfaction; weaker mobility. Highest: …  ·  lowest: …")
  plus tags (Strong ≥67 / Weaker ≤33 / "N of 6 dims available"). No personality claims
  beyond the stated bands, which are labelled as a display convention in the card footer.

## Data limitations encountered (all preserved, none repaired)

1. **Per-indicator reference years differ** (PM2.5 up to 2025, green area 2021, public
   transport 2023, employment/unemployment latest in 2021–2024) — shown per value in
   tooltips; composites have no single year (component years shown instead).
2. **Perception measures are city-core surveys** (~80 cities, 2023 wave) associated to
   urban systems — never FUA-wide; badged `city_core` wherever shown.
3. **Commuting context mixes census vintages**; pre-2021 rows carry
   `stale_commuting_context` and are badged as such.
4. **Composite scores require all components** — economic opportunity is therefore
   empty for ~1/3 of the cohort (no reweighting); the UI reports these as gaps.
5. **No coordinates in frozen V1** — the separate GeoNames lookup positions dots only;
   14 FUAs named after regions/districts are positioned at a documented principal city
   (e.g. Ruhrgebiet→Dortmund); Fort-de-France (Martinique) sits outside the initial
   Europe frame (pan/zoom or search reaches it).
6. Only the **BALANCED cohort** (391 of 763 systems) is in scope for Explore; income and
   health have no scores in V1 (structural gap / historical wave only).

## Files

```
index.html              shell (fonts, design-system CSS, vendored d3/topojson, module app)
styles/                 tokens.css + components.css (template) · explore.css (view)
js/                     main.js (assembler) · state.js · registry.js (metadata join)
                        scatter.js · map.js · compare.js (radar/table/summaries)
                        tooltip.js · lib/{csv,util}.js
data/                   frozen V1 copies + coordinates lookup + PROVENANCE.md
assets/vendor,assets/geo,assets/raw   d3, topojson-client, Natural Earth 50m, GeoNames
analysis/               build_city_coordinates.py + coordinate_match_report.md
verify.mjs              63-check self-test (hashes, shapes, joins, syntax)
```
