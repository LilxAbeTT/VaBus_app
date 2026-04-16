import { ConvexError, v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { mutation, query, type DatabaseWriter } from './_generated/server'
import {
  getActiveServiceDriverFields,
  getActiveServiceVehicleFields,
} from './lib/activeServiceSnapshot'
import {
  hashPassword,
  normalizeEmail,
  requireAuthenticatedSession,
} from './lib/auth'
import { toRouteListItem, toRouteSummary } from './lib/routes'
import {
  getLastSignalAt,
  getOperationalStatusForService,
} from './lib/serviceOperationalState'
import {
  getOpenServiceForDriver,
  getOpenServiceForVehicle,
  getOpenServices,
} from './lib/services'
import { recordSystemEvent } from './lib/systemEvents'

function assertNonEmptyValue(value: string, fieldLabel: string) {
  if (!value.trim()) {
    throw new ConvexError(`${fieldLabel} es obligatorio.`)
  }
}

async function requireActiveRoute(
  db: DatabaseWriter,
  routeId: Id<'routes'>,
  errorMessage: string,
) {
  const route = await db.get(routeId)

  if (!route || route.status !== 'active') {
    throw new ConvexError(errorMessage)
  }

  return route
}

async function ensureUniqueDriverEmail(
  db: DatabaseWriter,
  email: string,
  excludedUserId?: Id<'users'>,
) {
  const existingUser = await db
    .query('users')
    .withIndex('by_email', (q) => q.eq('email', email))
    .first()

  if (existingUser && existingUser._id !== excludedUserId) {
    throw new ConvexError('Ya existe un conductor con ese correo.')
  }
}

async function ensureUniqueVehicleUnitNumber(
  db: DatabaseWriter,
  unitNumber: string,
  excludedVehicleId?: Id<'vehicles'>,
) {
  const existingVehicle = await db
    .query('vehicles')
    .withIndex('by_unit_number', (q) => q.eq('unitNumber', unitNumber))
    .first()

  if (existingVehicle && existingVehicle._id !== excludedVehicleId) {
    throw new ConvexError('Ya existe una unidad con ese número.')
  }
}

async function requireAssignableVehicle(
  db: DatabaseWriter,
  vehicleId: Id<'vehicles'>,
  errorMessage: string,
  excludedDriverId?: Id<'users'>,
) {
  const [vehicle, drivers, openService] = await Promise.all([
    db.get(vehicleId),
    db
      .query('users')
      .withIndex('by_role', (q) => q.eq('role', 'driver'))
      .collect(),
    getOpenServiceForVehicle(db, vehicleId),
  ])

  if (!vehicle || vehicle.status === 'maintenance') {
    throw new ConvexError(errorMessage)
  }

  const conflictingDriver = drivers.find(
    (driver) =>
      driver._id !== excludedDriverId && driver.defaultVehicleId === vehicleId,
  )

  if (conflictingDriver) {
    throw new ConvexError(
      `La unidad ya está asignada a ${conflictingDriver.name}.`,
    )
  }

  if (openService && openService.driverId !== excludedDriverId) {
    throw new ConvexError(
      'La unidad ya tiene un servicio abierto con otro conductor.',
    )
  }

  return vehicle
}

async function requireOpenServiceById(
  db: DatabaseWriter,
  serviceId: Id<'activeServices'>,
) {
  const service = await db.get(serviceId)

  if (!service || service.status === 'completed') {
    throw new ConvexError('El servicio indicado ya no está abierto.')
  }

  return service
}

export const getOperationalOverview = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async ({ db }, { sessionToken }) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')

    const [routes, drivers, vehicles, openServices, recentEvents] = await Promise.all([
      db.query('routes').collect(),
      db
        .query('users')
        .withIndex('by_role', (q) => q.eq('role', 'driver'))
        .collect(),
      db.query('vehicles').order('asc').collect(),
      getOpenServices(db),
      db
        .query('systemEvents')
        .withIndex('by_created_at')
        .order('desc')
        .take(16),
    ])
    const activeRoutes = routes.filter((route) => route.status === 'active')
    const routeById = new Map(routes.map((route) => [route._id, route]))
    const driverById = new Map(drivers.map((driver) => [driver._id, driver]))
    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle._id, vehicle]))
    const operationalNowMs = Date.now()

    const services = openServices.map((service) => {
      const route = routeById.get(service.routeId)
      const driver = driverById.get(service.driverId)
      const vehicle = vehicleById.get(service.vehicleId)

      return {
        id: service._id,
        routeId: service.routeId,
        routeName: service.routeName ?? route?.name ?? 'Ruta sin catálogo activo',
        routeDirection: service.routeDirection ?? route?.direction ?? 'Sin dirección',
        transportType:
          service.routeTransportType ?? route?.transportType ?? 'urbano',
        vehicleId: service.vehicleId,
        unitNumber: service.vehicleUnitNumber ?? vehicle?.unitNumber ?? 'Unidad',
        vehicleLabel: service.vehicleLabel ?? vehicle?.label ?? 'Unidad activa',
        driverId: service.driverId,
        driverName: service.driverName ?? driver?.name ?? 'Conductor',
        status: service.status,
        startedAt: service.startedAt,
        lastSignalAt: getLastSignalAt(service) ?? undefined,
        lastSignalSource: service.lastLocationSource,
        lastPosition: service.lastPosition,
        operationalStatus: getOperationalStatusForService({
          activeService: service,
          nowMs: operationalNowMs,
        }),
      }
    })

    const routeSummaryMap = new Map(
      activeRoutes.map((route) => [
        route._id,
        {
          routeId: route._id,
          routeName: route.name,
          routeDirection: route.direction,
          transportType: route.transportType ?? 'urbano',
          totalServices: 0,
          activeRecent: 0,
          activeStale: 0,
          probablyStopped: 0,
          pausedServices: 0,
        },
      ]),
    )
    const totals = {
      activeRoutes: activeRoutes.length,
      openServices: services.length,
      activeServices: 0,
      pausedServices: 0,
      activeRecent: 0,
      activeStale: 0,
      probablyStopped: 0,
    }

    services.forEach((service) => {
      const currentSummary = routeSummaryMap.get(service.routeId)

      if (service.status === 'active') {
        totals.activeServices += 1
      } else {
        totals.pausedServices += 1
      }

      if (service.operationalStatus === 'active_recent') {
        totals.activeRecent += 1
      } else if (service.operationalStatus === 'active_stale') {
        totals.activeStale += 1
      } else {
        totals.probablyStopped += 1
      }

      if (!currentSummary) {
        return
      }

      currentSummary.totalServices += 1

      if (service.status === 'paused') {
        currentSummary.pausedServices += 1
      }

      if (service.operationalStatus === 'active_recent') {
        currentSummary.activeRecent += 1
      } else if (service.operationalStatus === 'active_stale') {
        currentSummary.activeStale += 1
      } else {
        currentSummary.probablyStopped += 1
      }
    })

    return {
      overview: {
        totals,
        routes: [...routeSummaryMap.values()]
          .filter((route) => route.totalServices > 0)
          .sort((left, right) => left.routeName.localeCompare(right.routeName, 'es')),
        services: services.sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt),
        ),
      },
      events: recentEvents.map((event) => ({
        id: event._id,
        category: event.category,
        title: event.title,
        description: event.description,
        actorName: event.actorName,
        actorRole: event.actorRole,
        targetType: event.targetType,
        targetId: event.targetId,
        createdAt: event.createdAt,
      })),
    }
  },
})

export const getManagementCatalog = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async ({ db }, { sessionToken }) => {
    const { user: admin } = await requireAuthenticatedSession(
      db,
      sessionToken,
      'admin',
    )

    const [routes, drivers, vehicles, openServices] = await Promise.all([
      db.query('routes').collect(),
      db
        .query('users')
        .withIndex('by_role', (q) => q.eq('role', 'driver'))
        .collect(),
      db.query('vehicles').order('asc').collect(),
      getOpenServices(db),
    ])
    const activeRoutes = routes.filter((route) => route.status === 'active')
    const serviceByDriverId = new Map(
      openServices.map((service) => [service.driverId, service]),
    )
    const serviceByVehicleId = new Map(
      openServices.map((service) => [service.vehicleId, service]),
    )
    const routeNameById = new Map(routes.map((route) => [route._id, route.name]))
    const vehicleLabelById = new Map(
      vehicles.map((vehicle) => [vehicle._id, `${vehicle.unitNumber} - ${vehicle.label}`]),
    )
    const routeServiceCount = new Map<Id<'routes'>, number>()
    const assignedDriverCountByRoute = new Map<Id<'routes'>, number>()
    const assignedVehicleCountByRoute = new Map<Id<'routes'>, number>()
    const assignedDriverNamesByVehicle = new Map<Id<'vehicles'>, string[]>()

    openServices.forEach((service) => {
      routeServiceCount.set(
        service.routeId,
        (routeServiceCount.get(service.routeId) ?? 0) + 1,
      )
    })
    drivers.forEach((driver) => {
      if (driver.defaultRouteId) {
        assignedDriverCountByRoute.set(
          driver.defaultRouteId,
          (assignedDriverCountByRoute.get(driver.defaultRouteId) ?? 0) + 1,
        )
      }

      if (driver.defaultVehicleId) {
        const assignedDrivers =
          assignedDriverNamesByVehicle.get(driver.defaultVehicleId) ?? []
        assignedDrivers.push(driver.name)
        assignedDriverNamesByVehicle.set(driver.defaultVehicleId, assignedDrivers)
      }
    })
    vehicles.forEach((vehicle) => {
      if (vehicle.defaultRouteId) {
        assignedVehicleCountByRoute.set(
          vehicle.defaultRouteId,
          (assignedVehicleCountByRoute.get(vehicle.defaultRouteId) ?? 0) + 1,
        )
      }
    })

    return {
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
      },
      routes: activeRoutes
        .map((route) => toRouteListItem(route))
        .sort((left, right) => left.name.localeCompare(right.name, 'es')),
      routeCatalog: routes
        .map((route) => ({
          ...toRouteListItem(route),
          activeServiceCount: routeServiceCount.get(route._id) ?? 0,
          assignedDriverCount: assignedDriverCountByRoute.get(route._id) ?? 0,
          assignedVehicleCount: assignedVehicleCountByRoute.get(route._id) ?? 0,
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'es')),
      drivers: drivers
        .sort((left, right) => left.name.localeCompare(right.name, 'es'))
        .map((driver) => {
          const openService = serviceByDriverId.get(driver._id)

          return {
            id: driver._id,
            name: driver.name,
            email: driver.email,
            status: driver.status,
            defaultRouteId: driver.defaultRouteId,
            defaultRouteName: driver.defaultRouteId
              ? routeNameById.get(driver.defaultRouteId)
              : undefined,
            defaultVehicleId: driver.defaultVehicleId,
            defaultVehicleLabel: driver.defaultVehicleId
              ? vehicleLabelById.get(driver.defaultVehicleId)
              : undefined,
            hasOpenService: openService !== undefined,
            currentRouteName: openService
              ? routeNameById.get(openService.routeId)
              : undefined,
            currentServiceStatus: openService?.status,
          }
        }),
      vehicles: vehicles
        .sort((left, right) => left.unitNumber.localeCompare(right.unitNumber, 'es'))
        .map((vehicle) => {
          const openService = serviceByVehicleId.get(vehicle._id)

          return {
            id: vehicle._id,
            unitNumber: vehicle.unitNumber,
            label: vehicle.label,
            status: vehicle.status,
            defaultRouteId: vehicle.defaultRouteId,
            defaultRouteName: vehicle.defaultRouteId
              ? routeNameById.get(vehicle.defaultRouteId)
              : undefined,
            assignedDriverNames: assignedDriverNamesByVehicle.get(vehicle._id) ?? [],
            hasOpenService: openService !== undefined,
            currentRouteName: openService
              ? routeNameById.get(openService.routeId)
              : undefined,
            currentServiceStatus: openService?.status,
          }
        }),
      alerts: [
        ...drivers
          .filter((driver) => !driver.defaultVehicleId)
          .map((driver) => ({
            id: `driver-without-vehicle:${driver._id}`,
            severity: 'warning' as const,
            title: 'Conductor sin unidad base',
            description: `${driver.name} no tiene unidad asignada.`,
          })),
        ...drivers
          .filter((driver) => !driver.defaultRouteId)
          .map((driver) => ({
            id: `driver-without-route:${driver._id}`,
            severity: 'warning' as const,
            title: 'Conductor sin ruta base',
            description: `${driver.name} no tiene ruta base configurada.`,
          })),
        ...routes
          .filter(
            (route) =>
              route.status === 'draft' &&
              ((assignedDriverCountByRoute.get(route._id) ?? 0) > 0 ||
                (assignedVehicleCountByRoute.get(route._id) ?? 0) > 0),
          )
          .map((route) => ({
            id: `draft-route-assigned:${route._id}`,
            severity: 'warning' as const,
            title: 'Ruta draft con asignaciones',
            description: `${route.name} sigue asignada como ruta base aunque no está activa.`,
          })),
        ...vehicles
          .filter(
            (vehicle) =>
              (assignedDriverNamesByVehicle.get(vehicle._id)?.length ?? 0) > 1,
          )
          .map((vehicle) => ({
            id: `vehicle-duplicated:${vehicle._id}`,
            severity: 'critical' as const,
            title: 'Unidad asignada a múltiples conductores',
            description: `${vehicle.unitNumber} está asignada a múltiples conductores base.`,
          })),
      ],
    }
  },
})

export const getDashboardState = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async ({ db }, { sessionToken }) => {
    const { user: admin } = await requireAuthenticatedSession(
      db,
      sessionToken,
      'admin',
    )
    const operationalNowMs = Date.now()

    const [routes, drivers, vehicles, openServices] = await Promise.all([
      db.query('routes').collect(),
      db
        .query('users')
        .withIndex('by_role', (q) => q.eq('role', 'driver'))
        .collect(),
      db.query('vehicles').order('asc').collect(),
      getOpenServices(db),
    ])
    const activeRoutes = routes.filter((route) => route.status === 'active')
    const recentEvents = await db
      .query('systemEvents')
      .withIndex('by_created_at')
      .order('desc')
      .take(16)
    const routeById = new Map(routes.map((route) => [route._id, route]))
    const driverById = new Map(drivers.map((driver) => [driver._id, driver]))
    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle._id, vehicle]))

    const services = (
      openServices.map((service) => {
        const route = routeById.get(service.routeId)
        const driver = driverById.get(service.driverId)
        const vehicle = vehicleById.get(service.vehicleId)

        return {
          id: service._id,
          routeId: service.routeId,
        routeName: service.routeName ?? route?.name ?? 'Ruta sin catálogo activo',
        routeDirection: service.routeDirection ?? route?.direction ?? 'Sin dirección',
          transportType:
            service.routeTransportType ?? route?.transportType ?? 'urbano',
          vehicleId: service.vehicleId,
          unitNumber: service.vehicleUnitNumber ?? vehicle?.unitNumber ?? 'Unidad',
          vehicleLabel: service.vehicleLabel ?? vehicle?.label ?? 'Unidad activa',
          driverId: service.driverId,
          driverName: service.driverName ?? driver?.name ?? 'Conductor',
          status: service.status,
          startedAt: service.startedAt,
          lastSignalAt: getLastSignalAt(service) ?? undefined,
          lastSignalSource: service.lastLocationSource,
          lastPosition: service.lastPosition,
          operationalStatus: getOperationalStatusForService({
            activeService: service,
            nowMs: operationalNowMs,
          }),
        }
      })
    ).filter((service) => service !== null)

    const routeSummaryMap = new Map<
      Id<'routes'>,
      {
        routeId: Id<'routes'>
        routeName: string
        routeDirection: string
        transportType: 'urbano' | 'colectivo'
        totalServices: number
        activeRecent: number
        activeStale: number
        probablyStopped: number
        pausedServices: number
      }
    >(
      activeRoutes.map((route) => [
        route._id,
        {
          routeId: route._id,
          routeName: route.name,
          routeDirection: route.direction,
          transportType: route.transportType ?? 'urbano',
          totalServices: 0,
          activeRecent: 0,
          activeStale: 0,
          probablyStopped: 0,
          pausedServices: 0,
        },
      ]),
    )

    services.forEach((service) => {
      const currentSummary = routeSummaryMap.get(service.routeId)

      if (!currentSummary) {
        return
      }

      currentSummary.totalServices += 1

      if (service.status === 'paused') {
        currentSummary.pausedServices += 1
      }

      if (service.operationalStatus === 'active_recent') {
        currentSummary.activeRecent += 1
      } else if (service.operationalStatus === 'active_stale') {
        currentSummary.activeStale += 1
      } else {
        currentSummary.probablyStopped += 1
      }
    })

    const routeSummaries = [...routeSummaryMap.values()]
      .filter((route) => route.totalServices > 0)
      .sort((left, right) => left.routeName.localeCompare(right.routeName, 'es'))

    const serviceByDriverId = new Map(
      openServices.map((service) => [service.driverId, service]),
    )
    const serviceByVehicleId = new Map(
      openServices.map((service) => [service.vehicleId, service]),
    )
    const routeNameById = new Map(routes.map((route) => [route._id, route.name]))
    const vehicleLabelById = new Map(
      vehicles.map((vehicle) => [vehicle._id, `${vehicle.unitNumber} - ${vehicle.label}`]),
    )

    return {
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
      },
      overview: {
        totals: {
          activeRoutes: activeRoutes.length,
          openServices: services.length,
          activeServices: services.filter((service) => service.status === 'active')
            .length,
          pausedServices: services.filter((service) => service.status === 'paused')
            .length,
          activeRecent: services.filter(
            (service) => service.operationalStatus === 'active_recent',
          ).length,
          activeStale: services.filter(
            (service) => service.operationalStatus === 'active_stale',
          ).length,
          probablyStopped: services.filter(
            (service) => service.operationalStatus === 'probably_stopped',
          ).length,
        },
        routes: routeSummaries,
        services: services.sort((left, right) =>
          right.startedAt.localeCompare(left.startedAt),
        ),
      },
      routes: activeRoutes
        .map((route) => toRouteSummary(route))
        .sort((left, right) => left.name.localeCompare(right.name, 'es')),
      routeCatalog: routes
        .map((route) => ({
          ...toRouteSummary(route),
          activeServiceCount: services.filter((service) => service.routeId === route._id)
            .length,
          assignedDriverCount: drivers.filter(
            (driver) => driver.defaultRouteId === route._id,
          ).length,
          assignedVehicleCount: vehicles.filter(
            (vehicle) => vehicle.defaultRouteId === route._id,
          ).length,
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'es')),
      drivers: drivers
        .sort((left, right) => left.name.localeCompare(right.name, 'es'))
        .map((driver) => {
          const openService = serviceByDriverId.get(driver._id)

          return {
            id: driver._id,
            name: driver.name,
            email: driver.email,
            status: driver.status,
            defaultRouteId: driver.defaultRouteId,
            defaultRouteName: driver.defaultRouteId
              ? routeNameById.get(driver.defaultRouteId)
              : undefined,
            defaultVehicleId: driver.defaultVehicleId,
            defaultVehicleLabel: driver.defaultVehicleId
              ? vehicleLabelById.get(driver.defaultVehicleId)
              : undefined,
            hasOpenService: openService !== undefined,
            currentRouteName: openService
              ? routeNameById.get(openService.routeId)
              : undefined,
            currentServiceStatus: openService?.status,
          }
        }),
      vehicles: vehicles
        .sort((left, right) => left.unitNumber.localeCompare(right.unitNumber, 'es'))
        .map((vehicle) => {
          const openService = serviceByVehicleId.get(vehicle._id)

          return {
            id: vehicle._id,
            unitNumber: vehicle.unitNumber,
            label: vehicle.label,
            status: vehicle.status,
            defaultRouteId: vehicle.defaultRouteId,
            defaultRouteName: vehicle.defaultRouteId
              ? routeNameById.get(vehicle.defaultRouteId)
              : undefined,
            assignedDriverNames: drivers
              .filter((driver) => driver.defaultVehicleId === vehicle._id)
              .map((driver) => driver.name),
            hasOpenService: openService !== undefined,
            currentRouteName: openService
              ? routeNameById.get(openService.routeId)
              : undefined,
            currentServiceStatus: openService?.status,
          }
        }),
      alerts: [
        ...drivers
          .filter((driver) => !driver.defaultVehicleId)
          .map((driver) => ({
            id: `driver-without-vehicle:${driver._id}`,
            severity: 'warning' as const,
            title: 'Conductor sin unidad base',
            description: `${driver.name} no tiene unidad asignada.`,
          })),
        ...drivers
          .filter((driver) => !driver.defaultRouteId)
          .map((driver) => ({
            id: `driver-without-route:${driver._id}`,
            severity: 'warning' as const,
            title: 'Conductor sin ruta base',
            description: `${driver.name} no tiene ruta base configurada.`,
          })),
        ...routes
          .filter(
            (route) =>
              route.status === 'draft' &&
              (drivers.some((driver) => driver.defaultRouteId === route._id) ||
                vehicles.some((vehicle) => vehicle.defaultRouteId === route._id)),
          )
          .map((route) => ({
            id: `draft-route-assigned:${route._id}`,
            severity: 'warning' as const,
            title: 'Ruta draft con asignaciones',
            description: `${route.name} sigue asignada como ruta base aunque no está activa.`,
          })),
        ...vehicles
          .filter(
            (vehicle) =>
              drivers.filter((driver) => driver.defaultVehicleId === vehicle._id).length >
              1,
          )
          .map((vehicle) => ({
            id: `vehicle-duplicated:${vehicle._id}`,
            severity: 'critical' as const,
            title: 'Unidad asignada a múltiples conductores',
            description: `${vehicle.unitNumber} está asignada a múltiples conductores base.`,
          })),
      ],
      events: recentEvents.map((event) => ({
        id: event._id,
        category: event.category,
        title: event.title,
        description: event.description,
        actorName: event.actorName,
        actorRole: event.actorRole,
        targetType: event.targetType,
        targetId: event.targetId,
        createdAt: event.createdAt,
      })),
    }
  },
})

export const createDriver = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    email: v.string(),
    password: v.string(),
    status: v.optional(v.union(v.literal('active'), v.literal('inactive'))),
    defaultRouteId: v.optional(v.id('routes')),
    defaultVehicleId: v.optional(v.id('vehicles')),
  },
  handler: async (
    { db },
    {
      sessionToken,
      name,
      email,
      password,
      status,
      defaultRouteId,
      defaultVehicleId,
    },
  ) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')

    assertNonEmptyValue(name, 'El nombre')
    assertNonEmptyValue(email, 'El correo')
    const normalizedEmail = normalizeEmail(email)
    await ensureUniqueDriverEmail(db, normalizedEmail)
    const passwordHash = await hashPassword(password)

    if (defaultRouteId) {
      await requireActiveRoute(db, defaultRouteId, 'La ruta asignada no está activa.')
    }

    if (defaultVehicleId) {
      await requireAssignableVehicle(
        db,
        defaultVehicleId,
        'La unidad asignada no está disponible.',
      )
    }

    const driverId = await db.insert('users', {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      defaultRouteId,
      defaultVehicleId,
      role: 'driver',
      status: status ?? 'active',
      createdAt: new Date().toISOString(),
    })

    await recordSystemEvent(db, {
      category: 'driver',
      title: 'Conductor creado',
      description: `${name.trim()} fue dado de alta en el panel admin.`,
      actorName: 'Administración',
      actorRole: 'admin',
      targetType: 'driver',
      targetId: driverId,
    })

    return {
      driverId,
    }
  },
})

export const updateDriver = mutation({
  args: {
    sessionToken: v.string(),
    driverId: v.id('users'),
    name: v.string(),
    email: v.string(),
    status: v.union(v.literal('active'), v.literal('inactive')),
    password: v.optional(v.string()),
    defaultRouteId: v.optional(v.id('routes')),
    defaultVehicleId: v.optional(v.id('vehicles')),
  },
  handler: async (
    { db },
    {
      sessionToken,
      driverId,
      name,
      email,
      status,
      password,
      defaultRouteId,
      defaultVehicleId,
    },
  ) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')

    const driver = await db.get(driverId)

    if (!driver || driver.role !== 'driver') {
      throw new ConvexError('El conductor indicado no existe.')
    }

    const openService = await getOpenServiceForDriver(db, driverId)

    if (status === 'inactive' && openService) {
      throw new ConvexError(
        'No puedes inactivar un conductor con un servicio abierto.',
      )
    }

    assertNonEmptyValue(name, 'El nombre')
    assertNonEmptyValue(email, 'El correo')
    const normalizedEmail = normalizeEmail(email)
    await ensureUniqueDriverEmail(db, normalizedEmail, driverId)

    if (
      openService &&
      ((defaultRouteId ?? null) !== (driver.defaultRouteId ?? null) ||
        (defaultVehicleId ?? null) !== (driver.defaultVehicleId ?? null))
    ) {
      throw new ConvexError(
        'No cambies la ruta o unidad base mientras el conductor tenga un servicio abierto.',
      )
    }

    if (defaultRouteId) {
      await requireActiveRoute(db, defaultRouteId, 'La ruta asignada no está activa.')
    }

    if (defaultVehicleId) {
      await requireAssignableVehicle(
        db,
        defaultVehicleId,
        'La unidad asignada no está disponible.',
        driverId,
      )
    }

    const patch: Partial<typeof driver> = {
      name: name.trim(),
      email: normalizedEmail,
      status,
      defaultRouteId,
      defaultVehicleId,
    }

    if (password && password.trim()) {
      patch.passwordHash = await hashPassword(password)
    }

    await db.patch(driverId, patch)

    if (openService) {
      await db.patch(openService._id, getActiveServiceDriverFields({ name: name.trim() }))
    }

    await recordSystemEvent(db, {
      category: 'driver',
      title: 'Conductor actualizado',
      description: `${name.trim()} fue actualizado desde el panel admin.`,
      actorName: 'Administración',
      actorRole: 'admin',
      targetType: 'driver',
      targetId: driverId,
    })

    return {
      driverId,
    }
  },
})

export const createVehicle = mutation({
  args: {
    sessionToken: v.string(),
    unitNumber: v.string(),
    label: v.string(),
    status: v.union(v.literal('available'), v.literal('maintenance')),
    defaultRouteId: v.optional(v.id('routes')),
  },
  handler: async (
    { db },
    { sessionToken, unitNumber, label, status, defaultRouteId },
  ) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')

    const normalizedUnitNumber = unitNumber.trim()
    assertNonEmptyValue(normalizedUnitNumber, 'El número de unidad')
    assertNonEmptyValue(label, 'La etiqueta de la unidad')
    await ensureUniqueVehicleUnitNumber(db, normalizedUnitNumber)

    if (defaultRouteId) {
      await requireActiveRoute(db, defaultRouteId, 'La ruta por defecto no está activa.')
    }

    const vehicleId = await db.insert('vehicles', {
      unitNumber: normalizedUnitNumber,
      label: label.trim(),
      status,
      defaultRouteId,
      createdAt: new Date().toISOString(),
    })

    await recordSystemEvent(db, {
      category: 'vehicle',
      title: 'Unidad creada',
      description: `${normalizedUnitNumber} fue registrada en el panel admin.`,
      actorName: 'Administración',
      actorRole: 'admin',
      targetType: 'vehicle',
      targetId: vehicleId,
    })

    return {
      vehicleId,
    }
  },
})

export const updateVehicle = mutation({
  args: {
    sessionToken: v.string(),
    vehicleId: v.id('vehicles'),
    unitNumber: v.string(),
    label: v.string(),
    status: v.union(
      v.literal('available'),
      v.literal('maintenance'),
      v.literal('in_service'),
    ),
    defaultRouteId: v.optional(v.id('routes')),
  },
  handler: async (
    { db },
    { sessionToken, vehicleId, unitNumber, label, status, defaultRouteId },
  ) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')

    const vehicle = await db.get(vehicleId)

    if (!vehicle) {
      throw new ConvexError('La unidad indicada no existe.')
    }

    const openService = await getOpenServiceForVehicle(db, vehicleId)

    if (status === 'maintenance' && openService) {
      throw new ConvexError(
        'No puedes mandar a mantenimiento una unidad con servicio abierto.',
      )
    }

    const normalizedUnitNumber = unitNumber.trim()
    assertNonEmptyValue(normalizedUnitNumber, 'El número de unidad')
    assertNonEmptyValue(label, 'La etiqueta de la unidad')
    await ensureUniqueVehicleUnitNumber(db, normalizedUnitNumber, vehicleId)

    if (defaultRouteId) {
      await requireActiveRoute(db, defaultRouteId, 'La ruta por defecto no está activa.')
    }

    if (!openService && status === 'in_service') {
      throw new ConvexError(
        'Solo una unidad con servicio abierto puede mantenerse en servicio.',
      )
    }

    const effectiveStatus = openService ? 'in_service' : status

    await db.patch(vehicleId, {
      unitNumber: normalizedUnitNumber,
      label: label.trim(),
      status: effectiveStatus,
      defaultRouteId,
    })

    if (openService) {
      await db.patch(
        openService._id,
        getActiveServiceVehicleFields({
          ...vehicle,
          unitNumber: normalizedUnitNumber,
          label: label.trim(),
          status: effectiveStatus,
          defaultRouteId,
        }),
      )
    }

    await recordSystemEvent(db, {
      category: 'vehicle',
      title: 'Unidad actualizada',
      description: `${normalizedUnitNumber} fue actualizada desde el panel admin.`,
      actorName: 'Administración',
      actorRole: 'admin',
      targetType: 'vehicle',
      targetId: vehicleId,
    })

    return {
      vehicleId,
    }
  },
})

export const pauseService = mutation({
  args: {
    sessionToken: v.string(),
    serviceId: v.id('activeServices'),
  },
  handler: async ({ db }, { sessionToken, serviceId }) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')
    const service = await requireOpenServiceById(db, serviceId)

    if (service.status !== 'active') {
      throw new ConvexError('Solo puedes pausar servicios activos.')
    }

    await db.patch(serviceId, {
      status: 'paused',
    })

    await recordSystemEvent(db, {
      category: 'service',
      title: 'Servicio pausado',
      description: `${service.vehicleUnitNumber ?? 'Unidad'} en ${service.routeName ?? 'ruta activa'} fue pausado por administración.`,
      actorName: 'Administración',
      actorRole: 'admin',
      targetType: 'service',
      targetId: serviceId,
    })

    return {
      serviceId,
      status: 'paused',
    }
  },
})

export const resumeService = mutation({
  args: {
    sessionToken: v.string(),
    serviceId: v.id('activeServices'),
  },
  handler: async ({ db }, { sessionToken, serviceId }) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')
    const service = await requireOpenServiceById(db, serviceId)

    if (service.status !== 'paused') {
      throw new ConvexError('Solo puedes reanudar servicios pausados.')
    }

    await db.patch(serviceId, {
      status: 'active',
    })

    await recordSystemEvent(db, {
      category: 'service',
      title: 'Servicio reanudado',
      description: `${service.vehicleUnitNumber ?? 'Unidad'} en ${service.routeName ?? 'ruta activa'} fue reanudado por administración.`,
      actorName: 'Administración',
      actorRole: 'admin',
      targetType: 'service',
      targetId: serviceId,
    })

    return {
      serviceId,
      status: 'active',
    }
  },
})

export const finishService = mutation({
  args: {
    sessionToken: v.string(),
    serviceId: v.id('activeServices'),
  },
  handler: async ({ db }, { sessionToken, serviceId }) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')
    const service = await requireOpenServiceById(db, serviceId)

    const endedAt = new Date().toISOString()

    await db.patch(serviceId, {
      status: 'completed',
      endedAt,
    })

    await db.patch(service.vehicleId, {
      status: 'available',
    })

    await recordSystemEvent(db, {
      category: 'service',
      title: 'Servicio finalizado',
      description: `${service.vehicleUnitNumber ?? 'Unidad'} en ${service.routeName ?? 'ruta activa'} fue finalizado por administración.`,
      actorName: 'Administración',
      actorRole: 'admin',
      targetType: 'service',
      targetId: serviceId,
    })

    return {
      serviceId,
      endedAt,
    }
  },
})

export const setDriverStatus = mutation({
  args: {
    sessionToken: v.string(),
    driverId: v.id('users'),
    status: v.union(v.literal('active'), v.literal('inactive')),
  },
  handler: async ({ db }, { sessionToken, driverId, status }) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')
    const driver = await db.get(driverId)

    if (!driver || driver.role !== 'driver') {
      throw new ConvexError('El conductor indicado no existe.')
    }

    const openService = await getOpenServiceForDriver(db, driverId)

    if (status === 'inactive' && openService) {
      throw new ConvexError(
        'No puedes inactivar un conductor con un servicio abierto.',
      )
    }

    await db.patch(driverId, { status })

    await recordSystemEvent(db, {
      category: 'driver',
      title: status === 'active' ? 'Conductor activado' : 'Conductor inactivado',
      description: `${driver.name} fue marcado como ${status === 'active' ? 'activo' : 'inactivo'} desde el panel admin.`,
      actorName: 'Administración',
      actorRole: 'admin',
      targetType: 'driver',
      targetId: driverId,
    })

    return {
      driverId,
      status,
    }
  },
})

export const setVehicleStatus = mutation({
  args: {
    sessionToken: v.string(),
    vehicleId: v.id('vehicles'),
    status: v.union(v.literal('available'), v.literal('maintenance')),
  },
  handler: async ({ db }, { sessionToken, vehicleId, status }) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')
    const vehicle = await db.get(vehicleId)

    if (!vehicle) {
      throw new ConvexError('La unidad indicada no existe.')
    }

    const openService = await getOpenServiceForVehicle(db, vehicleId)

    if (openService) {
      throw new ConvexError(
        'No puedes cambiar la disponibilidad de una unidad con servicio abierto.',
      )
    }

    await db.patch(vehicleId, { status })

    await recordSystemEvent(db, {
      category: 'vehicle',
      title:
        status === 'available'
          ? 'Unidad disponible'
          : 'Unidad en mantenimiento',
      description: `${vehicle.unitNumber} fue marcada como ${status === 'available' ? 'disponible' : 'mantenimiento'} desde el panel admin.`,
      actorName: 'Administración',
      actorRole: 'admin',
      targetType: 'vehicle',
      targetId: vehicleId,
    })

    return {
      vehicleId,
      status,
    }
  },
})

export const setRouteStatus = mutation({
  args: {
    sessionToken: v.string(),
    routeId: v.id('routes'),
    status: v.union(v.literal('active'), v.literal('draft')),
  },
  handler: async ({ db }, { sessionToken, routeId, status }) => {
    await requireAuthenticatedSession(db, sessionToken, 'admin')
    const route = await db.get(routeId)

    if (!route) {
      throw new ConvexError('La ruta indicada no existe.')
    }

    if (route.status === status) {
      return {
        routeId,
        status,
      }
    }

    if (status === 'draft') {
      const [openServices, drivers, vehicles] = await Promise.all([
        getOpenServices(db),
        db
          .query('users')
          .withIndex('by_role', (q) => q.eq('role', 'driver'))
          .collect(),
        db.query('vehicles').collect(),
      ])

      if (openServices.some((service) => service.routeId === routeId)) {
        throw new ConvexError(
          'No puedes desactivar una ruta con servicios abiertos.',
        )
      }

      if (
        drivers.some((driver) => driver.defaultRouteId === routeId) ||
        vehicles.some((vehicle) => vehicle.defaultRouteId === routeId)
      ) {
        throw new ConvexError(
          'No puedes desactivar una ruta que sigue asignada como base.',
        )
      }
    }

    await db.patch(routeId, { status })

    await recordSystemEvent(db, {
      category: 'route',
      title: status === 'active' ? 'Ruta activada' : 'Ruta desactivada',
      description: `${route.name} fue marcada como ${status === 'active' ? 'activa' : 'draft'} desde el panel admin.`,
      actorName: 'Administración',
      actorRole: 'admin',
      targetType: 'route',
      targetId: routeId,
    })

    return {
      routeId,
      status,
    }
  },
})
