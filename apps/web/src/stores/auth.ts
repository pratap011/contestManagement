import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { appConfig } from '@/config'

export interface AccountUser {
  id: string
  email: string
  createdAt: string
}

export interface SavedJourneyResponse {
  journey: unknown
  updatedAt: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const response = await fetch(`${appConfig.apiBase}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (response.status === 204) return null
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'The account service is unavailable. Try again in a moment.'
    throw new ApiError(response.status, message)
  }
  return body as T
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AccountUser | null>(null)
  const loading = ref(false)
  const error = ref('')
  const initialised = ref(false)
  const savedJourney = ref<SavedJourneyResponse | null>(null)
  const savedJourneyLoading = ref(false)
  const saving = ref(false)
  const syncMessage = ref('')

  const isAuthenticated = computed(() => user.value !== null)

  function clearMessages() {
    error.value = ''
    syncMessage.value = ''
  }

  async function fetchMe(): Promise<void> {
    if (initialised.value) return
    loading.value = true
    try {
      const body = await apiRequest<{ user: AccountUser }>('/api/auth/me')
      user.value = body?.user ?? null
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 401) {
        // An unavailable account service must not block the anonymous app.
        error.value = caught instanceof Error ? caught.message : 'Account service unavailable.'
      }
      user.value = null
    } finally {
      loading.value = false
      initialised.value = true
    }
  }

  async function register(email: string, password: string): Promise<boolean> {
    clearMessages()
    loading.value = true
    try {
      const body = await apiRequest<{ user: AccountUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      user.value = body?.user ?? null
      initialised.value = true
      return true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Could not create the account.'
      return false
    } finally {
      loading.value = false
    }
  }

  async function login(email: string, password: string): Promise<boolean> {
    clearMessages()
    loading.value = true
    try {
      const body = await apiRequest<{ user: AccountUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      user.value = body?.user ?? null
      initialised.value = true
      return true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Could not sign in.'
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    loading.value = true
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' })
    } catch {
      // Local session is cleared even if the network request fails.
    } finally {
      user.value = null
      savedJourney.value = null
      syncMessage.value = ''
      loading.value = false
    }
  }

  async function loadSavedJourney(): Promise<SavedJourneyResponse | null> {
    if (!user.value) return null
    savedJourneyLoading.value = true
    clearMessages()
    try {
      const body = await apiRequest<SavedJourneyResponse>('/api/journeys/current')
      savedJourney.value = body
      return body
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        savedJourney.value = null
        return null
      }
      error.value = caught instanceof Error ? caught.message : 'Could not load the saved journey.'
      return null
    } finally {
      savedJourneyLoading.value = false
    }
  }

  async function saveJourney(journey: unknown): Promise<boolean> {
    if (!user.value) return false
    saving.value = true
    clearMessages()
    try {
      const body = await apiRequest<{ saved: boolean; updatedAt: string }>(
        '/api/journeys/current',
        { method: 'PUT', body: JSON.stringify({ journey }) },
      )
      if (body?.updatedAt) {
        savedJourney.value = { journey, updatedAt: body.updatedAt }
      }
      syncMessage.value = 'Journey saved to your account.'
      return true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Could not save the journey.'
      return false
    } finally {
      saving.value = false
    }
  }

  async function deleteAccount(): Promise<boolean> {
    if (!user.value) return false
    saving.value = true
    clearMessages()
    try {
      await apiRequest('/api/auth/account', { method: 'DELETE' })
      user.value = null
      savedJourney.value = null
      syncMessage.value = 'Account deleted.'
      return true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Could not delete the account.'
      return false
    } finally {
      saving.value = false
    }
  }

  async function deleteSavedJourney(): Promise<boolean> {
    if (!user.value) return false
    saving.value = true
    clearMessages()
    try {
      await apiRequest('/api/journeys/current', { method: 'DELETE' })
      savedJourney.value = null
      syncMessage.value = 'Saved journey deleted from your account.'
      return true
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'Could not delete the saved journey.'
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    user,
    loading,
    error,
    initialised,
    savedJourney,
    savedJourneyLoading,
    saving,
    syncMessage,
    isAuthenticated,
    fetchMe,
    register,
    login,
    logout,
    loadSavedJourney,
    saveJourney,
    deleteSavedJourney,
    deleteAccount,
    clearMessages,
  }
})
