# Airport Navigator

A flight-aware, mobile-friendly navigator for major Indian airports. It combines live flight lookup
with OpenStreetMap-derived terminal geometry, A* walking routes, device location, terminal transfer
guidance, day-of Web Push alerts for BLR, dark/light themes and optional accounts.

Bundled airports: **BLR** (Bengaluru), **DEL** (Delhi), **BOM** (Mumbai), **HYD** (Hyderabad),
**MAA** (Chennai) and **CCU** (Kolkata). BLR has mapped indoor corridors and live airport queues; the
others use schematic terminal-level routes with inferred connectors.

> OpenStreetMap data is not field-verified. Some entrance, level and connector segments are
> inferred and drawn as dashed lines. Indoor GPS can be inaccurate. Airport signs, airline
> instructions and staff take precedence.

## Features

- Departing and layover journeys without an account.
- Live BLR airport board (other airports use the configured provider): airline, route,
  scheduled/estimated times, terminal, gate and gate floor.
- Optional AeroDataBox fallback for other dates and airports when an API key is configured.
- Manual entry and deterministic demo flights when live lookup is unavailable.
- Flight review with provenance badges, retrieval time, stale handling and explicit confirmation.
- Live airport checkpoint waits, Open-Meteo weather context and OpenSky ADS-B aircraft position.
- OpenStreetMap terminal footprints, mapped gates, corridors, shops, restrooms and transport stops.
- OpenFreeMap/MapLibre vector map with T1/T2 and floor switching, search, category filters, pan/zoom.
- A* routing with passenger-type rules, step-free mode and optional inferred connectors.
- Live navigation: device position, accuracy, next step, remaining time and off-route warning.
- T1↔T2 transfer route and airport-published Connections by BLR scenarios for all three
  international/domestic combinations, plus published T1/T2/T3 (DEL) and T1↔T2 (BOM) shuttle edges.
- Departure leave-by estimate: boarding allowance, mapped walk to the gate and the airport's
  reported checkpoint waits, with missing parts shown as gaps.
- Layover connection timing, context questions, required checks and time-buffered facility suggestions.
- Installable PWA with an app-shell cache and optional Web Push watches for gate, terminal, status,
  time and leave-by alerts.
- Optional email/password account that syncs the latest journey across devices.
- Fully responsive UI and an OpenStreetMap/ODbL attribution page.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Vue 3, TypeScript, Vite, Pinia, MapLibre GL |
| Map | OpenFreeMap vector tiles + committed OSM-derived JSON |
| Routing | Pure TypeScript A* with access and step-free filters |
| API | Node 24 + Express 5 |
| Database | PostgreSQL in production and Docker Compose; embedded PGlite for plain local development |
| Auth | Email/password, scrypt hashing, HTTP-only SameSite cookie |
| Flight data | BLR public live board server proxy; optional AeroDataBox for other airports |
| Live context | BLR queue displays, Open-Meteo, OpenSky ADS-B |
| Airports | BLR, DEL, BOM, HYD, MAA, CCU (lazy datasets, one catalogue entry each) |
| Notifications | Web Push (VAPID) + service worker |
| Tests | Vitest across the web app and API |

## Quick start with Docker

Requires Docker with Compose v2. No `.env`, database install or secret generation is needed.

```bash
docker compose up --build
```

Open <http://localhost:8787>. Compose starts PostgreSQL 16 and one app container that builds the Vue
app and serves it with the API. Tables are created on first boot, and a session secret plus Web Push
keys are generated once and kept in Docker volumes, so accounts and notification subscriptions
survive restarts.

```bash
docker compose down       # stop; keep the database and generated secrets
docker compose down -v    # stop and delete all local data
```

Optional settings (`AERODATABOX_API_KEY`, stable VAPID keys, a custom database password) can be put in
a local `.env`; see [`.env.example`](.env.example). `docker compose up` rebuilds nothing by itself, so
use `--build` after pulling changes.

## Run locally without Docker

```bash
npm install
npm --prefix apps/web install

# Terminal 1: API + auth + live flight proxy (http://localhost:8787)
npm run dev:server

# Terminal 2: Vite app (http://localhost:5173, proxies /api to 8787)
npm run dev:web
```

Copy `.env.example` to `.env` if you want to change the port, enable PostgreSQL, set a real
`JWT_SECRET`, add an AeroDataBox key, or configure stable VAPID keys. Without `DATABASE_URL`, the
API uses a local PostgreSQL-compatible PGlite database in `.data/pglite`.

Production-style single process:

```bash
npm run build:web
npm start
```

`npm start` serves `apps/web/dist` and the API from port 8787.

## Checks

```bash
npm test                 # web unit tests + API tests
npm run typecheck        # server + web TypeScript
npm run build:web        # production bundle
npm run data:osm         # refresh the BLR OSM-derived dataset
npm run data:airports    # refresh DEL/BOM/HYD/MAA/CCU schematic datasets
```

## Live flight data

The server calls the BLR airport's public flight board and caches the response. For the other
airports it goes straight to the optional AeroDataBox provider. The browser never receives provider
credentials. If lookup is unavailable, the review screen falls back to manual entry; demo flights are
always deterministic and selected per airport.

The BLR board covers the current airport day. For other dates or airports, set
`AERODATABOX_API_KEY` on the server or use manual entry. Never put a provider key in a `VITE_`
variable. The free AeroDataBox plan is non-commercial and needs attribution, which the flight summary
shows.

Checkpoint waits come from the airport's public queue displays, weather from Open-Meteo and aircraft
positions from OpenSky ADS-B. Each is cached and optional; see
[`apps/web/docs/live-data.md`](apps/web/docs/live-data.md).

## OpenStreetMap data

`apps/web/src/data/airports/blr/` is generated by `scripts/build-osm-data.mjs` from an OpenStreetMap
extract fetched through Overpass (with the OSM API bbox endpoint as a fallback). The other airport
folders are generated by `scripts/build-airport-datasets.mjs` from small OSM API extracts. The
committed files allow the app to run without an OSM API dependency. Each folder records its extraction
date, bounding box, source IDs and inferred connectors.

Adding an airport is intentionally small: add a dataset folder with a default `index.ts` export, add
its lazy loader in `modules/airport-directory/registry.ts`, and add a catalogue entry plus server
metadata. See [`apps/web/docs/data-sources.md`](apps/web/docs/data-sources.md).

- OSM data © OpenStreetMap contributors, ODbL 1.0.
- Attribution is shown on the map, in the footer, and on the Data & privacy page.
- Mapped walking edges are marked `unverified`; derived connectors are `inferred`.
- The BLR airport-confirmed inter-terminal shuttle and its two kerbside stops are marked `verified`.
  DEL/BOM shuttle edges are unverified because their geometry is schematic.
- Basemap tiles come from OpenFreeMap with MapLibre GL; keep OpenFreeMap, OpenMapTiles and OSM/ODbL
  attribution visible.
- Refresh with `npm run data:osm -- --refresh`, then review the diff and run the checks.

## Accounts and privacy

Accounts are optional. Only an email, a scrypt password hash, and the latest confirmed journey are
stored. No PNR, passport, date of birth, payment data or itinerary analytics are requested. The
anonymous app keeps the journey in `localStorage` and works if storage is unavailable.

## Notifications and offline shell

The built app registers `public/sw.js` and is installable from `manifest.webmanifest`. Notifications
are optional and anonymous: a browser subscription is stored with a flight watch, and the server
polls the BLR live board for changes. Watches are currently offered for BLR only. Set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in production so
subscriptions survive redeploys. See [`apps/web/docs/live-data.md`](apps/web/docs/live-data.md).

## Deployment

The repository includes a multi-stage `Dockerfile`, a zero-config `docker-compose.yml` (app +
PostgreSQL) and a `render.yaml` blueprint. See [`DEPLOYMENT.md`](DEPLOYMENT.md). The app is
static-first and portable; the API is required for live flight/queue/aircraft data, notifications and
optional accounts.

## Repository layout

```text
apps/web/               Vue app, map, routing, tests, committed airport datasets
server/                 Express API, auth, PostgreSQL/PGlite, flight proxy
scripts/build-osm-data.mjs      BLR OSM + OSRM dataset generator
scripts/build-airport-datasets.mjs  schematic datasets for DEL/BOM/HYD/MAA/CCU
apps/web/docs/          data sources, live data, transfers, map verification, attribution
Dockerfile              production image
docker/                 container entrypoint (generates a local session secret)
docker-compose.yml      zero-config app + PostgreSQL stack
render.yaml             one-click Render blueprint
```
