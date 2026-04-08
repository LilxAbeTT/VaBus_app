import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConvexError } from 'convex/values'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { AuthenticatedSession, BusRoute } from '../../../types/domain'
import { useCurrentTime } from '../../../hooks/useCurrentTime'
import { formatElapsedSignalTime } from '../../../lib/trackingSignal'
import {
  useBrowserLocationTracking,
  type BrowserLocationReading,
} from '../hooks/useBrowserLocationTracking'
import { DriverRouteMap } from './DriverRouteMap'

const AUTO_SHARE_STORAGE_PREFIX = 'vabus.driver.autoShare.'

function getErrorMessage(error: unknown) {
  if (error instanceof ConvexError) {
    return String(error.data)
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Ocurrio un error inesperado.'
}

function formatDateTime(value?: string) {
  if (!value) {
    return 'Sin registro'
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getTransportTypeLabel(transportType: BusRoute['transportType']) {
  return transportType === 'urbano' ? 'Urbano' : 'Colectivo'
}

function parseRouteDirection(direction: string) {
  const normalizedDirection = direction.replace(/\s+/g, ' ').trim()
  const startTimeMatch = normalizedDirection.match(
    /Inicio:\s*(.+?)(?=Finaliza:|Frecuencia:|$)/i,
  )
  const endTimeMatch = normalizedDirection.match(
    /Finaliza:\s*(.+?)(?=Frecuencia:|$)/i,
  )
  const frequencyMatch = normalizedDirection.match(/Frecuencia:\s*(.+)$/i)
  const pathSummary = normalizedDirection
    .replace(/^Trayecto:\s*/i, '')
    .replace(/Inicio:\s*.+$/i, '')
    .trim()
    .replace(/[.,]\s*$/, '')

  const stops = pathSummary
    .split(/\s+-\s+|,\s*/)
    .map((stop) => stop.trim())
    .filter((stop, index, allStops) => stop.length > 0 && allStops.indexOf(stop) === index)

  return {
    summary: pathSummary,
    stops,
    startTime: startTimeMatch?.[1]?.trim() ?? null,
    endTime: endTimeMatch?.[1]?.trim() ?? null,
    frequency: frequencyMatch?.[1]?.trim() ?? null,
  }
}

function getSharePreferenceKey(driverId: string) {
  return `${AUTO_SHARE_STORAGE_PREFIX}${driverId}`
}

function readStoredAutoSharePreference(driverId: string) {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(getSharePreferenceKey(driverId)) === 'true'
}

function writeStoredAutoSharePreference(driverId: string, enabled: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  const storageKey = getSharePreferenceKey(driverId)

  if (enabled) {
    window.localStorage.setItem(storageKey, 'true')
    return
  }

  window.localStorage.removeItem(storageKey)
}

function DriverPanelEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="panel px-4 py-5 sm:px-6 sm:py-6">
      <p className="eyebrow">Conductor</p>
      <h2 className="mt-3 font-display text-xl text-slate-900 sm:text-2xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        {description}
      </p>
    </section>
  )
}

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(children, document.body)
}

function RouteInfoModal({
  route,
  onClose,
}: {
  route: BusRoute
  onClose: () => void
}) {
  const routeDetails = parseRouteDirection(route.direction)

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-950/35 p-4 backdrop-blur-[2px] sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Informacion de ${route.name}`}
          className="panel w-full max-w-md px-5 py-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Info de ruta</p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">
                {route.name}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {getTransportTypeLabel(route.transportType)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Cerrar informacion de ruta"
            >
              X
            </button>
          </div>

          <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
              Trayecto
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {routeDetails.summary}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Inicio
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {routeDetails.startTime ?? 'No disponible'}
              </p>
            </div>
            <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Finaliza
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {routeDetails.endTime ?? 'No disponible'}
              </p>
            </div>
            <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Frecuencia
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {routeDetails.frequency ?? 'No disponible'}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {routeDetails.stops.length > 0 ? (
              routeDetails.stops.map((stop) => (
                <span
                  key={stop}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                >
                  {stop}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500">
                No hay detalle adicional disponible.
              </span>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function RouteChangeModal({
  routes,
  currentRouteId,
  pendingRouteId,
  onPendingRouteChange,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  routes: BusRoute[]
  currentRouteId: string
  pendingRouteId: string
  onPendingRouteChange: (routeId: string) => void
  onClose: () => void
  onConfirm: () => void
  isSubmitting: boolean
}) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-950/35 p-4 backdrop-blur-[2px] sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cambiar ruta del conductor"
          className="panel w-full max-w-md px-5 py-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Cambio de ruta</p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">
                Elige la nueva ruta
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Cerrar cambio de ruta"
            >
              X
            </button>
          </div>

          <div className="mt-4 rounded-[1.15rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Al confirmar, administracion vera tu nuevo cambio de ruta.
          </div>

          <div className="mt-4 max-h-[48svh] space-y-2 overflow-y-auto pr-1">
            {routes.map((route) => {
              const isSelected = route.id === pendingRouteId
              const isCurrent = route.id === currentRouteId

              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => onPendingRouteChange(route.id)}
                  className={`w-full rounded-[1.2rem] border bg-white px-4 py-3 text-left transition ${
                    isSelected
                      ? 'border-slate-900 shadow-[0_18px_30px_-24px_rgba(15,23,42,0.6)]'
                      : 'border-slate-200 hover:border-teal-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className="block h-2.5 w-14 rounded-full"
                        style={{ backgroundColor: route.color }}
                      />
                      <p className="mt-2 truncate font-display text-lg text-slate-900">
                        {route.name}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {getTransportTypeLabel(route.transportType)}
                      </span>
                      {isCurrent ? (
                        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                          Actual
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting || pendingRouteId === currentRouteId}
              className="min-h-11 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? 'Guardando...' : 'Confirmar cambio'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
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
    lastBrowserPosition,
    requestPermission,
    startTracking,
    stopTracking,
  } = useBrowserLocationTracking()
  const logout = useMutation(api.auth.logout)
  const activateService = useMutation(api.driver.activateService)
  const pauseCurrentService = useMutation(api.driver.pauseCurrentService)
  const resumeCurrentService = useMutation(api.driver.resumeCurrentService)
  const finishCurrentService = useMutation(api.driver.finishCurrentService)
  const addLocationUpdate = useMutation(api.driver.addLocationUpdate)
  const changeAssignedRoute = useMutation(api.driver.changeAssignedRoute)
  const panelState = useQuery(api.driver.getPanelState, {
    sessionToken: session.token,
  })

  const [selectedRouteId, setSelectedRouteId] = useState('')
  const [pendingRouteId, setPendingRouteId] = useState('')
  const [isRouteChangeOpen, setRouteChangeOpen] = useState(false)
  const [isRouteInfoOpen, setRouteInfoOpen] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [showManualFallback, setShowManualFallback] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
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

  const currentService = panelState?.currentService ?? null
  const hasAssignedVehicle = Boolean(panelState?.vehicle)
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

  useEffect(() => {
    if (!panelState) {
      return
    }

    const nextRouteId =
      currentService?.routeId ??
      panelState.preferredRouteId ??
      panelState.vehicle?.defaultRouteId ??
      panelState.availableRoutes[0]?.id ??
      ''

    if (nextRouteId) {
      setSelectedRouteId((currentValue) => currentValue || nextRouteId)
      setPendingRouteId((currentValue) => currentValue || nextRouteId)
    }
  }, [currentService?.routeId, panelState])

  const selectedRoute = useMemo(
    () =>
      panelState?.availableRoutes.find((route) => route.id === selectedRouteId) ?? null,
    [panelState?.availableRoutes, selectedRouteId],
  )
  const routeInView = useMemo(
    () =>
      panelState?.availableRoutes.find(
        (route) => route.id === (currentService?.routeId ?? selectedRouteId),
      ) ?? selectedRoute,
    [currentService?.routeId, panelState?.availableRoutes, selectedRoute, selectedRouteId],
  )

  const suggestedPoint = useMemo(() => {
    if (currentService?.lastPosition) {
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
    if (!panelState) {
      return
    }

    if (currentService?.status === 'active') {
      return
    }

    stopTracking()

    if (shouldAutoResumeShare) {
      setShouldAutoResumeShare(false)
    }
  }, [currentService?.status, panelState, shouldAutoResumeShare, stopTracking])

  const sendLocationUpdate = useCallback(
    async (lat: number, lng: number) => {
      const result = await addLocationUpdate({
        sessionToken: session.token,
        lat,
        lng,
      })

      lastSentSignalRef.current = {
        recordedAt: result.recordedAt,
        position: { lat, lng },
      }

      return result.recordedAt
    },
    [addLocationUpdate, session.token],
  )

  const sendTrackedLocationUpdate = useCallback(
    async (reading: BrowserLocationReading) => {
      const recordedAt = await sendLocationUpdate(
        reading.coordinates.lat,
        reading.coordinates.lng,
      )

      return {
        accepted: true,
        recordedAt,
      }
    },
    [sendLocationUpdate],
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

  if (!panelState) {
    return (
      <DriverPanelEmptyState
        title="Cargando tu panel"
        description="Estamos validando tu sesion, tu unidad y la ruta actual."
      />
    )
  }

  if (!hasAssignedVehicle) {
    return (
      <DriverPanelEmptyState
        title="Tu cuenta aun no tiene unidad asignada"
        description="Pide a administracion que te asigne una unidad para poder iniciar ruta."
      />
    )
  }

  if (panelState.availableRoutes.length === 0) {
    return (
      <DriverPanelEmptyState
        title="No hay rutas disponibles"
        description="Las rutas oficiales no estan activas en este momento."
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
      setFeedbackMessage('Autoriza tu ubicacion para empezar a compartir.')
      return
    }

    startTracking(sendTrackedLocationUpdate)
  }

  const handleStartRoute = () => {
    if (!selectedRoute) {
      setErrorMessage('No hay una ruta seleccionada para operar.')
      return
    }

    runAction(async () => {
      if (!currentService) {
        await activateService({
          sessionToken: session.token,
          routeId: selectedRoute.id as Id<'routes'>,
        })
        setFeedbackMessage(`Ruta iniciada en ${selectedRoute.name}.`)
      } else if (currentService.status === 'paused') {
        await resumeCurrentService({
          sessionToken: session.token,
        })
        setFeedbackMessage('Ruta reanudada.')
      } else {
        setFeedbackMessage('Tu ruta ya esta activa.')
      }

      setShouldAutoResumeShare(true)
      await beginRealtimeShare()
    })
  }

  const handlePauseRoute = () => {
    stopTracking()
    setShouldAutoResumeShare(false)

    runAction(async () => {
      await pauseCurrentService({
        sessionToken: session.token,
      })
      setFeedbackMessage('Ruta pausada.')
    })
  }

  const handleFinishRoute = () => {
    stopTracking()
    setShouldAutoResumeShare(false)

    runAction(async () => {
      await finishCurrentService({
        sessionToken: session.token,
      })
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
      setErrorMessage('Ingresa una latitud y longitud validas.')
      return
    }

    runAction(async () => {
      await sendLocationUpdate(lat, lng)
      setFeedbackMessage('Ubicacion enviada.')
    })
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
    ? `${timeSinceLastSignal}`
    : 'Sin señal aun'

  return (
    <>
      <section className="space-y-3">
        <section className="panel overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Conductor</p>
                <h2 className="mt-2 font-display text-3xl text-slate-900 sm:text-4xl">
                  {panelState.driver?.name ?? session.user.name}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {panelState.vehicle?.unitNumber} - {panelState.vehicle?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="min-h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {isLoggingOut ? 'Cerrando...' : 'Salir'}
              </button>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.14),_transparent_48%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(243,248,255,0.95))] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {routeInView ? (
                      <>
                        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                          {getTransportTypeLabel(routeInView.transportType)}
                        </span>
                        <span
                          className="h-2.5 w-14 rounded-full"
                          style={{ backgroundColor: routeInView.color }}
                        />
                      </>
                    ) : null}
                  </div>
                  <h3 className="mt-3 truncate font-display text-2xl text-slate-900">
                    {routeInView?.name ?? 'Sin ruta asignada'}
                  </h3>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRouteInfoOpen(true)}
                    disabled={!routeInView}
                    className="min-h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Info
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingRouteId(routeInView?.id ?? selectedRouteId)
                      setRouteChangeOpen(true)
                    }}
                    className="min-h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700"
                  >
                    Cambiar
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleStartRoute}
                disabled={
                  isSubmitting ||
                  isLoggingOut ||
                  (currentService?.status === 'active' && isShareRunning)
                }
                className="min-h-11 flex-1 rounded-full bg-teal-600 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Iniciar ruta
              </button>
              <button
                type="button"
                onClick={handlePauseRoute}
                disabled={isSubmitting || currentService?.status !== 'active'}
                className="min-h-11 flex-1 rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-amber-300 hover:text-amber-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                Pausar ruta
              </button>
              <button
                type="button"
                onClick={handleFinishRoute}
                disabled={isSubmitting || !currentService}
                className="min-h-11 flex-1 rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                Terminar ruta
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                Ultima señal: {lastSignalLabel}
              </span>
              {currentService?.lastLocationUpdateAt ? (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {formatDateTime(currentService.lastLocationUpdateAt)}
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <section className="panel overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
          <DriverRouteMap
            route={routeInView}
            livePosition={lastBrowserPosition}
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

        {errorMessage ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        {trackingError ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {trackingError}
          </p>
        ) : null}
      </section>

      {isRouteChangeOpen ? (
        <RouteChangeModal
          routes={panelState.availableRoutes}
          currentRouteId={routeInView?.id ?? selectedRouteId}
          pendingRouteId={pendingRouteId}
          onPendingRouteChange={setPendingRouteId}
          onClose={() => setRouteChangeOpen(false)}
          onConfirm={handleConfirmRouteChange}
          isSubmitting={isSubmitting}
        />
      ) : null}

      {isRouteInfoOpen && routeInView ? (
        <RouteInfoModal route={routeInView} onClose={() => setRouteInfoOpen(false)} />
      ) : null}
    </>
  )
}
