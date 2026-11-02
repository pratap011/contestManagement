# Map verification and release gate

## Current coverage

| Terminal | Floors | Status | Notes |
| --- | --- | --- | --- |
| T1 | `t1-l1` landside departures, `t1-l2` security/gates | Demo, unverified | Lifts/stairs/escalator, check-in, security, gates A1–A5, lounge, food, restrooms. |
| T2 | `t2-l1` landside departures, `t2-l2` security/gates | Demo, unverified | Lifts/stairs/escalator, check-in, security, gates B1–B4, lounge, food, restrooms. |
| T1↔T2 transfer | Not modelled | Unavailable | The UI warns that transfer guidance is unverified. |

All POIs and edges are hand-curated approximation. No claim is made that a real gate, counter,
restroom, or corridor is at the mapped location.

## What a route currently means

- A* runs over the local graph with passenger-type, step-free, and verification filters.
- The UI opts in to unverified demo edges explicitly and labels every result as a demo route.
- The demo route displays walking time, distance, and floor transitions.
- The app does not draw a guessed route when A* finds no path.
- Step-free mode excludes stairs and escalators, but accessible flags are demo values.

## Access boundaries

Security edges in the demo graph are allowed for `departing` and `connecting` passengers. Edges are
undirected, so a manual route can cross from airside to landside in either direction. The layover
assistant restricts facility suggestions to the departure gate's mapped floor and states that it
does not assume re-entry through security. Before this can be called reliable navigation, the graph
must model:

1. Directional access (landside → airside vs airside → landside).
2. Verified security, immigration, and domestic/international boundaries.
3. Separate ticket/baggage-recheck paths, only where sourced rules permit them.
4. T1↔T2 transfer rules and transport, or an explicit “unavailable” state.

## What must be verified before removing the demo label

- [ ] Permitted source and extraction/validation date recorded for each terminal and floor.
- [ ] Terminal/floor geometry checked against that source.
- [ ] POI names, categories, and coordinates checked (especially gates and counters).
- [ ] Corridor topology and every floor transition checked on site or against a reliable source.
- [ ] Access rules reviewed by someone with airport/airline knowledge.
- [ ] Step-free edges and accessible facilities verified; remove unsupported claims.
- [ ] T1↔T2 transfer guidance sourced or kept explicitly unavailable.
- [ ] Dataset `verificationStatus` and `lastVerifiedAt` updated, with evidence retained.
- [ ] Routing tests re-run; a route is labelled reliable only when all its edges are verified.
- [ ] OSM attribution/ODbL obligations checked if OSM-derived data is present.
- [ ] Emergency/operational changes process defined (gate changes, closures, construction).

## Manual test checklist

- T1 entrance → gate A5, normal and step-free modes.
- T2 entrance → gate B2, normal and step-free modes.
- A route with a floor transition displays the correct lift/stairs/escalator label.
- A staff-only edge is not used for a departing/connecting passenger.
- Staff route cannot cross passenger security edges.
- Unknown origin/destination and disconnected nodes return “no mapped route”.
- T1/T2 terminal switch clears the previous route and does not silently reuse T1 points.
- Layover with missing or unmapped gates does not invent facility suggestions.
- Small-screen map controls and POI search remain usable.

The automated coverage lives in `src/modules/navigation/astar.spec.ts` and
`src/modules/airport-directory/dataset.spec.ts`.
