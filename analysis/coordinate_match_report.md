# City coordinate match report

- Explorer rows: 391
- Matched (all resolved to a GeoNames place): 391
- Unmatched: 0

Chain: (1) full normalized name in-country; (2) comma/slash name parts;
(3) compound parts (hyphen/' and ', pop >= 25,000);
(4) documented principal-city alias (13 FUAs named after regions/
districts). Tie-break: GeoNames population, then geonameid.
Source: GeoNames cities15000 (CC BY 4.0); country codes UK->GB, EL->GR.
Coordinates position dots only; population/scores always come from the frozen V1 CSV.

## Rows resolved by fallback rules (34)

| id | city (frozen) | resolved GeoNames place | method |
|---|---|---|---|
| DE006 | Ruhrgebiet | Dortmund | alias:Ruhrgebiet FUA -> largest Ruhr city (pop 588,462) |
| DE081 | Mannheim-Ludwigshafen | Mannheim | compound_part:'Mannheim' (pop 307,960) |
| DE085 | Braunschweig-Salzgitter | Braunschweig | compound_part:'Braunschweig' (pop 244,715) |
| DE126 | Düren, Stadt | Düren | name_part:'Düren' (pop 93,440) |
| ES014 | Pamplona/Iruña | Pamplona | name_part:'Pamplona' (pop 208,243) |
| ES021 | Alicante/Alacant | Alicante | name_part:'Alicante' (pop 348,901) |
| ES063 | San Sebastián/Donostia | Donostia / San Sebastián | name_part:'San Sebastián' (pop 185,357) |
| ES069 | Castellón de la Plana/Castelló de la Plana | Castelló de la Plana | name_part:'Castellón de la Plana' (pop 171,857) |
| FI001 | Helsinki/Helsingfors | Helsinki | name_part:'Helsinki' (pop 658,864) |
| FI002 | Tampere/Tammerfors | Tampere | name_part:'Tampere' (pop 260,646) |
| FI003 | Turku/Åbo | Turku | name_part:'Turku' (pop 206,655) |
| FI004 | Oulu/Uleåborg | Oulu | name_part:'Oulu' (pop 216,066) |
| FR014 | Cannes-Antibes | Cannes | compound_part:'Cannes' (pop 74,545) |
| FR046 | Fort-de-France | Fort-de-France | alias:French overseas FUA (Martinique); GeoNames country MQ (pop 89,995) |
| FR076 | Annemasse-Geneva (French part) | Annemasse | compound_part:'Annemasse' (pop 28,275) |
| SI001 | Osrednjeslovenska | Ljubljana | alias:Osrednjeslovenska region -> capital (pop 272,220) |
| SI002 | Podravska | Maribor | alias:Podravska region -> principal city (pop 96,209) |
| TR017 | Kocaeli | İzmit | alias:Kocaeli FUA -> chief city of the province (pop 196,571) |
| UK002 | West Midlands urban area | Birmingham | alias:West Midlands urban area -> principal city (pop 1,157,603) |
| UK031 | Bath and North East Somerset | Bath | compound_part:'Bath' (pop 101,557) |
| UK043 | East Staffordshire | Burton upon Trent | alias:East Staffordshire -> principal town (pop 122,199) |
| UK062 | Halton | Runcorn | alias:Halton -> largest town (Runcorn/Widnes) (pop 61,145) |
| UK513 | Medway | Gillingham | alias:Medway -> largest Medway town (pop 101,187) |
| UK515 | Brighton and Hove | Brighton | compound_part:'Brighton' (pop 283,870) |
| UK542 | Telford and Wrekin | Telford | compound_part:'Telford' (pop 155,570) |
| UK543 | North East Lincolnshire | Grimsby | alias:North East Lincolnshire -> principal town (pop 86,138) |
| UK548 | Basingstoke and Deane | Basingstoke | compound_part:'Basingstoke' (pop 107,642) |
| UK550 | Dundee City | Dundee | compound_part:'Dundee' (pop 148,210) |
| UK556 | Dacorum | Hemel Hempstead | alias:Dacorum -> principal town (pop 95,961) |
| UK557 | Blackburn with Darwen | Blackburn | compound_part:'Blackburn' (pop 146,521) |
| UK561 | Torbay | Torquay | alias:Torbay -> largest of the three towns (pop 65,388) |
| UK568 | Cheshire West and Chester | Chester | compound_part:'Chester' (pop 90,524) |
| UK573 | Bracknell Forest | Bracknell | compound_part:'Bracknell' (pop 76,103) |
| UK580 | Rushmoor | Farnborough | alias:Rushmoor -> largest town (Farnborough/Aldershot) (pop 60,652) |
