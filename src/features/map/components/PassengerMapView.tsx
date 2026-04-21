import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSearchParams } from 'react-router'
import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiLineString,
  Point,
  Polygon,
} from 'geojson'
import {
  convexUrl,
  fallbackMapStyle,
  mapInitialCenter,
  mapInitialZoom,
  mapMaxZoom,
} from '../../../lib/env'
import { useCurrentTime } from '../../../hooks/useCurrentTime'
import { loadMapLibre } from '../../../lib/maplibreLoader'
import { getMapRuntimePerformanceProfile } from '../../../lib/runtimePerformance'
import {
  buildCirclePolygon,
  getBoundsFromPoints,
  type LatLngPoint,
} from '../../../lib/mapGeometry'
import {
  getMinimumDistanceToRouteMeters,
} from '../../../lib/trackingSignal'
import type {
  BusRoute,
  BusStop,
  PassengerMapSnapshot,
  TransportType,
} from '../../../types/domain'
import { usePassengerGeolocation } from '../hooks/usePassengerGeolocation'
import { usePassengerMapSnapshot } from '../hooks/usePassengerMapSnapshot'
import { usePassengerRouteSelection } from '../hooks/usePassengerRouteSelection'
import { PassengerMapHeader } from './PassengerMapHeader'
import {
  PassengerMapEmptyState,
  PassengerMapInfoModal,
  PassengerRouteInfoModal,
  PassengerRoutePickerModal,
} from './PassengerMapOverlays'
import { PassengerMapSidebar } from './PassengerMapSidebar'
import {
  decorateVehiclesWithRouteMeta,
  formatLastUpdateTime,
  getDisplayedRoutes,
  getDisplayedVehicles,
  getNearbyQuickRouteEntriesFromSortedRoutes,
  getLocationStatusCopy,
  getRecommendedRouteEntry,
  getRouteGroups,
  getSortedRoutesByDistance,
  getVehicleStatsByRoute,
  normalizeRouteSearchTerm,
  routeMatchesSearch,
  sortRoutesByUtility,
  type PassengerMapVehicleView,
} from './passengerMapViewUtils'
import { PassengerMapSelectionSummary } from './PassengerMapSelectionSummary'
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  Popup as MapLibrePopup,
} from 'maplibre-gl'

const ROUTES_SOURCE_ID = 'passenger-map-routes'
const ROUTES_CASING_LAYER_ID = 'passenger-map-routes-casing'
const ROUTES_LAYER_ID = 'passenger-map-routes'
const VEHICLES_SOURCE_ID = 'passenger-map-vehicles'
const VEHICLE_HALO_LAYER_ID = 'passenger-map-vehicle-halo'
const VEHICLES_LAYER_ID = 'passenger-map-vehicles'
const SELECTED_VEHICLE_SOURCE_ID = 'passenger-map-selected-vehicle'
const STOPS_SOURCE_ID = 'passenger-map-stops'
const STOPS_LAYER_ID = 'passenger-map-stops'
const USER_SOURCE_ID = 'passenger-map-user'
const USER_ACCURACY_SOURCE_ID = 'passenger-map-user-accuracy-source'
const USER_ACCURACY_LAYER_ID = 'passenger-map-user-accuracy'
const USER_POSITION_LAYER_ID = 'passenger-map-user-position'
const PASSENGER_MAP_REFRESH_INTERVAL_MS = 15_000
const PASSENGER_MAP_FOLLOW_RESUME_DELAY_MS = 3_000

type RouteFeatureProperties = {
  color: string
  lineOpacity: number
  lineWidth: number
  casingOpacity: number
  casingWidth: number
}

type VehicleFeatureProperties = {
  vehicleId: string
  isSelected: boolean
  operationalStatus: PassengerMapVehicleView['operationalStatus']
}

type UserFeatureProperties = {
  kind: 'position' | 'accuracy'
}

type StopFeatureProperties = {
  stopId: string
}

function emptyFeatureCollection(): FeatureCollection<Geometry> {
  return { type: 'FeatureCollection', features: [] }
}

function toLngLat(point: LatLngPoint): [number, number] {
  return [point.lng, point.lat]
}

function getRouteBounds(routes: BusRoute[]) {
  return getBoundsFromPoints(
    routes.flatMap((route) => route.segments.flatMap((segment) => segment)),
  )
}

function buildRouteFeatureCollection(
  routes: BusRoute[],
  selectedRouteId: string | null,
): FeatureCollection<MultiLineString, RouteFeatureProperties> {
  const hasSelectedRoute = Boolean(selectedRouteId)

  return {
    type: 'FeatureCollection',
    features: routes.flatMap((route) => {
      const coordinates = route.segments
        .map((segment) => segment.map(toLngLat))
        .filter((segment) => segment.length > 0)

      if (coordinates.length === 0) return []

      const isSelected = route.id === selectedRouteId
      const isSecondary = hasSelectedRoute && !isSelected

      return [
        {
          type: 'Feature',
          id: route.id,
          geometry: { type: 'MultiLineString', coordinates },
          properties: {
            color: route.color,
            lineOpacity: hasSelectedRoute ? (isSelected ? 0.98 : 0.28) : 0.82,
            lineWidth: hasSelectedRoute ? (isSelected ? 7 : 4) : 4,
            casingOpacity: isSelected ? 0.24 : isSecondary ? 0.06 : 0.14,
            casingWidth: hasSelectedRoute ? (isSelected ? 11 : 7) : 7,
          },
        } satisfies Feature<MultiLineString, RouteFeatureProperties>,
      ]
    }),
  }
}

function buildVehicleFeatureCollection(
  vehicles: PassengerMapVehicleView[],
  selectedVehicleId: string | null,
): FeatureCollection<Point, VehicleFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: vehicles.map((vehicle) => ({
      type: 'Feature',
      id: vehicle.id,
      geometry: { type: 'Point', coordinates: toLngLat(vehicle.position) },
      properties: {
        vehicleId: vehicle.id,
        isSelected: vehicle.id === selectedVehicleId,
        operationalStatus: vehicle.operationalStatus,
      },
    })),
  }
}

function buildSelectedVehicleFeatureCollection(
  vehicle: PassengerMapVehicleView | null,
): FeatureCollection<Point, VehicleFeatureProperties> {
  if (!vehicle) {
    return { type: 'FeatureCollection', features: [] }
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: vehicle.id,
        geometry: { type: 'Point', coordinates: toLngLat(vehicle.position) },
        properties: {
          vehicleId: vehicle.id,
          isSelected: true,
          operationalStatus: vehicle.operationalStatus,
        },
      },
    ],
  }
}

function buildAccuracyFeatureCollection(
  position: LatLngPoint | null,
  accuracyMeters: number | null,
): FeatureCollection<Polygon, UserFeatureProperties> {
  if (!position || !accuracyMeters || accuracyMeters <= 0) {
    return { type: 'FeatureCollection', features: [] }
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        ...buildCirclePolygon(position, Math.min(accuracyMeters, 600)),
        id: 'user-accuracy',
        properties: { kind: 'accuracy' },
      },
    ],
  }
}

function buildUserFeatureCollection(
  position: LatLngPoint | null,
  accuracyMeters: number | null,
): FeatureCollection<Geometry, UserFeatureProperties> {
  if (!position) return { type: 'FeatureCollection', features: [] }

  const features: Array<Feature<Point | Polygon, UserFeatureProperties>> = [
    {
      type: 'Feature',
      id: 'user-position',
      geometry: { type: 'Point', coordinates: toLngLat(position) },
      properties: { kind: 'position' },
    },
  ]

  if (accuracyMeters && accuracyMeters > 0) {
    features.push({
      ...buildCirclePolygon(position, Math.min(accuracyMeters, 600)),
      id: 'user-accuracy',
      properties: { kind: 'accuracy' },
    })
  }

  return { type: 'FeatureCollection', features }
}

function buildStopFeatureCollection(
  stops: BusStop[],
): FeatureCollection<Point, StopFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: stops.map((stop) => ({
      type: 'Feature',
      id: stop.id,
      geometry: { type: 'Point', coordinates: toLngLat(stop.position) },
      properties: {
        stopId: stop.id,
      },
    })),
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getVehiclePopupSignalMeta(
  status: PassengerMapVehicleView['operationalStatus'],
) {
  switch (status) {
    case 'active_recent':
      return { label: 'Reciente', color: '#15803d' }
    case 'active_stale':
      return { label: 'Atrasada', color: '#c2410c' }
    case 'probably_stopped':
      return { label: 'Desactivada', color: '#dc2626' }
    default:
      return { label: 'Sin estado', color: '#475569' }
  }
}

function createVehiclePopupHtml(vehicle: PassengerMapVehicleView) {
  const signalMeta = getVehiclePopupSignalMeta(vehicle.operationalStatus)

  return `
    <div class="min-w-[164px] space-y-1.5">
      <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ruta</p>
      <p class="text-sm font-semibold leading-5 text-slate-900">${escapeHtml(vehicle.routeName)}</p>
      <p class="text-sm text-slate-700">Unidad <span class="font-semibold text-slate-900">${escapeHtml(vehicle.unitNumber)}</span></p>
      <p class="text-xs font-semibold" style="color:${signalMeta.color}">
        Ultima actualizacion ${escapeHtml(formatLastUpdateTime(vehicle.lastUpdate))} · ${escapeHtml(signalMeta.label)}
      </p>
    </div>
  `.trim()
}

function createStopPopupHtml(stop: BusStop, routeById: Map<string, BusRoute>) {
  const routeNames = stop.routeIds
    .map((routeId) => routeById.get(routeId)?.name)
    .filter((routeName): routeName is string => Boolean(routeName))

  return `
    <div class="min-w-[160px] space-y-1.5">
      <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Parada oficial</p>
      <p class="text-sm font-semibold leading-5 text-slate-900">${escapeHtml(stop.name ?? 'Parada en revision validada')}</p>
      ${
        routeNames.length > 0
          ? `<p class="text-xs text-slate-600">${escapeHtml(routeNames.join(' · '))}</p>`
          : ''
      }
      <p class="text-xs font-semibold text-sky-700">Reportes consolidados: ${stop.reportCount}</p>
    </div>
  `.trim()
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

function PassengerMapContent({ snapshot }: { snapshot: PassengerMapSnapshot }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedRouteId = searchParams.get('route')
  const routes = snapshot.routes
  const routeGroups = useMemo(() => getRouteGroups(routes), [routes])
  const routeById = useMemo(
    () => new Map(routes.map((route) => [route.id, route] as const)),
    [routes],
  )
  const { hasHydratedSelection, selectedRouteId, setSelectedRouteId, clearSelectedRoute } =
    usePassengerRouteSelection(routes, requestedRouteId)
  const selectedRoute = selectedRouteId ? routeById.get(selectedRouteId) ?? null : null
  const selectedRouteKey = selectedRoute?.id ?? null
  const [routeCarouselTransportType, setRouteCarouselTransportType] =
    useState<TransportType>(routeGroups[0]?.transportType ?? 'urbano')
  const [hasTransportTypeFilter, setHasTransportTypeFilter] = useState(false)
  const [routeSearchTerm, setRouteSearchTerm] = useState('')
  const deferredRouteSearchTerm = useDeferredValue(routeSearchTerm)
  const [showOnlyRoutesWithVisibleVehicles, setShowOnlyRoutesWithVisibleVehicles] =
    useState(false)
  const [isRoutePickerOpen, setRoutePickerOpen] = useState(false)
  const [isInfoOpen, setInfoOpen] = useState(false)
  const [routeInfoRouteId, setRouteInfoRouteId] = useState<string | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [centerOnUserRequestCount, setCenterOnUserRequestCount] = useState(0)
  const [mapLoadStatus, setMapLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mapLoadError, setMapLoadError] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<LatLngPoint | null>(null)
  const [shouldShowPinchHint, setShouldShowPinchHint] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return (
      window.matchMedia('(pointer: coarse)').matches &&
      window.sessionStorage.getItem('cabobus-passenger-pinch-hint') !== '1'
    )
  })
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
  const vehicleById = useMemo(
    () => new Map(vehiclesWithRouteMeta.map((vehicle) => [vehicle.id, vehicle] as const)),
    [vehiclesWithRouteMeta],
  )
  const vehicleStatsByRoute = useMemo(
    () => getVehicleStatsByRoute(vehiclesWithRouteMeta),
    [vehiclesWithRouteMeta],
  )
  const normalizedDeferredRouteSearchTerm = useMemo(
    () => normalizeRouteSearchTerm(deferredRouteSearchTerm),
    [deferredRouteSearchTerm],
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
  const routeGroupsByUtility = useMemo(
    () =>
      routeGroups.map((group) => ({
        ...group,
        routes: sortRoutesByUtility(group.routes, routeDistanceById, vehicleStatsByRoute),
      })),
    [routeDistanceById, routeGroups, vehicleStatsByRoute],
  )

  const resolvedRouteCarouselTransportType = routeGroups.some(
    (group) => group.transportType === routeCarouselTransportType,
  )
    ? routeCarouselTransportType
    : routeGroups[0]?.transportType ?? 'urbano'

  const activeTransportType =
    selectedRoute?.transportType ?? resolvedRouteCarouselTransportType

  const displayedRoutes = useMemo(
    () => getDisplayedRoutes(routeGroupsByUtility, activeTransportType),
    [activeTransportType, routeGroupsByUtility],
  )
  const displayedVehicles = useMemo(
    () =>
      getDisplayedVehicles(
        vehiclesWithRouteMeta,
        activeTransportType,
        selectedRoute?.id,
      ),
    [activeTransportType, selectedRoute?.id, vehiclesWithRouteMeta],
  )

  const sortedRoutesByDistance = useMemo(
    () => getSortedRoutesByDistance(routes, routeDistanceById),
    [routeDistanceById, routes],
  )

  const filteredRouteGroups = useMemo(
    () =>
      routeGroupsByUtility.map((group) => ({
        ...group,
        routes: group.routes.filter(
          (route) =>
            routeMatchesSearch(route, normalizedDeferredRouteSearchTerm) &&
            (!showOnlyRoutesWithVisibleVehicles ||
              (vehicleStatsByRoute.get(route.id)?.visible ?? 0) > 0),
        ),
      })),
    [
      normalizedDeferredRouteSearchTerm,
      routeGroupsByUtility,
      showOnlyRoutesWithVisibleVehicles,
      vehicleStatsByRoute,
    ],
  )
  const filteredActiveRouteGroup =
    filteredRouteGroups.find((group) => group.transportType === activeTransportType) ??
    filteredRouteGroups[0] ??
    null

  const filteredRoutesByDistance = useMemo(() => {
    const candidateRoutes = hasTransportTypeFilter
      ? sortedRoutesByDistance.filter(
          (entry) => entry.route.transportType === activeTransportType,
        )
      : sortedRoutesByDistance

    return candidateRoutes.filter(
      (entry) =>
        routeMatchesSearch(entry.route, normalizedDeferredRouteSearchTerm) &&
        (!showOnlyRoutesWithVisibleVehicles ||
          (vehicleStatsByRoute.get(entry.route.id)?.visible ?? 0) > 0),
    )
  }, [
    activeTransportType,
    hasTransportTypeFilter,
    normalizedDeferredRouteSearchTerm,
    showOnlyRoutesWithVisibleVehicles,
    sortedRoutesByDistance,
    vehicleStatsByRoute,
  ])

  const recommendedRoute = useMemo(
    () => getRecommendedRouteEntry(filteredRoutesByDistance, vehicleStatsByRoute),
    [filteredRoutesByDistance, vehicleStatsByRoute],
  )
  const nearbyRoutes = useMemo(
    () =>
      getNearbyQuickRouteEntriesFromSortedRoutes(
        filteredActiveRouteGroup?.routes ?? [],
        routeDistanceById,
        vehicleStatsByRoute,
      ),
    [filteredActiveRouteGroup?.routes, routeDistanceById, vehicleStatsByRoute],
  )
  const locationStatusCopy = useMemo(
    () =>
      getLocationStatusCopy({
        permissionState,
        isRequestingPermission,
        errorMessage: userLocationError,
      }),
    [isRequestingPermission, permissionState, userLocationError],
  )
  const selectedRouteVehicles = useMemo(
    () =>
      selectedRoute
        ? displayedVehicles.filter((vehicle) => vehicle.routeId === selectedRoute.id)
        : displayedVehicles,
    [displayedVehicles, selectedRoute],
  )
  const selectedVehicle = useMemo(
    () => (selectedVehicleId ? vehicleById.get(selectedVehicleId) ?? null : null),
    [selectedVehicleId, vehicleById],
  )
  const stopById = useMemo(
    () => new Map(snapshot.stops.map((stop) => [stop.id, stop] as const)),
    [snapshot.stops],
  )
  const selectedStop = useMemo(
    () => (selectedStopId ? stopById.get(selectedStopId) ?? null : null),
    [selectedStopId, stopById],
  )
  const displayedStops = useMemo(
    () =>
      selectedRoute
        ? snapshot.stops.filter((stop) => stop.routeIds.includes(selectedRoute.id))
        : [],
    [selectedRoute, snapshot.stops],
  )
  const routeInfoRoute =
    routeInfoRouteId ? routeById.get(routeInfoRouteId) ?? null : null
  const visibleVehiclesCount = selectedRoute
    ? selectedRouteVehicles.length
    : displayedVehicles.length
  const activeRoutesCount = filteredActiveRouteGroup
    ? filteredActiveRouteGroup.routes.filter(
        (route) => (vehicleStatsByRoute.get(route.id)?.visible ?? 0) > 0,
      ).length
    : 0

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapPanelRef = useRef<HTMLElement | null>(null)
  const mapLibreRef = useRef<Awaited<ReturnType<typeof loadMapLibre>> | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<MapLibrePopup | null>(null)
  const attemptedFallbackStyleRef = useRef(false)
  const didFitInitialViewRef = useRef(false)
  const lastFittedViewKeyRef = useRef<string | null>(null)
  const isProgrammaticMapMoveRef = useRef(false)
  const isVehicleFollowPausedRef = useRef(false)
  const followResumeTimeoutRef = useRef<number | null>(null)
  const followedVehiclePositionRef = useRef<{
    vehicleId: string
    lat: number
    lng: number
  } | null>(null)
  const mapPerformanceProfile = useMemo(() => getMapRuntimePerformanceProfile(), [])
  const showPinchHint = mapLoadStatus === 'ready' && shouldShowPinchHint
  const routeFeatureCollection = useMemo(
    () => buildRouteFeatureCollection(displayedRoutes, selectedRouteKey),
    [displayedRoutes, selectedRouteKey],
  )
  const vehicleFeatureCollection = useMemo(
    () => buildVehicleFeatureCollection(displayedVehicles, selectedVehicleId),
    [displayedVehicles, selectedVehicleId],
  )
  const selectedVehicleFeatureCollection = useMemo(
    () => buildSelectedVehicleFeatureCollection(selectedVehicle),
    [selectedVehicle],
  )
  const stopFeatureCollection = useMemo(
    () => buildStopFeatureCollection(displayedStops),
    [displayedStops],
  )
  const userFeatureCollection = useMemo(
    () => buildUserFeatureCollection(userPosition, null),
    [userPosition],
  )
  const accuracyFeatureCollection = useMemo(
    () => buildAccuracyFeatureCollection(userPosition, accuracyMeters),
    [accuracyMeters, userPosition],
  )
  const displayedRouteBounds = useMemo(
    () => getRouteBounds(selectedRoute ? [selectedRoute] : displayedRoutes),
    [displayedRoutes, selectedRoute],
  )

  useEffect(() => {
    if (!showPinchHint || typeof window === 'undefined') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setShouldShowPinchHint(false)
      window.sessionStorage.setItem('cabobus-passenger-pinch-hint', '1')
    }, 4200)

    return () => window.clearTimeout(timeoutId)
  }, [showPinchHint])

  const clearFollowResumeTimeout = useCallback(() => {
    if (
      typeof window !== 'undefined' &&
      followResumeTimeoutRef.current !== null
    ) {
      window.clearTimeout(followResumeTimeoutRef.current)
    }

    followResumeTimeoutRef.current = null
  }, [])

  const clearSelectedVehicle = useCallback(() => {
    clearFollowResumeTimeout()
    isVehicleFollowPausedRef.current = false
    followedVehiclePositionRef.current = null
    setSelectedVehicleId(null)
  }, [clearFollowResumeTimeout])

  const clearSelectedStop = useCallback(() => {
    setSelectedStopId(null)
  }, [])

  const runProgrammaticMapMove = useCallback(
    (transition: (map: MapLibreMap) => void) => {
      const map = mapRef.current

      if (!map) {
        return
      }

      isProgrammaticMapMoveRef.current = true
      transition(map)

      if (!map.isMoving()) {
        isProgrammaticMapMoveRef.current = false
      }
    },
    [],
  )

  const focusRoute = useCallback(
    (routeId: string) => {
      const route = routeById.get(routeId)

      if (!route) return

      setRouteCarouselTransportType(route.transportType)
      clearSelectedVehicle()
      clearSelectedStop()
      setSelectedRouteId(route.id)
    },
    [clearSelectedStop, clearSelectedVehicle, routeById, setSelectedRouteId],
  )

  const revealMapPanel = useCallback(() => {
    mapPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const focusRouteAndRevealMap = useCallback(
    (routeId: string) => {
      focusRoute(routeId)
      revealMapPanel()
    },
    [focusRoute, revealMapPanel],
  )

  const openVehiclePopup = useCallback((vehicle: PassengerMapVehicleView) => {
    const map = mapRef.current
    const mapLibre = mapLibreRef.current

    if (!map || !mapLibre) {
      return
    }

    popupRef.current?.remove()
    popupRef.current = new mapLibre.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
      offset: 16,
      maxWidth: '220px',
    })
      .setLngLat([vehicle.position.lng, vehicle.position.lat])
      .setHTML(createVehiclePopupHtml(vehicle))
      .addTo(map)
  }, [])

  const openStopPopup = useCallback(
    (stop: BusStop) => {
      const map = mapRef.current
      const mapLibre = mapLibreRef.current

      if (!map || !mapLibre) {
        return
      }

      popupRef.current?.remove()
      popupRef.current = new mapLibre.Popup({
        closeButton: false,
        closeOnClick: true,
        closeOnMove: false,
        offset: 14,
        maxWidth: '220px',
      })
        .setLngLat([stop.position.lng, stop.position.lat])
        .setHTML(createStopPopupHtml(stop, routeById))
        .addTo(map)
    },
    [routeById],
  )

  const focusVehicle = useCallback(
    (vehicleId: string) => {
      if (vehicleId === selectedVehicleId) {
        clearSelectedVehicle()
        return
      }

      const vehicle = vehicleById.get(vehicleId)

      if (!vehicle) return

      const vehicleRoute = routeById.get(vehicle.routeId)

      if (vehicleRoute) {
        setRouteCarouselTransportType(vehicleRoute.transportType)
        setHasTransportTypeFilter(true)
        setSelectedRouteId(vehicle.routeId)
      }

      clearSelectedStop()
      followedVehiclePositionRef.current = {
        vehicleId: vehicle.id,
        lat: vehicle.position.lat,
        lng: vehicle.position.lng,
      }
      clearFollowResumeTimeout()
      isVehicleFollowPausedRef.current = false
      setSelectedVehicleId(vehicle.id)
      runProgrammaticMapMove((map) => {
        map.flyTo({
          center: [vehicle.position.lng, vehicle.position.lat],
          zoom: Math.max(map.getZoom(), 15),
          duration: 0.55,
        })
      })
    },
    [
      clearFollowResumeTimeout,
      clearSelectedVehicle,
      clearSelectedStop,
      routeById,
      runProgrammaticMapMove,
      selectedVehicleId,
      setSelectedRouteId,
      vehicleById,
    ],
  )

  const handleVehicleLayerClick = useEffectEvent((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0] as MapGeoJSONFeature | undefined
    const vehicleId = feature?.properties?.vehicleId

    if (typeof vehicleId === 'string') {
      focusVehicle(vehicleId)
    }
  })

  const handleStopLayerClick = useEffectEvent((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0] as MapGeoJSONFeature | undefined
    const stopId = feature?.properties?.stopId

    if (typeof stopId === 'string') {
      clearSelectedVehicle()
      setSelectedStopId(stopId)
    }
  })

  const handleRouteLayerClick = useEffectEvent((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0] as MapGeoJSONFeature | undefined
    const routeId = feature?.id ?? feature?.properties?.routeId

    if (typeof routeId === 'string') {
      focusRouteAndRevealMap(routeId)
    }
  })

  const scheduleVehicleFollowResume = useEffectEvent(() => {
    if (typeof window === 'undefined' || !selectedVehicle) {
      return
    }

    clearFollowResumeTimeout()
    followResumeTimeoutRef.current = window.setTimeout(() => {
      if (!selectedVehicle) {
        return
      }

      isVehicleFollowPausedRef.current = false
      followedVehiclePositionRef.current = {
        vehicleId: selectedVehicle.id,
        lat: selectedVehicle.position.lat,
        lng: selectedVehicle.position.lng,
      }
      runProgrammaticMapMove((map) => {
        map.easeTo({
          center: [selectedVehicle.position.lng, selectedVehicle.position.lat],
          duration: 700,
          essential: true,
        })
      })
    }, PASSENGER_MAP_FOLLOW_RESUME_DELAY_MS)
  })

  const handleMapMoveEnd = useEffectEvent(() => {
    const currentMap = mapRef.current
    const wasProgrammaticMove = isProgrammaticMapMoveRef.current

    if (currentMap) {
      const center = currentMap.getCenter()
      setMapCenter({ lat: center.lat, lng: center.lng })
    }

    isProgrammaticMapMoveRef.current = false

    if (wasProgrammaticMove || !selectedVehicleId || !isVehicleFollowPausedRef.current) {
      return
    }

    scheduleVehicleFollowResume()
  })

  const handleUserMapMoveStart = useEffectEvent(() => {
    if (!selectedVehicleId || isProgrammaticMapMoveRef.current) {
      return
    }

    isVehicleFollowPausedRef.current = true
    clearFollowResumeTimeout()
  })

  const handleTransportTypeChange = useCallback(
    (transportType: TransportType) => {
      startTransition(() => {
        setRouteCarouselTransportType(transportType)
        setHasTransportTypeFilter(true)
        clearSelectedRoute()
        clearSelectedVehicle()
        clearSelectedStop()
      })
    },
    [clearSelectedRoute, clearSelectedStop, clearSelectedVehicle],
  )

  const handleResetView = useCallback(() => {
    startTransition(() => {
      clearSelectedRoute()
      setHasTransportTypeFilter(false)
      clearSelectedVehicle()
      clearSelectedStop()
      setRouteSearchTerm('')
      setShowOnlyRoutesWithVisibleVehicles(false)
    })
  }, [clearSelectedRoute, clearSelectedStop, clearSelectedVehicle])

  const handleOpenRoutePicker = useCallback(() => {
    setRoutePickerOpen(true)
  }, [])

  const handleCloseRoutePicker = useCallback(() => {
    setRoutePickerOpen(false)
  }, [])

  const handleOpenInfo = useCallback(() => {
    setInfoOpen(true)
  }, [])

  const handleCloseInfo = useCallback(() => {
    setInfoOpen(false)
  }, [])

  const handleRouteSearchTermChange = useCallback((value: string) => {
    startTransition(() => {
      setRouteSearchTerm(value)
    })
  }, [])

  const handleClearSearch = useCallback(() => {
    startTransition(() => {
      setRouteSearchTerm('')
    })
  }, [])

  const handleToggleShowOnlyRoutesWithVisibleVehicles = useCallback(() => {
    setShowOnlyRoutesWithVisibleVehicles((current) => !current)
  }, [])

  const handleRequestPermission = useCallback(() => {
    void requestPermission()
  }, [requestPermission])

  const handleFocusRecommended = useCallback(() => {
    if (recommendedRoute) {
      focusRouteAndRevealMap(recommendedRoute.route.id)
    }
  }, [focusRouteAndRevealMap, recommendedRoute])

  const handleToggleRoute = useCallback(
    (routeId: string) => {
      clearSelectedVehicle()
      clearSelectedStop()

      if (routeId === selectedRouteKey) {
        clearSelectedRoute()
        return
      }

      focusRouteAndRevealMap(routeId)
    },
    [
      clearSelectedRoute,
      clearSelectedStop,
      clearSelectedVehicle,
      focusRouteAndRevealMap,
      selectedRouteKey,
    ],
  )

  const handleRouteSelectFromPicker = useCallback(
    (routeId: string) => {
      focusRouteAndRevealMap(routeId)
      setRoutePickerOpen(false)
    },
    [focusRouteAndRevealMap],
  )

  const handleClearSelectionFromPicker = useCallback(() => {
    handleResetView()
    setRoutePickerOpen(false)
  }, [handleResetView])

  const handleCloseRouteInfo = useCallback(() => {
    setRouteInfoRouteId(null)
  }, [])

  useEffect(() => {
    if (!requestedRouteId) {
      return
    }

    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('route')
    setSearchParams(nextSearchParams, { replace: true })
  }, [requestedRouteId, searchParams, setSearchParams])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    let cancelled = false
    let map: MapLibreMap | null = null
    let resizeMap: (() => void) | null = null
    let handleLoad: (() => void) | null = null
    let handleError: (() => void) | null = null

    void loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || mapRef.current || !mapContainerRef.current) {
          return
        }

        mapLibreRef.current = maplibregl
        map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: mapPerformanceProfile.primaryStyle,
          center: mapInitialCenter,
          zoom: mapInitialZoom,
          maxZoom: mapMaxZoom,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          scrollZoom: false,
          fadeDuration: mapPerformanceProfile.fadeDuration,
          pixelRatio: mapPerformanceProfile.pixelRatio,
          maxTileCacheSize: mapPerformanceProfile.maxTileCacheSize,
          refreshExpiredTiles: mapPerformanceProfile.refreshExpiredTiles,
          trackResize: mapPerformanceProfile.trackResize,
          renderWorldCopies: mapPerformanceProfile.renderWorldCopies,
          canvasContextAttributes: mapPerformanceProfile.canvasContextAttributes,
        })

        handleLoad = () => {
          setMapLoadStatus('ready')
          setMapLoadError(null)
          map?.setRenderWorldCopies(false)
          if (map) {
            const center = map.getCenter()
            setMapCenter({ lat: center.lat, lng: center.lng })
          }
        }
        handleError = () => {
          if (!map) {
            return
          }

          if (
            !attemptedFallbackStyleRef.current &&
            typeof mapPerformanceProfile.primaryStyle === 'string'
          ) {
            attemptedFallbackStyleRef.current = true
            setMapLoadStatus('loading')
            setMapLoadError(
              'No fue posible cargar el estilo principal del mapa. Intentando mapa alterno.',
            )
            map.setStyle(fallbackMapStyle)
            return
          }

          setMapLoadStatus('error')
          setMapLoadError('No fue posible cargar el mapa base configurado ni el alterno.')
        }
        resizeMap = () => map?.resize()

        mapRef.current = map
        map.addControl(
          new maplibregl.AttributionControl({
            compact: true,
            customAttribution: mapPerformanceProfile.attribution,
          }),
          'bottom-right',
        )
        map.on('load', handleLoad)
        map.on('error', handleError)
        map.on('dragstart', handleUserMapMoveStart)
        map.on('zoomstart', handleUserMapMoveStart)
        map.on('moveend', handleMapMoveEnd)
        window.addEventListener('resize', resizeMap)
      })
      .catch(() => {
        if (!cancelled) {
          setMapLoadStatus('error')
          setMapLoadError('No fue posible cargar el motor del mapa en este dispositivo.')
        }
      })

    return () => {
      cancelled = true
      popupRef.current?.remove()
      popupRef.current = null
      if (resizeMap) {
        window.removeEventListener('resize', resizeMap)
      }
      if (map && handleLoad) {
        map.off('load', handleLoad)
      }
      if (map && handleError) {
        map.off('error', handleError)
      }
      if (map) {
        map.off('dragstart', handleUserMapMoveStart)
        map.off('zoomstart', handleUserMapMoveStart)
        map.off('moveend', handleMapMoveEnd)
      }
      map?.remove()
      mapRef.current = null
      mapLibreRef.current = null
      attemptedFallbackStyleRef.current = false
      setMapLoadStatus('loading')
    }
  }, [
    mapPerformanceProfile.attribution,
    mapPerformanceProfile.canvasContextAttributes,
    mapPerformanceProfile.fadeDuration,
    mapPerformanceProfile.maxTileCacheSize,
    mapPerformanceProfile.pixelRatio,
    mapPerformanceProfile.primaryStyle,
    mapPerformanceProfile.refreshExpiredTiles,
    mapPerformanceProfile.renderWorldCopies,
    mapPerformanceProfile.trackResize,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapLoadStatus !== 'ready') return

    if (!map.getSource(ROUTES_SOURCE_ID)) {
      map.addSource(ROUTES_SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection(),
      })
      map.addLayer({
        id: ROUTES_CASING_LAYER_ID,
        type: 'line',
        source: ROUTES_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#082f49',
          'line-width': ['coalesce', ['get', 'casingWidth'], 7],
          'line-opacity': ['coalesce', ['get', 'casingOpacity'], 0.14],
        },
      })
      map.addLayer({
        id: ROUTES_LAYER_ID,
        type: 'line',
        source: ROUTES_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#0f766e'],
          'line-width': ['coalesce', ['get', 'lineWidth'], 4],
          'line-opacity': ['coalesce', ['get', 'lineOpacity'], 0.82],
        },
      })
      map.on('mouseenter', ROUTES_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', ROUTES_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', ROUTES_LAYER_ID, handleRouteLayerClick)
    }

    if (!map.getSource(VEHICLES_SOURCE_ID)) {
      map.addSource(VEHICLES_SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection(),
      })
      map.addSource(SELECTED_VEHICLE_SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection(),
      })
      map.addLayer({
        id: VEHICLE_HALO_LAYER_ID,
        type: 'circle',
        source: SELECTED_VEHICLE_SOURCE_ID,
        paint: {
          'circle-radius': 25,
          'circle-color': '#cbd5f5',
          'circle-opacity': 0.24,
        },
      })
      map.addLayer({
        id: VEHICLES_LAYER_ID,
        type: 'circle',
        source: VEHICLES_SOURCE_ID,
        paint: {
          'circle-radius': [
            'match',
            ['get', 'operationalStatus'],
            'active_recent',
            10,
            'active_stale',
            9,
            8,
          ],
          'circle-color': [
            'match',
            ['get', 'operationalStatus'],
            'active_recent',
            '#2dd4bf',
            'active_stale',
            '#f59e0b',
            '#fb7185',
          ],
          'circle-stroke-color': [
            'case',
            ['boolean', ['get', 'isSelected'], false],
            '#0f172a',
            '#0f766e',
          ],
          'circle-stroke-width': [
            'case',
            ['boolean', ['get', 'isSelected'], false],
            4,
            3,
          ],
          'circle-opacity': [
            'case',
            ['==', ['get', 'operationalStatus'], 'probably_stopped'],
            0.84,
            1,
          ],
        },
      })
      map.addLayer({
        id: `${SELECTED_VEHICLE_SOURCE_ID}-circle`,
        type: 'circle',
        source: SELECTED_VEHICLE_SOURCE_ID,
        paint: {
          'circle-radius': 14,
          'circle-color': '#2dd4bf',
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 4,
        },
      })
      map.on('mouseenter', VEHICLES_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', VEHICLES_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', VEHICLES_LAYER_ID, handleVehicleLayerClick)
      map.on('click', `${SELECTED_VEHICLE_SOURCE_ID}-circle`, handleVehicleLayerClick)
    }

    if (!map.getSource(STOPS_SOURCE_ID)) {
      map.addSource(STOPS_SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection(),
      })
      map.addLayer({
        id: STOPS_LAYER_ID,
        type: 'circle',
        source: STOPS_SOURCE_ID,
        paint: {
          'circle-radius': 6,
          'circle-color': '#f8fafc',
          'circle-stroke-color': '#0284c7',
          'circle-stroke-width': 3,
        },
      })
      map.on('mouseenter', STOPS_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', STOPS_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', STOPS_LAYER_ID, handleStopLayerClick)
    }

    if (!map.getSource(USER_SOURCE_ID)) {
      map.addSource(USER_SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection(),
      })
      map.addSource(USER_ACCURACY_SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection(),
      })
      map.addLayer({
        id: USER_ACCURACY_LAYER_ID,
        type: 'fill',
        source: USER_ACCURACY_SOURCE_ID,
        paint: {
          'fill-color': '#93c5fd',
          'fill-opacity': 0.12,
          'fill-outline-color': '#60a5fa',
        },
      })
      map.addLayer({
        id: USER_POSITION_LAYER_ID,
        type: 'circle',
        source: USER_SOURCE_ID,
        paint: {
          'circle-radius': 8,
          'circle-color': '#60a5fa',
          'circle-stroke-color': '#1d4ed8',
          'circle-stroke-width': 3,
        },
      })
    }
  }, [mapLoadStatus])

  useEffect(() => {
    if (mapLoadStatus !== 'ready') return

    ;(mapRef.current?.getSource(ROUTES_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      routeFeatureCollection,
    )
  }, [mapLoadStatus, routeFeatureCollection])

  useEffect(() => {
    if (mapLoadStatus !== 'ready') return

    ;(mapRef.current?.getSource(VEHICLES_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      vehicleFeatureCollection,
    )
    ;(mapRef.current?.getSource(SELECTED_VEHICLE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      selectedVehicleFeatureCollection,
    )
  }, [
    mapLoadStatus,
    selectedVehicleFeatureCollection,
    vehicleFeatureCollection,
  ])

  useEffect(() => {
    if (mapLoadStatus !== 'ready') return

    ;(mapRef.current?.getSource(STOPS_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      stopFeatureCollection,
    )
  }, [mapLoadStatus, stopFeatureCollection])

  useEffect(() => {
    if (mapLoadStatus !== 'ready') return

    ;(mapRef.current?.getSource(USER_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      userFeatureCollection,
    )
    ;(mapRef.current?.getSource(USER_ACCURACY_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      accuracyFeatureCollection,
    )
  }, [accuracyFeatureCollection, mapLoadStatus, userFeatureCollection])

  useEffect(() => {
    if (mapLoadStatus !== 'ready') return

    if (selectedVehicle) {
      openVehiclePopup(selectedVehicle)
      return
    }

    if (selectedStop) {
      openStopPopup(selectedStop)
      return
    }

    popupRef.current?.remove()
    popupRef.current = null
  }, [mapLoadStatus, openStopPopup, openVehiclePopup, selectedStop, selectedVehicle])

  useEffect(() => {
    const map = mapRef.current

    if (
      !map ||
      mapLoadStatus !== 'ready' ||
      !selectedVehicle ||
      isVehicleFollowPausedRef.current
    ) {
      if (!selectedVehicle) {
        followedVehiclePositionRef.current = null
      }

      return
    }

    const previousFollowedPosition = followedVehiclePositionRef.current
    const hasPositionChanged =
      previousFollowedPosition?.vehicleId !== selectedVehicle.id ||
      previousFollowedPosition?.lat !== selectedVehicle.position.lat ||
      previousFollowedPosition?.lng !== selectedVehicle.position.lng

    if (!hasPositionChanged) {
      return
    }

    followedVehiclePositionRef.current = {
      vehicleId: selectedVehicle.id,
      lat: selectedVehicle.position.lat,
      lng: selectedVehicle.position.lng,
    }

    runProgrammaticMapMove((activeMap) => {
      activeMap.easeTo({
        center: [selectedVehicle.position.lng, selectedVehicle.position.lat],
        duration: previousFollowedPosition ? 900 : 0,
        essential: true,
      })
    })
  }, [mapLoadStatus, runProgrammaticMapMove, selectedVehicle])

  useEffect(() => {
    return () => {
      clearFollowResumeTimeout()
    }
  }, [clearFollowResumeTimeout])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapLoadStatus !== 'ready') return

    if (selectedVehicle) {
      return
    }

    const viewKey = selectedRoute?.id ?? `transport:${activeTransportType}`
    const shouldFitView =
      !didFitInitialViewRef.current || lastFittedViewKeyRef.current !== viewKey

    if (shouldFitView && displayedRouteBounds) {
      runProgrammaticMapMove((activeMap) => {
        activeMap.fitBounds(displayedRouteBounds, {
          padding: {
            top: 72,
            bottom: selectedRoute ? 58 : 32,
            left: 24,
            right: 24,
          },
          maxZoom: selectedRoute ? 14.75 : 13.6,
        })
      })
      didFitInitialViewRef.current = true
      lastFittedViewKeyRef.current = viewKey
      return
    }

    if (!didFitInitialViewRef.current && userPosition) {
      runProgrammaticMapMove((activeMap) => {
        activeMap.flyTo({
          center: [userPosition.lng, userPosition.lat],
          zoom: 14,
          duration: 0.55,
        })
      })
      didFitInitialViewRef.current = true
      lastFittedViewKeyRef.current = viewKey
    }
  }, [
    activeTransportType,
    displayedRouteBounds,
    mapLoadStatus,
    selectedRoute,
    selectedVehicle,
    runProgrammaticMapMove,
    userPosition,
  ])

  useEffect(() => {
    const map = mapRef.current

    if (!map || mapLoadStatus !== 'ready' || centerOnUserRequestCount === 0) {
      return
    }

    if (!userPosition) {
      requestPermission()
      return
    }

    runProgrammaticMapMove((activeMap) => {
      activeMap.flyTo({
        center: [userPosition.lng, userPosition.lat],
        zoom: 15,
        duration: 0.55,
      })
    })
  }, [
    centerOnUserRequestCount,
    mapLoadStatus,
    requestPermission,
    runProgrammaticMapMove,
    userPosition,
  ])

  if (!hasHydratedSelection) {
    return (
      <PassengerMapEmptyState
        title="Cargando mapa"
        description="Recuperando la ultima ruta seleccionada para mostrar la vista del pasajero."
      />
    )
  }

  if (mapLoadStatus === 'error') {
    return (
      <PassengerMapEmptyState
        title="No se pudo cargar el mapa"
        description={
          mapLoadError ??
          'Revisa la configuracion del proveedor de mapas para mostrar la vista de pasajeros.'
        }
      />
    )
  }

  return (
    <>
      <section className="space-y-3 sm:space-y-4">
        <PassengerMapHeader
          visibleVehiclesCount={visibleVehiclesCount}
          activeRoutesCount={activeRoutesCount}
          onOpenRoutes={handleOpenRoutePicker}
        />

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <article ref={mapPanelRef} className="panel overflow-hidden">
            <div className="relative">
              <div
                ref={mapContainerRef}
                className="h-[50svh] min-h-[320px] w-full sm:h-[62svh] xl:h-[calc(100svh-11rem)] xl:min-h-[560px]"
              />

              {mapLoadStatus !== 'ready' ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/5 px-4 text-center">
                  <div className="max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_18px_35px_-28px_rgba(15,23,42,0.6)] backdrop-blur">
                    <p className="text-sm font-semibold text-slate-900">Cargando mapa</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {mapPerformanceProfile.prefersLiteMap
                        ? 'MapLibre esta inicializando la base ligera del mapa para movil.'
                        : 'MapLibre esta inicializando la capa base y los estilos del mapa.'}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
                <div
                  className={`transition-all duration-500 ${
                    showPinchHint
                      ? 'translate-y-0 opacity-100'
                      : '-translate-y-2 opacity-0'
                  }`}
                >
                  <div className="passenger-pinch-hint rounded-full bg-white/94 px-4 py-2 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.6)] backdrop-blur">
                    <div className="passenger-pinch-hint__gesture" aria-hidden="true">
                      <span className="passenger-pinch-hint__finger passenger-pinch-hint__finger--left" />
                      <span className="passenger-pinch-hint__finger passenger-pinch-hint__finger--right" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">
                      Pellizca para acercar o alejar
                    </span>
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-start justify-end">
                <div className="pointer-events-auto flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setCenterOnUserRequestCount((value) => value + 1)}
                    className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-sky-200 bg-white text-sky-700 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.6)] backdrop-blur transition hover:border-sky-300"
                    aria-label="Centrar mapa en mi ubicacion"
                    title="Centrar mapa en mi ubicacion"
                  >
                    <LocationTargetIcon />
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenInfo}
                    className="flex h-11 items-center justify-center rounded-full bg-white/92 px-3 text-base font-semibold text-slate-700 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.6)] backdrop-blur transition hover:text-slate-900"
                    aria-label="Ver ayuda del mapa"
                  >
                    i
                  </button>
                </div>
              </div>

              <PassengerMapSelectionSummary
                selectedRoute={selectedRoute}
              />
            </div>
          </article>

          <PassengerMapSidebar
            routeGroups={routeGroupsByUtility}
            activeTransportType={activeTransportType}
            activeRouteGroup={filteredActiveRouteGroup}
            hasTransportTypeFilter={hasTransportTypeFilter}
            recommendedRoute={recommendedRoute}
            nearbyRoutes={nearbyRoutes}
            permissionState={permissionState}
            locationStatusCopy={locationStatusCopy}
            selectedRoute={selectedRoute}
            routeDistanceById={routeDistanceById}
            vehicleStatsByRoute={vehicleStatsByRoute}
            routeSearchTerm={routeSearchTerm}
            showOnlyRoutesWithVisibleVehicles={showOnlyRoutesWithVisibleVehicles}
            mapCenter={mapCenter}
            userPosition={userPosition}
            canResetView={Boolean(selectedRoute || hasTransportTypeFilter)}
            onRequestPermission={handleRequestPermission}
            onFocusRecommended={handleFocusRecommended}
            onRouteSearchTermChange={handleRouteSearchTermChange}
            onClearSearch={handleClearSearch}
            onToggleShowOnlyRoutesWithVisibleVehicles={handleToggleShowOnlyRoutesWithVisibleVehicles}
            onTransportTypeChange={handleTransportTypeChange}
            onResetView={handleResetView}
            onToggleRoute={handleToggleRoute}
            onShowRouteInfo={setRouteInfoRouteId}
          />
        </section>
      </section>

      <PassengerRoutePickerModal
        isOpen={isRoutePickerOpen}
        activeTransportType={activeTransportType}
        routeGroups={filteredRouteGroups}
        selectedRouteId={selectedRouteKey}
        routeSearchTerm={routeSearchTerm}
        routeDistanceById={routeDistanceById}
        vehicleStatsByRoute={vehicleStatsByRoute}
        showOnlyRoutesWithVisibleVehicles={showOnlyRoutesWithVisibleVehicles}
        onClose={handleCloseRoutePicker}
        onRouteSearchTermChange={handleRouteSearchTermChange}
        onToggleShowOnlyRoutesWithVisibleVehicles={handleToggleShowOnlyRoutesWithVisibleVehicles}
        onTransportTypeChange={handleTransportTypeChange}
        onRouteSelect={handleRouteSelectFromPicker}
        onClearSelection={handleClearSelectionFromPicker}
        onClearSearch={handleClearSearch}
      />

      {isInfoOpen ? <PassengerMapInfoModal onClose={handleCloseInfo} /> : null}
      {routeInfoRoute ? (
        <PassengerRouteInfoModal route={routeInfoRoute} onClose={handleCloseRouteInfo} />
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
  const currentTimeMs = useCurrentTime(PASSENGER_MAP_REFRESH_INTERVAL_MS)
  const snapshot = usePassengerMapSnapshot(currentTimeMs)

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
