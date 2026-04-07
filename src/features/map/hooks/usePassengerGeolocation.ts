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
      return 'El permiso de ubicacion fue denegado.'
    case error.TIMEOUT:
      return 'La ubicacion tardo demasiado en responder.'
    case error.POSITION_UNAVAILABLE:
      return 'No fue posible obtener tu ubicacion en este momento.'
    default:
      return 'Ocurrio un error al leer tu ubicacion.'
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

  const startWatching = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermissionState('unsupported')
      setIsRequestingPermission(false)
      setErrorMessage(
        'Este navegador no soporta geolocalizacion para el mapa del pasajero.',
      )
      return
    }

    if (watchIdRef.current !== null) {
      return
    }

    setIsRequestingPermission(true)
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
        setPermissionState(normalizePermissionState(permissionStatus.state))

        permissionStatus.onchange = () => {
          setPermissionState(normalizePermissionState(permissionStatus.state))
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
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      startWatching()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      clearWatch()
    }
  }, [clearWatch, startWatching])

  return {
    permissionState,
    isRequestingPermission,
    position,
    accuracyMeters,
    capturedAt,
    errorMessage,
    requestPermission: startWatching,
  }
}
