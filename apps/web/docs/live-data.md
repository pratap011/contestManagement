# Live airport data

All live adapters run on the Node server, cache conservatively and degrade to a clear “unavailable”
state. None of them is a safety or operational-grade feed.

## Checkpoint queues

`GET /api/queues?terminal=T1&direction=departure`

Source: the airport's public queue-management endpoint
(`gateway.bengaluruairport.com/fis/v2/api/qms/general`). It publishes the same checkpoint estimates
shown on terminal displays.

- Values arrive in seconds; the API converts them to minutes.
- Sentinel or negative values (`99999`, `-1`) are treated as “not reported”, not as real waits.
- Walk rows are removed; terminal entrance, check-in, security and immigration/customs rows remain.
- Cached for 60 seconds, then shown in the journey assistant with a retrieval time.
- The departing assistant uses the longest reported security/immigration wait plus the mapped walk to
  the gate for a labelled leave-by estimate. Missing waits or walking times are stated as gaps, not
  treated as zero.
- Excludes walking on the ground, lift waits, bag drop and airline cut-offs. It is never used to label
  a connection safe.

## Weather

`GET /api/weather`

Source: Open-Meteo current conditions at BLR. No key. Cached for 10 minutes. The UI labels it as
context only and never uses it to infer delays.

## Aircraft position

`GET /api/aircraft?flightNumber=6E%205082`

Source: OpenSky Network ADS-B states inside a small BLR approach box. The server maps common BLR
airline IATA codes to ATC callsigns (for example `6E` → `IGO`), caches for 45 seconds and supports
optional OAuth2 credentials through `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`.

- Anonymous access has a smaller daily credit allowance; set credentials for heavier use.
- “Not found” is a valid answer: the aircraft may be outside the box, below coverage or not
  transmitting.
- ADS-B is not a schedule, gate, terminal or connection source. The UI says so.

## Web Push watches

The browser subscribes through the service worker (`public/sw.js`) and the server stores an
anonymous watch in `push_watches`. The scheduler polls the BLR board about every five minutes and
sends notifications for:

- gate changes,
- terminal changes,
- boarding / final call / gate closed,
- a schedule or estimate move of five minutes or more,
- a one-off leave-by reminder at the passenger's chosen lead time.

`GET /api/push/key` returns the VAPID public key and the watch window. `POST /api/push/subscribe`
stores the subscription and flight watch; `POST /api/push/unsubscribe` removes every watch for that
browser endpoint; `POST /api/push/test` sends one test notification. Watches are accepted from the
day before travel through `PUSH_WATCH_DAYS` (default 2). The BLR board covers today; future dates
also need the optional AeroDataBox fallback. State is only advanced after a successful delivery, so a
transient push failure is retried on the next poll.

Production must set a stable `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` pair. Without them the server
creates a local pair under `.data/vapid.json`; that survives a development restart but breaks
subscriptions on an ephemeral redeploy. Push delivery is best-effort and never replaces airport
screens.

## Caching and failure behaviour

| Adapter | Cache | Failure behaviour |
| --- | --- | --- |
| BLR board | 60 s | Manual/demo journeys still work; flight lookup shows a clear error. |
| Gate directory | 10 min | Gate floor is optional; terminal/gate still display. |
| Queues | 60 s | Card shows unavailable; no wait is invented. |
| Weather | 10 min | Card shows unavailable. |
| OpenSky | 45 s | Card says the aircraft is not visible. |
| AeroDataBox | 5 min | Board remains primary; fallback error is reported only if no source works. |
