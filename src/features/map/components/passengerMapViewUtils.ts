import type {
  BusRoute,
  Coordinates,
  PassengerMapVehicle,
  TransportType,
} from '../../../types/domain'
import type { PassengerGeolocationPermissionState } from '../hooks/usePassengerGeolocation'
import type { ServiceOperationalStatus } from '../../../../shared/tracking'

export interface PassengerRouteGroup {
  transportType: TransportType
  label: string
  routes: BusRoute[]
}

export interface PassengerRouteDistanceEntry {
  route: BusRoute
  distanceMeters: number | null
}

export interface PassengerLocationStatusCopy {
  title: string
  description: string
}

export type PassengerMapVehicleView = PassengerMapVehicle & {
  isVisibleInOverview: boolean
  transportType: TransportType
}

export function formatLastUpdate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

export function formatRelativeLastUpdate(value: string, nowMs: number) {
  const elapsedMs = nowMs - new Date(value).getTime()

  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 'hace un momento'
  }

  const elapsedMinutes = Math.round(elapsedMs / 60_000)

  if (elapsedMinutes < 1) return 'hace un momento'
  if (elapsedMinutes < 60) return `hace ${elapsedMinutes} min`

  const elapsedHours = Math.round(elapsedMinutes / 60)

  if (elapsedHours < 24) return `hace ${elapsedHours} h`

  const elapsedDays = Math.round(elapsedHours / 24)
  return `hace ${elapsedDays} d`
}

export function getTransportTypeLabel(transportType: TransportType) {
  return transportType === 'urbano' ? 'Urbano' : 'Colectivo'
}

export function getSignalBadgeClass(status: ServiceOperationalStatus) {
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

export function getMarkerStyle(status: ServiceOperationalStatus) {
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

export function getRouteGroups(routes: BusRoute[]): PassengerRouteGroup[] {
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

export function formatDistanceRange(distanceMeters: number) {
  if (distanceMeters < 150) return '0 a 150 m'
  if (distanceMeters < 300) return '150 a 300 m'
  if (distanceMeters < 600) return '300 a 600 m'
  if (distanceMeters < 1_000) return '600 m a 1 km'
  if (distanceMeters < 2_000) return '1 a 2 km'
  if (distanceMeters < 4_000) return '2 a 4 km'
  return 'más de 4 km'
}

export function parseRouteDirection(direction: string) {
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
    .filter(
      (stop, index, allStops) =>
        stop.length > 0 && allStops.indexOf(stop) === index,
    )

  return {
    summary: pathSummary,
    stops,
    startTime: startTimeMatch?.[1]?.trim() ?? null,
    endTime: endTimeMatch?.[1]?.trim() ?? null,
    frequency: frequencyMatch?.[1]?.trim() ?? null,
  }
}

export function getRouteDistanceTone(distanceMeters: number | null) {
  if (distanceMeters === null) return 'bg-slate-100 text-slate-600'
  if (distanceMeters <= 600) return 'bg-emerald-100 text-emerald-700'
  if (distanceMeters <= 2_000) return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

export function routeMatchesSearch(route: BusRoute, searchTerm: string) {
  const normalizedSearch = searchTerm.trim().toLowerCase()

  if (!normalizedSearch) {
    return true
  }

  return (
    route.name.toLowerCase().includes(normalizedSearch) ||
    route.direction.toLowerCase().includes(normalizedSearch)
  )
}

export function getLocationStatusCopy({
  permissionState,
  isRequestingPermission,
  errorMessage,
}: {
  permissionState: PassengerGeolocationPermissionState
  isRequestingPermission: boolean
  errorMessage: string | null
}): PassengerLocationStatusCopy {
  if (isRequestingPermission) {
    return {
      title: 'Solicitando tu ubicación',
      description: 'Acepta el permiso para ver rutas cercanas y ubicarte en el mapa.',
    }
  }

  if (permissionState === 'granted') {
    return {
      title: 'Tu ubicación está activa',
      description: 'Las rutas cercanas se calculan en tiempo real según tu posición.',
    }
  }

  if (permissionState === 'denied') {
    return {
      title: 'La ubicación está bloqueada',
      description:
        errorMessage ??
        'Activa el permiso del navegador para ver rutas cercanas y usar el botón de ubicación.',
    }
  }

  if (permissionState === 'unsupported') {
    return {
      title: 'Tu navegador no soporta ubicación',
      description: 'Puedes seguir usando el mapa, pero no se mostrarán rutas cercanas a ti.',
    }
  }

  if (permissionState === 'loading') {
    return {
      title: 'Ubicando tu posición',
      description: 'Estamos preparando el permiso y la primera lectura del mapa.',
    }
  }

  return {
    title: 'Ubicación pendiente',
    description: 'Esperando permiso o una primera lectura de ubicación.',
  }
}

export function decorateVehiclesWithRouteMeta(
  vehicles: PassengerMapVehicle[],
  routes: BusRoute[],
): PassengerMapVehicleView[] {
  const routeTransportTypeById = new Map(
    routes.map((route) => [route.id, route.transportType] as const),
  )

  return vehicles.map((vehicle) => {
    return {
      ...vehicle,
      isVisibleInOverview: vehicle.operationalStatus !== 'probably_stopped',
      transportType: routeTransportTypeById.get(vehicle.routeId) ?? 'urbano',
    }
  })
}

export function getDisplayedVehicles(
  vehicles: PassengerMapVehicleView[],
  activeTransportType: TransportType,
  selectedRouteId?: string | null,
) {
  return vehicles.filter(
    (vehicle) =>
      vehicle.transportType === activeTransportType &&
      (selectedRouteId
        ? vehicle.routeId === selectedRouteId
        : vehicle.isVisibleInOverview),
  )
}

export function getDisplayedRoutes(
  routeGroups: PassengerRouteGroup[],
  activeTransportType: TransportType,
) {
  return (
    routeGroups.find((group) => group.transportType === activeTransportType)?.routes ??
    []
  )
}

export function getVehicleStatsByRoute(vehicles: PassengerMapVehicleView[]) {
  const statsByRouteId = new Map<string, { visible: number; stopped: number }>()

  vehicles.forEach((vehicle) => {
    const current = statsByRouteId.get(vehicle.routeId) ?? { visible: 0, stopped: 0 }

    if (vehicle.isVisibleInOverview) current.visible += 1
    if (vehicle.operationalStatus === 'probably_stopped') current.stopped += 1

    statsByRouteId.set(vehicle.routeId, current)
  })

  return statsByRouteId
}

export function getSortedRoutesByDistance(
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

export function getRecommendedRouteEntry(
  routeEntries: PassengerRouteDistanceEntry[],
  vehicleStatsByRoute: Map<string, { visible: number; stopped: number }>,
) {
  if (routeEntries.length === 0) {
    return null
  }

  const routesWithVisibleVehicles = routeEntries.filter(
    (entry) => (vehicleStatsByRoute.get(entry.route.id)?.visible ?? 0) > 0,
  )

  return routesWithVisibleVehicles[0] ?? routeEntries[0] ?? null
}

export function getNearbyRoutesCount(
  routes: BusRoute[],
  routeDistanceById: Map<string, number | null>,
  maxDistanceMeters = 2_000,
) {
  return routes.filter((route) => {
    const distanceMeters = routeDistanceById.get(route.id)
    return (
      distanceMeters !== null &&
      distanceMeters !== undefined &&
      distanceMeters <= maxDistanceMeters
    )
  }).length
}

export function getFeaturedVehicle(
  vehicles: PassengerMapVehicleView[],
  userPosition: Coordinates | null,
) {
  if (vehicles.length === 0) {
    return null
  }

  return [...vehicles].sort((left, right) => {
    const leftStatusRank = left.operationalStatus === 'active_recent' ? 0 : 1
    const rightStatusRank = right.operationalStatus === 'active_recent' ? 0 : 1

    if (leftStatusRank !== rightStatusRank) {
      return leftStatusRank - rightStatusRank
    }

    if (userPosition) {
      const leftDistance = getDistanceBetweenPointsMeters(userPosition, left.position)
      const rightDistance = getDistanceBetweenPointsMeters(userPosition, right.position)

      if (Math.abs(leftDistance - rightDistance) > 50) {
        return leftDistance - rightDistance
      }
    }

    return new Date(right.lastUpdate).getTime() - new Date(left.lastUpdate).getTime()
  })[0]
}

function getDistanceBetweenPointsMeters(first: Coordinates, second: Coordinates) {
  const earthRadiusMeters = 6_371_000
  const latDeltaRadians = degreesToRadians(second.lat - first.lat)
  const lngDeltaRadians = degreesToRadians(second.lng - first.lng)
  const firstLatRadians = degreesToRadians(first.lat)
  const secondLatRadians = degreesToRadians(second.lat)

  const haversine =
    Math.sin(latDeltaRadians / 2) * Math.sin(latDeltaRadians / 2) +
    Math.cos(firstLatRadians) *
      Math.cos(secondLatRadians) *
      Math.sin(lngDeltaRadians / 2) *
      Math.sin(lngDeltaRadians / 2)

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180
}

export function getRouteBoundsPoints(routes: BusRoute[]) {
  return routes.flatMap((route) =>
    route.segments.flatMap((segment) =>
      segment.map((point) => [point.lat, point.lng] as [number, number]),
    ),
  )
}
