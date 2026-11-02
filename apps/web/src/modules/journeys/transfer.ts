import type { ConnectionContext } from './connection'

export interface TransferScenario {
  id: 'international-domestic' | 'domestic-international' | 'international-international'
  label: string
  summary: string
  steps: string[]
  checks: string[]
}

export const TRANSFER_SOURCE = {
  name: 'Connections by BLR',
  operator: 'Bangalore International Airport Limited',
  url: 'https://www.bengaluruairport.com/travellers/services/all-facilities/transfers',
  retrievedAt: '2026-11-02',
  signage:
    'Follow the blue and yellow Connections by BLR wayfinding signs. Dedicated transfer desks and transfer zones are available in both terminals.',
  t1ShuttleStop: 'T1 departure kerb: inner lane next to the Relay outlet.',
  t2ShuttleStop: 'T2 arrival kerb: inner lane at pick-up points P16 and P17.',
  bagDrop:
    'At T2, a bag-drop facility after the customs zone lets international-to-domestic passengers hand checked bags to the next airline. Availability depends on the airline.',
  deskNote:
    'Transfer desks are staffed by airlines and the airport. Confirm eligibility, documents and baggage routing there.',
} as const

export const TRANSFER_SCENARIOS: TransferScenario[] = [
  {
    id: 'international-domestic',
    label: 'International arrival → domestic departure',
    summary:
      'Immigration and customs are required. Baggage usually has to be collected unless it was through-checked to the final domestic destination.',
    steps: [
      'Follow the arrivals flow through immigration and customs.',
      'Collect your checked baggage unless it is tagged through to your final domestic destination.',
      'If you are at T2, look for the bag-drop facility immediately after the customs zone; otherwise keep your bags.',
      'Check the departure terminal on your e-ticket or a flight display. If it differs, follow signage to the complimentary inter-terminal shuttle.',
      'At the departure terminal, check in or hand over baggage at your airline counter, then clear security and any required emigration.',
      'Follow the gate signage and confirm the gate and boarding time on airport screens.',
    ],
    checks: [
      'Confirm whether your bag is checked through before leaving the arrival hall.',
      'A separate ticket normally means you must check in again.',
      'Do not assume an airside transfer is available; ask at a Connections by BLR transfer desk.',
    ],
  },
  {
    id: 'domestic-international',
    label: 'Domestic arrival → international departure',
    summary:
      'If you already have a boarding pass and your bag is through-checked, you may be able to use the transfer route. Otherwise collect your bag and check in again.',
    steps: [
      'Check whether your bag is tagged through to the international destination and whether you already hold the onward boarding pass.',
      'If both are true, follow the Connections by BLR signs towards the international transfer area and complete immigration and security as directed.',
      'If either is not true, collect your baggage and go to your airline check-in counter. Use the inter-terminal shuttle if your onward flight leaves from the other terminal.',
      'Complete emigration and security, then go to the departure gate.',
      'Confirm the gate and boarding time on airport screens.',
    ],
    checks: [
      'A separate ticket normally means you must collect baggage and check in again.',
      'Keep enough time for immigration, security and a possible terminal change.',
      'Ask the transfer desk or your airline if you are unsure about transit eligibility.',
    ],
  },
  {
    id: 'international-international',
    label: 'International arrival → international departure',
    summary:
      'Follow the dedicated international transfer signs before the immigration counters. A transfer desk can prepare the documents your onward airline needs.',
    steps: [
      'Follow the signs for international transfers before reaching immigration.',
      'Go to the Connections by BLR transfer desk and show your passport, onward ticket and boarding pass if you have one.',
      'The airline may need time to prepare transfer documents; tell staff at the arrival gate if you have a tight connection.',
      'Complete the security check directed by staff, then proceed to the departure gate.',
      'If your baggage is not through-checked, ask the transfer desk whether you must clear immigration and collect it.',
    ],
    checks: [
      'Transit rules depend on your nationality, visa and airline; the app cannot decide eligibility.',
      'A transfer desk may need to retain your passport or ticket while documents are prepared.',
      'If you leave the secure area, you may need a visa or transit visa. Confirm before doing so.',
    ],
  },
]

export function transferWarnings(
  context: ConnectionContext | null | undefined,
  terminalsDiffer: boolean,
): string[] {
  const warnings: string[] = []
  if (terminalsDiffer) {
    warnings.push(
      'This connection changes terminals. Use the airport-published inter-terminal transfer and allow for the wait, the ride, and a second security check.',
    )
  }
  if (context?.sameBooking === 'no') {
    warnings.push(
      'Separate tickets usually mean you must collect baggage and check in again. Do not rely on an airside transfer.',
    )
  }
  if (context?.baggageThrough === 'no') {
    warnings.push(
      'You told us baggage is not checked through. Collect it and re-check it before your onward flight.',
    )
  }
  if (context?.needsFormalities === 'yes') {
    warnings.push(
      'You told us formalities may be required. Follow airport signage and staff instructions for immigration, customs or security.',
    )
  }
  if (
    context?.sameBooking === 'unknown' ||
    context?.baggageThrough === 'unknown' ||
    context?.needsFormalities === 'unknown'
  ) {
    warnings.push(
      'Some transfer details are still unknown. Confirm them with your airline or the airport transfer desk.',
    )
  }
  return warnings
}
