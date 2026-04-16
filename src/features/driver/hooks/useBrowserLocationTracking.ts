import { useCallback, useEffect, useRef, useState } from 'react'

import type { Coordinates } from '../../../types/domain'
import type {
  DriverLocationPermissionState,
  DriverLocationReading,
  DriverLocationSubmissionResult,
  DriverLocationTrackingHookResult,
  DriverTrackingStatus,
} from './locationTrackingTypes'

const PERMISSION_REQUEST_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 60000,
  timeout: 10000,
}

const INITIAL_ACQUISITION_OPTIONS: PositionOptions[] = [
  {
    enableHighAccuracy: false,
    maximumAge: 45000,
    timeout: 8000,
  },
  {
    enableHighAccuracy: true,
    maximumAge: 15000,
    timeout: 15000,
  },
]

const CONTINUOUS_TRACKING_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 20000,
}

const PREFETCHED_POSITION_MAX_AGE_MS = 45000

function normalizePermissionState(
  permissionState: PermissionState,
): DriverLocationPermissionState {
  switch (permissionState) {
    case 'granted':
      return 'granted'
    case 'denied':
      return 'denied'
    default:
      return 'not_requested'
  }
}

function isGeolocationPositionError(error: unknown): error is GeolocationPositionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  )
}

function readCurrentPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

function getPermissionRequestErrorMessage(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'El permiso de ubicación fue denegado por el navegador.'
    case error.TIMEOUT:
      return 'No se pudo confirmar el permiso con una lectura rápida. Reintenta cuando mantengas la pestaña visible o usa el modo manual.'
    case error.POSITION_UNAVAILABLE:
      return 'El navegador no pudo confirmar la ubicación al pedir permiso. Reintenta o usa el modo manual.'
    default:
      return 'Ocurrió un error inesperado al solicitar permiso de ubicación.'
  }
}

function getInitialAcquisitionErrorMessage(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'El permiso de ubicación fue denegado por el navegador.'
    case error.TIMEOUT:
      return 'La primera ubicación tardó demasiado en llegar. Reintenta el arranque o usa el modo manual.'
    case error.POSITION_UNAVAILABLE:
      return 'No fue posible obtener una primera ubicación válida. Reintenta el arranque o usa el modo manual.'
    default:
      return 'Ocurrió un error inesperado al obtener la primera ubicación.'
  }
}

function getContinuousTrackingErrorMessage(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'El permiso de ubicación fue revocado mientras el tracking estaba activo.'
    case error.TIMEOUT:
      return 'Una lectura puntual tardó demasiado, pero el navegador sigue esperando nuevas señales.'
    case error.POSITION_UNAVAILABLE:
      return 'Se perdió la señal de ubicación del dispositivo. Reintenta el tracking o usa el modo manual.'
    default:
      return 'Ocurrió un error inesperado durante el tracking continuo.'
  }
}

export function useBrowserLocationTracking(): DriverLocationTrackingHookResult {
  const [permissionState, setPermissionState] =
    useState<DriverLocationPermissionState>(() => {
      if (typeof navigator === 'undefined') {
        return 'not_requested'
      }

      return 'geolocation' in navigator ? 'not_requested' : 'unsupported'
    })
  const [trackingStatus, setTrackingStatus] =
    useState<DriverTrackingStatus>('stopped')
  const [trackingError, setTrackingError] = useState<string | null>(null)
  const [lastTrackedPosition, setLastTrackedPosition] = useState<Coordinates | null>(
    null,
  )
  const [lastTrackedAt, setLastTrackedAt] = useState<string | null>(null)
  const [lastTrackedAccuracyMeters, setLastTrackedAccuracyMeters] = useState<number | null>(
    null,
  )

  const watchIdRef = useRef<number | null>(null)
  const permissionStatusRef = useRef<PermissionStatus | null>(null)
  const permissionStateRef = useRef<DriverLocationPermissionState>(
    permissionState,
  )
  const onLocationRef = useRef<
    ((reading: DriverLocationReading) => Promise<DriverLocationSubmissionResult>) | null
  >(null)
  const isSendingRef = useRef(false)
  const activeOperationIdRef = useRef(0)
  const prefetchedPositionRef = useRef<GeolocationPosition | null>(null)
  const hasAcceptedSignalRef = useRef(false)

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

  useEffect(() => {
    permissionStateRef.current = permissionState
  }, [permissionState])

  const resetTrackingSession = useCallback(() => {
    clearWatch()
    isSendingRef.current = false
    onLocationRef.current = null
    hasAcceptedSignalRef.current = false
  }, [clearWatch])

  const failTracking = useCallback((
    nextStatus: Extract<DriverTrackingStatus, 'stopped' | 'signal_timeout' | 'error'>,
    errorMessage: string,
  ) => {
    activeOperationIdRef.current += 1
    resetTrackingSession()
    setTrackingStatus(nextStatus)
    setTrackingError(errorMessage)
  }, [resetTrackingSession])

  const stopTracking = useCallback(() => {
    activeOperationIdRef.current += 1
    resetTrackingSession()
    setTrackingError(null)
    setTrackingStatus('stopped')
  }, [resetTrackingSession])

  const deliverPosition = useCallback(async (
    position: GeolocationPosition,
    operationId: number,
  ) => {
    if (
      activeOperationIdRef.current !== operationId ||
      isSendingRef.current ||
      !onLocationRef.current
    ) {
      return { accepted: false }
    }

    isSendingRef.current = true

    const coordinates = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    }
    const accuracyMeters = Number.isFinite(position.coords.accuracy)
      ? position.coords.accuracy
      : null
    const capturedAt = new Date(position.timestamp).toISOString()

    setLastTrackedPosition(coordinates)
    setLastTrackedAt(capturedAt)
    setLastTrackedAccuracyMeters(accuracyMeters)

    try {
      const result = await onLocationRef.current({
        coordinates,
        accuracyMeters,
        capturedAt,
      })

      if (activeOperationIdRef.current !== operationId) {
        return { accepted: false }
      }

      if (!result.accepted) {
        if (!result.shouldContinue && result.rejectionMessage) {
          setTrackingError(result.rejectionMessage)
        }

        return result
      }

      prefetchedPositionRef.current = position
      setPermissionState('granted')
      setTrackingError(null)
      setTrackingStatus(hasAcceptedSignalRef.current ? 'tracking' : 'first_signal_received')
      hasAcceptedSignalRef.current = true
      return result
    } catch (error) {
      if (activeOperationIdRef.current !== operationId) {
        return { accepted: false }
      }

      failTracking(
        'error',
        error instanceof Error
          ? error.message
          : 'No fue posible enviar la ubicación real a Convex.',
      )
      return {
        accepted: false,
        rejectionMessage:
          error instanceof Error
            ? error.message
            : 'No fue posible enviar la ubicación real a Convex.',
      }
    } finally {
      isSendingRef.current = false
    }
  }, [failTracking])

  const acquireInitialPosition = useCallback(async (operationId: number) => {
    const prefetchedPosition = prefetchedPositionRef.current

    if (
      prefetchedPosition &&
      Date.now() - prefetchedPosition.timestamp <= PREFETCHED_POSITION_MAX_AGE_MS
    ) {
      return prefetchedPosition
    }

    let lastError: GeolocationPositionError | null = null

    for (const options of INITIAL_ACQUISITION_OPTIONS) {
      if (activeOperationIdRef.current !== operationId) {
        return null
      }

      try {
        return await readCurrentPosition(options)
      } catch (error) {
        if (!isGeolocationPositionError(error)) {
          throw error
        }

        if (error.code === error.PERMISSION_DENIED) {
          throw error
        }

        lastError = error
      }
    }

    if (lastError) {
      throw lastError
    }

    return null
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermissionState('unsupported')
      permissionStateRef.current = 'unsupported'
      setTrackingStatus('error')
      setTrackingError(
        'Este navegador no soporta geolocalización para seguimiento real.',
      )
      return false
    }

    if (trackingStatus === 'requesting_permission') {
      return false
    }

    const operationId = activeOperationIdRef.current + 1
    activeOperationIdRef.current = operationId
    clearWatch()
    onLocationRef.current = null
    isSendingRef.current = false
    setTrackingError(null)
    setTrackingStatus('requesting_permission')

    try {
      const position = await readCurrentPosition(PERMISSION_REQUEST_OPTIONS)

      if (activeOperationIdRef.current !== operationId) {
        return false
      }

      prefetchedPositionRef.current = position
      permissionStateRef.current = 'granted'
      setPermissionState('granted')
      setTrackingStatus('stopped')
      return true
    } catch (error) {
      if (activeOperationIdRef.current !== operationId) {
        return false
      }

      if (!isGeolocationPositionError(error)) {
        setTrackingStatus('stopped')
        setTrackingError(
          'Ocurrió un error inesperado al solicitar permiso de ubicación.',
        )
        return false
      }

      if (error.code === error.PERMISSION_DENIED) {
        permissionStateRef.current = 'denied'
        setPermissionState('denied')
      } else if (permissionStatusRef.current) {
        const nextPermissionState = normalizePermissionState(
          permissionStatusRef.current.state,
        )
        permissionStateRef.current = nextPermissionState
        setPermissionState(nextPermissionState)
      }

      setTrackingStatus('stopped')
      setTrackingError(getPermissionRequestErrorMessage(error))
      return false
    }
  }, [clearWatch, trackingStatus])

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
        permissionStateRef.current = nextPermissionState
        setPermissionState(nextPermissionState)

        permissionStatus.onchange = () => {
          const changedPermissionState = normalizePermissionState(
            permissionStatus.state,
          )
          permissionStateRef.current = changedPermissionState
          setPermissionState(changedPermissionState)
        }
      })
      .catch(() => {
        if (isSubscribed) {
          permissionStateRef.current = 'not_requested'
          setPermissionState('not_requested')
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
    return () => {
      stopTracking()
    }
  }, [stopTracking])

  const startTracking = useCallback((
    onLocation: (
      reading: DriverLocationReading,
    ) => Promise<DriverLocationSubmissionResult>,
  ) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      permissionStateRef.current = 'unsupported'
      setPermissionState('unsupported')
      setTrackingStatus('error')
      setTrackingError(
        'Este navegador no soporta geolocalización para seguimiento real.',
      )
      return
    }

    if (permissionStateRef.current !== 'granted') {
      setTrackingStatus('stopped')
      setTrackingError(
        'Solicita permiso de ubicación antes de iniciar el tracking real.',
      )
      return
    }

    if (
      trackingStatus === 'requesting_permission' ||
      trackingStatus === 'waiting_first_signal' ||
      trackingStatus === 'first_signal_received' ||
      trackingStatus === 'tracking'
    ) {
      return
    }

    const operationId = activeOperationIdRef.current + 1
    activeOperationIdRef.current = operationId
    clearWatch()
    onLocationRef.current = onLocation
    isSendingRef.current = false
    setTrackingError(null)
    setTrackingStatus('waiting_first_signal')

    void (async () => {
      try {
        const initialPosition = await acquireInitialPosition(operationId)

        if (!initialPosition || activeOperationIdRef.current !== operationId) {
          return
        }

        const initialDelivery = await deliverPosition(initialPosition, operationId)

        if (activeOperationIdRef.current !== operationId) {
          return
        }

        if (!initialDelivery.accepted && !initialDelivery.shouldContinue) {
          failTracking(
            'signal_timeout',
            initialDelivery.rejectionMessage ??
              'No fue posible validar una primera ubicación confiable. Reintenta el tracking o usa el modo manual.',
          )
          return
        }

        if (initialDelivery.shouldContinue) {
          hasAcceptedSignalRef.current = true
          setTrackingError(null)
          setTrackingStatus('first_signal_received')
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
          (nextPosition) => {
            if (activeOperationIdRef.current !== operationId) {
              return
            }

            void deliverPosition(nextPosition, operationId)
          },
          (error) => {
            if (activeOperationIdRef.current !== operationId) {
              return
            }

            if (error.code === error.TIMEOUT) {
              setTrackingError(getContinuousTrackingErrorMessage(error))
              return
            }

            if (error.code === error.PERMISSION_DENIED) {
              setPermissionState('denied')
            }

            failTracking('error', getContinuousTrackingErrorMessage(error))
          },
          CONTINUOUS_TRACKING_OPTIONS,
        )
      } catch (error) {
        if (activeOperationIdRef.current !== operationId) {
          return
        }

        if (!isGeolocationPositionError(error)) {
          failTracking(
            'error',
            'Ocurrió un error inesperado al iniciar el tracking real.',
          )
          return
        }

        if (error.code === error.PERMISSION_DENIED) {
          setPermissionState('denied')
          failTracking('stopped', getInitialAcquisitionErrorMessage(error))
          return
        }

        failTracking('signal_timeout', getInitialAcquisitionErrorMessage(error))
      }
    })()
  }, [acquireInitialPosition, clearWatch, deliverPosition, failTracking, trackingStatus])

  const isTracking =
    watchIdRef.current !== null &&
    (trackingStatus === 'first_signal_received' || trackingStatus === 'tracking')

  return {
    permissionState,
    trackingStatus,
    trackingError,
    lastTrackedPosition,
    lastTrackedAt,
    lastTrackedAccuracyMeters,
    isTracking,
    trackingMode: 'browser',
    supportsBackgroundTracking: false,
    requestPermission,
    startTracking,
    stopTracking,
    openSettings: undefined,
  }
}
