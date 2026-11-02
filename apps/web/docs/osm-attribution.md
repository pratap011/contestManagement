# OpenStreetMap attribution and ODbL

The airport dataset in `apps/web/src/data/blr/` is derived from OpenStreetMap.

## Required attribution

Display, visibly and near the map:

> © OpenStreetMap contributors

Links:

- Copyright: <https://www.openstreetmap.org/copyright>
- License: <https://opendatacommons.org/licenses/odbl/1-0/>

The app shows this on the map, in the footer, and on the Data & privacy page.

## ODbL obligations

OpenStreetMap data is licensed under the Open Database License (ODbL) 1.0. If you distribute the
derived database — for example by publishing this repository or serving the JSON — keep the
attribution and make the derived database available under ODbL. Do not add incompatible
restrictions. If you combine OSM data with other data, review the ODbL's derivative-database and
produced-work guidance before distribution.

## Extraction metadata

`apps/web/src/data/blr/osm-meta.json` records:

- extraction URL and date,
- bounding box,
- terminal/relation/way IDs used,
- node, edge, POI and floor counts,
- which connector classes are inferred,
- source/licence links.

Regenerate with:

```bash
npm run data:osm -- --refresh
```

Review the generated diff and run `npm test`, `npm run typecheck` and `npm run build:web` before
committing. The generator caches the raw extract under `.data/osm-cache/` (gitignored).

## Tile usage

The prototype uses `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with attribution at low traffic.
The OSM Foundation's tile usage policy is not an unlimited free hosting agreement. Before a
high-traffic public launch, switch to a compliant tile provider or self-host tiles and keep the
attribution. The OSM-derived geometry remains ODbL regardless of the tile provider.

## What is not OSM

- Live flight data comes from the airport's public board.
- OSRM road geometry is derived from OSM roads but computed by the OSRM demo server at build time.
- Demo flights and manual entries are not OSM.
- The terminal entrance/level/short access connectors are derived from OSM geometry, not surveyed.
  They are marked `inferred` and drawn dashed.
