import type {
  BusRoute,
  Coordinates,
  PassengerMapVehicle,
  TransportType,
} from '../../../types/domain'
import type { PassengerGeolocationPermissionState } from '../hooks/usePassengerGeolocation'
import type { ServiceOperationalStatus } from '../../../../shared/tracking'
import { normalizeTextForSearch, repairPossibleMojibake } from '../../../../shared/routeDetails'

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

export interface PassengerQuickRouteEntry {
  route: BusRoute
  distanceMeters: number | null
  visibleVehicles: number
  stoppedVehicles: number
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

export function getOperationalStatusShortLabel(status: ServiceOperationalStatus) {
  switch (status) {
    case 'active_recent':
      return 'Reciente'
    case 'active_stale':
      return 'Desactualizada'
    case 'probably_stopped':
      return 'Detenida'
    default:
      return 'Sin dato'
  }
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
      routes: groupedRoutes.get(transportType) ?? [],
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
  return 'mas de 4 km'
}

export function getRouteDistanceTone(distanceMeters: number | null) {
  if (distanceMeters === null) return 'bg-slate-100 text-slate-600'
  if (distanceMeters <= 600) return 'bg-emerald-100 text-emerald-700'
  if (distanceMeters <= 2_000) return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

function getRouteSearchHaystack(route: BusRoute) {
  return normalizeTextForSearch(
    [
      route.name,
      route.direction,
      route.importKey,
      route.slug,
      route.passengerInfo.summary,
      route.passengerInfo.landmarks.join(' '),
      route.passengerInfo.startTime ?? '',
      route.passengerInfo.endTime ?? '',
      route.passengerInfo.frequency ?? '',
      getTransportTypeLabel(route.transportType),
    ].join(' '),
  )
}

export function routeMatchesSearch(route: BusRoute, searchTerm: string) {
  const normalizedSearch = normalizeTextForSearch(searchTerm)

  if (!normalizedSearch) {
    return true
  }

  return getRouteSearchHaystack(route).includes(normalizedSearch)
}

export function getLocationStatusCopy({
  permissionState,
  isRequestingPermission,
  errorMessage,
  isFollowingPosition,
}: {
  permissionState: PassengerGeolocationPermissionState
  isRequestingPermission: boolean
  errorMessage: string | null
  isFollowingPosition: boolean
}): PassengerLocationStatusCopy {
  if (isRequestingPermission) {
    return {
      title: 'Buscando tu ubicacion',
      description: 'Acepta el permiso para ver rutas cercanas y centrar tu posicion.',
    }
  }

  if (permissionState === 'granted') {
    return {
      title: isFollowingPosition ? 'Ubicacion en seguimiento' : 'Ubicacion lista',
      description: isFollowingPosition
        ? 'El mapa puede seguir tu posicion mientras exploras rutas cercanas.'
        : 'Tus rutas cercanas se calculan con una lectura reciente de tu posicion.',
    }
  }

  if (permissionState === 'denied') {
    return {
      title: 'Ubicacion bloqueada',
      description:
        errorMessage ??
        'Activa el permiso del navegador para ver rutas cercanas y usar el boton de ubicacion.',
    }
  }

  if (permissionState === 'unsupported') {
    return {
      title: 'Ubicacion no disponible',
      description: 'Puedes seguir usando el mapa y elegir rutas manualmente.',
    }
  }

  if (permissionState === 'loading') {
    return {
      title: 'Preparando ubicacion',
      description: 'Estamos validando si el navegador puede darte una lectura inicial.',
    }
  }

  return {
    title: 'Activa tu ubicacion',
    description: 'Con una sola lectura te sugerimos rutas cercanas sin complicar la vista.',
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
      unitNumber: repairPossibleMojibake(vehicle.unitNumber),
      label: repairPossibleMojibake(vehicle.label),
      routeName: repairPossibleMojibake(vehicle.routeName),
      driverName: repairPossibleMojibake(vehicle.driverName),
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
      (selectedRouteId ? vehicle.routeId === selectedRouteId : vehicle.isVisibleInOverview),
  )
}

export function getDisplayedRoutes(
  routeGroups: PassengerRouteGroup[],
  activeTransportType: TransportType,
) {
  return (
    routeGroups.find((group) => group.transportType === activeTransportType)?.routes ?? []
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

function getRouteUtilityScore(
  route: BusRoute,
  routeDistanceById: Map<string, number | null>,
  vehicleStatsByRoute: Map<string, { visible: number; stopped: number }>,
) {
  const routeStats = vehicleStatsByRoute.get(route.id) ?? { visible: 0, stopped: 0 }
  const distanceMeters = routeDistanceById.get(route.id) ?? null
  const visibleWeight = routeStats.visible * 10_000
  const stoppedWeight = routeStats.stopped * 1_000
  const distanceWeight =
    distanceMeters === null ? 0 : Math.max(0, 5_000 - Math.round(distanceMeters))

  return visibleWeight + stoppedWeight + distanceWeight
}

export function sortRoutesByUtility(
  routes: BusRoute[],
  routeDistanceById: Map<string, number | null>,
  vehicleStatsByRoute: Map<string, { visible: number; stopped: number }>,
) {
  return [...routes].sort((left, right) => {
    const scoreDifference =
      getRouteUtilityScore(right, routeDistanceById, vehicleStatsByRoute) -
      getRouteUtilityScore(left, routeDistanceById, vehicleStatsByRoute)

    if (scoreDifference !== 0) {
      return scoreDifference
    }

    const leftDistance = routeDistanceById.get(left.id)
    const rightDistance = routeDistanceById.get(right.id)

    if (leftDistance !== null && leftDistance !== undefined && rightDistance !== null && rightDistance !== undefined) {
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance
      }
    } else if (leftDistance !== null && leftDistance !== undefined) {
      return -1
    } else if (rightDistance !== null && rightDistance !== undefined) {
      return 1
    }

    return left.name.localeCompare(right.name, 'es')
  })
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

export function getNearbyQuickRouteEntries(
  routes: BusRoute[],
  routeDistanceById: Map<string, number | null>,
  vehicleStatsByRoute: Map<string, { visible: number; stopped: number }>,
  limit = 4,
) {
  return sortRoutesByUtility(routes, routeDistanceById, vehicleStatsByRoute)
    .map((route) => {
      const stats = vehicleStatsByRoute.get(route.id) ?? { visible: 0, stopped: 0 }

      return {
        route,
        distanceMeters: routeDistanceById.get(route.id) ?? null,
        visibleVehicles: stats.visible,
        stoppedVehicles: stats.stopped,
      } satisfies PassengerQuickRouteEntry
    })
    .filter((entry) => entry.visibleVehicles > 0 || entry.distanceMeters !== null)
    .slice(0, limit)
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
