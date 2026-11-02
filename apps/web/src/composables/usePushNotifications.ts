import { computed, ref } from 'vue'
import { appConfig } from '@/config'

export interface PushWatch {
  flightNumber: string
  date: string
  role: 'departure' | 'arrival' | 'connection'
  leadMinutes?: number
}

const STORAGE_KEY = 'blr-navigator:push-watch:v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readStoredWatch(): PushWatch | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      isRecord(parsed) &&
      typeof parsed.flightNumber === 'string' &&
      typeof parsed.date === 'string' &&
      (parsed.role === 'departure' || parsed.role === 'arrival' || parsed.role === 'connection')
    ) {
      return {
        flightNumber: parsed.flightNumber,
        date: parsed.date,
        role: parsed.role,
        leadMinutes: typeof parsed.leadMinutes === 'number' ? parsed.leadMinutes : undefined,
      }
    }
  } catch {
    // Storage can be unavailable in private modes.
  }
  return null
}

function storeWatch(watch: PushWatch | null): void {
  try {
    if (watch) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(watch))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // The subscription still works for this session.
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalised)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index)
  }
  return bytes
}

async function serverJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${appConfig.apiBase}${path}`, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'omit',
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.error === 'string'
        ? body.error
        : 'Notifications are unavailable right now.'
    throw new Error(message)
  }
  return body as T
}

export function usePushNotifications() {
  const supported = ref(
    typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
  )
  const permission = ref<NotificationPermission>(
    supported.value ? Notification.permission : 'denied',
  )
  const subscribed = ref(false)
  const busy = ref(false)
  const message = ref('')
  const error = ref('')
  const watch = ref<PushWatch | null>(null)
  const testSent = ref(false)
  const watchWindowDays = ref(2)

  const watchKey = computed(() =>
    watch.value
      ? `${watch.value.flightNumber}|${watch.value.date}|${watch.value.role}`
      : null,
  )

  function describeError(reason: unknown): string {
    const text = reason instanceof Error ? reason.message : 'Notifications could not be enabled.'
    if (/denied/i.test(text)) return 'Notification permission was denied in this browser.'
    return text
  }

  async function currentSubscription(): Promise<PushSubscription | null> {
    if (!supported.value) return null
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return null
    return registration.pushManager.getSubscription()
  }

  async function restore(): Promise<void> {
    if (!supported.value) return
    try {
      const key = await serverJson<{ watchWindowDays?: number }>('/api/push/key')
      if (typeof key.watchWindowDays === 'number' && key.watchWindowDays > 0) {
        watchWindowDays.value = key.watchWindowDays
      }
    } catch {
      // The default window still lets the card render honestly.
    }
    const stored = readStoredWatch()
    if (!stored) return
    try {
      const subscription = await currentSubscription()
      if (subscription) {
        watch.value = stored
        subscribed.value = true
        permission.value = Notification.permission
      }
    } catch {
      // Leave the card in its disabled state.
    }
  }

  async function enable(nextWatch: PushWatch): Promise<boolean> {
    busy.value = true
    error.value = ''
    message.value = ''
    testSent.value = false
    try {
      if (!supported.value) throw new Error('This browser does not support Web Push notifications.')
      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const keyResponse = await serverJson<{
        enabled: boolean
        publicKey: string | null
        watchWindowDays?: number
      }>('/api/push/key')
      if (!keyResponse.enabled || !keyResponse.publicKey) {
        throw new Error('Notifications are not configured on this deployment.')
      }
      if (typeof keyResponse.watchWindowDays === 'number' && keyResponse.watchWindowDays > 0) {
        watchWindowDays.value = keyResponse.watchWindowDays
      }
      const requested = await Notification.requestPermission()
      permission.value = requested
      if (requested !== 'granted') {
        throw new Error('Notification permission was denied in this browser.')
      }
      const existing = await registration.pushManager.getSubscription()
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyResponse.publicKey),
        }))
      await serverJson('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription, watch: nextWatch }),
      })
      watch.value = nextWatch
      storeWatch(nextWatch)
      subscribed.value = true
      message.value = `Watching ${nextWatch.flightNumber} on the live BLR board.`
      return true
    } catch (reason) {
      error.value = describeError(reason)
      return false
    } finally {
      busy.value = false
    }
  }

  async function disable(): Promise<void> {
    busy.value = true
    error.value = ''
    message.value = ''
    try {
      const subscription = await currentSubscription()
      if (subscription) {
        await serverJson('/api/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ subscription }),
        })
        await subscription.unsubscribe()
      }
      watch.value = null
      storeWatch(null)
      subscribed.value = false
      message.value = 'Flight notifications are off for this browser.'
    } catch (reason) {
      error.value = describeError(reason)
    } finally {
      busy.value = false
    }
  }

  async function sendTest(): Promise<void> {
    busy.value = true
    error.value = ''
    testSent.value = false
    try {
      const subscription = await currentSubscription()
      if (!subscription) throw new Error('Enable notifications first.')
      await serverJson('/api/push/test', {
        method: 'POST',
        body: JSON.stringify({ subscription }),
      })
      testSent.value = true
    } catch (reason) {
      error.value = describeError(reason)
    } finally {
      busy.value = false
    }
  }

  return {
    supported,
    permission,
    subscribed,
    busy,
    message,
    error,
    watch,
    watchKey,
    testSent,
    watchWindowDays,
    restore,
    enable,
    disable,
    sendTest,
  }
}
