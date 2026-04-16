import { ConvexError } from 'convex/values'
import type { Doc } from '../_generated/dataModel'
import type { DatabaseReader, DatabaseWriter } from '../_generated/server'

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14

export type AuthenticatedRole = 'driver' | 'admin'

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export async function hashPassword(password: string) {
  const normalizedPassword = password.trim()

  if (normalizedPassword.length < 8) {
    throw new ConvexError('La contraseña debe tener al menos 8 caracteres.')
  }

  const payload = new TextEncoder().encode(normalizedPassword)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return bytesToHex(new Uint8Array(digest))
}

export function toUserSummary(user: Doc<'users'>) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    defaultRouteId: user.defaultRouteId,
    defaultVehicleId: user.defaultVehicleId,
  }
}

async function readSessionWithUser(
  db: DatabaseReader,
  sessionToken: string,
) {
  const session = await db
    .query('sessions')
    .withIndex('by_token', (q) => q.eq('token', sessionToken))
    .first()

  if (!session) {
    return null
  }

  const user = await db.get(session.userId)

  if (!user) {
    return null
  }

  if (Date.parse(session.expiresAt) <= Date.now()) {
    return null
  }

  return { session, user }
}

export async function getAuthenticatedSession(
  db: DatabaseReader,
  sessionToken: string,
  expectedRole?: AuthenticatedRole,
) {
  const sessionWithUser = await readSessionWithUser(db, sessionToken)

  if (!sessionWithUser) {
    return null
  }

  if (expectedRole && sessionWithUser.user.role !== expectedRole) {
    return null
  }

  if (sessionWithUser.user.status !== 'active') {
    return null
  }

  return sessionWithUser
}

export async function requireAuthenticatedSession(
  db: DatabaseReader,
  sessionToken: string,
  expectedRole?: AuthenticatedRole,
) {
  const sessionWithUser = await getAuthenticatedSession(
    db,
    sessionToken,
    expectedRole,
  )

  if (!sessionWithUser) {
    throw new ConvexError('La sesión ya no es válida. Ingresa de nuevo.')
  }

  return sessionWithUser
}

export async function createUserSession(
  db: DatabaseWriter,
  user: Doc<'users'>,
) {
  if (user.role !== 'driver' && user.role !== 'admin') {
    throw new ConvexError('Este usuario no puede iniciar sesión.')
  }

  const existingSessions = await db
    .query('sessions')
    .withIndex('by_user', (q) => q.eq('userId', user._id))
    .collect()

  for (const existingSession of existingSessions) {
    await db.delete(existingSession._id)
  }

  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString()
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`

  await db.insert('sessions', {
    token,
    userId: user._id,
    role: user.role,
    createdAt,
    expiresAt,
  })

  return {
    token,
    expiresAt,
  }
}

export async function invalidateSession(
  db: DatabaseWriter,
  sessionToken: string,
) {
  const session = await db
    .query('sessions')
    .withIndex('by_token', (q) => q.eq('token', sessionToken))
    .first()

  if (!session) {
    return
  }

  await db.delete(session._id)
}
