import { useCallback, useEffect, useRef, useState } from 'react'
import type { Coordinates } from '../../../types/domain'

const PASSENGER_GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 15_000,
}

export type PassengerGeolocationPermissionState =
  | 'loading'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unsupported'

function normalizePermissionState(
  permissionState: PermissionState,
): PassengerGeolocationPermissionState {
  switch (permissionState) {
    case 'granted':
      return 'granted'
    case 'denied':
      return 'denied'
    default:
      return 'prompt'
  }
}

function getLocationErrorMessage(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'El permiso de ubicación fue denegado.'
    case error.TIMEOUT:
      return 'La ubicación tardó demasiado en responder.'
    case error.POSITION_UNAVAILABLE:
      return 'No fue posible obtener tu ubicación en este momento.'
    default:
      return 'Ocurrió un error al leer tu ubicación.'
  }
}

export function usePassengerGeolocation() {
  const [permissionState, setPermissionState] =
    useState<PassengerGeolocationPermissionState>(() => {
      if (typeof navigator === 'undefined') {
        return 'loading'
      }

      return 'geolocation' in navigator ? 'prompt' : 'unsupported'
    })
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const [position, setPosition] = useState<Coordinates | null>(null)
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null)
  const [capturedAt, setCapturedAt] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const permissionStatusRef = useRef<PermissionStatus | null>(null)

  const clearWatch = useCallback(() => {
    if (
      watchIdRef.current !== null &&
      typeof navigator !== 'undefined' &&
      'geolocation' in navigator
    ) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }

    watchIdRef.current = null
  }, [])

  const startWatching = useCallback((requestedByUser = true) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermissionState('unsupported')
      setIsRequestingPermission(false)
      setErrorMessage(
        'Este navegador no soporta geolocalización para el mapa del pasajero.',
      )
      return
    }

    if (watchIdRef.current !== null) {
      return
    }

    setIsRequestingPermission(requestedByUser)
    setErrorMessage(null)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (nextPosition) => {
        setPermissionState('granted')
        setIsRequestingPermission(false)
        setPosition({
          lat: nextPosition.coords.latitude,
          lng: nextPosition.coords.longitude,
        })
        setAccuracyMeters(
          Number.isFinite(nextPosition.coords.accuracy)
            ? nextPosition.coords.accuracy
            : null,
        )
        setCapturedAt(new Date(nextPosition.timestamp).toISOString())
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          clearWatch()
          setPermissionState('denied')
        }

        setIsRequestingPermission(false)
        setErrorMessage(getLocationErrorMessage(error))
      },
      PASSENGER_GEOLOCATION_OPTIONS,
    )
  }, [clearWatch])

  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('geolocation' in navigator) ||
      !('permissions' in navigator)
    ) {
      return
    }

    let isSubscribed = true

    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((permissionStatus) => {
        if (!isSubscribed) {
          return
        }

        permissionStatusRef.current = permissionStatus
        const nextPermissionState = normalizePermissionState(permissionStatus.state)
        setPermissionState(nextPermissionState)

        if (nextPermissionState === 'granted') {
          startWatching(false)
        }

        permissionStatus.onchange = () => {
          const changedPermissionState = normalizePermissionState(
            permissionStatus.state,
          )
          setPermissionState(changedPermissionState)

          if (changedPermissionState === 'granted') {
            startWatching(false)
            return
          }

          if (changedPermissionState === 'denied') {
            clearWatch()
          }
        }
      })
      .catch(() => {
        if (isSubscribed) {
          setPermissionState('prompt')
        }
      })

    return () => {
      isSubscribed = false

      if (permissionStatusRef.current) {
        permissionStatusRef.current.onchange = null
      }
    }
  }, [clearWatch, startWatching])

  useEffect(() => clearWatch, [clearWatch])

  return {
    permissionState,
    isRequestingPermission,
    position,
    accuracyMeters,
    capturedAt,
    errorMessage,
    requestPermission: () => startWatching(true),
  }
}
