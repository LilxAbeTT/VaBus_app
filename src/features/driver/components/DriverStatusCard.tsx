import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PluginListenerHandle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { useMutation, useQuery } from 'convex/react'
import type { Id } from '../../../../convex/_generated/dataModel'
import { api } from '../../../../convex/_generated/api'
import type { AuthenticatedSession } from '../../../types/domain'
import { useCurrentTime } from '../../../hooks/useCurrentTime'
import {
  REALTIME_ROUTE_SANITY_MAX_DISTANCE_METERS,
  evaluateBrowserSignalPlausibility,
  evaluateRealtimeSignalDispatch,
  formatElapsedSignalTime,
  getMinimumDistanceToRouteMeters,
} from '../../../lib/trackingSignal'
import { useDriverLocationTracking } from '../hooks/useDriverLocationTracking'
import type { DriverLocationReading } from '../hooks/locationTrackingTypes'
import {
  appendQueuedNativeTrackingReading,
  clearQueuedNativeTrackingReadings,
  readQueuedNativeTrackingReadings,
  writeQueuedNativeTrackingReadings,
} from '../lib/nativeTrackingQueue'
import {
  NativeLocationUploadError,
  uploadNativeLocationUpdate,
} from '../lib/nativeLocationUpload'
import { DriverRouteMap } from './DriverRouteMap'
import {
  DriverPanelEmptyState,
  DriverRouteChangeModal,
  DriverRouteInfoModal,
} from './DriverStatusModals'
import { DriverStatusSummary } from './DriverStatusSummary'
import {
  getErrorMessage,
  getTrackingRejectionMessage,
  readStoredAutoSharePreference,
  writeStoredAutoSharePreference,
} from './driverStatusCardUtils'

function getSharingStatusLabel({
  currentServiceStatus,
  permissionState,
  trackingStatus,
  trackingModeLabel,
}: {
  currentServiceStatus?: 'active' | 'paused' | 'completed'
  permissionState: string
  trackingStatus: string
  trackingModeLabel: string
}) {
  if (currentServiceStatus !== 'active') {
    return 'Ubicación detenida'
  }

  if (trackingStatus === 'requesting_permission') {
    return 'Solicitando permiso'
  }

  if (trackingStatus === 'waiting_first_signal') {
    return 'Esperando primera señal'
  }

  if (
    trackingStatus === 'first_signal_received' ||
    trackingStatus === 'tracking'
  ) {
    return `Compartiendo desde ${trackingModeLabel.toLowerCase()}`
  }

  if (trackingStatus === 'signal_timeout') {
    return 'Sin señal inicial'
  }

  if (permissionState === 'denied') {
    return 'Permiso bloqueado'
  }

  if (permissionState === 'unsupported') {
    return 'Solo modo manual'
  }

  return 'Lista para compartir'
}

export function DriverStatusCard({
  session,
  onLogout,
}: {
  session: AuthenticatedSession
  onLogout: () => void
}) {
  const currentTimeMs = useCurrentTime(15_000)
  const {
    permissionState,
    trackingStatus,
    trackingError,
    lastTrackedPosition,
    requestPermission,
    startTracking,
    stopTracking,
    trackingMode,
    supportsBackgroundTracking,
    openSettings,
  } = useDriverLocationTracking()

  const logout = useMutation(api.auth.logout)
  const activateService = useMutation(api.driver.activateService)
  const pauseCurrentService = useMutation(api.driver.pauseCurrentService)
  const resumeCurrentService = useMutation(api.driver.resumeCurrentService)
  const finishCurrentService = useMutation(api.driver.finishCurrentService)
  const addLocationUpdate = useMutation(api.driver.addLocationUpdate)
  const changeAssignedRoute = useMutation(api.driver.changeAssignedRoute)
  const reportRouteScheduleIssue = useMutation(api.driver.reportRouteScheduleIssue)

  const panelContext = useQuery(api.driver.getPanelContext, {
    sessionToken: session.token,
  })
  const currentServiceState = useQuery(api.driver.getCurrentServiceState, {
    sessionToken: session.token,
  })

  const [selectedRouteId, setSelectedRouteId] = useState('')
  const [pendingRouteId, setPendingRouteId] = useState('')
  const [isRouteChangeOpen, setRouteChangeOpen] = useState(false)
  const [isRouteInfoOpen, setRouteInfoOpen] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false)
  const [isReportingMissingSchedule, setIsReportingMissingSchedule] =
    useState(false)
  const [shouldAutoResumeShare, setShouldAutoResumeShare] = useState(() =>
    readStoredAutoSharePreference(session.user.id),
  )

  const lastSentSignalRef = useRef<{
    recordedAt: string | null
    position: { lat: number; lng: number } | null
  }>({
    recordedAt: null,
    position: null,
  })
  const activeServiceIdRef = useRef<string | null>(null)
  const previousServiceIdRef = useRef<string | null>(null)

  const currentService =
    currentServiceState === undefined ? undefined : currentServiceState ?? null
  const availableRoutes = useMemo(
    () => panelContext?.availableRoutes ?? [],
    [panelContext?.availableRoutes],
  )
  const isNativeBackgroundTracking = trackingMode === 'native-background'
  const showManualFallback = currentService?.status === 'active'
  const hasAssignedVehicle = Boolean(panelContext?.vehicle)
  const isRealtimeBusy =
    trackingStatus === 'requesting_permission' ||
    trackingStatus === 'waiting_first_signal'
  const isRealtimeActive =
    trackingStatus === 'first_signal_received' || trackingStatus === 'tracking'
  const isShareRunning = isRealtimeBusy || isRealtimeActive
  const timeSinceLastSignal = formatElapsedSignalTime(
    currentService?.lastLocationUpdateAt ?? null,
    currentTimeMs,
  )
  const trackingModeLabel =
    isNativeBackgroundTracking ? 'App nativa' : 'Navegador'
  const backgroundCapabilityMessage = supportsBackgroundTracking
    ? 'La app puede seguir compartiendo tu ubicación con la pantalla bloqueada o minimizada mientras el servicio siga activo.'
    : 'En navegador el tracking depende de mantener la pestaña visible. Para segundo plano usa la app móvil del conductor.'
  const sharingStatusLabel = getSharingStatusLabel({
    currentServiceStatus: currentService?.status,
    permissionState,
    trackingStatus,
    trackingModeLabel,
  })

  useEffect(() => {
    if (!panelContext) {
      return
    }

    const nextRouteId =
      currentService?.routeId ??
      panelContext.preferredRouteId ??
      panelContext.vehicle?.defaultRouteId ??
      availableRoutes[0]?.id ??
      ''

    if (nextRouteId) {
      setSelectedRouteId((currentValue) => currentValue || nextRouteId)
      setPendingRouteId((currentValue) => currentValue || nextRouteId)
    }
  }, [
    availableRoutes,
    currentService?.routeId,
    panelContext,
  ])

  useEffect(() => {
    if (currentService?.id) {
      activeServiceIdRef.current = currentService.id
    }
  }, [currentService?.id])

  useEffect(() => {
    const previousServiceId = previousServiceIdRef.current
    const nextServiceId = currentService?.id ?? null

    if (previousServiceId && previousServiceId !== nextServiceId) {
      void clearQueuedNativeTrackingReadings(session.user.id, previousServiceId)
    }

    previousServiceIdRef.current = nextServiceId

    if (!nextServiceId) {
      activeServiceIdRef.current = null
    }
  }, [currentService?.id, session.user.id])

  const selectedRoute = useMemo(
    () => availableRoutes.find((route) => route.id === selectedRouteId) ?? null,
    [availableRoutes, selectedRouteId],
  )
  const routeInView = useMemo(
    () =>
      availableRoutes.find(
        (route) => route.id === (currentService?.routeId ?? selectedRouteId),
      ) ?? selectedRoute,
    [availableRoutes, currentService?.routeId, selectedRoute, selectedRouteId],
  )

  const suggestedPoint = useMemo(() => {
    if (
      currentService?.lastPosition &&
      routeInView &&
      (() => {
        const distanceToRouteMeters = getMinimumDistanceToRouteMeters(
          currentService.lastPosition,
          routeInView.segments,
        )

        return (
          distanceToRouteMeters === null ||
          distanceToRouteMeters <= REALTIME_ROUTE_SANITY_MAX_DISTANCE_METERS
        )
      })()
    ) {
      return currentService.lastPosition
    }

    return routeInView?.segments[0]?.[0] ?? null
  }, [currentService?.lastPosition, routeInView])

  useEffect(() => {
    if (!suggestedPoint) {
      return
    }

    setManualLat((currentValue) => currentValue || suggestedPoint.lat.toFixed(6))
    setManualLng((currentValue) => currentValue || suggestedPoint.lng.toFixed(6))
  }, [suggestedPoint])

  useEffect(() => {
    lastSentSignalRef.current = {
      recordedAt:
        currentService?.lastLocationSource === 'device'
          ? (currentService.lastLocationUpdateAt ?? null)
          : null,
      position:
        currentService?.lastLocationSource === 'device'
          ? (currentService.lastPosition ?? null)
          : null,
    }
  }, [
    currentService?.lastLocationSource,
    currentService?.lastLocationUpdateAt,
    currentService?.lastPosition,
  ])

  useEffect(() => {
    writeStoredAutoSharePreference(session.user.id, shouldAutoResumeShare)
  }, [session.user.id, shouldAutoResumeShare])

  useEffect(() => {
    if (currentService?.status === 'active') {
      return
    }

    stopTracking()

    if (shouldAutoResumeShare) {
      setShouldAutoResumeShare(false)
    }
  }, [currentService?.status, shouldAutoResumeShare, stopTracking])

  const sendLocationUpdate = useCallback(
    async (
      lat: number,
      lng: number,
      accuracyMeters?: number | null,
      capturedAt?: string,
    ) => {
      const result = await addLocationUpdate({
        sessionToken: session.token,
        lat,
        lng,
        accuracyMeters: accuracyMeters ?? undefined,
        capturedAt,
      })

      lastSentSignalRef.current = {
        recordedAt: result.recordedAt,
        position: { lat, lng },
      }

      return result.recordedAt
    },
    [addLocationUpdate, session.token],
  )

  const flushQueuedNativeTrackingReadings = useCallback(async () => {
    if (!isNativeBackgroundTracking) {
      return 'flushed' as const
    }

    const serviceId = currentService?.id ?? activeServiceIdRef.current

    if (!serviceId) {
      return 'flushed' as const
    }

    const queuedReadings = await readQueuedNativeTrackingReadings(
      session.user.id,
      serviceId,
    )

    if (queuedReadings.length === 0) {
      return 'flushed' as const
    }

    for (let index = 0; index < queuedReadings.length; index += 1) {
      const queuedReading = queuedReadings[index]

      try {
        const result = await uploadNativeLocationUpdate({
          sessionToken: session.token,
          reading: queuedReading,
        })

        lastSentSignalRef.current = {
          recordedAt: result.recordedAt,
          position: queuedReading.coordinates,
        }
      } catch (error) {
        if (error instanceof NativeLocationUploadError && error.retryable) {
          await writeQueuedNativeTrackingReadings(
            session.user.id,
            serviceId,
            queuedReadings.slice(index),
          )

          return 'queued' as const
        }

        await clearQueuedNativeTrackingReadings(session.user.id, serviceId)
        throw error
      }
    }

    await clearQueuedNativeTrackingReadings(session.user.id, serviceId)
    return 'flushed' as const
  }, [
    currentService?.id,
    isNativeBackgroundTracking,
    session.token,
    session.user.id,
  ])

  const sendBrowserTrackedLocationUpdate = useCallback(
    async (reading: DriverLocationReading) => {
      if (!routeInView) {
        return {
          accepted: false,
          rejectionMessage: 'No hay una ruta activa para validar tu ubicación.',
        }
      }

      const plausibility = evaluateBrowserSignalPlausibility({
        accuracyMeters: reading.accuracyMeters,
        nextPosition: reading.coordinates,
        routeSegments: routeInView.segments,
      })

      if (!plausibility.accepted) {
        return {
          accepted: false,
          rejectionMessage: getTrackingRejectionMessage(
            plausibility.reason ?? 'outside_route_zone',
          ),
        }
      }

      const dispatchDecision = evaluateRealtimeSignalDispatch({
        lastSentAt: lastSentSignalRef.current.recordedAt,
        lastSentPosition: lastSentSignalRef.current.position,
        nextPosition: reading.coordinates,
      })

      if (!dispatchDecision.shouldSend && dispatchDecision.reason) {
        return {
          accepted: false,
          shouldContinue: true,
        }
      }

      const recordedAt = await sendLocationUpdate(
        reading.coordinates.lat,
        reading.coordinates.lng,
        reading.accuracyMeters,
        reading.capturedAt,
      )

      return {
        accepted: true,
        recordedAt,
      }
    },
    [routeInView, sendLocationUpdate],
  )

  const sendNativeTrackedLocationUpdate = useCallback(
    async (reading: DriverLocationReading) => {
      if (!routeInView) {
        return {
          accepted: false,
          rejectionMessage: 'No hay una ruta activa para validar tu ubicación.',
        }
      }

      const plausibility = evaluateBrowserSignalPlausibility({
        accuracyMeters: reading.accuracyMeters,
        nextPosition: reading.coordinates,
        routeSegments: routeInView.segments,
      })

      if (!plausibility.accepted) {
        return {
          accepted: false,
          rejectionMessage: getTrackingRejectionMessage(
            plausibility.reason ?? 'outside_route_zone',
          ),
        }
      }

      const dispatchDecision = evaluateRealtimeSignalDispatch({
        lastSentAt: lastSentSignalRef.current.recordedAt,
        lastSentPosition: lastSentSignalRef.current.position,
        nextPosition: reading.coordinates,
      })

      if (!dispatchDecision.shouldSend && dispatchDecision.reason) {
        return {
          accepted: false,
          shouldContinue: true,
        }
      }

      const serviceId = currentService?.id ?? activeServiceIdRef.current

      if (!serviceId) {
        return {
          accepted: false,
          shouldContinue: true,
          rejectionMessage:
            'No se encontró el servicio activo para sincronizar esta ubicación.',
        }
      }

      const queueState = await flushQueuedNativeTrackingReadings()

      if (queueState === 'queued') {
        await appendQueuedNativeTrackingReading(session.user.id, serviceId, reading)

        return {
          accepted: false,
          shouldContinue: true,
          rejectionMessage:
            'La app seguirá guardando lecturas hasta recuperar conexión.',
        }
      }

      try {
        const result = await uploadNativeLocationUpdate({
          sessionToken: session.token,
          reading,
        })

        lastSentSignalRef.current = {
          recordedAt: result.recordedAt,
          position: reading.coordinates,
        }

        return {
          accepted: true,
          recordedAt: result.recordedAt,
        }
      } catch (error) {
        if (error instanceof NativeLocationUploadError && error.retryable) {
          await appendQueuedNativeTrackingReading(session.user.id, serviceId, reading)

          return {
            accepted: false,
            shouldContinue: true,
            rejectionMessage: error.message,
          }
        }

        throw error
      }
    },
    [
      currentService?.id,
      flushQueuedNativeTrackingReadings,
      routeInView,
      session.token,
      session.user.id,
    ],
  )

  const sendTrackedLocationUpdate = useCallback(
    async (reading: DriverLocationReading) => {
      if (isNativeBackgroundTracking) {
        return await sendNativeTrackedLocationUpdate(reading)
      }

      return await sendBrowserTrackedLocationUpdate(reading)
    },
    [
      isNativeBackgroundTracking,
      sendBrowserTrackedLocationUpdate,
      sendNativeTrackedLocationUpdate,
    ],
  )

  useEffect(() => {
    if (
      !shouldAutoResumeShare ||
      permissionState !== 'granted' ||
      currentService?.status !== 'active' ||
      trackingStatus !== 'stopped'
    ) {
      return
    }

    setErrorMessage(null)
    startTracking(sendTrackedLocationUpdate)
  }, [
    currentService?.status,
    permissionState,
    sendTrackedLocationUpdate,
    shouldAutoResumeShare,
    startTracking,
    trackingStatus,
  ])

  useEffect(() => {
    if (!isNativeBackgroundTracking || currentService?.status !== 'active') {
      return
    }

    void flushQueuedNativeTrackingReadings().catch(() => {
      // El proximo envio nativo reintentara la cola pendiente.
    })
  }, [
    currentService?.status,
    flushQueuedNativeTrackingReadings,
    isNativeBackgroundTracking,
  ])

  useEffect(() => {
    if (!isNativeBackgroundTracking) {
      return
    }

    let listenerHandle: PluginListenerHandle | null = null

    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && currentService?.status === 'active') {
        void flushQueuedNativeTrackingReadings().catch(() => {
          // El siguiente ciclo de tracking volvera a intentar.
        })
      }
    }).then((handle) => {
      listenerHandle = handle
    })

    return () => {
      void listenerHandle?.remove()
    }
  }, [
    currentService?.status,
    flushQueuedNativeTrackingReadings,
    isNativeBackgroundTracking,
  ])

  if (!panelContext || currentService === undefined) {
    return (
      <DriverPanelEmptyState
        title="Cargando tu panel"
        description="Estamos validando tu sesión, tu unidad y la ruta actual."
      />
    )
  }

  if (!hasAssignedVehicle) {
    return (
      <DriverPanelEmptyState
        title="Tu cuenta aún no tiene unidad asignada"
        description="Pide a administración que te asigne una unidad para poder iniciar ruta."
      />
    )
  }

  if (availableRoutes.length === 0) {
    return (
      <DriverPanelEmptyState
        title="No hay rutas disponibles"
        description="Las rutas oficiales no están activas en este momento."
      />
    )
  }

  const runAction = (runner: () => Promise<void>) => {
    setErrorMessage(null)
    setFeedbackMessage(null)

    void (async () => {
      setIsSubmitting(true)

      try {
        await runner()
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  const beginRealtimeShare = async () => {
    const hasPermission =
      permissionState === 'granted' ? true : await requestPermission()

    if (!hasPermission) {
      setFeedbackMessage('Autoriza tu ubicación para empezar a compartir.')
      return false
    }

    startTracking(sendTrackedLocationUpdate)
    return true
  }

  const handleStartRoute = () => {
    if (!selectedRoute) {
      setErrorMessage('No hay una ruta seleccionada para operar.')
      return
    }

    runAction(async () => {
      if (!currentService) {
        const result = await activateService({
          sessionToken: session.token,
          routeId: selectedRoute.id as Id<'routes'>,
        })
        activeServiceIdRef.current = result.serviceId
        setFeedbackMessage(`Ruta iniciada en ${selectedRoute.name}.`)
      } else if (currentService.status === 'paused') {
        const result = await resumeCurrentService({
          sessionToken: session.token,
        })
        activeServiceIdRef.current = result.serviceId
        setFeedbackMessage('Ruta reanudada.')
      } else {
        setFeedbackMessage('Tu ruta ya está activa.')
      }

      setShouldAutoResumeShare(true)
      await beginRealtimeShare()
    })
  }

  const handlePauseRoute = () => {
    runAction(async () => {
      await pauseCurrentService({
        sessionToken: session.token,
      })
      stopTracking()
      setShouldAutoResumeShare(false)
      setFeedbackMessage('Ruta pausada.')
    })
  }

  const handleFinishRoute = () => {
    runAction(async () => {
      const serviceId = currentService?.id ?? activeServiceIdRef.current
      await finishCurrentService({
        sessionToken: session.token,
      })
      stopTracking()
      setShouldAutoResumeShare(false)
      activeServiceIdRef.current = null

      if (serviceId) {
        await clearQueuedNativeTrackingReadings(session.user.id, serviceId)
      }

      setFeedbackMessage('Ruta finalizada.')
    })
  }

  const handleConfirmRouteChange = () => {
    if (!pendingRouteId) {
      return
    }

    runAction(async () => {
      const result = await changeAssignedRoute({
        sessionToken: session.token,
        routeId: pendingRouteId as Id<'routes'>,
      })
      setSelectedRouteId(result.routeId)
      setPendingRouteId(result.routeId)
      setRouteChangeOpen(false)
      setFeedbackMessage(`Ruta cambiada a ${result.routeName}.`)
    })
  }

  const handleSendManualLocation = () => {
    const lat = Number(manualLat)
    const lng = Number(manualLng)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setErrorMessage('Ingresa una latitud y longitud válidas.')
      return
    }

    runAction(async () => {
      await sendLocationUpdate(lat, lng)
      setFeedbackMessage('Ubicación enviada.')
    })
  }

  const handleRefreshLocation = () => {
    if (currentService?.status !== 'active') {
      return
    }

    if (isShareRunning) {
      setFeedbackMessage('La ubicación ya se está compartiendo.')
      return
    }

    setErrorMessage(null)
    setFeedbackMessage(null)
    setIsRefreshingLocation(true)

    void (async () => {
      try {
        const started = await beginRealtimeShare()

        if (started) {
          setShouldAutoResumeShare(true)
          setFeedbackMessage('Recargando tu ubicación real.')
        }
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
      } finally {
        setIsRefreshingLocation(false)
      }
    })()
  }

  const handleReportMissingSchedule = () => {
    if (!routeInView || isReportingMissingSchedule) {
      return
    }

    setIsReportingMissingSchedule(true)
    setErrorMessage(null)

    void (async () => {
      try {
        await reportRouteScheduleIssue({
          sessionToken: session.token,
          routeId: routeInView.id as Id<'routes'>,
        })
        setFeedbackMessage(
          'Se notificó a administración que esta ruta no muestra horario.',
        )
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
      } finally {
        setIsReportingMissingSchedule(false)
      }
    })()
  }

  const handleLogout = () => {
    stopTracking()
    setShouldAutoResumeShare(false)
    setIsLoggingOut(true)

    void (async () => {
      try {
        await logout({ sessionToken: session.token })
      } finally {
        writeStoredAutoSharePreference(session.user.id, false)
        onLogout()
        setIsLoggingOut(false)
      }
    })()
  }

  const lastSignalLabel = currentService?.lastLocationUpdateAt
    ? timeSinceLastSignal
    : 'Sin señal aún'

  return (
    <>
      <section className="space-y-3">
        <DriverStatusSummary
          driverName={panelContext.driver?.name ?? session.user.name}
          vehicle={panelContext.vehicle}
          routeInView={routeInView}
          currentService={currentService}
          sharingStatusLabel={sharingStatusLabel}
          lastSignalLabel={lastSignalLabel}
          isLoggingOut={isLoggingOut}
          isSubmitting={isSubmitting}
          isShareRunning={isShareRunning}
          isRefreshingLocation={isRefreshingLocation || isRealtimeBusy}
          onLogout={handleLogout}
          onOpenRouteInfo={() => setRouteInfoOpen(true)}
          onOpenRouteChange={() => {
            setPendingRouteId(routeInView?.id ?? selectedRouteId)
            setRouteChangeOpen(true)
          }}
          onStartRoute={handleStartRoute}
          onPauseRoute={handlePauseRoute}
          onFinishRoute={handleFinishRoute}
          onRefreshLocation={handleRefreshLocation}
        />

        <section className="panel overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
          <DriverRouteMap
            route={routeInView}
            livePosition={lastTrackedPosition}
            lastSharedPosition={currentService?.lastPosition ?? null}
          />

          {showManualFallback ? (
            <div className="mt-3 grid gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50/80 px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Latitud</span>
                <input
                  type="text"
                  value={manualLat}
                  onChange={(event) => setManualLat(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Longitud</span>
                <input
                  type="text"
                  value={manualLng}
                  onChange={(event) => setManualLng(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <button
                type="button"
                onClick={handleSendManualLocation}
                disabled={isSubmitting || currentService?.status !== 'active'}
                className="min-h-11 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Enviar
              </button>
            </div>
          ) : null}
        </section>

        {feedbackMessage ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {feedbackMessage}
          </p>
        ) : null}

        <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {backgroundCapabilityMessage}
        </p>

        {errorMessage ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        {trackingError ? (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <p>{trackingError}</p>
            {permissionState === 'denied' && openSettings ? (
              <button
                type="button"
                onClick={() => {
                  void openSettings()
                }}
                className="mt-3 min-h-10 rounded-full border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-900 transition hover:border-amber-300 hover:bg-amber-100"
              >
                Abrir ajustes del sistema
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {isRouteChangeOpen ? (
        <DriverRouteChangeModal
          routes={availableRoutes}
          currentRouteId={routeInView?.id ?? selectedRouteId}
          pendingRouteId={pendingRouteId}
          onPendingRouteChange={setPendingRouteId}
          onClose={() => setRouteChangeOpen(false)}
          onConfirm={handleConfirmRouteChange}
          isSubmitting={isSubmitting}
        />
      ) : null}

      {isRouteInfoOpen && routeInView ? (
        <DriverRouteInfoModal
          route={routeInView}
          onClose={() => setRouteInfoOpen(false)}
          onReportMissingSchedule={handleReportMissingSchedule}
          isReportingMissingSchedule={isReportingMissingSchedule}
        />
      ) : null}
    </>
  )
}
