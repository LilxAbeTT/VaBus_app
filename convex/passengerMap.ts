import { ConvexError, v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { mutation, query, type DatabaseReader } from './_generated/server'
import { recordSystemEvent } from './lib/systemEvents'
import { toRouteSummary } from './lib/routes'
import { getOperationalStatusForService } from './lib/serviceOperationalState'
import {
  STOP_SUGGESTION_CLUSTER_RADIUS_METERS,
  getDistanceBetweenCoordinatesMeters,
} from './lib/stops'

function isDefined<T>(value: T | null): value is T {
  return value !== null
}

async function getActiveRouteDocuments(db: DatabaseReader) {
  return await db
    .query('routes')
    .withIndex('by_status', (q) => q.eq('status', 'active'))
    .collect()
}

async function getActiveVehicleDocuments(db: DatabaseReader) {
  return await db
    .query('activeServices')
    .withIndex('by_status', (q) => q.eq('status', 'active'))
    .collect()
}

export const getRoutes = query({
  args: {},
  handler: async ({ db }) => {
    const routes = await getActiveRouteDocuments(db)

    return routes.map((route) => toRouteSummary(route))
  },
})

export const getActiveVehicles = query({
  args: {
    nowMs: v.optional(v.number()),
  },
  handler: async ({ db }, { nowMs }) => {
    const activeServices = await getActiveVehicleDocuments(db)
    const effectiveNowMs = nowMs ?? Date.now()

    const fallbackRouteIds = new Set<Id<'routes'>>()
    const fallbackVehicleIds = new Set<Id<'vehicles'>>()
    const fallbackDriverIds = new Set<Id<'users'>>()

    activeServices.forEach((service) => {
      if (!service.routeName) {
        fallbackRouteIds.add(service.routeId)
      }

      if (!service.vehicleUnitNumber || !service.vehicleLabel) {
        fallbackVehicleIds.add(service.vehicleId)
      }

      if (!service.driverName) {
        fallbackDriverIds.add(service.driverId)
      }
    })

    const [fallbackRoutes, fallbackVehicles, fallbackDrivers] = await Promise.all([
      Promise.all([...fallbackRouteIds].map((routeId) => db.get(routeId))),
      Promise.all([...fallbackVehicleIds].map((vehicleId) => db.get(vehicleId))),
      Promise.all([...fallbackDriverIds].map((driverId) => db.get(driverId))),
    ])

    const routeById = new Map(
      fallbackRoutes.filter(isDefined).map((route) => [route._id, route] as const),
    )
    const vehicleById = new Map(
      fallbackVehicles
        .filter(isDefined)
        .map((vehicle) => [vehicle._id, vehicle] as const),
    )
    const driverById = new Map(
      fallbackDrivers.filter(isDefined).map((driver) => [driver._id, driver] as const),
    )

    return activeServices
      .map((service) => {
        const route = routeById.get(service.routeId)
        const vehicle = vehicleById.get(service.vehicleId)
        const driver = driverById.get(service.driverId)

        if (
          !service.lastPosition ||
          service.lastLocationSource !== 'device' ||
          !service.lastLocationUpdateAt
        ) {
          return null
        }

        return {
          id: service.vehicleId,
          unitNumber: service.vehicleUnitNumber ?? vehicle?.unitNumber ?? 'Unidad',
          label: service.vehicleLabel ?? vehicle?.label ?? 'Unidad activa',
          routeId: service.routeId,
          routeName: service.routeName ?? route?.name ?? 'Ruta activa',
          driverName: service.driverName ?? driver?.name ?? 'Conductor',
          status: service.status,
          position: service.lastPosition,
          lastUpdate: service.lastLocationUpdateAt,
          lastUpdateSource: service.lastLocationSource,
          operationalStatus: getOperationalStatusForService({
            activeService: service,
            nowMs: effectiveNowMs,
          }),
        }
      })
      .filter(isDefined)
  },
})

export const getStops = query({
  args: {},
  handler: async ({ db }) => {
    const [officialStops, routes] = await Promise.all([
      db
        .query('stops')
        .withIndex('by_status', (q) => q.eq('status', 'official'))
        .collect(),
      getActiveRouteDocuments(db),
    ])

    const activeRouteIds = new Set(routes.map((route) => route._id))

    return officialStops
      .filter((stop) => stop.routeIds.some((routeId) => activeRouteIds.has(routeId)))
      .map((stop) => ({
        id: stop._id,
        name: stop.name,
        position: stop.position,
        status: stop.status,
        routeIds: stop.routeIds,
        source: stop.source,
        note: stop.note,
        reportCount: stop.reportCount,
        createdAt: stop.createdAt,
        validatedAt: stop.validatedAt,
        lastReportedAt: stop.lastReportedAt,
      }))
  },
})

export const submitRouteReport = mutation({
  args: {
    routeId: v.id('routes'),
    issueType: v.union(
      v.literal('bus_never_arrived'),
      v.literal('too_delayed'),
      v.literal('map_not_matching'),
      v.literal('unit_problem'),
      v.literal('other'),
    ),
    details: v.optional(v.string()),
  },
  handler: async ({ db }, { routeId, issueType, details }) => {
    const route = await db.get(routeId)

    if (!route) {
      throw new ConvexError('La ruta seleccionada ya no está disponible.')
    }

    const trimmedDetails = details?.trim()
    const issueTypeLabel = {
      bus_never_arrived: 'La unidad no pasó',
      too_delayed: 'Va muy retrasada',
      map_not_matching: 'El mapa no coincide',
      unit_problem: 'Problema con la unidad',
      other: 'Otro problema',
    }[issueType]

    await recordSystemEvent(db, {
      category: 'route',
      title: `Reporte de pasajero: ${issueTypeLabel}`,
      description: trimmedDetails
        ? `Un pasajero reportó "${issueTypeLabel}" en ${route.name}. Detalle: ${trimmedDetails}`
        : `Un pasajero reportó "${issueTypeLabel}" en ${route.name}.`,
      actorName: 'Pasajero',
      targetType: 'route',
      targetId: route._id,
    })

    return {
      reportedAt: new Date().toISOString(),
      routeId: route._id,
      issueType,
    }
  },
})

export const submitStopSuggestion = mutation({
  args: {
    routeId: v.optional(v.id('routes')),
    position: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    reportedAsOfficial: v.union(
      v.literal('yes'),
      v.literal('no'),
      v.literal('unknown'),
    ),
    note: v.optional(v.string()),
    reporterKey: v.string(),
    source: v.union(v.literal('map_center'), v.literal('current_location')),
  },
  handler: async (
    { db },
    { routeId, position, reportedAsOfficial, note, reporterKey, source },
  ) => {
    const trimmedReporterKey = reporterKey.trim()

    if (!trimmedReporterKey) {
      throw new ConvexError('No fue posible identificar este dispositivo para el reporte.')
    }

    const route = routeId ? await db.get(routeId) : null

    if (routeId && (!route || route.status !== 'active')) {
      throw new ConvexError('La ruta seleccionada ya no esta disponible para reportar paradas.')
    }

    const trimmedNote = note?.trim()
    const createdAt = new Date().toISOString()
    const recentSuggestions = await db
      .query('stopSuggestions')
      .withIndex('by_reporter_created_at', (q) => q.eq('reporterKey', trimmedReporterKey))
      .order('desc')
      .take(20)

    const duplicatedSuggestion = recentSuggestions.find((suggestion) => {
      if (suggestion.status !== 'pending') {
        return false
      }

      const sameRoute = (suggestion.routeId ?? null) === (routeId ?? null)
      const isClose =
        getDistanceBetweenCoordinatesMeters(suggestion.position, position) <=
        STOP_SUGGESTION_CLUSTER_RADIUS_METERS
      const createdAtDeltaMs =
        Math.abs(Date.parse(createdAt) - Date.parse(suggestion.createdAt))

      return sameRoute && isClose && createdAtDeltaMs <= 30 * 60_000
    })

    if (duplicatedSuggestion) {
      throw new ConvexError(
        'Ya registraste recientemente una parada muy cercana para esta ruta. Gracias por ayudar.',
      )
    }

    const suggestionId = await db.insert('stopSuggestions', {
      position,
      routeId: routeId ?? undefined,
      reportedAsOfficial,
      note: trimmedNote,
      reporterKey: trimmedReporterKey,
      source,
      createdAt,
      status: 'pending',
    })

    await recordSystemEvent(db, {
      category: 'stop',
      title: 'Nueva parada sugerida',
      description: route
        ? `Se recibio una sugerencia de parada para ${route.name}.`
        : 'Se recibio una sugerencia de parada sin ruta seleccionada.',
      actorName: 'Pasajero',
      targetType: 'stop',
      targetId: suggestionId,
    })

    return {
      suggestionId,
      reportedAt: createdAt,
    }
  },
})
