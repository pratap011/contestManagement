import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'airport-navigator:theme:v1'

function readStoredTheme(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can be unavailable; fall back to the system preference.
  }
  return null
}

function systemTheme(): ThemeMode {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const theme = ref<ThemeMode>(readStoredTheme() ?? systemTheme())
const usingSystemPreference = ref(readStoredTheme() === null)
let initialised = false

function applyTheme(value: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = value
  document.documentElement.style.colorScheme = value
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', value === 'dark' ? '#0a1220' : '#0b3d91')
}

export function useTheme() {
  function initTheme() {
    applyTheme(theme.value)
    if (initialised || typeof window === 'undefined') return
    initialised = true
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (event) => {
      if (!usingSystemPreference.value) return
      theme.value = event.matches ? 'dark' : 'light'
      applyTheme(theme.value)
    })
  }

  function setTheme(value: ThemeMode) {
    theme.value = value
    usingSystemPreference.value = false
    applyTheme(value)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      // The selected theme still applies for this session.
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  const isDark = computed(() => theme.value === 'dark')

  return { theme, isDark, initTheme, setTheme, toggleTheme }
}
