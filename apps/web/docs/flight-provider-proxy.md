# Optional flight-provider proxy contract

Live lookup is feature-flagged off by default. The browser never holds a provider key; it calls a
server-side proxy configured with `VITE_FLIGHT_PROXY_URL` (default `/api/flights`). The proxy can be
a Cloudflare Worker, Express route, or equivalent, and must keep the API key server-side.

## Request

```http
GET /api/flights?flightNumber=6E%202134&date=2026-11-02
Accept: application/json
```

- `flightNumber` is normalised to `XX 123` form before the request.
- `date` is `YYYY-MM-DD` in airport-local time.
- The proxy should apply its own conservative timeout, caching, rate limit, and provider quota guard.

## Response

Return `200` with either an array or `{ "results": [...] }`:

```json
{
  "results": [
    {
      "flightNumber": "6E 2134",
      "airline": "IndiGo",
      "origin": "BLR",
      "destination": "DEL",
      "scheduledDeparture": "2026-11-02T20:00:00+05:30",
      "scheduledArrival": "2026-11-02T22:25:00+05:30",
      "estimatedDeparture": null,
      "estimatedArrival": null,
      "terminal": "T1",
      "gate": "A3",
      "status": "scheduled",
      "fetchedAt": "2026-11-02T14:30:00.000Z"
    }
  ]
}
```

The client normalises timestamps to ISO UTC, normalises terminal values to `T1`/`T2`, and marks the
result `source: "provider"`. Every timestamp must include an explicit UTC or numeric offset
(`Z`, `+05:30`, `-04:00`); timestamps without an offset are treated as unavailable rather than being
silently read in the browser's timezone. It discards records without a valid flight number and does not silently
substitute a different flight number. `fetchedAt` is used for the freshness label; if the provider
does not return one, the client uses retrieval time.

## Error handling

| Status | Client behaviour |
| --- | --- |
| `429` | “Request limit reached”; manual entry remains available. |
| `401` / `403` | “Not configured correctly”; manual entry remains available. |
| `5xx` | “Unavailable”; manual entry remains available. |
| Timeout | “Timed out”; manual entry remains available. |
| Invalid/malformed JSON | “Could not read data”; manual entry remains available. |
| `200` with no results | “No matching flight”; manual entry remains available. |

## Rules

- Never embed `AVIATIONSTACK_API_KEY` or any provider secret in `VITE_` variables or client JSON.
- Re-check provider terms, free-tier limits, coverage, and non-commercial restrictions before
  enabling lookup in a deployed environment.
- Do not imply a gate or terminal is live unless the provider explicitly supplies it and freshness is
  known.
- Cache conservatively per flight/date within the provider terms; do not hammer a free tier.
- Keep the proxy independent of the map/routing modules so the app works without it.

The adapter implementation is `src/modules/flights/providers/http.ts`; failure-mode tests are in
`src/modules/flights/flights.spec.ts`.
