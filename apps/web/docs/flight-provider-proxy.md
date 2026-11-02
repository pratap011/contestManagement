# Live flight lookup and proxy contract

Live lookup is **enabled by default**. The browser never holds a provider key; it calls the API at
`/api/flights` (or `VITE_FLIGHT_PROXY_URL` if configured). The API is implemented in
`server/flights.ts` and does not need a separate Worker for this deployment.

## Sources

1. **Primary: BLR Airport public live board**
   - Board: `https://gateway.bengaluruairport.com/fis/v2/api/aodb/flights`
   - Gate directory: `https://gateway.bengaluruairport.com/fis/v2/api/aodb/gates`
   - Covers the current airport day.
   - Supplies airline, route, scheduled/estimated times, status, terminal, gate and gate floor.
   - Requested server-side with the public website origin/referer headers.
   - Cached for 60 seconds (board) and 10 minutes (gate directory).
2. **Optional fallback: AeroDataBox**
   - Enabled only when `AERODATABOX_API_KEY` is set on the server.
   - Useful for dates outside the current airport day; free plan is non-commercial and requires
     attribution.
   - Calls `https://aerodatabox.p.rapidapi.com/flights/number/{flight}/{date}` with the key only on
     the server. Keeps scheduled and revised times separate and normalises terminal labels.
3. **Manual entry** and **demo flights** always remain available.

## Request

```http
GET /api/flights?flightNumber=6E%205082&date=2026-11-02&role=departure
Accept: application/json
```

- `flightNumber` is validated and normalised to `XX 123` form.
- `date` is `YYYY-MM-DD` in airport-local time.
- `role` is optional: `departure`, `arrival` or `connection`. `departure`/`connection` select departures
  from BLR; `arrival` selects arrivals at BLR.
- The server applies a timeout, rate limit, board cache and provider fallback.

## Response

`200` with:

```json
{
  "results": [
    {
      "flightNumber": "6E 5082",
      "airline": "IndiGo",
      "origin": "BLR",
      "destination": "BOM",
      "scheduledDeparture": "2026-11-02T19:00:00.000Z",
      "estimatedDeparture": "2026-11-02T19:20:00.000Z",
      "terminal": "T1",
      "gate": "33",
      "gateFloor": 1,
      "status": "Delayed",
      "source": "provider",
      "provider": "blr-airport-board",
      "direction": "departure",
      "fetchedAt": "2026-11-02T13:30:00.000Z"
    }
  ],
  "provider": "blr-airport-board",
  "fetchedAt": "2026-11-02T13:30:00.000Z"
}
```

The client normalises timestamps to ISO UTC, terminal values to `T1`/`T2`, and marks results
`source: "provider"`. Every timestamp must include an explicit offset; timestamps without one are
treated as unavailable. The client discards records without a valid flight number and never
substitutes a different flight number. `fetchedAt` drives the freshness label.

## Error handling

| Status | Meaning | Client behaviour |
| --- | --- | --- |
| `400` | Invalid flight number/date | Shows validation copy; manual entry remains. |
| `429` | Local rate limit or provider quota | Shows quota copy; manual entry remains. |
| `502` | Provider unavailable or rejected | Shows unavailable copy; manual entry remains. |
| `504` | Provider timeout | Shows timeout copy; manual entry remains. |
| `200` with empty results | No match on the current board | Offers manual entry; explains the board covers today. |

## Security rules

- Never put `AERODATABOX_API_KEY` or any provider secret in a `VITE_` variable or client bundle.
- Keep the API server-side and rate-limited.
- Cache conservatively; do not hammer the airport's public endpoint.
- Re-check the airport endpoint's terms and AeroDataBox's current free-tier/non-commercial terms
  before a high-traffic public launch. Keep the required AeroDataBox attribution visible.
- Do not imply a gate or terminal is live unless the source supplies it and freshness is known.

The client adapter is `src/modules/flights/providers/http.ts`; API tests mock the board, gate
directory and AeroDataBox in `server/app.test.ts` and `server/live-data.test.ts`; client failure-mode
tests are in `src/modules/flights/flights.spec.ts`.
