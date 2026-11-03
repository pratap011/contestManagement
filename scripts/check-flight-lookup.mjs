// Verifies the configured live-flight path without hardcoded keys or dates.
// Usage: npm run flights:check -- "6E 5082" 2026-12-03 DEL departure
import 'dotenv/config'
import {
  flightLookupStatus,
  isValidFlightNumber,
  isValidTravelDate,
  searchLiveFlights,
} from '../server/flights.ts'

const [flightNumber, date, airport = 'BLR', role = 'departure'] = process.argv.slice(2)
const status = flightLookupStatus()

console.log('Live flight coverage')
console.log(`  Airport board: ${status.board.airports.join(', ') || 'none'}`)
console.log(
  `  Provider: ${status.provider.id} (${status.provider.configured ? status.provider.gateway : 'not configured'})`,
)
console.log(`  Provider airports: ${status.provider.airports.join(', ') || 'none'}`)
console.log(`  Future dates: ${status.provider.futureDates ? 'yes' : 'no'}`)
console.log('')

if (!flightNumber && !date) {
  console.log('Add a flight and date to run a lookup:')
  console.log('  npm run flights:check -- "6E 5082" 2026-12-03 DEL departure')
  process.exit(0)
}

if (!isValidFlightNumber(flightNumber ?? '') || !isValidTravelDate(date ?? '')) {
  console.error('Enter a valid flight number and YYYY-MM-DD date.')
  process.exit(1)
}

if (role !== 'departure' && role !== 'arrival') {
  console.error('Role must be departure or arrival.')
  process.exit(1)
}

try {
  const result = await searchLiveFlights(flightNumber, date, role, airport.toUpperCase())
  console.log(`Source: ${result.provider}`)
  console.log(`Fetched: ${result.fetchedAt}`)
  if (!result.results.length) {
    console.log('No matching flight. Check the date, airport and provider configuration.')
    process.exit(2)
  }
  for (const flight of result.results) {
    console.log('')
    console.log(`${flight.flightNumber} · ${flight.airline ?? 'Airline unavailable'}`)
    console.log(`  ${flight.origin ?? '?'} → ${flight.destination ?? '?'}`)
    console.log(`  Terminal: ${flight.terminal ?? 'Not available'}`)
    console.log(`  Gate: ${flight.gate ?? 'Not available'}`)
    console.log(`  Status: ${flight.status ?? 'Unknown'}`)
    console.log(`  Scheduled: ${flight.scheduledDeparture ?? flight.scheduledArrival ?? 'Unknown'}`)
    console.log(`  Estimated: ${flight.estimatedDeparture ?? flight.estimatedArrival ?? 'Not available'}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Live lookup failed.')
  process.exit(1)
}
