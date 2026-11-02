# BLR Navigator · MVP prototype

A flight-aware, mobile-friendly wayfinding prototype for Kempegowda International Airport (BLR).
It supports departing and layover journeys, manual/demo flight data, a searchable schematic T1/T2
map, A* walking routes, connection timing, and conservative facility suggestions.

> All bundled map and flight data is demonstration data. The floors, gates, and walking edges are
> unverified and are not for live navigation. Airline and airport instructions take precedence.

## Stack

- Vue 3 + TypeScript + Vite
- Pinia for the persisted anonymous journey
- Versioned local JSON airport dataset
- Pure TypeScript A* routing with access and step-free filters
- Vitest unit tests for routing, time calculations, validation, and provider failures

No backend is required for the core app. Live flight lookup is optional and feature-flagged.

## Run

```bash
cd apps/web
npm install
npm run dev
```

Production checks:

```bash
npm run typecheck
npm run test
npm run build
npm run preview
```

Copy `.env.example` to `.env` only if you are enabling the optional provider lookup. Never put a
provider API key in a `VITE_` variable.

## Screens

1. **Home** — journey type, flight number(s), travel date, demo entry points, privacy note.
2. **Flight review** — provider results, manual fallback, provenance badges, explicit confirmation,
   and layover context questions.
3. **Map** — T1/T2 terminal and floor switcher, POI search/categories, origin/destination, A* route,
   step-free mode, floor transitions, and a clear demo-data warning.
4. **Journey assistant** — departure countdown/next steps or layover duration, warnings, required
   checks, and facility suggestions with walking and return-buffer estimates.
5. **Data & privacy** — provenance rules, storage, limitations, OSM/ODbL notes.

## Source of truth

- `src/data/blr/` — versioned demo airport data.
- `src/modules/navigation/` — A*, costs, route validation.
- `src/modules/flights/` — provider interface, demo/manual/HTTP adapters, validation, lookup service.
- `src/modules/journeys/` — connection calculation and facility recommendations.
- `docs/data-sources.md` — dataset and OSM audit status.
- `docs/map-verification.md` — what would be required before calling routes reliable.
- `docs/flight-provider-proxy.md` — optional proxy contract.

## Known limitations

- No verified BLR indoor map, gates, or access rules; all edges are `unverified`.
- No T1↔T2 transfer routing.
- No live positioning or live airport operational feed.
- No accounts, PNR lookup, booking, or check-in.
- Step-free mode is based on demo flags, not a real accessibility audit.
