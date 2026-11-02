import { resolveAirport } from './airports.ts'
import { config } from './config.ts'
import { fetchJson, isRecord, readNumber, readString, UpstreamError } from './upstream.ts'

export interface AirportWeather {
  temperatureC: number | null
  apparentTemperatureC: number | null
  humidityPercent: number | null
  precipitationMm: number | null
  windKph: number | null
  condition: string
  observedAt: string | null
  timezone: string
  source: 'open-meteo'
  sourceLabel: string
  note: string
}

interface CacheEntry {
  expiresAt: number
  value: AirportWeather
}

const cache = new Map<string, CacheEntry>()

const WEATHER_LABELS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light rain showers',
  81: 'Rain showers',
  82: 'Violent rain showers',
  85: 'Light snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with light hail',
  99: 'Thunderstorm with heavy hail',
}

export function parseWeather(body: unknown, timezone = 'Asia/Kolkata'): AirportWeather {
  if (!isRecord(body) || !isRecord(body.current)) {
    throw new UpstreamError('malformed', 'The weather service returned an unexpected shape.')
  }
  const current = body.current
  const code = readNumber(current, 'weather_code')
  return {
    temperatureC: readNumber(current, 'temperature_2m') ?? null,
    apparentTemperatureC: readNumber(current, 'apparent_temperature') ?? null,
    humidityPercent: readNumber(current, 'relative_humidity_2m') ?? null,
    precipitationMm: readNumber(current, 'precipitation') ?? null,
    windKph: readNumber(current, 'wind_speed_10m') ?? null,
    condition: code === undefined ? 'Conditions unavailable' : WEATHER_LABELS[code] ?? 'Mixed conditions',
    observedAt: readString(current, 'time') ?? null,
    timezone: readString(body, 'timezone') ?? timezone,
    source: 'open-meteo',
    sourceLabel: 'Open-Meteo',
    note: 'Weather is context only. It is not used to predict delays or operational decisions.',
  }
}

export async function fetchWeather(
  airportCode = 'BLR',
  fetchImpl: typeof fetch = fetch,
): Promise<AirportWeather> {
  const airport = resolveAirport(airportCode)
  if (!airport) throw new UpstreamError('unavailable', 'Unknown airport for weather context.')
  const cached = cache.get(airport.code)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const url = new URL(config.weatherUrl)
  url.searchParams.set('latitude', String(airport.center.lat))
  url.searchParams.set('longitude', String(airport.center.lon))
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
  )
  url.searchParams.set('timezone', airport.timezone)
  const body = await fetchJson(
    url.toString(),
    {
      timeoutMs: config.flightProviderTimeoutMs,
      service: 'Open-Meteo',
      headers: { 'User-Agent': 'BLR-Navigator/1.0 (airport weather context)' },
    },
    fetchImpl,
  )
  const value = parseWeather(body, airport.timezone)
  cache.set(airport.code, { expiresAt: Date.now() + config.weatherCacheTtlMs, value })
  return value
}

/** Test helper: clears the process-local weather cache. */
export function clearWeatherCache(): void {
  cache.clear()
}
