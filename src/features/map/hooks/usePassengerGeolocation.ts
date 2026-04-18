import { useCallback, useEffect, useRef, useState } from 'react'
import type { Coordinates } from '../../../types/domain'

const PASSENGER_GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 20_000,
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
  const [isFollowingPosition, setIsFollowingPosition] = useState(false)
  const [position, setPosition] = useState<Coordinates | null>(null)
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null)
  const [capturedAt, setCapturedAt] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const permissionStatusRef = useRef<PermissionStatus | null>(null)

  const commitPosition = useCallback((nextPosition: GeolocationPosition) => {
    setPermissionState('granted')
    setPosition({
      lat: nextPosition.coords.latitude,
      lng: nextPosition.coords.longitude,
    })
    setAccuracyMeters(
      Number.isFinite(nextPosition.coords.accuracy) ? nextPosition.coords.accuracy : null,
    )
    setCapturedAt(new Date(nextPosition.timestamp).toISOString())
  }, [])

  const clearWatch = useCallback(() => {
    if (
      watchIdRef.current !== null &&
      typeof navigator !== 'undefined' &&
      'geolocation' in navigator
    ) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }

    watchIdRef.current = null
    setIsFollowingPosition(false)
  }, [])

  const requestPermission = useCallback(
    async (requestedByUser = true) => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        setPermissionState('unsupported')
        setErrorMessage('Este navegador no soporta geolocalizacion para el mapa del pasajero.')
        return false
      }

      setIsRequestingPermission(requestedByUser)
      setErrorMessage(null)

      return await new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (nextPosition) => {
            commitPosition(nextPosition)
            setIsRequestingPermission(false)
            resolve(true)
          },
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              setPermissionState('denied')
            }

            setIsRequestingPermission(false)
            setErrorMessage(getLocationErrorMessage(error))
            resolve(false)
          },
          PASSENGER_GEOLOCATION_OPTIONS,
        )
      })
    },
    [commitPosition],
  )

  const startFollowingPosition = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermissionState('unsupported')
      setErrorMessage('Este navegador no soporta geolocalizacion para el mapa del pasajero.')
      return false
    }

    if (watchIdRef.current !== null) {
      setIsFollowingPosition(true)
      return true
    }

    const hasPosition = position ? true : await requestPermission(true)

    if (!hasPosition) {
      return false
    }

    setErrorMessage(null)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (nextPosition) => {
        commitPosition(nextPosition)
        setIsFollowingPosition(true)
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          clearWatch()
          setPermissionState('denied')
        }

        setErrorMessage(getLocationErrorMessage(error))
      },
      PASSENGER_GEOLOCATION_OPTIONS,
    )

    setIsFollowingPosition(true)
    return true
  }, [clearWatch, commitPosition, position, requestPermission])

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
          void requestPermission(false)
        }

        permissionStatus.onchange = () => {
          const changedPermissionState = normalizePermissionState(permissionStatus.state)
          setPermissionState(changedPermissionState)

          if (changedPermissionState === 'granted') {
            void requestPermission(false)
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
  }, [clearWatch, requestPermission])

  useEffect(() => clearWatch, [clearWatch])

  return {
    permissionState,
    isRequestingPermission,
    isFollowingPosition,
    position,
    accuracyMeters,
    capturedAt,
    errorMessage,
    requestPermission: () => requestPermission(true),
    startFollowingPosition,
    stopFollowingPosition: clearWatch,
  }
}
