import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSearchParams } from 'react-router'
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature, type MapLayerMouseEvent } from 'maplibre-gl'
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
  mapAttribution,
  mapInitialCenter,
  mapInitialZoom,
  mapMaxZoom,
  mapStyleUrl,
} from '../../../lib/env'
import { useCurrentTime } from '../../../hooks/useCurrentTime'
import {
  buildCirclePolygon,
  getBoundsFromPoints,
  type LatLngPoint,
} from '../../../lib/mapGeometry'
import {
  getMinimumDistanceToRouteMeters,
  getOperationalStatusLabel,
} from '../../../lib/trackingSignal'
import type { BusRoute, PassengerMapSnapshot, TransportType } from '../../../types/domain'
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
  formatDistanceRange,
  formatLastUpdate,
  formatRelativeLastUpdate,
  getDisplayedRoutes,
  getDisplayedVehicles,
  getFeaturedVehicle,
  getNearbyQuickRouteEntries,
  getLocationStatusCopy,
  getRecommendedRouteEntry,
  getRouteGroups,
  getSignalBadgeClass,
  getSortedRoutesByDistance,
  getTransportTypeLabel,
  getVehicleStatsByRoute,
  routeMatchesSearch,
  sortRoutesByUtility,
  type PassengerMapVehicleView,
} from './passengerMapViewUtils'

const ROUTES_SOURCE_ID = 'passenger-map-routes'
const ROUTES_CASING_LAYER_ID = 'passenger-map-routes-casing'
const ROUTES_LAYER_ID = 'passenger-map-routes'
const VEHICLES_SOURCE_ID = 'passenger-map-vehicles'
const VEHICLE_HALO_LAYER_ID = 'passenger-map-vehicle-halo'
const VEHICLES_LAYER_ID = 'passenger-map-vehicles'
const SELECTED_VEHICLE_SOURCE_ID = 'passenger-map-selected-vehicle'
const USER_SOURCE_ID = 'passenger-map-user'
const USER_ACCURACY_SOURCE_ID = 'passenger-map-user-accuracy-source'
const USER_ACCURACY_LAYER_ID = 'passenger-map-user-accuracy'
const USER_POSITION_LAYER_ID = 'passenger-map-user-position'
const PASSENGER_MAP_REFRESH_INTERVAL_MS = 15_000
const PASSENGER_MAP_RELATIVE_TIME_INTERVAL_MS = 30_000

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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function createVehiclePopupHtml(vehicle: PassengerMapVehicleView) {
  return `
    <div class="space-y-1">
      <p class="text-sm font-semibold text-slate-900">${escapeHtml(vehicle.unitNumber)}</p>
      <p class="text-sm text-slate-600">${escapeHtml(vehicle.routeName)}</p>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">${escapeHtml(getOperationalStatusLabel(vehicle.operationalStatus))}</p>
      <p class="text-xs text-slate-500">Actualizado: ${escapeHtml(formatLastUpdate(vehicle.lastUpdate))}</p>
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
  const currentTimeMs = useCurrentTime(PASSENGER_MAP_RELATIVE_TIME_INTERVAL_MS)
  const routeGroups = useMemo(() => getRouteGroups(routes), [routes])
  const { hasHydratedSelection, selectedRouteId, setSelectedRouteId, clearSelectedRoute } =
    usePassengerRouteSelection(routes, requestedRouteId)
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null
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
  const [centerOnUserRequestCount, setCenterOnUserRequestCount] = useState(0)
  const [mapLoadStatus, setMapLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mapLoadError, setMapLoadError] = useState<string | null>(null)
  const {
    permissionState,
    isRequestingPermission,
    isFollowingPosition,
    position: userPosition,
    accuracyMeters,
    errorMessage: userLocationError,
    requestPermission,
    startFollowingPosition,
    stopFollowingPosition,
  } = usePassengerGeolocation()
  const vehiclesWithRouteMeta = useMemo(
    () => decorateVehiclesWithRouteMeta(snapshot.activeVehicles, routes),
    [routes, snapshot.activeVehicles],
  )
  const vehicleStatsByRoute = useMemo(
    () => getVehicleStatsByRoute(vehiclesWithRouteMeta),
    [vehiclesWithRouteMeta],
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
            routeMatchesSearch(route, deferredRouteSearchTerm) &&
            (!showOnlyRoutesWithVisibleVehicles ||
              (vehicleStatsByRoute.get(route.id)?.visible ?? 0) > 0),
        ),
      })),
    [
      deferredRouteSearchTerm,
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
        routeMatchesSearch(entry.route, deferredRouteSearchTerm) &&
        (!showOnlyRoutesWithVisibleVehicles ||
          (vehicleStatsByRoute.get(entry.route.id)?.visible ?? 0) > 0),
    )
  }, [
    activeTransportType,
    deferredRouteSearchTerm,
    hasTransportTypeFilter,
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
      getNearbyQuickRouteEntries(
        filteredActiveRouteGroup?.routes ?? [],
        routeDistanceById,
        vehicleStatsByRoute,
      ),
    [filteredActiveRouteGroup?.routes, routeDistanceById, vehicleStatsByRoute],
  )
  const locationStatusCopy = getLocationStatusCopy({
    permissionState,
    isRequestingPermission,
    errorMessage: userLocationError,
    isFollowingPosition,
  })
  const selectedRouteVehicles = useMemo(
    () =>
      selectedRoute
        ? displayedVehicles.filter((vehicle) => vehicle.routeId === selectedRoute.id)
        : displayedVehicles,
    [displayedVehicles, selectedRoute],
  )
  const sortedSelectedRouteVehicles = useMemo(
    () =>
      [...selectedRouteVehicles].sort((left, right) => {
        const statusRank = (status: PassengerMapVehicleView['operationalStatus']) => {
          if (status === 'active_recent') return 0
          if (status === 'active_stale') return 1
          return 2
        }

        const byStatus = statusRank(left.operationalStatus) - statusRank(right.operationalStatus)

        if (byStatus !== 0) {
          return byStatus
        }

        return new Date(right.lastUpdate).getTime() - new Date(left.lastUpdate).getTime()
      }),
    [selectedRouteVehicles],
  )
  const selectedVehicle =
    displayedVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
  const featuredVehicle = useMemo(
    () =>
      getFeaturedVehicle(
        selectedRoute ? selectedRouteVehicles : displayedVehicles,
        userPosition ?? null,
      ),
    [displayedVehicles, selectedRoute, selectedRouteVehicles, userPosition],
  )
  const selectedVehicleSummary =
    selectedVehicle ?? featuredVehicle ?? null
  const selectedRouteDistanceMeters = selectedRoute
    ? routeDistanceById.get(selectedRoute.id) ?? null
    : null
  const routeInfoRoute =
    routes.find((route) => route.id === routeInfoRouteId) ?? null
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
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const didFitInitialViewRef = useRef(false)
  const lastFittedViewKeyRef = useRef<string | null>(null)

  function focusRoute(routeId: string) {
    const route = routes.find((currentRoute) => currentRoute.id === routeId)

    if (!route) return

    setRouteCarouselTransportType(route.transportType)
    setSelectedVehicleId(null)
    setSelectedRouteId(route.id)
  }

  function revealMapPanel() {
    mapPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function focusRouteAndRevealMap(routeId: string) {
    focusRoute(routeId)
    revealMapPanel()
  }

  function openVehiclePopup(vehicle: PassengerMapVehicleView) {
    const map = mapRef.current

    if (!map) {
      return
    }

    popupRef.current?.remove()
    popupRef.current = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 18,
    })
      .setLngLat([vehicle.position.lng, vehicle.position.lat])
      .setHTML(createVehiclePopupHtml(vehicle))
      .addTo(map)
  }

  function focusVehicle(vehicleId: string) {
    const vehicle = vehiclesWithRouteMeta.find(
      (currentVehicle) => currentVehicle.id === vehicleId,
    )

    if (!vehicle) return

    const vehicleRoute = routes.find((route) => route.id === vehicle.routeId)

    if (vehicleRoute) {
      setRouteCarouselTransportType(vehicleRoute.transportType)
      setHasTransportTypeFilter(true)
      setSelectedRouteId(vehicle.routeId)
    }

    setSelectedVehicleId(vehicle.id)
    mapRef.current?.flyTo({
      center: [vehicle.position.lng, vehicle.position.lat],
      zoom: 15,
      duration: 0.55,
    })
  }

  const handleVehicleLayerClick = useEffectEvent((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0] as MapGeoJSONFeature | undefined
    const vehicleId = feature?.properties?.vehicleId

    if (typeof vehicleId === 'string') {
      focusVehicle(vehicleId)
    }
  })

  const handleRouteLayerClick = useEffectEvent((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0] as MapGeoJSONFeature | undefined
    const routeId = feature?.id ?? feature?.properties?.routeId

    if (typeof routeId === 'string') {
      focusRouteAndRevealMap(routeId)
    }
  })

  function handleTransportTypeChange(transportType: TransportType) {
    startTransition(() => {
      setRouteCarouselTransportType(transportType)
      setHasTransportTypeFilter(true)
      clearSelectedRoute()
      setSelectedVehicleId(null)
    })
  }

  function handleResetView() {
    startTransition(() => {
      clearSelectedRoute()
      setHasTransportTypeFilter(false)
      setSelectedVehicleId(null)
      setRouteSearchTerm('')
      setShowOnlyRoutesWithVisibleVehicles(false)
    })
  }

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

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyleUrl,
      center: mapInitialCenter,
      zoom: mapInitialZoom,
      maxZoom: mapMaxZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      scrollZoom: false,
    })

    const handleLoad = () => {
      setMapLoadStatus('ready')
      setMapLoadError(null)
    }
    const handleError = () => {
      setMapLoadStatus('error')
      setMapLoadError('No fue posible cargar el mapa base configurado.')
    }
    const resizeMap = () => map.resize()

    mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: mapAttribution,
      }),
      'bottom-right',
    )
    map.on('load', handleLoad)
    map.on('error', handleError)
    window.addEventListener('resize', resizeMap)

    return () => {
      popupRef.current?.remove()
      popupRef.current = null
      window.removeEventListener('resize', resizeMap)
      map.off('load', handleLoad)
      map.off('error', handleError)
      map.remove()
      mapRef.current = null
      setMapLoadStatus('loading')
    }
  }, [])

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
      buildRouteFeatureCollection(displayedRoutes, selectedRoute?.id ?? null),
    )
    ;(mapRef.current?.getSource(VEHICLES_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      buildVehicleFeatureCollection(displayedVehicles, selectedVehicleId),
    )
    ;(mapRef.current?.getSource(SELECTED_VEHICLE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      buildSelectedVehicleFeatureCollection(selectedVehicle),
    )
    ;(mapRef.current?.getSource(USER_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      buildUserFeatureCollection(userPosition, null),
    )
    ;(mapRef.current?.getSource(USER_ACCURACY_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      buildAccuracyFeatureCollection(userPosition, accuracyMeters),
    )
  }, [accuracyMeters, displayedRoutes, displayedVehicles, mapLoadStatus, selectedRoute?.id, selectedVehicle, selectedVehicleId, userPosition])

  useEffect(() => {
    if (mapLoadStatus !== 'ready') return

    if (selectedVehicle) {
      openVehiclePopup(selectedVehicle)
      return
    }

    popupRef.current?.remove()
    popupRef.current = null
  }, [mapLoadStatus, selectedVehicle])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapLoadStatus !== 'ready') return

    const viewKey = selectedRoute?.id ?? `transport:${activeTransportType}`
    const shouldFitView =
      !didFitInitialViewRef.current || lastFittedViewKeyRef.current !== viewKey
    const routeBounds = getRouteBounds(selectedRoute ? [selectedRoute] : displayedRoutes)

    if (shouldFitView && routeBounds) {
      map.fitBounds(routeBounds, {
        padding: {
          top: 72,
          bottom: selectedRoute || selectedVehicleSummary ? 112 : 32,
          left: 24,
          right: 24,
        },
        maxZoom: selectedRoute ? 14.75 : 13.6,
      })
      didFitInitialViewRef.current = true
      lastFittedViewKeyRef.current = viewKey
      return
    }

    if (!didFitInitialViewRef.current && userPosition) {
      map.flyTo({
        center: [userPosition.lng, userPosition.lat],
        zoom: 14,
        duration: 0.55,
      })
      didFitInitialViewRef.current = true
      lastFittedViewKeyRef.current = viewKey
    }
  }, [activeTransportType, displayedRoutes, mapLoadStatus, selectedRoute, selectedVehicleSummary, userPosition])

  useEffect(() => {
    const map = mapRef.current

    if (!map || mapLoadStatus !== 'ready' || centerOnUserRequestCount === 0) {
      return
    }

    if (!userPosition) {
      requestPermission()
      return
    }

    map.flyTo({
      center: [userPosition.lng, userPosition.lat],
      zoom: 15,
      duration: 0.55,
    })
  }, [centerOnUserRequestCount, mapLoadStatus, requestPermission, userPosition])

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
          selectedRouteName={selectedRoute?.name ?? null}
          visibleVehiclesCount={visibleVehiclesCount}
          activeRoutesCount={activeRoutesCount}
          onOpenRoutes={() => setRoutePickerOpen(true)}
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
                    <p className="text-sm font-semibold text-slate-900">
                      Cargando mapa moderno
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      MapLibre esta inicializando la capa base y los estilos de Stadia.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="pointer-events-none absolute left-3 right-3 top-3 flex items-start justify-between gap-3">
                <div className="pointer-events-auto max-w-[70%] rounded-full bg-white/92 px-3 py-2 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.6)] backdrop-blur">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-700">
                    {selectedRoute
                      ? getTransportTypeLabel(selectedRoute.transportType)
                      : `Vista de ${getTransportTypeLabel(activeTransportType)}`}
                  </p>
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {selectedRoute
                      ? selectedRoute.name
                      : `${activeRoutesCount} rutas con servicio para explorar`}
                  </p>
                </div>

                <div className="pointer-events-auto flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setCenterOnUserRequestCount((value) => value + 1)}
                    className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-sky-200 bg-white text-sky-700 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.6)] backdrop-blur transition hover:border-sky-300"
                    aria-label="Ir a mi ubicacion"
                    title="Ir a mi ubicacion"
                  >
                    <LocationTargetIcon />
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
                <div className="pointer-events-none absolute bottom-3 left-3 right-3">
                  <div className="pointer-events-auto rounded-[1.3rem] bg-white/94 px-4 py-3 shadow-[0_18px_35px_-28px_rgba(15,23,42,0.6)] backdrop-blur">
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
                      <>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span className="font-semibold text-slate-900">
                            {selectedVehicleSummary.unitNumber}
                          </span>
                          <span>{formatRelativeLastUpdate(selectedVehicleSummary.lastUpdate, currentTimeMs)}</span>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getSignalBadgeClass(
                              selectedVehicleSummary.operationalStatus,
                            )}`}
                          >
                            {getOperationalStatusLabel(selectedVehicleSummary.operationalStatus)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => focusVehicle(selectedVehicleSummary.id)}
                            className="inline-flex min-h-10 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-teal-700"
                          >
                            Ver unidad
                          </button>
                          {selectedRoute || hasTransportTypeFilter ? (
                            <button
                              type="button"
                              onClick={handleResetView}
                              className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700"
                            >
                              Vista general
                            </button>
                          ) : null}
                          <span className="inline-flex min-h-10 items-center rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-600">
                            Ultima senal: {formatLastUpdate(selectedVehicleSummary.lastUpdate)}
                          </span>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
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
            selectedRouteVehicles={sortedSelectedRouteVehicles}
            isFollowingPosition={isFollowingPosition}
            currentTimeMs={currentTimeMs}
            routeDistanceById={routeDistanceById}
            vehicleStatsByRoute={vehicleStatsByRoute}
            routeSearchTerm={routeSearchTerm}
            showOnlyRoutesWithVisibleVehicles={showOnlyRoutesWithVisibleVehicles}
            canResetView={Boolean(selectedRoute || hasTransportTypeFilter)}
            onRequestPermission={() => {
              void requestPermission()
            }}
            onStartFollowingPosition={() => {
              void startFollowingPosition()
            }}
            onStopFollowingPosition={stopFollowingPosition}
            onFocusRecommended={() => {
              if (recommendedRoute) {
                focusRouteAndRevealMap(recommendedRoute.route.id)
              }
            }}
            onFocusVehicle={focusVehicle}
            onRouteSearchTermChange={(value) => {
              startTransition(() => {
                setRouteSearchTerm(value)
              })
            }}
            onClearSearch={() => {
              startTransition(() => {
                setRouteSearchTerm('')
              })
            }}
            onToggleShowOnlyRoutesWithVisibleVehicles={() =>
              setShowOnlyRoutesWithVisibleVehicles((current) => !current)
            }
            onTransportTypeChange={handleTransportTypeChange}
            onResetView={handleResetView}
            onToggleRoute={(routeId) => {
              setSelectedVehicleId(null)

              if (routeId === selectedRoute?.id) {
                clearSelectedRoute()
                return
              }

              focusRouteAndRevealMap(routeId)
            }}
            onShowRouteInfo={setRouteInfoRouteId}
          />
        </section>
      </section>

      <PassengerRoutePickerModal
        isOpen={isRoutePickerOpen}
        activeTransportType={activeTransportType}
        routeGroups={filteredRouteGroups}
            selectedRouteId={selectedRoute?.id ?? null}
            routeSearchTerm={routeSearchTerm}
            routeDistanceById={routeDistanceById}
            vehicleStatsByRoute={vehicleStatsByRoute}
            showOnlyRoutesWithVisibleVehicles={showOnlyRoutesWithVisibleVehicles}
            onClose={() => setRoutePickerOpen(false)}
        onRouteSearchTermChange={(value) => {
          startTransition(() => {
            setRouteSearchTerm(value)
          })
        }}
        onToggleShowOnlyRoutesWithVisibleVehicles={() =>
          setShowOnlyRoutesWithVisibleVehicles((current) => !current)
        }
        onTransportTypeChange={handleTransportTypeChange}
        onRouteSelect={(routeId) => {
          focusRouteAndRevealMap(routeId)
          setRoutePickerOpen(false)
        }}
        onClearSelection={() => {
          handleResetView()
          setRoutePickerOpen(false)
        }}
        onClearSearch={() => {
          startTransition(() => {
            setRouteSearchTerm('')
          })
        }}
      />

      {isInfoOpen ? <PassengerMapInfoModal onClose={() => setInfoOpen(false)} /> : null}
      {routeInfoRoute ? (
        <PassengerRouteInfoModal route={routeInfoRoute} onClose={() => setRouteInfoRouteId(null)} />
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
