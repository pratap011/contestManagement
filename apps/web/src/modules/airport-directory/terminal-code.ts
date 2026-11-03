/** Maps provider/manual terminal labels such as "T1", "1" or "Terminal 3" to a dataset id. */
export function normaliseTerminalCode(value: string | undefined): string | null {
  if (!value) return null
  const compact = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const match = compact.match(/^(?:terminal)?t?([1-9])$/)
  if (!match) return null
  return `t${match[1]}`
}

/** Converts a dataset terminal id ("t3") to the provider-style label ("T3"). */
export function terminalLabel(value: string | undefined): string | undefined {
  const normalised = normaliseTerminalCode(value)
  return normalised ? normalised.toUpperCase() : undefined
}
