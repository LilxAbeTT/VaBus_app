import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import L from 'leaflet'
import { convexUrl } from '../../../lib/env'
import {
  getMinimumDistanceToRouteMeters,
  getOperationalStatusLabel,
} from '../../../lib/trackingSignal'
import type {
  BusRoute,
  PassengerMapSnapshot,
  PassengerMapVehicle,
  TransportType,
} from '../../../types/domain'
import type { ServiceOperationalStatus } from '../../../../shared/tracking'
import { usePassengerRouteSelection } from '../hooks/usePassengerRouteSelection'
import { usePassengerMapSnapshot } from '../hooks/usePassengerMapSnapshot'
import { usePassengerGeolocation } from '../hooks/usePassengerGeolocation'

function formatLastUpdate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

function getTransportTypeLabel(transportType: TransportType) {
  return transportType === 'urbano' ? 'Urbano' : 'Colectivo'
}

function getSignalBadgeClass(status: ServiceOperationalStatus) {
  switch (status) {
    case 'active_recent':
      return 'bg-emerald-100 text-emerald-700'
    case 'active_stale':
      return 'bg-amber-100 text-amber-700'
    case 'probably_stopped':
      return 'bg-rose-100 text-rose-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function getMarkerStyle(status: ServiceOperationalStatus) {
  switch (status) {
    case 'active_stale':
      return {
        radius: 9,
        color: '#b45309',
        fillColor: '#f59e0b',
        fillOpacity: 0.92,
        weight: 3,
      }
    case 'probably_stopped':
      return {
        radius: 8,
        color: '#be123c',
        fillColor: '#fb7185',
        fillOpacity: 0.78,
        weight: 3,
      }
    default:
      return {
        radius: 10,
        color: '#0f766e',
        fillColor: '#2dd4bf',
        fillOpacity: 1,
        weight: 3,
      }
  }
}

function getRouteGroups(routes: BusRoute[]) {
  const groupedRoutes = new Map<TransportType, BusRoute[]>()

  routes.forEach((route) => {
    const currentGroup = groupedRoutes.get(route.transportType) ?? []
    currentGroup.push(route)
    groupedRoutes.set(route.transportType, currentGroup)
  })

  return (['urbano', 'colectivo'] as const)
    .map((transportType) => ({
      transportType,
      label: getTransportTypeLabel(transportType),
      routes: (groupedRoutes.get(transportType) ?? []).sort((left, right) =>
        left.name.localeCompare(right.name, 'es'),
      ),
    }))
    .filter((group) => group.routes.length > 0)
}

function formatDistanceRange(distanceMeters: number) {
  if (distanceMeters < 150) return '0 a 150 m'
  if (distanceMeters < 300) return '150 a 300 m'
  if (distanceMeters < 600) return '300 a 600 m'
  if (distanceMeters < 1_000) return '600 m a 1 km'
  if (distanceMeters < 2_000) return '1 a 2 km'
  if (distanceMeters < 4_000) return '2 a 4 km'
  return 'mas de 4 km'
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

function getRouteDistanceTone(distanceMeters: number | null) {
  if (distanceMeters === null) return 'bg-slate-100 text-slate-600'
  if (distanceMeters <= 600) return 'bg-emerald-100 text-emerald-700'
  if (distanceMeters <= 2_000) return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

function getLocationStatusCopy({
  permissionState,
  isRequestingPermission,
  errorMessage,
}: {
  permissionState: ReturnType<typeof usePassengerGeolocation>['permissionState']
  isRequestingPermission: boolean
  errorMessage: string | null
}) {
  if (isRequestingPermission) {
    return {
      title: 'Solicitando tu ubicacion',
      description: 'Acepta el permiso para ver rutas cercanas y ubicarte en el mapa.',
    }
  }

  if (permissionState === 'granted') {
    return {
      title: 'Tu ubicacion esta activa',
      description: 'Las rutas cercanas se calculan en tiempo real segun tu posicion.',
    }
  }

  if (permissionState === 'denied') {
    return {
      title: 'La ubicacion esta bloqueada',
      description:
        errorMessage ??
        'Activa el permiso del navegador para ver rutas cercanas y usar el boton de ubicacion.',
    }
  }

  if (permissionState === 'unsupported') {
    return {
      title: 'Tu navegador no soporta ubicacion',
      description: 'Puedes seguir usando el mapa, pero no se mostraran rutas cercanas a ti.',
    }
  }

  return {
    title: 'Ubicacion pendiente',
    description: 'Esperando permiso o una primera lectura de ubicacion.',
  }
}

type PassengerMapVehicleView = PassengerMapVehicle & {
  isVisibleInOverview: boolean
  transportType: TransportType
}

function decorateVehiclesWithRouteMeta(
  vehicles: PassengerMapVehicle[],
  routes: BusRoute[],
): PassengerMapVehicleView[] {
  const routeTransportTypeById = new Map(
    routes.map((route) => [route.id, route.transportType] as const),
  )

  return vehicles.map((vehicle) => ({
    ...vehicle,
    isVisibleInOverview: vehicle.operationalStatus !== 'probably_stopped',
    transportType: routeTransportTypeById.get(vehicle.routeId) ?? 'urbano',
  }))
}

function getDisplayedVehicles(
  vehicles: PassengerMapVehicleView[],
  _selectedRouteId: string | null,
  activeTransportType: TransportType,
) {
  return vehicles.filter(
    (vehicle) =>
      vehicle.transportType === activeTransportType && vehicle.isVisibleInOverview,
  )
}

function getDisplayedRoutes(
  routeGroups: ReturnType<typeof getRouteGroups>,
  activeTransportType: TransportType,
) {
  return (
    routeGroups.find((group) => group.transportType === activeTransportType)?.routes ??
    []
  )
}

function getVehicleStatsByRoute(vehicles: PassengerMapVehicleView[]) {
  const statsByRouteId = new Map<string, { visible: number; stopped: number }>()

  vehicles.forEach((vehicle) => {
    const current = statsByRouteId.get(vehicle.routeId) ?? { visible: 0, stopped: 0 }

    if (vehicle.isVisibleInOverview) current.visible += 1
    if (vehicle.operationalStatus === 'probably_stopped') current.stopped += 1

    statsByRouteId.set(vehicle.routeId, current)
  })

  return statsByRouteId
}

function getSortedRoutesByDistance(
  routes: BusRoute[],
  routeDistanceById: Map<string, number | null>,
) {
  return routes
    .map((route) => ({
      route,
      distanceMeters: routeDistanceById.get(route.id) ?? null,
    }))
    .filter((entry) => entry.distanceMeters !== null)
    .sort((left, right) => (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0))
}

function getRouteBoundsPoints(routes: BusRoute[]) {
  return routes.flatMap((route) =>
    route.segments.flatMap((segment) =>
      segment.map((point) => [point.lat, point.lng] as [number, number]),
    ),
  )
}

function LocationTargetIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </svg>
  )
}

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

function PassengerMapEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="panel px-4 py-5 sm:px-6 sm:py-6">
      <p className="eyebrow">Mapa</p>
      <h2 className="mt-3 font-display text-xl text-slate-900 sm:text-2xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        {description}
      </p>
    </section>
  )
}

function InfoModal({
  onClose,
}: {
  onClose: () => void
}) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ayuda del mapa"
          className="panel w-full max-w-sm px-5 py-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Ayuda</p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">
                Como usar el mapa
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Cerrar ayuda"
            >
              X
            </button>
          </div>

          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <p>Usa Rutas para elegir rapidamente una ruta y enfocarla.</p>
            <p>Usa Mi ubicacion para centrar el mapa en tu posicion actual.</p>
            <p>Toca una unidad para ver su estado y la hora de su ultima senal.</p>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
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
              <p className="eyebrow">Informacion de ruta</p>
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

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
              Colonias y puntos clave
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
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
      </div>
    </ModalPortal>
  )
}

function RoutePickerModal({
  isOpen,
  activeTransportType,
  routeGroups,
  selectedRouteId,
  onClose,
  onTransportTypeChange,
  onRouteSelect,
  onClearSelection,
}: {
  isOpen: boolean
  activeTransportType: TransportType
  routeGroups: ReturnType<typeof getRouteGroups>
  selectedRouteId: string | null
  onClose: () => void
  onTransportTypeChange: (transportType: TransportType) => void
  onRouteSelect: (routeId: string) => void
  onClearSelection: () => void
}) {
  if (!isOpen) {
    return null
  }

  const activeGroup =
    routeGroups.find((group) => group.transportType === activeTransportType) ??
    routeGroups[0] ??
    null

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-950/35 p-4 backdrop-blur-[2px] sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Seleccionar ruta"
          className="panel w-full max-w-lg px-4 py-4 sm:px-5 sm:py-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Rutas</p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">
                Elige el tipo y la ruta
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Cerrar selector de ruta"
            >
              X
            </button>
          </div>

          <div className="mt-4 inline-flex rounded-full bg-slate-100 p-1">
            {routeGroups.map((group) => (
              <button
                key={group.transportType}
                type="button"
                onClick={() => onTransportTypeChange(group.transportType)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  group.transportType === activeTransportType
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {group.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
            {activeGroup?.routes.map((route) => {
              const isSelected = route.id === selectedRouteId

              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => onRouteSelect(route.id)}
                  className={`min-w-[200px] snap-start rounded-[1.3rem] border bg-white px-4 py-4 text-left shadow-sm transition ${
                    isSelected
                      ? 'border-slate-900 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.6)]'
                      : 'border-slate-200 hover:border-teal-300'
                  }`}
                >
                  <span
                    className="block h-2.5 w-14 rounded-full"
                    style={{ backgroundColor: route.color }}
                  />
                  <span className="mt-3 block font-display text-lg text-slate-900">
                    {route.name}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClearSelection}
              className="text-sm font-semibold text-slate-600 transition hover:text-slate-900"
            >
              Ver mapa general
            </button>
            <p className="text-xs text-slate-500">Toca una ruta para enfocarla.</p>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function PassengerMapContent({
  snapshot,
}: {
  snapshot: PassengerMapSnapshot
}) {
  const routes = snapshot.routes
  const routeGroups = useMemo(() => getRouteGroups(routes), [routes])
  const {
    hasHydratedSelection,
    selectedRouteId,
    setSelectedRouteId,
    clearSelectedRoute,
  } = usePassengerRouteSelection(routes)
  const selectedRoute =
    routes.find((route) => route.id === selectedRouteId) ?? null
  const [routeCarouselTransportType, setRouteCarouselTransportType] =
    useState<TransportType>(routeGroups[0]?.transportType ?? 'urbano')
  const [hasTransportTypeFilter, setHasTransportTypeFilter] = useState(false)
  const [isRoutePickerOpen, setRoutePickerOpen] = useState(false)
  const [isInfoOpen, setInfoOpen] = useState(false)
  const [routeInfoRouteId, setRouteInfoRouteId] = useState<string | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [centerOnUserRequestCount, setCenterOnUserRequestCount] = useState(0)
  const {
    permissionState,
    isRequestingPermission,
    position: userPosition,
    accuracyMeters,
    errorMessage: userLocationError,
    requestPermission,
  } = usePassengerGeolocation()
  const vehiclesWithRouteMeta = useMemo(
    () => decorateVehiclesWithRouteMeta(snapshot.activeVehicles, routes),
    [routes, snapshot.activeVehicles],
  )
  const vehicleStatsByRoute = useMemo(
    () => getVehicleStatsByRoute(vehiclesWithRouteMeta),
    [vehiclesWithRouteMeta],
  )
  const resolvedRouteCarouselTransportType = routeGroups.some(
    (group) => group.transportType === routeCarouselTransportType,
  )
    ? routeCarouselTransportType
    : routeGroups[0]?.transportType ?? 'urbano'
  const activeTransportType =
    selectedRoute?.transportType ??
    resolvedRouteCarouselTransportType
  const displayedRoutes = useMemo(
    () => getDisplayedRoutes(routeGroups, activeTransportType),
    [activeTransportType, routeGroups],
  )
  const displayedVehicles = useMemo(
    () =>
      getDisplayedVehicles(
        vehiclesWithRouteMeta,
        selectedRoute?.id ?? null,
        activeTransportType,
      ),
    [activeTransportType, selectedRoute?.id, vehiclesWithRouteMeta],
  )
  const routeDistanceById = useMemo(() => {
    const distances = new Map<string, number | null>()

    routes.forEach((route) => {
      distances.set(
        route.id,
        userPosition
          ? getMinimumDistanceToRouteMeters(userPosition, route.segments)
          : null,
      )
    })

    return distances
  }, [routes, userPosition])
  const sortedRoutesByDistance = useMemo(
    () => getSortedRoutesByDistance(routes, routeDistanceById),
    [routeDistanceById, routes],
  )
  const activeRouteGroup =
    routeGroups.find((group) => group.transportType === activeTransportType) ??
    routeGroups[0] ??
    null
  const filteredRoutesByDistance = useMemo(() => {
    if (!hasTransportTypeFilter) {
      return []
    }

    return sortedRoutesByDistance.filter(
      (entry) => entry.route.transportType === activeTransportType,
    )
  }, [activeTransportType, hasTransportTypeFilter, sortedRoutesByDistance])
  const recommendedRoute =
    (hasTransportTypeFilter
      ? filteredRoutesByDistance[0]
      : sortedRoutesByDistance[0]) ?? null
  const locationStatusCopy = getLocationStatusCopy({
    permissionState,
    isRequestingPermission,
    errorMessage: userLocationError,
  })
  const selectedRouteVehicles = useMemo(
    () =>
      selectedRoute
        ? displayedVehicles.filter((vehicle) => vehicle.routeId === selectedRoute.id)
        : displayedVehicles,
    [displayedVehicles, selectedRoute],
  )
  const selectedVehicle =
    displayedVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
  const selectedVehicleSummary =
    selectedVehicle ?? selectedRouteVehicles[0] ?? displayedVehicles[0] ?? null
  const selectedRouteDistanceMeters = selectedRoute
    ? routeDistanceById.get(selectedRoute.id) ?? null
    : null
  const routeInfoRoute =
    routes.find((route) => route.id === routeInfoRouteId) ?? null

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const vehicleLayerRef = useRef<L.LayerGroup | null>(null)
  const userLayerRef = useRef<L.LayerGroup | null>(null)
  const didFitInitialViewRef = useRef(false)
  const lastFittedViewKeyRef = useRef<string | null>(null)

  function focusRoute(routeId: string) {
    const route = routes.find((currentRoute) => currentRoute.id === routeId)

    if (!route) {
      return
    }

    setRouteCarouselTransportType(route.transportType)
    setSelectedVehicleId(null)
    setSelectedRouteId(route.id)
  }

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }

    const map = L.map(mapContainerRef.current, {
      scrollWheelZoom: false,
      zoomControl: false,
    })

    mapRef.current = map
    routeLayerRef.current = L.layerGroup().addTo(map)
    vehicleLayerRef.current = L.layerGroup().addTo(map)
    userLayerRef.current = L.layerGroup().addTo(map)

    L.control.zoom({ position: 'topright' }).addTo(map)

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    map.setView([23.058, -109.701], 13)

    return () => {
      map.remove()
      mapRef.current = null
      routeLayerRef.current = null
      vehicleLayerRef.current = null
      userLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const routeLayer = routeLayerRef.current
    const vehicleLayer = vehicleLayerRef.current
    const userLayer = userLayerRef.current

    if (!map || !routeLayer || !vehicleLayer || !userLayer) {
      return
    }

    routeLayer.clearLayers()
    vehicleLayer.clearLayers()
    userLayer.clearLayers()

    const routeBoundsPoints = getRouteBoundsPoints(
      selectedRoute ? [selectedRoute] : displayedRoutes,
    )

    displayedRoutes.forEach((route) => {
      const isSelectedRoute = route.id === selectedRoute?.id
      const isSecondaryRoute = Boolean(selectedRoute) && !isSelectedRoute

      route.segments.forEach((segment) => {
        const path = segment.map((point) => [point.lat, point.lng] as [number, number])

        if (path.length === 0) {
          return
        }

        L.polyline(path, {
          color: isSecondaryRoute ? '#94a3b8' : route.color,
          weight: selectedRoute ? (isSelectedRoute ? 7 : 4) : 4,
          opacity: selectedRoute ? (isSelectedRoute ? 0.98 : 0.3) : 0.78,
        })
          .addTo(routeLayer)
          .bindPopup(route.name)
      })
    })

    displayedVehicles.forEach((vehicle) => {
      const markerPosition: [number, number] = [
        vehicle.position.lat,
        vehicle.position.lng,
      ]
      const marker = L.circleMarker(markerPosition, {
        ...getMarkerStyle(vehicle.operationalStatus),
      })

      marker
        .addTo(vehicleLayer)
        .bindPopup(
          `<strong>${vehicle.unitNumber}</strong><br/>${vehicle.routeName}<br/>${getOperationalStatusLabel(vehicle.operationalStatus)}<br/>Actualizado: ${formatLastUpdate(vehicle.lastUpdate)}`,
        )
        .on('click', () => setSelectedVehicleId(vehicle.id))

      if (vehicle.id === selectedVehicleId) {
        marker.openPopup()
      }
    })

    if (userPosition) {
      const userLatLng: [number, number] = [userPosition.lat, userPosition.lng]

      L.circleMarker(userLatLng, {
        radius: 8,
        color: '#1d4ed8',
        fillColor: '#60a5fa',
        fillOpacity: 1,
        weight: 3,
      })
        .addTo(userLayer)
        .bindPopup('Tu ubicacion actual')

      if (accuracyMeters && accuracyMeters > 0) {
        L.circle(userLatLng, {
          radius: Math.min(accuracyMeters, 600),
          color: '#60a5fa',
          fillColor: '#93c5fd',
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(userLayer)
      }
    }

    const viewKey = selectedRoute?.id ?? `transport:${activeTransportType}`
    const shouldFitView =
      !didFitInitialViewRef.current || lastFittedViewKeyRef.current !== viewKey

    if (shouldFitView && routeBoundsPoints.length > 0) {
      map.fitBounds(L.latLngBounds(routeBoundsPoints), {
        paddingTopLeft: [24, 72],
        paddingBottomRight: [24, selectedRoute || selectedVehicleSummary ? 112 : 32],
        maxZoom: selectedRoute ? 14.75 : 13.6,
      })
      didFitInitialViewRef.current = true
      lastFittedViewKeyRef.current = viewKey
      return
    }

    if (!didFitInitialViewRef.current && userPosition) {
      map.setView([userPosition.lat, userPosition.lng], 14)
      didFitInitialViewRef.current = true
      lastFittedViewKeyRef.current = viewKey
    }
  }, [
    accuracyMeters,
    activeTransportType,
    displayedRoutes,
    displayedVehicles,
    selectedRoute,
    selectedVehicleSummary,
    selectedVehicleId,
    userPosition,
  ])

  useEffect(() => {
    const map = mapRef.current

    if (!map || centerOnUserRequestCount === 0) {
      return
    }

    if (!userPosition) {
      requestPermission()
      return
    }

    map.flyTo([userPosition.lat, userPosition.lng], Math.max(map.getZoom(), 15), {
      duration: 0.55,
    })
  }, [centerOnUserRequestCount, requestPermission, userPosition])

  if (!hasHydratedSelection) {
    return (
      <PassengerMapEmptyState
        title="Cargando mapa"
        description="Recuperando la ultima ruta seleccionada para mostrar la vista del pasajero."
      />
    )
  }

  return (
    <>
      <section className="space-y-3 sm:space-y-4">
        <header className="panel px-3 py-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/"
              className="flex items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-1 transition hover:border-teal-300"
              aria-label="Volver al inicio"
            >
              <img
                src="/logo.png"
                alt="VaBus"
                className="h-12 w-14 object-contain"
              />
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRoutePickerOpen(true)}
                className="flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-teal-700"
              >
                Rutas
              </button>
              <button
                type="button"
                onClick={() => {
                  if (recommendedRoute) {
                    focusRoute(recommendedRoute.route.id)
                  }
                }}
                disabled={!recommendedRoute}
                className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                </span>
                Cerca
              </button>
              <Link
                to="/"
                className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700"
              >
                Regresar
              </Link>
            </div>
          </div>
        </header>


        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <article className="panel overflow-hidden">
            <div className="relative">
              <div
                ref={mapContainerRef}
                className="h-[50svh] min-h-[320px] w-full sm:h-[62svh] xl:h-[calc(100svh-11rem)] xl:min-h-[560px]"
              />

              <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-3">
                <div className="max-w-[70%] rounded-full bg-white/92 px-3 py-2 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.6)] backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
                    {selectedRoute
                      ? getTransportTypeLabel(selectedRoute.transportType)
                      : getTransportTypeLabel(activeTransportType)}
                  </p>
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {selectedRoute
                      ? selectedRoute.name
                      : `Vista general de ${getTransportTypeLabel(activeTransportType).toLowerCase()}`}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setCenterOnUserRequestCount((value) => value + 1)}
                    className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-sky-200 bg-white text-transparent shadow-[0_14px_28px_-24px_rgba(15,23,42,0.6)] backdrop-blur transition hover:border-sky-300"
                    aria-label="Ir a mi ubicacion"
                    title="Ir a mi ubicacion"
                  >
                    ⌖
                    <span className="absolute inset-0 flex items-center justify-center text-sky-700">
                      <LocationTargetIcon />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInfoOpen(true)}
                    className="flex h-11 items-center justify-center rounded-full bg-white/92 px-3 text-base font-semibold text-slate-700 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.6)] backdrop-blur transition hover:text-slate-900"
                    aria-label="Ver ayuda del mapa"
                  >
                    i
                  </button>
                </div>
              </div>

              {selectedRoute || selectedVehicleSummary ? (
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="rounded-[1.3rem] bg-white/94 px-4 py-3 shadow-[0_18px_35px_-28px_rgba(15,23,42,0.6)] backdrop-blur">
                    {selectedRoute ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-2.5 w-12 rounded-full"
                          style={{ backgroundColor: selectedRoute.color }}
                        />
                        <p className="font-semibold text-slate-900">
                          {selectedRoute.name}
                        </p>
                        {selectedRouteDistanceMeters !== null ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {selectedRouteDistanceMeters <= 600
                              ? 'Cerca de ti'
                              : formatDistanceRange(selectedRouteDistanceMeters)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedVehicleSummary ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {selectedVehicleSummary.unitNumber}
                        </span>
                        <span>{formatLastUpdate(selectedVehicleSummary.lastUpdate)}</span>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getSignalBadgeClass(
                            selectedVehicleSummary.operationalStatus,
                          )}`}
                        >
                          {getOperationalStatusLabel(
                            selectedVehicleSummary.operationalStatus,
                          )}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </article>

          <section className="panel overflow-hidden px-3 py-3 sm:px-4">
            <div className="overflow-hidden rounded-[1.4rem] border border-teal-200 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.18),_transparent_48%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.16),_transparent_42%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(240,249,255,0.94))] px-4 py-4 shadow-[0_24px_45px_-32px_rgba(15,23,42,0.45)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
                    {hasTransportTypeFilter
                      ? `Ruta mas cercana ${getTransportTypeLabel(activeTransportType).toLowerCase()}`
                      : 'Ruta recomendada cerca de ti'}
                  </p>
                  <p className="mt-2 font-display text-2xl text-slate-900">
                    {recommendedRoute && permissionState === 'granted'
                      ? recommendedRoute.route.name
                      : locationStatusCopy.title}
                  </p>
                </div>
                {recommendedRoute && permissionState === 'granted' ? (
                  <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                    {getTransportTypeLabel(recommendedRoute.route.transportType)}
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {recommendedRoute && permissionState === 'granted'
                  ? recommendedRoute.distanceMeters !== null
                    ? recommendedRoute.distanceMeters <= 600
                      ? 'Esta ruta pasa muy cerca de tu ubicacion actual.'
                      : `Aproximadamente ${formatDistanceRange(recommendedRoute.distanceMeters)} desde tu ubicacion.`
                    : locationStatusCopy.description
                  : locationStatusCopy.description}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {recommendedRoute &&
                recommendedRoute.distanceMeters !== null &&
                permissionState === 'granted' ? (
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getRouteDistanceTone(
                      recommendedRoute.distanceMeters,
                    )}`}
                  >
                    {recommendedRoute.distanceMeters <= 600
                      ? 'Muy cerca de ti'
                      : formatDistanceRange(recommendedRoute.distanceMeters)}
                  </span>
                ) : null}
                {recommendedRoute && permissionState === 'granted' ? (
                  <span className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                    Toca para enfocarla en el mapa
                  </span>
                ) : null}
              </div>

              {recommendedRoute && permissionState === 'granted' ? (
                <button
                  type="button"
                  onClick={() => focusRoute(recommendedRoute.route.id)}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-teal-700"
                >
                  Ver esta ruta
                </button>
              ) : null}

              {permissionState !== 'granted' && permissionState !== 'unsupported' ? (
                <button
                  type="button"
                  onClick={requestPermission}
                  className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
                >
                  Activar ubicacion
                </button>
              ) : null}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="inline-flex rounded-full bg-slate-100 p-1">
                {routeGroups.map((group) => (
                  <button
                    key={group.transportType}
                    type="button"
                    onClick={() => {
                      setRouteCarouselTransportType(group.transportType)
                      setHasTransportTypeFilter(true)
                      clearSelectedRoute()
                      setSelectedVehicleId(null)
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      group.transportType === activeTransportType
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {group.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  clearSelectedRoute()
                  setHasTransportTypeFilter(false)
                  setSelectedVehicleId(null)
                }}
                disabled={!selectedRoute && !hasTransportTypeFilter}
                className="text-sm font-semibold text-slate-500 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                General
              </button>
            </div>

            <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden xl:pb-0">
              {activeRouteGroup?.routes.map((route) => {
                const isSelected = route.id === selectedRoute?.id
                const routeStats = vehicleStatsByRoute.get(route.id) ?? {
                  visible: 0,
                  stopped: 0,
                }
                const distanceMeters = routeDistanceById.get(route.id) ?? null

                return (
                  <article
                    key={route.id}
                    className={`min-w-[180px] snap-start rounded-[1.35rem] border bg-white px-4 py-4 text-left shadow-sm transition xl:min-w-0 ${
                      isSelected
                        ? 'border-slate-900 shadow-[0_18px_30px_-24px_rgba(15,23,42,0.6)]'
                        : 'border-slate-200 hover:border-teal-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVehicleId(null)

                          if (isSelected) {
                            clearSelectedRoute()
                            return
                          }

                          focusRoute(route.id)
                        }}
                        className="flex-1 text-left"
                      >
                        <span
                          className="block h-2.5 w-16 rounded-full"
                          style={{ backgroundColor: route.color }}
                        />
                        <span className="mt-3 block font-display text-lg text-slate-900">
                          {route.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRouteInfoRouteId(route.id)}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                      >
                        Info
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {distanceMeters !== null ? (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getRouteDistanceTone(
                            distanceMeters,
                          )}`}
                        >
                          {distanceMeters <= 600
                            ? 'Cerca de ti'
                            : formatDistanceRange(distanceMeters)}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {routeStats.visible} visible
                        {routeStats.visible === 1 ? '' : 's'}
                      </span>
                      {routeStats.stopped > 0 ? (
                        <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                          {routeStats.stopped} detenida
                          {routeStats.stopped === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVehicleId(null)

                        if (isSelected) {
                          clearSelectedRoute()
                          return
                        }

                        focusRoute(route.id)
                      }}
                      className={`mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-full px-4 text-sm font-semibold transition ${
                        isSelected
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-slate-900 text-white hover:bg-teal-700'
                      }`}
                    >
                      {isSelected ? 'Ruta seleccionada' : 'Ver en el mapa'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        </section>
      </section>

      <RoutePickerModal
        isOpen={isRoutePickerOpen}
        activeTransportType={activeTransportType}
        routeGroups={routeGroups}
        selectedRouteId={selectedRoute?.id ?? null}
        onClose={() => setRoutePickerOpen(false)}
        onTransportTypeChange={(transportType) => {
          setRouteCarouselTransportType(transportType)
          setHasTransportTypeFilter(true)
          clearSelectedRoute()
          setSelectedVehicleId(null)
        }}
        onRouteSelect={(routeId) => {
          focusRoute(routeId)
          setRoutePickerOpen(false)
        }}
        onClearSelection={() => {
          clearSelectedRoute()
          setHasTransportTypeFilter(false)
          setSelectedVehicleId(null)
          setRoutePickerOpen(false)
        }}
      />

      {isInfoOpen ? <InfoModal onClose={() => setInfoOpen(false)} /> : null}
      {routeInfoRoute ? (
        <RouteInfoModal
          route={routeInfoRoute}
          onClose={() => setRouteInfoRouteId(null)}
        />
      ) : null}
    </>
  )
}

export function PassengerMapView() {
  if (!convexUrl) {
    return (
      <PassengerMapEmptyState
        title="Convex aun no esta configurado"
        description="Inicia Convex con un despliegue local para cargar la URL del backend en Vite y habilitar el mapa con datos reales."
      />
    )
  }

  return <PassengerMapConnectedView />
}

function PassengerMapConnectedView() {
  const snapshot = usePassengerMapSnapshot()

  if (snapshot === undefined) {
    return (
      <PassengerMapEmptyState
        title="Cargando datos del mapa"
        description="Consultando rutas activas y unidades visibles desde Convex."
      />
    )
  }

  return <PassengerMapContent snapshot={snapshot} />
}
