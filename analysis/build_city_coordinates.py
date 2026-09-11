#!/usr/bin/env python3
"""Build data/city_coordinates.csv — presentation-layer city centroids for the map view.

This script is READ-ONLY on all frozen V1 inputs. The frozen pipeline
(data/processed/v1/) carries no coordinates; this lookup adds ONLY lat/lon
for map positioning. It never touches indicator values, scores, or years.

Input:
  data/city_explorer.csv                (frozen V1 copy, byte-identical)
  assets/raw/cities15000.txt            (GeoNames cities15000, CC BY 4.0,
                                         https://download.geonames.org/export/dump/)

Matching chain (deterministic, documented, no fuzzy matching, no invented
coordinates — every row resolves to a real GeoNames place):
  1. full normalized name in-country (name/asciiname/alternatenames)
  2. comma/slash name parts in-country  ("Helsinki/Helsingfors" -> Helsinki)
  3. compound parts (parenthetical stripped; split on hyphen / "and" / "with",
     then last-word drop for district suffixes like "City"/"Forest") in-country,
     GeoNames population >= 25k, first part that resolves wins
     ("Mannheim-Ludwigshafen" -> Mannheim, "Dundee City" -> Dundee)
  4. documented alias -> principal-city search name (+ optional country override),
     for FUAs named after regions/districts rather than a single city

Tie-break everywhere: highest GeoNames population, then lowest geonameid.

Output:
  data/city_coordinates.csv
  analysis/coordinate_match_report.md (per-row method + unmatched list)
"""

import csv
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPLORER = ROOT / "data" / "city_explorer.csv"
GEONAMES = ROOT / "assets" / "raw" / "cities15000.txt"
OUT_CSV = ROOT / "data" / "city_coordinates.csv"
OUT_REPORT = ROOT / "analysis" / "coordinate_match_report.md"

COUNTRY_MAP = {"UK": "GB", "EL": "GR"}  # OECD/Eurostat code -> GeoNames ISO-2
MIN_PART_POP = 25_000  # attempt-3 guard against tiny same-name places

# Attempt 4 aliases: urban_system_id -> (search name, country-or-None, note).
# Each maps an FUA named after a region/district to its principal city.
ALIASES = {
    "DE006": ("Dortmund", None, "Ruhrgebiet FUA -> largest Ruhr city"),
    "UK002": ("Birmingham", None, "West Midlands urban area -> principal city"),
    "UK043": ("Burton upon Trent", None, "East Staffordshire -> principal town"),
    "UK062": ("Runcorn", None, "Halton -> largest town (Runcorn/Widnes)"),
    "UK513": ("Gillingham", None, "Medway -> largest Medway town"),
    "UK543": ("Grimsby", None, "North East Lincolnshire -> principal town"),
    "UK556": ("Hemel Hempstead", None, "Dacorum -> principal town"),
    "UK561": ("Torquay", None, "Torbay -> largest of the three towns"),
    "UK580": ("Farnborough", None, "Rushmoor -> largest town (Farnborough/Aldershot)"),
    "SI001": ("Ljubljana", None, "Osrednjeslovenska region -> capital"),
    "SI002": ("Maribor", None, "Podravska region -> principal city"),
    "TR017": ("Izmit", None, "Kocaeli FUA -> chief city of the province"),
    "FR046": ("Fort-de-France", "MQ", "French overseas FUA (Martinique); GeoNames country MQ"),
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.casefold()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def pick(cands):
    return sorted(cands, key=lambda p: (-p["pop"], int(p["id"])))[0]


def main() -> int:
    with EXPLORER.open(encoding="utf-8-sig", newline="") as f:
        cities = list(csv.DictReader(f))
    print(f"city_explorer rows: {len(cities)}")

    # ---- index GeoNames populated places by (country, normalized name) ----
    index = defaultdict(list)
    n_places = 0
    with GEONAMES.open(encoding="utf-8", newline="") as f:
        for row in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            if len(row) < 15:
                continue
            geonameid, name, asciiname, alternates, lat, lon = row[0], row[1], row[2], row[3], row[4], row[5]
            fclass, fcode, country = row[6], row[7], row[8]
            if fclass != "P" or not fcode.startswith("PPL"):
                continue
            try:
                pop = int(row[14]) if row[14] else 0
            except (ValueError, IndexError):
                pop = 0
            place = {"id": geonameid, "name": name, "lat": float(lat), "lon": float(lon),
                     "pop": pop, "fcode": fcode}
            n_places += 1
            names = {name, asciiname}
            names.update(a.strip() for a in alternates.split(",") if a.strip())
            for n in names:
                key = (country, norm(n))
                if key[1]:
                    index[key].append(place)
    print(f"GeoNames populated places indexed: {n_places}")

    def lookup(search_name: str, country_geo: str, min_pop: int = 0):
        cands = [p for p in index.get((country_geo, norm(search_name)), []) if p["pop"] >= min_pop]
        return pick(cands) if cands else None

    out_rows, unmatched = [], []
    stats = Counter()
    for c in cities:
        country_geo = COUNTRY_MAP.get(c["country_code"], c["country_code"])
        uid, name = c["urban_system_id"], c["city"]
        best, method = None, None

        cand = lookup(name, country_geo)
        if cand:
            best, method = cand, "geonames_full_name"

        if not best:  # attempt 2: comma/slash parts, in reading order
            for part in re.split(r"[/,]", name):
                cand = lookup(part.strip(), country_geo)
                if cand:
                    best, method = cand, f"name_part:'{part.strip()}'"
                    break

        if not best:  # attempt 3: compound parts, sizable only
            cleaned = re.sub(r"\([^)]*\)", " ", name)
            for part in re.split(r"\s*(?:-|\b(?:and|with)\b)\s*", cleaned):
                part = part.strip()
                if not part:
                    continue
                candidates = [part]
                trimmed = re.sub(r"\s+\S+$", "", part).strip()
                if trimmed and trimmed != part:
                    candidates.append(trimmed)
                for candidate in candidates:
                    cand = lookup(candidate, country_geo, min_pop=MIN_PART_POP)
                    if cand:
                        best, method = cand, f"compound_part:'{candidate}'"
                        break
                if best:
                    break

        if not best and uid in ALIASES:  # attempt 4: documented principal-city alias
            search, ctry, note = ALIASES[uid]
            cc = COUNTRY_MAP.get(ctry, ctry) if ctry else country_geo
            cand = lookup(search, cc)
            if cand:
                best, method = cand, f"alias:{note}"

        if best:
            out_rows.append({
                "urban_system_id": uid, "city": name, "country_code": c["country_code"],
                "lat": f"{best['lat']:.6f}", "lon": f"{best['lon']:.6f}",
                "geonames_id": best["id"], "geonames_name": best["name"],
                "match_field": f"{method} (pop {best['pop']:,})",
            })
            stats["matched"] += 1
        else:
            unmatched.append((uid, name, c["country_code"]))
            stats["unmatched"] += 1

    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "urban_system_id", "city", "country_code", "lat", "lon",
            "geonames_id", "geonames_name", "match_field"])
        w.writeheader()
        w.writerows(out_rows)

    lines = [
        "# City coordinate match report", "",
        f"- Explorer rows: {len(cities)}",
        f"- Matched (all resolved to a GeoNames place): {stats['matched']}",
        f"- Unmatched: {stats['unmatched']}", "",
        "Chain: (1) full normalized name in-country; (2) comma/slash name parts;",
        f"(3) compound parts (hyphen/' and ', pop >= {MIN_PART_POP:,});",
        "(4) documented principal-city alias (13 FUAs named after regions/",
        "districts). Tie-break: GeoNames population, then geonameid.",
        "Source: GeoNames cities15000 (CC BY 4.0); country codes UK->GB, EL->GR.",
        "Coordinates position dots only; population/scores always come from the frozen V1 CSV.",
        "",
    ]
    fallback = [r for r in out_rows if not r["match_field"].startswith("geonames_full_name")]
    if fallback:
        lines += [f"## Rows resolved by fallback rules ({len(fallback)})", "",
                  "| id | city (frozen) | resolved GeoNames place | method |", "|---|---|---|---|"]
        lines += [f"| {r['urban_system_id']} | {r['city']} | {r['geonames_name']} | {r['match_field']} |" for r in fallback]
        lines += [""]
    if unmatched:
        lines += ["## Unmatched (absent from map, counted in UI)", "", "| id | city | country |", "|---|---|---|"]
        lines += [f"| {u} | {c} | {cc} |" for u, c, cc in unmatched]
    OUT_REPORT.write_text("\n".join(lines), encoding="utf-8")

    print(f"matched={stats['matched']} unmatched={stats['unmatched']}")
    if unmatched:
        print("UNMATCHED:", "; ".join(f"{c}({cc})" for _, c, cc in unmatched))
    return 0


if __name__ == "__main__":
    sys.exit(main())
