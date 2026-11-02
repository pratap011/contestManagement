import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const BLR_TIMEZONE = 'Asia/Kolkata'

export function isValidIso(value: string | undefined): value is string {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

export function localInputToIso(value: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = fromZonedTime(`${value}:00`, timeZone)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function isoToLocalInput(iso: string | undefined, timeZone: string): string {
  if (!isValidIso(iso)) return ''
  return formatInTimeZone(new Date(iso), timeZone, "yyyy-MM-dd'T'HH:mm")
}

export function formatTime(iso: string | undefined, timeZone: string): string {
  if (!isValidIso(iso)) return 'Not available'
  return formatInTimeZone(new Date(iso), timeZone, 'HH:mm')
}

export function formatDateTime(iso: string | undefined, timeZone: string): string {
  if (!isValidIso(iso)) return 'Not available'
  return formatInTimeZone(new Date(iso), timeZone, 'EEE d MMM · HH:mm')
}

export function formatFullDateTime(iso: string | undefined, timeZone: string): string {
  if (!isValidIso(iso)) return 'Not available'
  return formatInTimeZone(new Date(iso), timeZone, 'EEE d MMM yyyy · HH:mm')
}

export function todayInTimeZone(timeZone: string): string {
  return formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd')
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—'
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const remainder = rounded % 60
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`
}

export function formatCountdown(targetIso: string | undefined, now = Date.now()): string {
  if (!isValidIso(targetIso)) return 'Departure time not supplied'
  const diff = new Date(targetIso).getTime() - now
  if (diff <= 0) return 'Scheduled time has passed'
  const totalMinutes = Math.floor(diff / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `in ${days} d ${hours} hr`
  if (hours > 0) return `in ${hours} hr ${minutes} min`
  return `in ${minutes} min`
}

export function minutesBetween(startIso: string, endIso: string): number | null {
  if (!isValidIso(startIso) || !isValidIso(endIso)) return null
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000
}

export function formatFetchedAt(iso: string | undefined, timeZone: string): string {
  if (!isValidIso(iso)) return 'retrieval time unknown'
  return `retrieved ${formatInTimeZone(new Date(iso), timeZone, 'd MMM, HH:mm')}`
}
