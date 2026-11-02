# Deployment

The app is a single Node service that serves the built Vue app and the API. Live flight lookup and
optional accounts need the service; the map and manual/demo journeys work without an external
provider.

## Docker Compose (app + PostgreSQL)

```bash
cp .env.example .env
# Edit .env: set a long random JWT_SECRET and POSTGRES_PASSWORD.
docker compose up --build
```

Open <http://localhost:8787>. The compose file runs PostgreSQL 16 and passes `DATABASE_URL` to the
app. Do not use the example passwords or the development JWT secret in public deployments.

## Render blueprint

1. Push the branch you want to deploy; do not deploy from `main` unless you intend to.
2. In Render, create a new **Blueprint** and select this repository and that branch.
3. Render reads `render.yaml`, creates a free PostgreSQL database, builds the Docker image and runs
   the health check at `/api/health`.
4. Optional: set `AVIATIONSTACK_API_KEY` if you want schedule coverage beyond the BLR board's current
   day. The BLR board needs no key.
5. Keep the web app and API on the same origin. A same-origin request is always allowed.
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
  blr-navigator
```

Provide a managed PostgreSQL database for durable accounts. Without `DATABASE_URL`, the container
uses embedded PGlite under `/app/.data`; that works for a single-instance demo but is not a shared
database.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | production | Enables secure cookies, trusted proxy and production secret checks |
| `PORT` | no | API/HTTP port, default `8787` |
| `JWT_SECRET` | production | Long random value for session tokens |
| `DATABASE_URL` | recommended | PostgreSQL connection string |
| `DATABASE_SSL` | no | Set `true` for providers that require TLS |
| `APP_ORIGIN` | no | Extra comma-separated allowed origins |
| `AVIATIONSTACK_API_KEY` | no | Optional schedule fallback; server-side only |
| `BLR_BOARD_URL` | no | Override the airport board URL if it changes |
| `BLR_GATE_DIRECTORY_URL` | no | Override the airport gate directory URL |

## Post-deploy checks

- `GET /api/health` returns `{"ok":true,...}`.
- The home screen loads and the map tiles show the OSM attribution.
- A live flight lookup returns a current BLR flight, or falls back to manual entry.
- Register/sign in, save a journey, sign out, sign in and load it again.
- Allow location and confirm the map shows a position and live guidance.

## Tiles and OpenStreetMap

The prototype uses the public OpenStreetMap tile server with attribution at low traffic. Before a
high-traffic launch, switch `appConfig.map.tileUrl` to a compliant tile provider or self-hosted
tiles. Keep the OpenStreetMap attribution and ODbL notice. The committed OSM-derived database is
distributed under ODbL 1.0; see `docs/osm-attribution.md`.
