import { ConvexError } from 'convex/values'
import type { DatabaseWriter } from '../_generated/server'
import { requireAuthenticatedSession } from './auth'
import { evaluateServerLocationPlausibility } from './location'
import { getRouteSegments } from './routes'
import { getOpenServiceForDriver } from './services'

const MAX_FUTURE_LOCATION_DRIFT_MS = 5 * 60_000

function normalizeRecordedAt(capturedAt?: string) {
  if (!capturedAt) {
    return new Date().toISOString()
  }

  const parsedCapturedAt = Date.parse(capturedAt)

  if (
    Number.isNaN(parsedCapturedAt) ||
    parsedCapturedAt > Date.now() + MAX_FUTURE_LOCATION_DRIFT_MS
  ) {
    return new Date().toISOString()
  }

  return new Date(parsedCapturedAt).toISOString()
}

function shouldRefreshServiceSnapshot(
  currentRecordedAt: string | undefined,
  nextRecordedAt: string,
) {
  if (!currentRecordedAt) {
    return true
  }

  const currentRecordedAtMs = Date.parse(currentRecordedAt)
  const nextRecordedAtMs = Date.parse(nextRecordedAt)

  if (Number.isNaN(currentRecordedAtMs) || Number.isNaN(nextRecordedAtMs)) {
    return true
  }

  return nextRecordedAtMs >= currentRecordedAtMs
}

export async function recordDriverLocationUpdate(
  db: DatabaseWriter,
  {
    sessionToken,
    lat,
    lng,
    accuracyMeters,
    capturedAt,
  }: {
    sessionToken: string
    lat: number
    lng: number
    accuracyMeters?: number
    capturedAt?: string
  },
) {
  const { user: driver } = await requireAuthenticatedSession(
    db,
    sessionToken,
    'driver',
  )
  const currentService = await getOpenServiceForDriver(db, driver._id)

  if (!currentService || currentService.status !== 'active') {
    throw new ConvexError(
      'Activa o reanuda un servicio antes de enviar ubicación.',
    )
  }

  const route = await db.get(currentService.routeId)

  if (!route) {
    throw new ConvexError('La ruta activa no existe.')
  }

  const plausibility = evaluateServerLocationPlausibility({
    accuracyMeters: accuracyMeters ?? null,
    nextPosition: { lat, lng },
    routeSegments: getRouteSegments(route),
  })

  if (!plausibility.accepted) {
    if (plausibility.reason === 'low_accuracy') {
      throw new ConvexError(
        'La precisión del GPS es demasiado baja para compartir esta ubicación.',
      )
    }

    throw new ConvexError(
      'La ubicación recibida cae demasiado lejos de la ruta activa.',
    )
  }

  const recordedAt = normalizeRecordedAt(capturedAt)
  const locationUpdateId = await db.insert('locationUpdates', {
    activeServiceId: currentService._id,
    vehicleId: currentService.vehicleId,
    routeId: route._id,
    position: { lat, lng },
    recordedAt,
    source: 'device',
  })

  if (
    shouldRefreshServiceSnapshot(
      currentService.lastLocationUpdateAt,
      recordedAt,
    )
  ) {
    await db.patch(currentService._id, {
      lastLocationUpdateAt: recordedAt,
      lastPosition: { lat, lng },
      lastLocationSource: 'device',
    })
  }

  return {
    locationUpdateId,
    recordedAt,
  }
}
