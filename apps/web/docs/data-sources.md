# Airport Navigator data sources

## What is bundled

| Dataset | Version | Source | Verification |
| --- | --- | --- | --- |
| BLR airport, terminals, floors, POIs, graph | `osm-2026-11-02` | OpenStreetMap extract + OSRM road geometry | `unverified` (OSM) / `inferred` (derived connectors) |
| DEL, BOM, HYD, MAA, CCU terminal datasets | `osm-2026-11-02` | OpenStreetMap API bbox extract + airport transfer pages | `unverified` (OSM) / `inferred` (schematic connectors) |
| Live flights | Current airport day | BLR Airport public live board via server proxy | `provider` |
| Other-date flights | User-selected date | Optional AeroDataBox key via server proxy | `provider` |
| Checkpoint queues | Live, cached 60 s | BLR Airport public queue displays via server proxy | `provider` |
| Weather context | Live, cached 10 min | Open-Meteo | `provider` |
| Aircraft position | Live, cached 45 s | OpenSky Network ADS-B | `provider` |
| Manual flights | User input | Passenger | `manual` |
| Demo flights | Deterministic catalogue | Local `demo.ts` | `demo` |
| Optional accounts | — | PostgreSQL / local PGlite | User-controlled |

The exact BLR extraction date, bounding box, source IDs and counts are in
`apps/web/src/data/airports/blr/osm-meta.json`. The BLR generator is
`scripts/build-osm-data.mjs`. The other airports use `scripts/build-airport-datasets.mjs` and store
their metadata beside each dataset in `apps/web/src/data/airports/<code>/meta.json`.

## Multi-airport catalogue

The web app loads one dataset lazily from
`apps/web/src/data/airports/<code>/index.ts`. The catalogue in
`apps/web/src/modules/airport-directory/catalog.ts` supplies the selector, terminal summaries and
live-data capabilities. The server has a matching code, timezone, centre and OpenSky bounding box in
`server/airports.ts`.

To add another airport:

1. Add its dataset folder under `apps/web/src/data/airports/<code>/` with an `index.ts` default export.
2. Add the lazy loader in `modules/airport-directory/registry.ts`.
3. Add the catalogue entry and server metadata.
4. Add tests for dataset validation, terminal/gate matching and any live-data capability.
5. Regenerate or extend the data using a permitted source, and record provenance in `meta.json`.

BLR has mapped indoor corridors, live airport queues and the airport-confirmed T1↔T2 shuttle. The
other bundled airports (DEL, BOM, HYD, MAA, CCU) are **schematic terminal-level** datasets: OSM gives
terminal footprints, mapped gates and named facilities, while the hall, entrance, security and gate
connectors are inferred. DEL and BOM include airport-published inter-terminal shuttle edges; the stop
directions come from the airport, but the drawn geometry is a straight schematic connector.

## OpenStreetMap derivation

The BLR generator downloads the OSM map extract for `77.695,13.185,77.720,13.212` through the
Overpass API, with the OSM API bbox endpoint as a fallback when Overpass is at capacity. The other
airports use the OSM API bbox endpoint directly for a small terminal-area extract. The generators
extract:

- T1 footprint (OSM way `60046909`) and T2 footprint (relation `13779616`, outer way `1029667204`).
- `aeroway=gate` positions for T1 and T2.
- Mapped indoor corridors, footways, steps and lifts.
- Shops, food, restrooms, entrances, transport stops and other named facilities.
- Terminal 2 indoor room polygons for the level-1 retail area.
- The two mapped inter-terminal shuttle stops.

It then derives airport routing data:

- Node/edge chains from consecutive OSM way points, using `level` and `indoor` tags.
- Haversine distances and walking times at 1.25 m/s (0.6 m/s stairs, 0.8 m/s escalator, 30 s lift).
- Passenger access from `access`/`foot` tags; step-free flags from `wheelchair`, stairs and escalators.
- Gate spines and POI access connectors where OSM has gate/facility points but no mapped walkway.
- Approximate terminal entrance, hall and vertical connectors.
- A T1↔T2 shuttle edge between the mapped stops, with road geometry from the OSRM demo server.

All OSM-derived edges are marked `unverified` because they have not been field-checked. Every derived
connector is marked `inferred` and drawn dashed. The app includes both by default but lets the user
turn inferred connectors off.

## Verification statuses

| Status | Meaning | Routing policy |
| --- | --- | --- |
| `verified` | Checked against a reliable, permitted source or on-site validation. | Eligible for a route presented as reliable. Only the airport-confirmed inter-terminal shuttle and its two kerbside stops currently use this status. |
| `unverified` | Imported from OpenStreetMap but not checked. | Used with a visible data-quality warning. |
| `inferred` | Derived connector, approximate level or entrance. | Dashed; included only when inferred connectors are enabled. |
| `unknown` | No reliable value. | Display as “Not available”; do not invent. |

To promote data, record the permitted source, verification date, reviewer and method in the metadata,
update `verificationStatus`, and adjust tests. Do not change statuses to make the UI look complete.

## Inter-terminal transfers

BLR: Public guidance says the terminals are about 600 m apart, with a complimentary shuttle roughly
every 10 minutes and a ride of about 10 minutes. The graph uses the two mapped OSM stops, OSRM/OSM
road geometry, a 10-minute ride and a 5-minute wait allowance. The airport's “Connections by BLR”
page confirms the shuttle, the T1 departure-kerb stop next to Relay and the T2 arrival-kerb stops at
P16/P17. The shuttle edge and stop POIs are marked `verified` against that source; the road geometry
is still OSRM-derived. This is a transfer route, not a guarantee that a passenger is eligible to
transit without immigration, security or baggage steps. The UI warns about this explicitly and
renders the three airport-published transfer scenarios. See `docs/transfer-guidance.md`.

DEL: the airport publishes a complimentary shuttle between T1, T2 and T3 every 20 minutes, 24x7, with
published stop locations. BOM: the airport publishes a complimentary T1↔T2 coach, 24x7, every 25
minutes, with stops at the T1 arrival exit and T2 Level 1 (P4). These edges are marked `unverified`
because the connector geometry is schematic; the stop directions and service existence come from the
airport. HYD, MAA and CCU do not have an inter-terminal shuttle edge in this dataset.

Sources:

- BLR Airport “Connections by BLR” transfer guidance (dedicated transfer desks, blue/yellow signage,
  shuttle stops, T2 bag drop, international transfer desk).
- Delhi Airport Inter-Terminal Shuttle Service page.
- CSMIA Mumbai Inter Terminal Coach Facility page.
- OpenStreetMap stop and road geometry.

## Live flights

The primary provider is the BLR Airport public flight board
(`/fis/v2/api/aodb/flights`) plus the public gate directory (`/fis/v2/api/aodb/gates`). The server:

- calls the board server-side with the required origin/referer headers,
- caches the board for 60 seconds and the gate directory for 10 minutes,
- filters by flight number and departure/arrival role,
- maps airport-local timestamps to ISO with the fixed `+05:30` offset,
- returns terminal, gate and gate floor when supplied,
- rate-limits client requests and never exposes a key to the browser.

The board covers the current airport day only. The optional AeroDataBox fallback can cover other
dates when `AERODATABOX_API_KEY` is set; its free plan is non-commercial and requires attribution.
Manual entry and demo data always work if both fail.

The same server proxy pattern supplies the live queue displays, Open-Meteo weather context and
OpenSky aircraft positions. Each has its own short cache, rate limit and explicit “unavailable”
state; see `docs/live-data.md`.

## Limits

- BLR indoor corridors are only mapped for part of T2. T1's indoor walkways are inferred from
  gate/facility positions and terminal geometry.
- DEL, BOM, HYD, MAA and CCU use inferred hall/gate connectors rather than mapped indoor corridors.
  Treat their routes as terminal-level guidance, not surveyed indoor navigation.
- Some T2 gates on floors 0 and 3 have no mapped indoor corridor. The route ends at a mapped gate
  area and tells the user to confirm the exact gate.
- OSM coverage, tags and gate positions change. Re-run the generator and review the diff before a
  public launch.
- The basemap is OpenFreeMap vector tiles (no key, no per-request tile limit), with MapLibre GL. Keep
  the OpenFreeMap, OpenMapTiles and OpenStreetMap/ODbL attribution visible.
- Aircraft ADS-B positions are not a schedule or gate feed and can be missing indoors or outside the
  approach box.
- Step-free flags are OSM-derived, not a wheelchair-accessibility guarantee.
