# BLR Navigator data sources

## What is bundled today

| Dataset | Version | Source | Verification |
| --- | --- | --- | --- |
| BLR airport, terminals, floors, POIs, graph | `demo-2026.11` | Hand-curated schematic demo | `unverified` |
| Flight schedules | Deterministic demo catalogue + manual entry | Demo provider / user | Labelled `demo` / `manual` |
| Live flight lookup | Disabled by default | Optional server-side proxy | `provider` when enabled |

No OpenStreetMap data is bundled in this build. The schematic SVG is rendered from local JSON
geometry. If OSM-derived data is added later, the extraction date, query, source metadata, and
required attribution must be recorded with the dataset.

## Honest limitations

- The terminal floors and POIs are illustrative. They are not a survey of the real T1/T2.
- Every graph edge is `unverified`. Routes are shown only as demo routes with a visible warning.
- There is no T1↔T2 transfer edge. The UI explicitly says transfer guidance is unavailable.
- Security edges are currently undirected in the demo graph. The assistant avoids suggesting
  landside facilities to connecting passengers, but a manual map route can still cross the boundary.
  This must be modelled with directional access rules before claiming reliable airside routing.
- Accessible flags are demo values. Step-free mode is not a wheelchair-accessibility guarantee.

## OSM / Overpass audit status

The PRD's M0 audit was **not completed** as part of this prototype, so there is no go decision for
OSM indoor routing. Do not import OSM geometry and mark it verified without reviewing coverage and
permissions.

When the audit is run, keep the query and extraction date in this document. A starting query (to be
reviewed, not executed by the app) is:

```overpassql
[out:json][timeout:60];
area["aeroway"="aerodrome"]["name"~"Kempegowda",i]->.a;
(
  nwr["aeroway"](area.a);
  nwr["indoor"](area.a);
  nwr["level"](area.a);
  nwr["amenity"](area.a);
  nwr["shop"](area.a);
  nwr["wheelchair"](area.a);
);
out center tags;
```

Review at minimum `aeroway`, `indoor`, `level`, `amenity`, `shop`, and `wheelchair` tags. Record
counts per terminal/floor and note whether corridors, gates, and floor transitions are actually
mapped. Do not treat a mapped feature as routable without verification.

If OSM data is used, display “© OpenStreetMap contributors” and comply with ODbL obligations for a
distributed derived database. Do not treat the public OSM tile servers as unlimited free hosting;
the current app uses local SVG, not OSM tiles.

## Data files

```
src/data/blr/
  airport.json
  terminals/t1/floors.json
  terminals/t1/pois.json
  terminals/t1/graph.json
  terminals/t2/floors.json
  terminals/t2/pois.json
  terminals/t2/graph.json
```

- Floor geometry uses a 1000×620 schematic coordinate system per floor (width/height are stored in
  each floor record).
- Graph nodes carry terminal, floor, and schematic x/y coordinates.
- POIs reference a graph node and must be on the same floor.
- `estimatedWalkingSeconds` is a demo estimate derived from schematic distance at roughly 1.2 m/s.
  Cross-floor edges use fixed demo transition times.
- Edges are undirected in this MVP. `allowedPassengerTypes` is the serialized access rule used by A*.
- `accessible` excludes stairs/escalators from step-free mode; lifts must be marked accessible.

`validateDataset()` runs when the app loads and in the test suite. Add data through the JSON files
and keep the validator/test green.

## Verification statuses

| Status | Meaning | Routing policy |
| --- | --- | --- |
| `verified` | Checked against a reliable, permitted source or on-site validation. | Eligible for a route presented as reliable. |
| `unverified` | Imported, demo, or collected but not checked. | Searchable with a warning; demo routing only. |
| `inferred` | Approximate or derived location. | Not for safety-critical routing. |
| `unknown` | No reliable value. | Display as “Not available”; never invent a route. |

To promote data, record the permitted source, verification date, reviewer, and method in the dataset
metadata, update `verificationStatus`, and add/adjust tests. Do not change statuses to make the UI
look complete.

## Flight providers

`VITE_ENABLE_PROVIDER_LOOKUP=false` by default. Manual entry and deterministic demo flights are
always available. The browser calls a configurable server-side proxy
(`VITE_FLIGHT_PROXY_URL`); no provider secret belongs in a `VITE_` variable or client bundle.

See [flight-provider-proxy.md](./flight-provider-proxy.md) for the proxy contract and
[map-verification.md](./map-verification.md) for the verification checklist.
