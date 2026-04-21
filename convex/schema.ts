import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const coordinates = v.object({
  lat: v.number(),
  lng: v.number(),
})

const passengerRouteInfo = v.object({
  summary: v.string(),
  landmarks: v.array(v.string()),
  startTime: v.optional(v.string()),
  endTime: v.optional(v.string()),
  frequency: v.optional(v.string()),
})

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.optional(v.string()),
    defaultRouteId: v.optional(v.id('routes')),
    defaultVehicleId: v.optional(v.id('vehicles')),
    role: v.union(v.literal('passenger'), v.literal('driver'), v.literal('admin')),
    status: v.union(v.literal('active'), v.literal('inactive')),
    createdAt: v.string(),
  })
    .index('by_email', ['email'])
    .index('by_role', ['role']),

  routes: defineTable({
    importKey: v.optional(v.string()),
    slug: v.string(),
    name: v.string(),
    direction: v.string(),
    transportType: v.optional(
      v.union(v.literal('urbano'), v.literal('colectivo')),
    ),
    sourceFile: v.optional(v.string()),
    status: v.union(v.literal('draft'), v.literal('active')),
    color: v.string(),
    passengerInfo: v.optional(passengerRouteInfo),
    segments: v.optional(v.array(v.array(coordinates))),
    path: v.optional(v.array(coordinates)),
    createdAt: v.string(),
  })
    .index('by_import_key', ['importKey'])
    .index('by_slug', ['slug'])
    .index('by_status', ['status']),

  vehicles: defineTable({
    unitNumber: v.string(),
    label: v.string(),
    status: v.union(
      v.literal('available'),
      v.literal('in_service'),
      v.literal('maintenance'),
    ),
    defaultRouteId: v.optional(v.id('routes')),
    createdAt: v.string(),
  }).index('by_unit_number', ['unitNumber']),

  activeServices: defineTable({
    vehicleId: v.id('vehicles'),
    routeId: v.id('routes'),
    driverId: v.id('users'),
    routeName: v.optional(v.string()),
    routeDirection: v.optional(v.string()),
    routeTransportType: v.optional(
      v.union(v.literal('urbano'), v.literal('colectivo')),
    ),
    vehicleUnitNumber: v.optional(v.string()),
    vehicleLabel: v.optional(v.string()),
    driverName: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('paused'), v.literal('completed')),
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
    lastLocationUpdateAt: v.optional(v.string()),
    lastPosition: v.optional(coordinates),
    lastLocationSource: v.optional(v.union(v.literal('seed'), v.literal('device'))),
  })
    .index('by_status', ['status'])
    .index('by_driver', ['driverId'])
    .index('by_vehicle', ['vehicleId'])
    .index('by_driver_status', ['driverId', 'status'])
    .index('by_vehicle_status', ['vehicleId', 'status']),

  locationUpdates: defineTable({
    activeServiceId: v.id('activeServices'),
    vehicleId: v.id('vehicles'),
    routeId: v.id('routes'),
    position: coordinates,
    recordedAt: v.string(),
    source: v.union(v.literal('seed'), v.literal('device')),
  })
    .index('by_active_service_recorded_at', ['activeServiceId', 'recordedAt'])
    .index('by_vehicle_recorded_at', ['vehicleId', 'recordedAt']),

  sessions: defineTable({
    token: v.string(),
    userId: v.id('users'),
    role: v.union(v.literal('driver'), v.literal('admin')),
    createdAt: v.string(),
    expiresAt: v.string(),
  })
    .index('by_token', ['token'])
    .index('by_user', ['userId']),

  supportThreads: defineTable({
    driverId: v.id('users'),
    driverName: v.string(),
    driverEmail: v.string(),
    routeId: v.optional(v.id('routes')),
    routeName: v.optional(v.string()),
    serviceId: v.optional(v.id('activeServices')),
    status: v.union(v.literal('open'), v.literal('closed')),
    createdAt: v.string(),
    updatedAt: v.string(),
    lastDriverMessageAt: v.optional(v.string()),
    lastAdminMessageAt: v.optional(v.string()),
    lastSeenByDriverAt: v.optional(v.string()),
    lastSeenByAdminAt: v.optional(v.string()),
    messages: v.array(
      v.object({
        id: v.string(),
        senderRole: v.union(v.literal('driver'), v.literal('admin')),
        senderName: v.string(),
        body: v.string(),
        createdAt: v.string(),
      }),
    ),
  })
    .index('by_driver', ['driverId'])
    .index('by_status_updated_at', ['status', 'updatedAt'])
    .index('by_updated_at', ['updatedAt']),

  stops: defineTable({
    name: v.optional(v.string()),
    position: coordinates,
    status: v.union(
      v.literal('official'),
      v.literal('informal'),
      v.literal('inactive'),
    ),
    routeIds: v.array(v.id('routes')),
    source: v.union(v.literal('admin'), v.literal('user_validated')),
    note: v.optional(v.string()),
    reportCount: v.number(),
    createdAt: v.string(),
    validatedAt: v.optional(v.string()),
    lastReportedAt: v.optional(v.string()),
  }).index('by_status', ['status']),

  stopSuggestions: defineTable({
    position: coordinates,
    routeId: v.optional(v.id('routes')),
    reportedAsOfficial: v.union(
      v.literal('yes'),
      v.literal('no'),
      v.literal('unknown'),
    ),
    note: v.optional(v.string()),
    reporterKey: v.string(),
    source: v.union(v.literal('map_center'), v.literal('current_location')),
    createdAt: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('merged'),
    ),
    resolvedAt: v.optional(v.string()),
    stopId: v.optional(v.id('stops')),
  })
    .index('by_status_created_at', ['status', 'createdAt'])
    .index('by_reporter_created_at', ['reporterKey', 'createdAt']),

  systemEvents: defineTable({
    category: v.union(
      v.literal('service'),
      v.literal('driver'),
      v.literal('vehicle'),
      v.literal('route'),
      v.literal('stop'),
    ),
    title: v.string(),
    description: v.string(),
    actorName: v.optional(v.string()),
    actorRole: v.optional(v.union(v.literal('driver'), v.literal('admin'))),
    targetType: v.optional(
      v.union(
        v.literal('service'),
        v.literal('driver'),
        v.literal('vehicle'),
        v.literal('route'),
        v.literal('stop'),
      ),
    ),
    targetId: v.optional(v.string()),
    createdAt: v.string(),
  }).index('by_created_at', ['createdAt']),
})
