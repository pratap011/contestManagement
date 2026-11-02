/** Maps provider/manual terminal labels such as "T1", "1" or "Terminal 2" to a dataset id. */
export function normaliseTerminalCode(value: string | undefined): string | null {
  if (!value) return null
  const compact = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const match = compact.match(/^(?:terminal)?t?([12])$/)
  if (!match) return null
  return `t${match[1]}`
}
