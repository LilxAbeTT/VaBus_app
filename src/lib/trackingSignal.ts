import {
  getSignalAgeMs,
  REALTIME_MIN_DISTANCE_METERS,
  REALTIME_MIN_SIGNAL_INTERVAL_MS,
  getServiceOperationalStatus,
  type ServiceOperationalStatus,
} from '../../shared/tracking'
import type { Coordinates } from '../types/domain'

export type TrackingTransmissionSkipReason =
  | 'too_soon'
  | 'no_meaningful_change'

export type BrowserSignalIssueReason =
  | 'low_accuracy'
  | 'outside_route_zone'

export const BROWSER_SIGNAL_MAX_ACCURACY_METERS = 2_500
export const REALTIME_ROUTE_SANITY_MAX_DISTANCE_METERS = 25_000

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function projectCoordinateToMeters(point: Coordinates, referenceLatitude: number) {
  const metersPerLatitudeDegree = 111_320
  const metersPerLongitudeDegree =
    Math.cos(toRadians(referenceLatitude)) * metersPerLatitudeDegree

  return {
    x: point.lng * metersPerLongitudeDegree,
    y: point.lat * metersPerLatitudeDegree,
  }
}

export function getOperationalStatusLabel(
  status: ServiceOperationalStatus,
) {
  switch (status) {
    case 'active_recent':
      return 'Reciente'
    case 'active_stale':
      return 'Desactualizada'
    case 'probably_stopped':
      return 'Probablemente detenida'
    default:
      return 'Sin estado'
  }
}

export function getOperationalStatusFromLastUpdate(
  recordedAt?: string | null,
  nowMs = Date.now(),
) {
  return getServiceOperationalStatus(recordedAt, nowMs)
}

export function formatElapsedSignalTime(
  recordedAt?: string | null,
  nowMs = Date.now(),
) {
  const signalAgeMs = getSignalAgeMs(recordedAt, nowMs)

  if (signalAgeMs === null) {
    return 'Sin señal'
  }

  if (signalAgeMs < 60_000) {
    return `Hace ${Math.max(1, Math.floor(signalAgeMs / 1000))} s`
  }

  if (signalAgeMs < 3_600_000) {
    return `Hace ${Math.floor(signalAgeMs / 60_000)} min`
  }

  return `Hace ${Math.floor(signalAgeMs / 3_600_000)} h`
}

export function getDistanceBetweenCoordinatesMeters(
  left: Coordinates,
  right: Coordinates,
) {
  const earthRadiusMeters = 6_371_000
  const latitudeDelta = toRadians(right.lat - left.lat)
  const longitudeDelta = toRadians(right.lng - left.lng)
  const leftLatitude = toRadians(left.lat)
  const rightLatitude = toRadians(right.lat)
  const haversineValue =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2)

  return (
    2 *
    earthRadiusMeters *
    Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue))
  )
}

function getDistanceToSegmentMeters(
  point: Coordinates,
  segmentStart: Coordinates,
  segmentEnd: Coordinates,
) {
  const referenceLatitude =
    (point.lat + segmentStart.lat + segmentEnd.lat) / 3
  const projectedPoint = projectCoordinateToMeters(point, referenceLatitude)
  const projectedStart = projectCoordinateToMeters(
    segmentStart,
    referenceLatitude,
  )
  const projectedEnd = projectCoordinateToMeters(segmentEnd, referenceLatitude)
  const deltaX = projectedEnd.x - projectedStart.x
  const deltaY = projectedEnd.y - projectedStart.y
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY

  if (segmentLengthSquared === 0) {
    return Math.hypot(
      projectedPoint.x - projectedStart.x,
      projectedPoint.y - projectedStart.y,
    )
  }

  const projectionFactor = Math.max(
    0,
    Math.min(
      1,
      ((projectedPoint.x - projectedStart.x) * deltaX +
        (projectedPoint.y - projectedStart.y) * deltaY) /
        segmentLengthSquared,
    ),
  )

  const projectedClosestPoint = {
    x: projectedStart.x + projectionFactor * deltaX,
    y: projectedStart.y + projectionFactor * deltaY,
  }

  return Math.hypot(
    projectedPoint.x - projectedClosestPoint.x,
    projectedPoint.y - projectedClosestPoint.y,
  )
}

export function getMinimumDistanceToRouteMeters(
  point: Coordinates,
  routeSegments: Coordinates[][],
) {
  let closestDistanceMeters: number | null = null

  routeSegments.forEach((segment) => {
    if (segment.length === 0) {
      return
    }

    if (segment.length === 1) {
      const pointDistanceMeters = getDistanceBetweenCoordinatesMeters(
        point,
        segment[0],
      )

      closestDistanceMeters =
        closestDistanceMeters === null
          ? pointDistanceMeters
          : Math.min(closestDistanceMeters, pointDistanceMeters)

      return
    }

    for (let index = 0; index < segment.length - 1; index += 1) {
      const segmentDistanceMeters = getDistanceToSegmentMeters(
        point,
        segment[index],
        segment[index + 1],
      )

      closestDistanceMeters =
        closestDistanceMeters === null
          ? segmentDistanceMeters
          : Math.min(closestDistanceMeters, segmentDistanceMeters)
    }
  })

  return closestDistanceMeters
}

export function evaluateBrowserSignalPlausibility({
  accuracyMeters,
  nextPosition,
  routeSegments,
}: {
  accuracyMeters?: number | null
  nextPosition: Coordinates
  routeSegments?: Coordinates[][] | null
}) {
  const distanceToRouteMeters =
    routeSegments && routeSegments.length > 0
      ? getMinimumDistanceToRouteMeters(nextPosition, routeSegments)
      : null

  if (
    accuracyMeters !== null &&
    accuracyMeters !== undefined &&
    accuracyMeters > BROWSER_SIGNAL_MAX_ACCURACY_METERS
  ) {
    return {
      accepted: false,
      reason: 'low_accuracy' as const,
      accuracyMeters,
      distanceToRouteMeters,
    }
  }

  if (
    distanceToRouteMeters !== null &&
    distanceToRouteMeters > REALTIME_ROUTE_SANITY_MAX_DISTANCE_METERS
  ) {
    return {
      accepted: false,
      reason: 'outside_route_zone' as const,
      accuracyMeters: accuracyMeters ?? null,
      distanceToRouteMeters,
    }
  }

  return {
    accepted: true,
    accuracyMeters: accuracyMeters ?? null,
    distanceToRouteMeters,
  }
}

export function evaluateRealtimeSignalDispatch({
  lastSentAt,
  lastSentPosition,
  nextPosition,
  nowMs = Date.now(),
}: {
  lastSentAt?: string | null
  lastSentPosition?: Coordinates | null
  nextPosition: Coordinates
  nowMs?: number
}) {
  const elapsedMs = getSignalAgeMs(lastSentAt, nowMs)
  const distanceMeters = lastSentPosition
    ? getDistanceBetweenCoordinatesMeters(lastSentPosition, nextPosition)
    : null

  if (
    elapsedMs !== null &&
    elapsedMs < REALTIME_MIN_SIGNAL_INTERVAL_MS
  ) {
    return {
      shouldSend: false,
      reason: 'too_soon' as const,
      elapsedMs,
      distanceMeters,
    }
  }

  if (
    distanceMeters !== null &&
    distanceMeters < REALTIME_MIN_DISTANCE_METERS
  ) {
    return {
      shouldSend: false,
      reason: 'no_meaningful_change' as const,
      elapsedMs,
      distanceMeters,
    }
  }

  return {
    shouldSend: true,
    elapsedMs,
    distanceMeters,
  }
}
