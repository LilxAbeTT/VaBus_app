import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import L from 'leaflet'
import { convexUrl } from '../../../lib/env'
import { useCurrentTime } from '../../../hooks/useCurrentTime'
import {
  getMinimumDistanceToRouteMeters,
  getOperationalStatusLabel,
} from '../../../lib/trackingSignal'
import type { PassengerMapSnapshot, TransportType } from '../../../types/domain'
import { usePassengerRouteSelection } from '../hooks/usePassengerRouteSelection'
import { usePassengerMapSnapshot } from '../hooks/usePassengerMapSnapshot'
import { usePassengerGeolocation } from '../hooks/usePassengerGeolocation'
import {
  PassengerMapEmptyState,
  PassengerMapInfoModal,
  PassengerRouteInfoModal,
  PassengerRoutePickerModal,
} from './PassengerMapOverlays'
import { PassengerMapHeader } from './PassengerMapHeader'
import { PassengerMapSidebar } from './PassengerMapSidebar'
import {
  decorateVehiclesWithRouteMeta,
  formatDistanceRange,
  formatLastUpdate,
  formatRelativeLastUpdate,
  getDisplayedRoutes,
  getDisplayedVehicles,
  getFeaturedVehicle,
  getLocationStatusCopy,
  getMarkerStyle,
  getRecommendedRouteEntry,
  getRouteBoundsPoints,
  getRouteGroups,
  getSignalBadgeClass,
  getSortedRoutesByDistance,
  getTransportTypeLabel,
  getVehicleStatsByRoute,
  routeMatchesSearch,
} from './passengerMapViewUtils'

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

function PassengerMapContent({
  snapshot,
}: {
  snapshot: PassengerMapSnapshot
}) {
  const routes = snapshot.routes
  const currentTimeMs = useCurrentTime(30_000)
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
  const [routeSearchTerm, setRouteSearchTerm] = useState('')
  const deferredRouteSearchTerm = useDeferredValue(routeSearchTerm)
  const [showOnlyRoutesWithVisibleVehicles, setShowOnlyRoutesWithVisibleVehicles] =
    useState(false)
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
    selectedRoute?.transportType ?? resolvedRouteCarouselTransportType

  const displayedRoutes = useMemo(
    () => getDisplayedRoutes(routeGroups, activeTransportType),
    [activeTransportType, routeGroups],
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

  const filteredRouteGroups = useMemo(
    () =>
      routeGroups.map((group) => ({
        ...group,
        routes: group.routes.filter(
          (route) =>
            routeMatchesSearch(route, deferredRouteSearchTerm) &&
            (!showOnlyRoutesWithVisibleVehicles ||
              (vehicleStatsByRoute.get(route.id)?.visible ?? 0) > 0),
        ),
      })),
    [deferredRouteSearchTerm, routeGroups, showOnlyRoutesWithVisibleVehicles, vehicleStatsByRoute],
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
  const activeRoutesCount = filteredActiveRouteGroup?.routes.filter(
    (route) => (vehicleStatsByRoute.get(route.id)?.visible ?? 0) > 0,
  ).length

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapPanelRef = useRef<HTMLElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const vehicleLayerRef = useRef<L.LayerGroup | null>(null)
  const userLayerRef = useRef<L.LayerGroup | null>(null)
  const vehicleMarkerByIdRef = useRef(new Map<string, L.CircleMarker>())
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

  function revealMapPanel() {
    mapPanelRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function focusRouteAndRevealMap(routeId: string) {
    focusRoute(routeId)
    revealMapPanel()
  }

  function focusVehicle(vehicleId: string) {
    const vehicle = snapshot.activeVehicles.find(
      (currentVehicle) => currentVehicle.id === vehicleId,
    )

    if (!vehicle) {
      return
    }

    const vehicleRoute = routes.find((route) => route.id === vehicle.routeId)

    if (vehicleRoute) {
      setRouteCarouselTransportType(vehicleRoute.transportType)
      setHasTransportTypeFilter(true)
      setSelectedRouteId(vehicle.routeId)
    }

    setSelectedVehicleId(vehicle.id)

    const map = mapRef.current

    if (!map) {
      return
    }

    map.flyTo([vehicle.position.lat, vehicle.position.lng], Math.max(map.getZoom(), 15), {
      duration: 0.55,
    })

    window.setTimeout(() => {
      vehicleMarkerByIdRef.current.get(vehicle.id)?.openPopup()
    }, 180)
  }

  const handleVehicleMarkerClick = useEffectEvent((vehicleId: string) => {
    focusVehicle(vehicleId)
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
    vehicleMarkerByIdRef.current.clear()

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
      const isSelectedVehicle = vehicle.id === selectedVehicleId
      const marker = L.circleMarker(
        [vehicle.position.lat, vehicle.position.lng],
        isSelectedVehicle
          ? {
              ...getMarkerStyle(vehicle.operationalStatus),
              radius: 14,
              weight: 4,
              color: '#0f172a',
              fillOpacity: 1,
            }
          : getMarkerStyle(vehicle.operationalStatus),
      )

      marker
        .addTo(vehicleLayer)
        .bindPopup(
          `<strong>${vehicle.unitNumber}</strong><br/>${vehicle.routeName}<br/>${getOperationalStatusLabel(vehicle.operationalStatus)}<br/>Actualizado: ${formatLastUpdate(vehicle.lastUpdate)}`,
        )
        .on('click', () => handleVehicleMarkerClick(vehicle.id))

      vehicleMarkerByIdRef.current.set(vehicle.id, marker)

      if (isSelectedVehicle) {
        L.circle([vehicle.position.lat, vehicle.position.lng], {
          radius: 85,
          color: '#0f172a',
          fillColor: '#cbd5f5',
          fillOpacity: 0.1,
          weight: 1.5,
        }).addTo(vehicleLayer)
      }

      if (isSelectedVehicle) {
        marker.bringToFront()
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
    selectedVehicleId,
    selectedVehicleSummary,
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
                            {getOperationalStatusLabel(
                              selectedVehicleSummary.operationalStatus,
                            )}
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
                          {(selectedRoute || hasTransportTypeFilter) ? (
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
            routeGroups={routeGroups}
            activeTransportType={activeTransportType}
            activeRouteGroup={filteredActiveRouteGroup}
            hasTransportTypeFilter={hasTransportTypeFilter}
            recommendedRoute={recommendedRoute}
            permissionState={permissionState}
            locationStatusCopy={locationStatusCopy}
            selectedRoute={selectedRoute}
            routeDistanceById={routeDistanceById}
            vehicleStatsByRoute={vehicleStatsByRoute}
            routeSearchTerm={routeSearchTerm}
            showOnlyRoutesWithVisibleVehicles={showOnlyRoutesWithVisibleVehicles}
            canResetView={Boolean(selectedRoute || hasTransportTypeFilter)}
            onRequestPermission={requestPermission}
            onFocusRecommended={() => {
              if (recommendedRoute) {
                focusRouteAndRevealMap(recommendedRoute.route.id)
              }
            }}
            onRouteSearchTermChange={(value) => {
              startTransition(() => {
                setRouteSearchTerm(value)
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
      />

      {isInfoOpen ? (
        <PassengerMapInfoModal onClose={() => setInfoOpen(false)} />
      ) : null}
      {routeInfoRoute ? (
        <PassengerRouteInfoModal
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
  const currentTimeMs = useCurrentTime(30_000)
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
