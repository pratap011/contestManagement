# Map verification and release gate

## Current coverage

| Area | Mapped data | Status | Notes |
| --- | --- | --- | --- |
| T1 footprint | OSM terminal way | Unverified | Real footprint, not field-checked for entrances. |
| T1 gates 1–8, 18–20 | OSM gate nodes + airport gate floor directory | Unverified positions | Gate spines/connectors are inferred. Live gates without a point fall back to the T1 gate area. |
| T1 shops/food/restrooms/transport | OSM nodes | Unverified | Indoors/outside assignment uses tags and terminal geometry. |
| T2 footprint | OSM relation outer way | Unverified | Real footprint. |
| T2 Level 1 indoor corridor | OSM `indoor=corridor`/`highway=corridor` ways | Unverified | Main mapped retail corridor. |
| T2 C1–C6, D1–D7 gates | OSM gate nodes + airport gate floor directory | Unverified positions | Connected to the Level 1 corridor through inferred spines. |
| T2 D2/D3, D8–D13 gates | OSM gate nodes, Level 3 | Unverified positions | No mapped Level 3 corridor; route ends at the domestic gate area. |
| T2 Level 0/3 facilities | Sparse OSM coverage | Unverified | Routes may end at a mapped gate area rather than an exact facility. |
| T1↔T2 shuttle | OSM stops + OSRM road route + public service guidance | Inferred | Ride ~10 min, wait allowance 5 min. Eligibility/security not verified. |
| Step-free access | OSM `wheelchair`, stairs/escalator tags | Unverified | Not a real accessibility audit. |

All POIs and edges are approximations. No claim is made that a real gate, counter, restroom or
corridor is exactly at the mapped location.

## What a route means

- A* runs over the OSM-derived graph with passenger-type and step-free filters.
- OSM edges are `unverified`; derived gate spines, entrance/level connectors and access paths are
  `inferred` and drawn dashed.
- The map shows the route only when A* finds a path. If no path exists, it explains that mapped data
  is incomplete rather than drawing a guessed route.
- The route summary shows walking time, distance, floor transitions, inferred segments, shuttle use
  and a data-quality warning.
- Device location is snapped to the nearest mapped node that can reach the destination within 300 m.
  It is not a blue-dot indoor positioning system.

## Access boundaries

- The graph carries `allowedPassengerTypes` and `accessible` flags.
- Security/immigration boundaries are **not** modelled as directional access rules. The T1↔T2 route
  may use the landside shuttle; the UI warns that a terminal change can require leaving the secure
  area, re-clearing formalities and re-checking baggage.
- For a reliable airside product, the graph must model:
  1. Directional landside/airside access.
  2. Verified security, immigration and domestic/international boundaries.
  3. Separate-ticket and baggage-recheck paths only where sourced rules permit them.
  4. T1↔T2 transfer eligibility rules by ticket/airline, or keep the warning explicit.

## Before removing the unverified label

- [ ] Record the permitted source and extraction/validation date for each terminal and floor.
- [ ] Field-check terminal/floor geometry and entrances.
- [ ] Field-check gate positions, especially gates not individually mapped in OSM.
- [ ] Walk every corridor, stair, escalator and lift used by the route graph.
- [ ] Verify access rules with airport/airline knowledge.
- [ ] Verify step-free routes and accessible facilities; remove unsupported claims.
- [ ] Verify T1↔T2 transfer eligibility and security/baggage procedure.
- [ ] Update `verificationStatus`/`lastVerifiedAt`, retain evidence and re-run tests.
- [ ] Check OSM attribution and ODbL obligations.
- [ ] Define a process for gate changes, closures and construction.

## Manual test checklist

- T1 kerbside → mapped gate, normal and step-free modes.
- T2 kerbside → C gates through the mapped indoor corridor.
- Live gate without a mapped point → gate-area fallback with an explicit message.
- T1→T2 route includes the blue shuttle segment and a transfer warning.
- A route with a floor transition shows the lift/stairs/escalator step.
- Step-free mode never uses stairs or escalators.
- Unknown origin/destination or disconnected nodes return “no mapped route”.
- GPS at the start, mid-route and destination updates remaining time and current step.
- GPS far from the mapped network shows no route instead of snapping to a dead end.
- Small-screen map controls, search and route summary remain usable.

Automated coverage lives in `src/modules/navigation/astar.spec.ts`,
`src/modules/navigation/directions.spec.ts`, `src/modules/airport-directory/dataset.spec.ts` and
`src/modules/journeys/connection.spec.ts`.
