import { ConvexError } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import { getOpenServiceForDriver } from './services'

export type SupportMessageSenderRole = 'driver' | 'admin'
export type SupportViewerRole = 'driver' | 'admin'

export function normalizeSupportMessageBody(body: string) {
  const normalizedBody = body.trim()

  if (!normalizedBody) {
    throw new ConvexError('Escribe un mensaje para soporte.')
  }

  if (normalizedBody.length < 6) {
    throw new ConvexError('Describe un poco más lo que necesitas de soporte.')
  }

  if (normalizedBody.length > 1200) {
    throw new ConvexError('El mensaje de soporte es demasiado largo.')
  }

  return normalizedBody
}

export function createSupportMessage({
  senderRole,
  senderName,
  body,
}: {
  senderRole: SupportMessageSenderRole
  senderName: string
  body: string
}) {
  return {
    id: crypto.randomUUID(),
    senderRole,
    senderName,
    body: normalizeSupportMessageBody(body),
    createdAt: new Date().toISOString(),
  }
}

export async function getSupportThreadForDriver(
  db: DatabaseReader,
  driverId: Id<'users'>,
) {
  const threads = await db
    .query('supportThreads')
    .withIndex('by_driver', (q) => q.eq('driverId', driverId))
    .collect()

  return threads.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
}

export async function getSupportContextForDriver(
  db: DatabaseReader,
  driver: Doc<'users'>,
) {
  const [currentService, defaultRoute] = await Promise.all([
    getOpenServiceForDriver(db, driver._id),
    driver.defaultRouteId ? db.get(driver.defaultRouteId) : null,
  ])

  return {
    serviceId: currentService?._id,
    routeId: currentService?.routeId ?? driver.defaultRouteId,
    routeName:
      currentService?.routeName ??
      defaultRoute?.name ??
      undefined,
  }
}

export function toSupportThreadSummary(
  thread: Doc<'supportThreads'>,
) {
  const latestMessage = thread.messages[thread.messages.length - 1]
  const hasUnreadForDriver = Boolean(
    thread.lastAdminMessageAt &&
      (!thread.lastSeenByDriverAt ||
        thread.lastAdminMessageAt > thread.lastSeenByDriverAt),
  )
  const hasUnreadForAdmin = Boolean(
    thread.lastDriverMessageAt &&
      (!thread.lastSeenByAdminAt ||
        thread.lastDriverMessageAt > thread.lastSeenByAdminAt),
  )

  return {
    id: thread._id,
    driverId: thread.driverId,
    driverName: thread.driverName,
    driverEmail: thread.driverEmail,
    routeId: thread.routeId,
    routeName: thread.routeName,
    serviceId: thread.serviceId,
    status: thread.status,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastDriverMessageAt: thread.lastDriverMessageAt,
    lastAdminMessageAt: thread.lastAdminMessageAt,
    lastSeenByDriverAt: thread.lastSeenByDriverAt,
    lastSeenByAdminAt: thread.lastSeenByAdminAt,
    hasUnreadForDriver,
    hasUnreadForAdmin,
    latestMessageRole: latestMessage?.senderRole,
    latestMessagePreview: latestMessage?.body,
    messages: thread.messages,
  }
}

export async function upsertDriverSupportThread(
  db: DatabaseWriter,
  driver: Doc<'users'>,
  messageBody: string,
) {
  const supportThread = await getSupportThreadForDriver(db, driver._id)
  const supportContext = await getSupportContextForDriver(db, driver)
  const message = createSupportMessage({
    senderRole: 'driver',
    senderName: driver.name,
    body: messageBody,
  })

  if (!supportThread) {
    const threadId = await db.insert('supportThreads', {
      driverId: driver._id,
      driverName: driver.name,
      driverEmail: driver.email,
      routeId: supportContext.routeId,
      routeName: supportContext.routeName,
      serviceId: supportContext.serviceId,
      status: 'open',
      createdAt: message.createdAt,
      updatedAt: message.createdAt,
      lastDriverMessageAt: message.createdAt,
      lastAdminMessageAt: undefined,
      lastSeenByDriverAt: message.createdAt,
      lastSeenByAdminAt: undefined,
      messages: [message],
    })

    return await db.get(threadId)
  }

  await db.patch(supportThread._id, {
    driverName: driver.name,
    driverEmail: driver.email,
    routeId: supportContext.routeId,
    routeName: supportContext.routeName,
    serviceId: supportContext.serviceId,
    status: 'open',
    updatedAt: message.createdAt,
    lastDriverMessageAt: message.createdAt,
    lastSeenByDriverAt: message.createdAt,
    messages: [...supportThread.messages, message],
  })

  return await db.get(supportThread._id)
}

export async function markSupportThreadSeen(
  db: DatabaseWriter,
  thread: Doc<'supportThreads'>,
  viewerRole: SupportViewerRole,
) {
  const latestSeenAt =
    viewerRole === 'driver' ? thread.lastAdminMessageAt : thread.lastDriverMessageAt

  if (!latestSeenAt) {
    return thread
  }

  if (
    viewerRole === 'driver' &&
    thread.lastSeenByDriverAt &&
    thread.lastSeenByDriverAt >= latestSeenAt
  ) {
    return thread
  }

  if (
    viewerRole === 'admin' &&
    thread.lastSeenByAdminAt &&
    thread.lastSeenByAdminAt >= latestSeenAt
  ) {
    return thread
  }

  await db.patch(thread._id, {
    ...(viewerRole === 'driver'
      ? { lastSeenByDriverAt: latestSeenAt }
      : { lastSeenByAdminAt: latestSeenAt }),
  })

  return await db.get(thread._id)
}
