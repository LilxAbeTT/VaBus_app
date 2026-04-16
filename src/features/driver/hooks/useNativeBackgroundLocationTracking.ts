import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import type {
  BackgroundGeolocationPlugin,
  CallbackError,
  Location,
} from '@capacitor-community/background-geolocation'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Coordinates } from '../../../types/domain'
import { REALTIME_MIN_DISTANCE_METERS } from '../../../../shared/tracking'
import type {
  DriverLocationPermissionState,
  DriverLocationReading,
  DriverLocationSubmissionResult,
  DriverLocationTrackingHookResult,
  DriverTrackingStatus,
} from './locationTrackingTypes'

const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

const PERMISSION_PROBE_TIMEOUT_MS = 12_000

const PERMISSION_PROBE_OPTIONS = {
  requestPermissions: true,
  stale: true,
  distanceFilter: 0,
}

const BACKGROUND_TRACKING_OPTIONS = {
  backgroundTitle: 'CaboBus Conductor',
  backgroundMessage:
    'CaboBus comparte tu ubicación para mantener visible tu unidad en tiempo real.',
  requestPermissions: false,
  stale: false,
  distanceFilter: REALTIME_MIN_DISTANCE_METERS,
}

function isCallbackError(error: unknown): error is CallbackError {
  return typeof error === 'object' && error !== null && 'message' in error
}

function getNativePermissionErrorMessage(error?: CallbackError) {
  if (!error) {
    return 'No fue posible confirmar el permiso de ubicación en la app.'
  }

  if (error.code === 'NOT_AUTHORIZED') {
    return 'La app no tiene permiso de ubicación. Autoriza el acceso desde el sistema para compartir tu ruta.'
  }

  return error.message || 'No fue posible confirmar el permiso de ubicación en la app.'
}

function getNativeTrackingErrorMessage(error?: CallbackError) {
  if (!error) {
    return 'Ocurrió un error inesperado durante el tracking en segundo plano.'
  }

  if (error.code === 'NOT_AUTHORIZED') {
    return 'El permiso de ubicación fue revocado mientras el tracking estaba activo.'
  }

    return error.message || 'Ocurrió un error inesperado durante el tracking en segundo plano.'
}

function toTrackedReading(location: Location): DriverLocationReading {
  const capturedAt =
    typeof location.time === 'number' && Number.isFinite(location.time)
      ? new Date(location.time).toISOString()
      : new Date().toISOString()

  return {
    coordinates: {
      lat: location.latitude,
      lng: location.longitude,
    },
    accuracyMeters:
      typeof location.accuracy === 'number' && Number.isFinite(location.accuracy)
        ? location.accuracy
        : null,
    capturedAt,
  }
}

async function ensureNotificationPermission() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return true
  }

  const currentPermissions = await LocalNotifications.checkPermissions()

  if (currentPermissions.display === 'granted') {
    return true
  }

  const requestedPermissions = await LocalNotifications.requestPermissions()
  return requestedPermissions.display === 'granted'
}

export function useNativeBackgroundLocationTracking(): DriverLocationTrackingHookResult {
  const isNativePlatform = Capacitor.isNativePlatform()

  const [permissionState, setPermissionState] =
    useState<DriverLocationPermissionState>(
      isNativePlatform ? 'not_requested' : 'unsupported',
    )
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

  const watcherIdRef = useRef<string | null>(null)
  const onLocationRef = useRef<
    ((reading: DriverLocationReading) => Promise<DriverLocationSubmissionResult>) | null
  >(null)
  const isSendingRef = useRef(false)
  const activeOperationIdRef = useRef(0)
  const hasAcceptedSignalRef = useRef(false)
  const permissionStateRef = useRef<DriverLocationPermissionState>(permissionState)

  useEffect(() => {
    permissionStateRef.current = permissionState
  }, [permissionState])

  const clearWatcher = useCallback(async () => {
    const watcherId = watcherIdRef.current

    watcherIdRef.current = null

    if (!watcherId || !isNativePlatform) {
      return
    }

    try {
      await BackgroundGeolocation.removeWatcher({ id: watcherId })
    } catch {
      // La app puede haber perdido el watcher durante un cambio de estado.
    }
  }, [isNativePlatform])

  const resetTrackingSession = useCallback(() => {
    void clearWatcher()
    isSendingRef.current = false
    onLocationRef.current = null
    hasAcceptedSignalRef.current = false
  }, [clearWatcher])

  const failTracking = useCallback(((
    nextStatus: Extract<DriverTrackingStatus, 'stopped' | 'signal_timeout' | 'error'>,
    errorMessage: string,
  ) => {
    activeOperationIdRef.current += 1
    resetTrackingSession()
    setTrackingStatus(nextStatus)
    setTrackingError(errorMessage)
  }), [resetTrackingSession])

  const stopTracking = useCallback(() => {
    activeOperationIdRef.current += 1
    resetTrackingSession()
    setTrackingError(null)
    setTrackingStatus('stopped')
  }, [resetTrackingSession])

  const deliverLocation = useCallback(async (
    location: Location,
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

    const reading = toTrackedReading(location)

    setLastTrackedPosition(reading.coordinates)
    setLastTrackedAt(reading.capturedAt)
    setLastTrackedAccuracyMeters(reading.accuracyMeters)

    try {
      const result = await onLocationRef.current(reading)

      if (activeOperationIdRef.current !== operationId) {
        return { accepted: false }
      }

      if (!result.accepted) {
        if (result.shouldContinue && !hasAcceptedSignalRef.current) {
          hasAcceptedSignalRef.current = true
          setTrackingError(null)
          setTrackingStatus('first_signal_received')
        } else if (!result.shouldContinue && result.rejectionMessage) {
          setTrackingError(result.rejectionMessage)
        }

        return result
      }

      permissionStateRef.current = 'granted'
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
          : 'No fue posible enviar la ubicación real desde la app nativa.',
      )

      return {
        accepted: false,
        rejectionMessage:
          error instanceof Error
            ? error.message
            : 'No fue posible enviar la ubicación real desde la app nativa.',
      }
    } finally {
      isSendingRef.current = false
    }
  }, [failTracking])

  const requestPermission = useCallback(async () => {
    if (!isNativePlatform) {
      setPermissionState('unsupported')
      setTrackingStatus('error')
      setTrackingError(
        'La geolocalización nativa no está disponible fuera de Android o iOS.',
      )
      return false
    }

    if (trackingStatus === 'requesting_permission') {
      return false
    }

    const operationId = activeOperationIdRef.current + 1
    activeOperationIdRef.current = operationId
    resetTrackingSession()
    setTrackingError(null)
    setTrackingStatus('requesting_permission')

    return await new Promise<boolean>((resolve) => {
      let isSettled = false
      let timeoutId: number | null = null

      const finalize = (
        granted: boolean,
        nextPermissionState: DriverLocationPermissionState,
        errorMessage?: string,
      ) => {
        if (isSettled) {
          return
        }

        isSettled = true

        if (timeoutId !== null) {
          window.clearTimeout(timeoutId)
        }

        permissionStateRef.current = nextPermissionState
        setPermissionState(nextPermissionState)
        setTrackingStatus('stopped')
        setTrackingError(errorMessage ?? null)
        void clearWatcher()
        resolve(granted)
      }

      void (async () => {
        try {
          const watcherId = await BackgroundGeolocation.addWatcher(
            PERMISSION_PROBE_OPTIONS,
            (location, error) => {
              if (activeOperationIdRef.current !== operationId || isSettled) {
                return
              }

              if (error) {
                finalize(
                  false,
                  error.code === 'NOT_AUTHORIZED' ? 'denied' : 'not_requested',
                  getNativePermissionErrorMessage(error),
                )
                return
              }

              if (!location) {
                return
              }

              const reading = toTrackedReading(location)

              setLastTrackedPosition(reading.coordinates)
              setLastTrackedAt(reading.capturedAt)
              setLastTrackedAccuracyMeters(reading.accuracyMeters)

              finalize(true, 'granted')
            },
          )

          if (activeOperationIdRef.current !== operationId) {
            void BackgroundGeolocation.removeWatcher({ id: watcherId })
            resolve(false)
            return
          }

          watcherIdRef.current = watcherId
          timeoutId = window.setTimeout(() => {
            finalize(
              false,
              permissionStateRef.current,
              'No fue posible confirmar una lectura inicial desde la app. Reintenta con mejor señal o usa el modo manual.',
            )
          }, PERMISSION_PROBE_TIMEOUT_MS)
        } catch (error) {
          finalize(
            false,
            'not_requested',
            getNativePermissionErrorMessage(
              isCallbackError(error) ? error : undefined,
            ),
          )
        }
      })()
    })
  }, [clearWatcher, isNativePlatform, resetTrackingSession, trackingStatus])

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
    if (!isNativePlatform) {
      setPermissionState('unsupported')
      setTrackingStatus('error')
      setTrackingError(
        'La geolocalización nativa no está disponible fuera de Android o iOS.',
      )
      return
    }

    if (permissionStateRef.current !== 'granted') {
      setTrackingStatus('stopped')
      setTrackingError(
        'Solicita permiso de ubicación antes de iniciar el tracking nativo.',
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
    resetTrackingSession()
    onLocationRef.current = onLocation
    setTrackingError(null)
    setTrackingStatus('waiting_first_signal')

    void (async () => {
      const notificationsGranted = await ensureNotificationPermission()

      if (activeOperationIdRef.current !== operationId) {
        return
      }

      if (!notificationsGranted) {
        failTracking(
          'stopped',
          'Autoriza las notificaciones del sistema para mantener el tracking en segundo plano en Android.',
        )
        return
      }

      try {
        const watcherId = await BackgroundGeolocation.addWatcher(
          BACKGROUND_TRACKING_OPTIONS,
          (location, error) => {
            if (activeOperationIdRef.current !== operationId) {
              return
            }

            if (error) {
              if (error.code === 'NOT_AUTHORIZED') {
                permissionStateRef.current = 'denied'
                setPermissionState('denied')
                failTracking('stopped', getNativeTrackingErrorMessage(error))
                return
              }

              failTracking('error', getNativeTrackingErrorMessage(error))
              return
            }

            if (!location) {
              return
            }

            void (async () => {
              const result = await deliverLocation(location, operationId)

              if (activeOperationIdRef.current !== operationId) {
                return
              }

              if (!result.accepted && !result.shouldContinue && !hasAcceptedSignalRef.current) {
                failTracking(
                  'signal_timeout',
                  result.rejectionMessage ??
                    'No fue posible validar una primera ubicación confiable desde la app.',
                )
              }
            })()
          },
        )

        if (activeOperationIdRef.current !== operationId) {
          void BackgroundGeolocation.removeWatcher({ id: watcherId })
          return
        }

        watcherIdRef.current = watcherId
      } catch (error) {
        if (activeOperationIdRef.current !== operationId) {
          return
        }

        if (isCallbackError(error) && error.code === 'NOT_AUTHORIZED') {
          permissionStateRef.current = 'denied'
          setPermissionState('denied')
          failTracking('stopped', getNativeTrackingErrorMessage(error))
          return
        }

        failTracking(
          'error',
          getNativeTrackingErrorMessage(
            isCallbackError(error) ? error : undefined,
          ),
        )
      }
    })()
  }, [deliverLocation, failTracking, isNativePlatform, resetTrackingSession, trackingStatus])

  const isTracking =
    watcherIdRef.current !== null &&
    (trackingStatus === 'first_signal_received' || trackingStatus === 'tracking')

  return {
    permissionState,
    trackingStatus,
    trackingError,
    lastTrackedPosition,
    lastTrackedAt,
    lastTrackedAccuracyMeters,
    isTracking,
    trackingMode: 'native-background',
    supportsBackgroundTracking: true,
    requestPermission,
    startTracking,
    stopTracking,
    openSettings: isNativePlatform
      ? () => BackgroundGeolocation.openSettings()
      : undefined,
  }
}
