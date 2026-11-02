# T1↔T2 transfer guidance

The transfer feature combines airport-published procedure with a mapped shuttle route. It does not
decide whether a passenger is eligible to transit.

## Source

- BLR Airport, “Connections by BLR” transfer guidance:
  <https://www.bengaluruairport.com/travellers/services/all-facilities/transfers>
- Retrieved 2 November 2026.

The airport page confirms:

- dedicated transfer desks and transfer zones in the terminals,
- blue and yellow wayfinding signs,
- a complimentary inter-terminal shuttle,
- T1 stop: departure kerb, inner lane next to the Relay outlet,
- T2 stop: arrival kerb, inner lane at pick-up points P16 and P17,
- a T2 bag-drop facility after customs for international-to-domestic passengers, subject to airline
  participation,
- international-to-international passengers should follow the international transfer signs before
  immigration.

## What the app shows

The layover assistant renders three scenario cards:

1. international arrival → domestic departure,
2. domestic arrival → international departure,
3. international arrival → international departure.

Each card lists the airport-published steps and the checks that depend on the passenger's ticket,
baggage and visa. Context answers (same booking, baggage through, formalities) add conservative
warnings. The shuttle edge and both kerbside stops are marked `verified` against the airport source;
walking connectors and the approximate transfer-desk POIs remain `inferred` and are labelled.

## What it does not do

- It does not say a connection is safe, guaranteed or eligible.
- It does not model airline-specific minimum connection times, visa rules or through-check agreements.
- It does not claim the approximate transfer-desk marker is the exact desk location.
- It does not treat the shuttle ride as airside: a terminal change may require leaving security,
  clearing immigration and re-checking baggage.

If any of those rules matter, ask airline staff or a Connections by BLR desk.
