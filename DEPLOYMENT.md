# Deployment

The app is a single Node service that serves the built Vue app and the API. Live flight lookup and
optional accounts need the service; the map and manual/demo journeys work without an external
provider.

## Docker Compose (app + frontend + PostgreSQL)

Requires Docker with Compose v2. No `.env` or manual setup is required:

```bash
docker compose up --build
```

Open <http://localhost:8787>. Compose starts PostgreSQL 16 and one app container that builds the Vue
app and serves it alongside the API. On boot the server creates the tables in PostgreSQL.

- `docker compose down` stops the stack and keeps data.
- `docker compose down -v` also deletes the database, accounts and generated keys.
- The image entrypoint creates a random `JWT_SECRET` on first run and stores it in the `appdata`
  volume, so sessions survive container restarts. Web Push keys are stored in the same volume.
- Optional overrides go in a local `.env`: `POSTGRES_PASSWORD`, `JWT_SECRET`,
  `AERODATABOX_API_KEY` (plus `AERODATABOX_GATEWAY=direct` for direct keys), stable
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, or OpenSky credentials.
- The database is not published on the host. If you change `POSTGRES_PASSWORD` after the volume was
  created, run `docker compose down -v` before starting again.
- Compose passes the password separately from `DATABASE_URL`, so it can contain URL-reserved
  characters.

For a shared host, use a managed PostgreSQL database, set `JWT_SECRET`, `POSTGRES_PASSWORD` and the
Push keys explicitly as environment variables, and do not rely on the local defaults. See
`render.yaml` for a production example.

## Render blueprint

1. Push the branch you want to deploy; do not deploy from `main` unless you intend to.
2. In Render, create a new **Blueprint** and select this repository and that branch.
3. Render reads `render.yaml`, creates a free PostgreSQL database, builds the Docker image and runs
   the health check at `/api/health`.
4. Optional: set `AERODATABOX_API_KEY` for future dates and for DEL/BOM/HYD/MAA/CCU. Keep the
   default RapidAPI gateway, or set `AERODATABOX_GATEWAY=direct` if the key came from AeroDataBox
   directly. The BLR board, queue displays and weather need no key. Run `npm run flights:check`
   locally with the same key to verify coverage before deploying.
5. Set a stable `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` pair if you want Web Push subscriptions to
   survive redeploys. Generate one with
   `node -e "console.log(require('web-push').generateVAPIDKeys())"`.
6. Keep the web app and API on the same origin. A same-origin request is always allowed.
   `APP_ORIGIN` only adds another allowed page origin for the same-site API; it does not add CORS or
   cross-site cookie support.

Free-tier limits, database expiry and provider terms change; check them before a public launch.

## Any Docker host (Railway, Fly.io, a VPS)

```bash
docker build -t blr-navigator .
docker run -p 8787:8787 \
  -e NODE_ENV=production \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e DATABASE_URL="postgres://user:password@host:5432/blr_navigator" \
  -e DATABASE_SSL=true \
  -v blr-data:/app/.data \
  blr-navigator
```

Provide a managed PostgreSQL database for durable accounts. Without `DATABASE_URL`, the container
uses embedded PGlite under `/app/.data`; that works for a single-instance demo but is not a shared
database. Mount `/app/.data` as a volume if you want PGlite data, the generated session secret and
Web Push keys to survive container replacement.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | production | Enables secure cookies, trusted proxy and production secret checks |
| `PORT` | no | API/HTTP port, default `8787` |
| `JWT_SECRET` | production | Long random value for session tokens; the Docker entrypoint generates and persists one if omitted |
| `JWT_SECRET_FILE` | no | Where the Docker entrypoint stores an auto-generated secret, default `.data/jwt-secret` |
| `DATABASE_URL` | recommended | PostgreSQL connection string |
| `DATABASE_SSL` | no | Set `true` for providers that require TLS |
| `APP_ORIGIN` | no | Extra comma-separated allowed origins |
| `AERODATABOX_API_KEY` | no | Live lookup for future dates and non-BLR airports; server-side only, non-commercial free plan |
| `AERODATABOX_GATEWAY` | no | `rapidapi` (default) or `direct`, matching the key source |
| `AERODATABOX_BASE_URL` | no | Override the provider gateway URL |
| `AERODATABOX_CACHE_TTL_MS` | no | Positive-result cache, default 15 minutes |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | production push | Stable Web Push keypair; without it keys are local/ephemeral |
| `VAPID_SUBJECT` | no | Contact mailto for VAPID |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | no | Optional higher OpenSky ADS-B allowance |
| `BLR_BOARD_URL` | no | Override the airport board URL if it changes |
| `BLR_GATE_DIRECTORY_URL` | no | Override the airport gate directory URL |
| `BLR_QUEUE_URL` | no | Override the airport queue endpoint if it changes |
| `PUSH_POLL_INTERVAL_MS` | no | Live-board polling interval, default 5 minutes |

## Post-deploy checks

- `GET /api/health` returns `{"ok":true,...}`.
- `GET /api/flights/status` shows whether the provider is configured and which airports/dates it covers.
- The home screen loads and the map tiles show the OSM attribution.
- A live flight lookup returns a current BLR flight; with a provider key, also check a future date at DEL/BOM/HYD/MAA/CCU, or fall back to manual entry.
- The journey assistant shows live checkpoint waits, or a clear unavailable state.
- Register/sign in, save a journey, sign out, sign in and load it again.
- Allow location and confirm the map shows a position and live guidance.
- Enable notifications, receive the test notification, then change a watched flight state if you can
  and confirm a gate/status notification arrives.

## Tiles and OpenStreetMap

The basemap uses OpenFreeMap's free vector tiles (`appConfig.map.styleUrl`) rendered with MapLibre GL.
OpenFreeMap needs no API key, has no per-request tile limit and permits commercial use under its
current terms. Keep the OpenFreeMap, OpenMapTiles and OpenStreetMap/ODbL attribution visible. The
committed OSM-derived database is distributed under ODbL 1.0; see
`apps/web/docs/osm-attribution.md` and `apps/web/docs/map-verification.md`.
