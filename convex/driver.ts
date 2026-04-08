import { ConvexError, v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { mutation, query, type DatabaseReader } from './_generated/server'
import { requireAuthenticatedSession, toUserSummary } from './lib/auth'
import { getRouteSegments, toRouteSummary } from './lib/routes'
import { getLastSignalAt } from './lib/serviceOperationalState'
import {
  getLatestLocationForService,
  getOpenServiceForDriver,
  getOpenServiceForVehicle,
} from './lib/services'

async function getAssignedVehicle(
  db: DatabaseReader,
  driver: {
    _id: Id<'users'>
    defaultVehicleId?: Id<'vehicles'>
  },
  currentServiceVehicleId?: Id<'vehicles'>,
) {
  const preferredVehicleId = currentServiceVehicleId ?? driver.defaultVehicleId

  if (!preferredVehicleId) {
    return null
  }

  return await db.get(preferredVehicleId)
}

export const getPanelState = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async ({ db }, { sessionToken }) => {
    const { user: driver } = await requireAuthenticatedSession(
      db,
      sessionToken,
      'driver',
    )

    const [routes, currentService] = await Promise.all([
      db
        .query('routes')
        .withIndex('by_status', (q) => q.eq('status', 'active'))
        .collect(),
      getOpenServiceForDriver(db, driver._id),
    ])

    const vehicle = await getAssignedVehicle(
      db,
      driver,
      currentService?.vehicleId,
    )

    let currentServiceState = null

    if (currentService) {
      const [route, latestLocation] = await Promise.all([
        db.get(currentService.routeId),
        getLatestLocationForService(db, currentService._id),
      ])

      if (route) {
        currentServiceState = {
          id: currentService._id,
          routeId: route._id,
          routeName: route.name,
          status: currentService.status,
          startedAt: currentService.startedAt,
          lastLocationUpdateAt:
            getLastSignalAt(currentService, latestLocation) ?? undefined,
          lastPosition: latestLocation?.position,
          lastLocationSource: latestLocation?.source,
        }
      }
    }

    return {
      driver: toUserSummary(driver),
      vehicle: vehicle
        ? {
            id: vehicle._id,
            unitNumber: vehicle.unitNumber,
            label: vehicle.label,
            status: vehicle.status,
            defaultRouteId: vehicle.defaultRouteId,
          }
        : null,
      availableRoutes: routes.map((route) => toRouteSummary(route)),
      preferredRouteId:
        currentServiceState?.routeId ??
        driver.defaultRouteId ??
        vehicle?.defaultRouteId,
      currentService: currentServiceState,
    }
  },
})

export const activateService = mutation({
  args: {
    sessionToken: v.string(),
    routeId: v.id('routes'),
  },
  handler: async ({ db }, { sessionToken, routeId }) => {
    const { user: driver } = await requireAuthenticatedSession(
      db,
      sessionToken,
      'driver',
    )

    if (!driver.defaultVehicleId) {
      throw new ConvexError(
        'Tu cuenta no tiene una unidad asignada. Contacta a administracion.',
      )
    }

    const [route, vehicle, currentDriverService, currentVehicleService] =
      await Promise.all([
        db.get(routeId),
        db.get(driver.defaultVehicleId),
        getOpenServiceForDriver(db, driver._id),
        getOpenServiceForVehicle(db, driver.defaultVehicleId),
      ])

    if (!route || route.status !== 'active') {
      throw new ConvexError('La ruta seleccionada no esta disponible.')
    }

    if (!vehicle || vehicle.status === 'maintenance') {
      throw new ConvexError('Tu unidad asignada no esta disponible.')
    }

    if (currentDriverService) {
      throw new ConvexError('Ya tienes un servicio abierto.')
    }

    if (currentVehicleService && currentVehicleService.driverId !== driver._id) {
      throw new ConvexError('Tu unidad asignada ya tiene un servicio abierto.')
    }

    const startedAt = new Date().toISOString()
    const serviceId = await db.insert('activeServices', {
      vehicleId: vehicle._id,
      routeId: route._id,
      driverId: driver._id,
      status: 'active',
      startedAt,
      lastLocationUpdateAt: startedAt,
    })

    const initialPosition = getRouteSegments(route)[0]?.[0] ?? {
      lat: 23.058,
      lng: -109.701,
    }

    await db.insert('locationUpdates', {
      activeServiceId: serviceId,
      vehicleId: vehicle._id,
      routeId: route._id,
      position: initialPosition,
      recordedAt: startedAt,
      source: 'seed',
    })

    await db.patch(vehicle._id, {
      status: 'in_service',
      defaultRouteId: route._id,
    })

    await db.patch(driver._id, {
      defaultRouteId: route._id,
    })

    return {
      serviceId,
      routeId: route._id,
      startedAt,
    }
  },
})

export const pauseCurrentService = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async ({ db }, { sessionToken }) => {
    const { user: driver } = await requireAuthenticatedSession(
      db,
      sessionToken,
      'driver',
    )
    const currentService = await getOpenServiceForDriver(db, driver._id)

    if (!currentService || currentService.status !== 'active') {
      throw new ConvexError('No hay un servicio activo para pausar.')
    }

    await db.patch(currentService._id, {
      status: 'paused',
    })

    return {
      serviceId: currentService._id,
      status: 'paused',
    }
  },
})

export const resumeCurrentService = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async ({ db }, { sessionToken }) => {
    const { user: driver } = await requireAuthenticatedSession(
      db,
      sessionToken,
      'driver',
    )
    const currentService = await getOpenServiceForDriver(db, driver._id)

    if (!currentService || currentService.status !== 'paused') {
      throw new ConvexError('No hay un servicio pausado para reanudar.')
    }

    await db.patch(currentService._id, {
      status: 'active',
    })

    return {
      serviceId: currentService._id,
      status: 'active',
    }
  },
})

export const finishCurrentService = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async ({ db }, { sessionToken }) => {
    const { user: driver } = await requireAuthenticatedSession(
      db,
      sessionToken,
      'driver',
    )
    const currentService = await getOpenServiceForDriver(db, driver._id)

    if (!currentService) {
      throw new ConvexError('No hay un servicio abierto para este conductor.')
    }

    const endedAt = new Date().toISOString()

    await db.patch(currentService._id, {
      status: 'completed',
      endedAt,
    })

    await db.patch(currentService.vehicleId, {
      status: 'available',
    })

    return {
      serviceId: currentService._id,
      endedAt,
    }
  },
})

export const addLocationUpdate = mutation({
  args: {
    sessionToken: v.string(),
    lat: v.number(),
    lng: v.number(),
  },
  handler: async ({ db }, { sessionToken, lat, lng }) => {
    const { user: driver } = await requireAuthenticatedSession(
      db,
      sessionToken,
      'driver',
    )
    const currentService = await getOpenServiceForDriver(db, driver._id)

    if (!currentService || currentService.status !== 'active') {
      throw new ConvexError(
        'Activa o reanuda un servicio antes de enviar ubicacion.',
      )
    }

    const route = await db.get(currentService.routeId)

    if (!route) {
      throw new ConvexError('La ruta activa no existe.')
    }

    const recordedAt = new Date().toISOString()
    const locationUpdateId = await db.insert('locationUpdates', {
      activeServiceId: currentService._id,
      vehicleId: currentService.vehicleId,
      routeId: route._id,
      position: { lat, lng },
      recordedAt,
      source: 'device',
    })

    await db.patch(currentService._id, {
      lastLocationUpdateAt: recordedAt,
    })

    return {
      locationUpdateId,
      recordedAt,
    }
  },
})

export const changeAssignedRoute = mutation({
  args: {
    sessionToken: v.string(),
    routeId: v.id('routes'),
  },
  handler: async ({ db }, { sessionToken, routeId }) => {
    const { user: driver } = await requireAuthenticatedSession(
      db,
      sessionToken,
      'driver',
    )

    const [route, currentService] = await Promise.all([
      db.get(routeId),
      getOpenServiceForDriver(db, driver._id),
    ])

    if (!route || route.status !== 'active') {
      throw new ConvexError('La ruta seleccionada no esta disponible.')
    }

    if (driver.defaultRouteId === route._id && currentService?.routeId === route._id) {
      return {
        routeId: route._id,
        routeName: route.name,
        changedAt: new Date().toISOString(),
      }
    }

    const changedAt = new Date().toISOString()

    await db.patch(driver._id, {
      defaultRouteId: route._id,
    })

    if (driver.defaultVehicleId) {
      await db.patch(driver.defaultVehicleId, {
        defaultRouteId: route._id,
      })
    }

    if (currentService) {
      await db.patch(currentService._id, {
        routeId: route._id,
        lastLocationUpdateAt: changedAt,
      })

      const nextReferencePosition = getRouteSegments(route)[0]?.[0] ?? {
        lat: 23.058,
        lng: -109.701,
      }

      await db.insert('locationUpdates', {
        activeServiceId: currentService._id,
        vehicleId: currentService.vehicleId,
        routeId: route._id,
        position: nextReferencePosition,
        recordedAt: changedAt,
        source: 'seed',
      })
    }

    return {
      routeId: route._id,
      routeName: route.name,
      changedAt,
    }
  },
})
