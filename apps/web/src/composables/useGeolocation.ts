import { onBeforeUnmount, ref } from 'vue'

export interface UserPosition {
  lat: number
  lon: number
  accuracy: number
  heading: number | null
  speed: number | null
  timestamp: number
}

function toPosition(position: GeolocationPosition): UserPosition {
  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
    speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
    timestamp: position.timestamp,
  }
}

function geoErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location permission was denied. You can still choose a mapped starting point.'
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'Your device could not determine a location. Choose a mapped starting point instead.'
  }
  return 'Location is taking longer than expected. Move near a window or choose a mapped starting point.'
}

export function useGeolocation() {
  const supported = ref(
    typeof navigator !== 'undefined' && typeof navigator.geolocation !== 'undefined',
  )
  const position = ref<UserPosition | null>(null)
  const error = ref('')
  const watching = ref(false)
  let watchId: number | null = null

  function handlePosition(next: GeolocationPosition) {
    position.value = toPosition(next)
    error.value = ''
  }

  function handleError(next: GeolocationPositionError) {
    error.value = geoErrorMessage(next)
    if (next.code === next.PERMISSION_DENIED) stop()
  }

  function start() {
    if (!supported.value) {
      error.value = 'This browser does not support location. Choose a mapped starting point.'
      return
    }
    if (watching.value) return
    watching.value = true
    error.value = ''
    try {
      watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 20_000,
      })
    } catch {
      watching.value = false
      error.value = 'Location could not start in this browser. Choose a mapped starting point.'
    }
  }

  function stop() {
    if (watchId !== null && supported.value) {
      navigator.geolocation.clearWatch(watchId)
    }
    watchId = null
    watching.value = false
  }

  function locateOnce(): Promise<UserPosition | null> {
    if (!supported.value) {
      error.value = 'This browser does not support location. Choose a mapped starting point.'
      return Promise.resolve(null)
    }
    error.value = ''
    return new Promise((resolve) => {
      try {
        navigator.geolocation.getCurrentPosition(
          (next) => {
            handlePosition(next)
            resolve(position.value)
          },
          (next) => {
            handleError(next)
            resolve(null)
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
        )
      } catch {
        error.value = 'Location could not start in this browser. Choose a mapped starting point.'
        resolve(null)
      }
    })
  }

  onBeforeUnmount(stop)

  return { supported, position, error, watching, start, stop, locateOnce }
}
