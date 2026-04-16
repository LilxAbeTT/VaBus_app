import { ConvexError } from 'convex/values'
import type { BusRoute } from '../../../types/domain'

const AUTO_SHARE_STORAGE_PREFIX = 'cabobus.driver.autoShare.'

export function getErrorMessage(error: unknown) {
  if (error instanceof ConvexError) {
    return String(error.data)
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Ocurrió un error inesperado.'
}

export function formatDateTime(value?: string) {
  if (!value) {
    return 'Sin registro'
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function getTrackingRejectionMessage(
  reason:
    | 'low_accuracy'
    | 'outside_route_zone'
    | 'too_soon'
    | 'no_meaningful_change',
) {
  switch (reason) {
    case 'low_accuracy':
      return 'La precisión del GPS es baja. Busca mejor señal antes de compartir.'
    case 'outside_route_zone':
      return 'La ubicación detectada cae demasiado lejos de la ruta activa.'
    case 'too_soon':
      return 'Aún no hace falta enviar una nueva ubicación.'
    case 'no_meaningful_change':
      return 'No hubo movimiento suficiente para actualizar la ubicación.'
    default:
      return 'No fue posible validar la ubicación.'
  }
}

export function getTransportTypeLabel(transportType: BusRoute['transportType']) {
  return transportType === 'urbano' ? 'Urbano' : 'Colectivo'
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

export function getRouteScheduleLabel(direction: string) {
  const routeDetails = parseRouteDirection(direction)

  if (routeDetails.startTime && routeDetails.endTime) {
    return `${routeDetails.startTime} - ${routeDetails.endTime}`
  }

  if (routeDetails.startTime) {
    return `Entrada ${routeDetails.startTime}`
  }

  if (routeDetails.endTime) {
    return `Salida ${routeDetails.endTime}`
  }

  return 'Horario pendiente de captura'
}

export function hasRouteSchedule(direction: string) {
  const routeDetails = parseRouteDirection(direction)

  return Boolean(routeDetails.startTime || routeDetails.endTime)
}

export function formatElapsedSignalMinutes(
  recordedAt?: string | null,
  nowMs = Date.now(),
) {
  if (!recordedAt) {
    return 'Sin señal aún'
  }

  const parsedTime = Date.parse(recordedAt)

  if (Number.isNaN(parsedTime)) {
    return 'Sin señal aún'
  }

  const elapsedMinutes = Math.max(0, Math.floor((nowMs - parsedTime) / 60_000))
  return `Hace ${elapsedMinutes} min`
}

function getSharePreferenceKey(driverId: string) {
  return `${AUTO_SHARE_STORAGE_PREFIX}${driverId}`
}

export function readStoredAutoSharePreference(driverId: string) {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(getSharePreferenceKey(driverId)) === 'true'
}

export function writeStoredAutoSharePreference(driverId: string, enabled: boolean) {
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
