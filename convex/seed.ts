import type { Id } from './_generated/dataModel'
import { mutation } from './_generated/server'
import { importedRouteSeeds } from './data/importedRoutes.generated'
import { hashPassword, normalizeEmail } from './lib/auth'
import { getRouteImportKey, getRouteSegments } from './lib/routes'
import { extractRouteDetails } from '../shared/routeDetails'

const seedTimestamp = '2026-04-05T16:20:00-07:00'

const driverSeeds = [
  {
    emails: ['conductor.centro@cabobus.app'],
    email: 'conductor.centro@cabobus.app',
    name: 'Operador Centro',
    password: 'Conductor123',
    defaultRouteImportKey: 'urbano:urbano-1',
    defaultVehicleUnitNumber: 'Unidad 17',
  },
  {
    emails: ['conductor.guaymitas@cabobus.app'],
    email: 'conductor.guaymitas@cabobus.app',
    name: 'Conductora Guaymitas',
    password: 'Conductor123',
    defaultRouteImportKey: 'colectivo:colectivo-1',
    defaultVehicleUnitNumber: 'Unidad 24',
  },
]

const adminSeeds = [
  {
    emails: ['admin@cabobus.app'],
    email: 'admin@cabobus.app',
      name: 'Administración CaboBus',
    password: 'Admin12345',
  },
]

const vehicleSeeds = [
  {
    unitNumber: 'Unidad 17',
    label: 'Mercedes Sprinter 17',
    defaultRouteImportKey: 'urbano:urbano-1',
  },
  {
    unitNumber: 'Unidad 24',
    label: 'Toyota Hiace 24',
    defaultRouteImportKey: 'colectivo:colectivo-1',
  },
]

export const seedDatabase = mutation({
  args: {},
  handler: async ({ db }) => {
    const routeIdsByImportKey: Record<string, Id<'routes'>> = {}

    for (const routeSeed of importedRouteSeeds) {
      const existingRoute = await db
        .query('routes')
        .withIndex('by_import_key', (q) => q.eq('importKey', routeSeed.importKey))
        .first()

      if (existingRoute) {
        await db.patch(existingRoute._id, {
          importKey: routeSeed.importKey,
          slug: routeSeed.slug,
          name: routeSeed.name,
          direction: routeSeed.direction,
          transportType: routeSeed.transportType,
          sourceFile: routeSeed.sourceFile,
          status: 'active',
          color: routeSeed.color,
          passengerInfo: routeSeed.passengerInfo,
          segments: routeSeed.segments,
        })
        routeIdsByImportKey[routeSeed.importKey] = existingRoute._id
        continue
      }

      const routeId = await db.insert('routes', {
        importKey: routeSeed.importKey,
        slug: routeSeed.slug,
        name: routeSeed.name,
        direction: routeSeed.direction,
        transportType: routeSeed.transportType,
        sourceFile: routeSeed.sourceFile,
        status: 'active',
        color: routeSeed.color,
        passengerInfo: routeSeed.passengerInfo,
        segments: routeSeed.segments,
        createdAt: seedTimestamp,
      })
      routeIdsByImportKey[routeSeed.importKey] = routeId
    }

    const importedRouteKeys = new Set(importedRouteSeeds.map((route) => route.importKey))
    const existingRoutes = await db.query('routes').collect()
    let normalizedLegacyRoutes = 0

    for (const route of existingRoutes) {
      if (importedRouteKeys.has(getRouteImportKey(route))) {
        continue
      }

      await db.patch(route._id, {
        importKey: getRouteImportKey(route),
        transportType:
          route.transportType ??
          (route.slug.startsWith('colectivo') ? 'colectivo' : 'urbano'),
        sourceFile: route.sourceFile ?? 'legacy-seed',
        status: 'draft',
        passengerInfo: route.passengerInfo ?? extractRouteDetails(route.direction),
        segments: getRouteSegments(route),
      })
      normalizedLegacyRoutes += 1
    }

    const driverIds: Record<string, Id<'users'>> = {}
    const adminIds: Record<string, Id<'users'>> = {}

    for (const driverSeed of driverSeeds) {
      let existingDriver = null
      const normalizedEmail = normalizeEmail(driverSeed.email)
      const passwordHash = await hashPassword(driverSeed.password)

      for (const email of driverSeed.emails) {
        existingDriver = await db
          .query('users')
          .withIndex('by_email', (q) => q.eq('email', normalizeEmail(email)))
          .first()

        if (existingDriver) {
          break
        }
      }

      const driverId =
        existingDriver?._id ??
        (await db.insert('users', {
          name: driverSeed.name,
          email: normalizedEmail,
          passwordHash,
          role: 'driver',
          status: 'active',
          createdAt: seedTimestamp,
        }))

      if (existingDriver) {
        await db.patch(driverId, {
          name: driverSeed.name,
          email: normalizedEmail,
          passwordHash,
          role: 'driver',
          status: 'active',
        })
      }

      driverIds[normalizedEmail] = driverId
    }

    for (const adminSeed of adminSeeds) {
      let existingAdmin = null
      const normalizedEmail = normalizeEmail(adminSeed.email)
      const passwordHash = await hashPassword(adminSeed.password)

      for (const email of adminSeed.emails) {
        existingAdmin = await db
          .query('users')
          .withIndex('by_email', (q) => q.eq('email', normalizeEmail(email)))
          .first()

        if (existingAdmin) {
          break
        }
      }

      const adminId =
        existingAdmin?._id ??
        (await db.insert('users', {
          name: adminSeed.name,
          email: normalizedEmail,
          passwordHash,
          role: 'admin',
          status: 'active',
          createdAt: seedTimestamp,
        }))

      if (existingAdmin) {
        await db.patch(adminId, {
          name: adminSeed.name,
          email: normalizedEmail,
          passwordHash,
          role: 'admin',
          status: 'active',
        })
      }

      adminIds[normalizedEmail] = adminId
    }

    const vehicleIds: Record<string, Id<'vehicles'>> = {}

    for (const vehicleSeed of vehicleSeeds) {
      const existingVehicle = await db
        .query('vehicles')
          .withIndex('by_unit_number', (q) => q.eq('unitNumber', vehicleSeed.unitNumber))
        .first()

      const defaultRouteId = routeIdsByImportKey[vehicleSeed.defaultRouteImportKey]
      const vehicleId =
        existingVehicle?._id ??
        (await db.insert('vehicles', {
          unitNumber: vehicleSeed.unitNumber,
          label: vehicleSeed.label,
          status: 'available',
          defaultRouteId,
          createdAt: seedTimestamp,
        }))

      if (existingVehicle) {
        await db.patch(vehicleId, {
          label: vehicleSeed.label,
          status: 'available',
          defaultRouteId,
        })
      }

      vehicleIds[vehicleSeed.unitNumber] = vehicleId
    }

    for (const driverSeed of driverSeeds) {
      const driverId = driverIds[normalizeEmail(driverSeed.email)]
      const defaultRouteId = routeIdsByImportKey[driverSeed.defaultRouteImportKey]
      const defaultVehicleId = vehicleIds[driverSeed.defaultVehicleUnitNumber]

      if (!driverId) {
        continue
      }

      await db.patch(driverId, {
        defaultRouteId,
        defaultVehicleId,
      })
    }

    const [existingActiveServices, existingPausedServices] = await Promise.all([
      db
        .query('activeServices')
        .withIndex('by_status', (q) => q.eq('status', 'active'))
        .collect(),
      db
        .query('activeServices')
        .withIndex('by_status', (q) => q.eq('status', 'paused'))
        .collect(),
    ])
    const existingOpenServices = [...existingActiveServices, ...existingPausedServices]

    let normalizedServices = 0
    const seededDriverIds = new Set(Object.values(driverIds))
    const seededVehicleIds = new Set(Object.values(vehicleIds))

    for (const service of existingOpenServices) {
      if (
        seededDriverIds.has(service.driverId) ||
        seededVehicleIds.has(service.vehicleId)
      ) {
        await db.patch(service._id, {
          status: 'completed',
          endedAt: seedTimestamp,
        })
        normalizedServices += 1
      }
    }

    return {
      seeded: true,
      adminIds,
      driverIds,
      routeIds: routeIdsByImportKey,
      vehicleIds,
      normalizedServices,
      normalizedLegacyRoutes,
    }
  },
})
