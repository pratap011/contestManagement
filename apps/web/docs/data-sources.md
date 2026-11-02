# BLR Navigator data sources

## What is bundled

| Dataset | Version | Source | Verification |
| --- | --- | --- | --- |
| BLR airport, terminals, floors, POIs, graph | `osm-2026-11-02` | OpenStreetMap extract + OSRM road geometry | `unverified` (OSM) / `inferred` (derived connectors) |
| Live flights | Current airport day | BLR Airport public live board via server proxy | `provider` |
| Other-date flights | User-selected date | Optional Aviationstack key via server proxy | `provider` |
| Manual flights | User input | Passenger | `manual` |
| Demo flights | Deterministic catalogue | Local `demo.ts` | `demo` |
| Optional accounts | — | PostgreSQL / local PGlite | User-controlled |

The exact OSM extraction date, bounding box, source IDs and counts are in
`apps/web/src/data/blr/osm-meta.json`. The generator is `scripts/build-osm-data.mjs`.

## OpenStreetMap derivation

The generator downloads the OSM map extract for `77.695,13.185,77.720,13.212` from the public OSM API.
It extracts:

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
| `verified` | Checked against a reliable, permitted source or on-site validation. | Eligible for a route presented as reliable. The current import has none. |
| `unverified` | Imported from OpenStreetMap but not checked. | Used with a visible data-quality warning. |
| `inferred` | Derived connector, approximate level or entrance. | Dashed; included only when inferred connectors are enabled. |
| `unknown` | No reliable value. | Display as “Not available”; do not invent. |

To promote data, record the permitted source, verification date, reviewer and method in the metadata,
update `verificationStatus`, and adjust tests. Do not change statuses to make the UI look complete.

## T1↔T2 transfer

Public BLR guidance says the terminals are about 600 m apart, with a complimentary shuttle roughly
every 10 minutes and a ride of about 10 minutes. The graph uses the two mapped OSM stops, OSRM/OSM
road geometry, a 10-minute ride and a 5-minute wait allowance. This is a transfer route, not a
guarantee that a passenger is eligible to transit without immigration, security or baggage steps.
The UI warns about this explicitly.

Sources:

- BLR Airport public transfer guidance (complimentary inter-terminal shuttle, stops at T1 departures
  and T1 kerbside, T2 P16/P17 arrivals).
- BLR Airport “Connections by BLR” transfer-service announcement (dedicated transfer desks,
  wayfinding, complimentary inter-terminal shuttle).
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

The board covers the current airport day only. The optional Aviationstack fallback can cover other
dates when `AVIATIONSTACK_API_KEY` is set. Manual entry and demo data always work if both fail.

## Limits

- Indoor corridors are only mapped for part of T2. T1's indoor walkways are inferred from gate/facility
  positions and terminal geometry.
- Some T2 gates on floors 0 and 3 have no mapped indoor corridor. The route ends at a mapped gate
  area and tells the user to confirm the exact gate.
- OSM coverage, tags and gate positions change. Re-run the generator and review the diff before a
  public launch.
- The public OSM tile server is used for the basemap at prototype traffic levels; it is not unlimited
  free tile hosting.
- Step-free flags are OSM-derived, not a wheelchair-accessibility guarantee.
