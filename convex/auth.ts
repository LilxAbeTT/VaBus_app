import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import {
  createUserSession,
  getAuthenticatedSession,
  hashPassword,
  invalidateSession,
  normalizeEmail,
  toUserSummary,
} from './lib/auth'
import { recordSystemEvent } from './lib/systemEvents'

export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    role: v.union(v.literal('driver'), v.literal('admin')),
  },
  handler: async ({ db }, { email, password, role }) => {
    const normalizedEmail = normalizeEmail(email)
    const user = await db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', normalizedEmail))
      .first()

    if (
      !user ||
      user.role !== role ||
      user.status !== 'active' ||
      !user.passwordHash
    ) {
      throw new ConvexError('Credenciales inválidas.')
    }

    const passwordHash = await hashPassword(password)

    if (passwordHash !== user.passwordHash) {
      throw new ConvexError('Credenciales inválidas.')
    }

    const session = await createUserSession(db, user)

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: toUserSummary(user),
    }
  },
})

export const logout = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async ({ db }, { sessionToken }) => {
    await invalidateSession(db, sessionToken)

    return {
      loggedOut: true,
    }
  },
})

export const getSession = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async ({ db }, { sessionToken }) => {
    const session = await getAuthenticatedSession(db, sessionToken)

    if (!session) {
      return null
    }

    return {
      token: session.session.token,
      expiresAt: session.session.expiresAt,
      user: toUserSummary(session.user),
    }
  },
})

export const requestDriverLoginHelp = mutation({
  args: {
    email: v.string(),
    issueType: v.union(v.literal('password_reset'), v.literal('general_support')),
  },
  handler: async ({ db }, { email, issueType }) => {
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail) {
      throw new ConvexError('Ingresa tu correo operativo para pedir ayuda.')
    }

    const driver = await db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', normalizedEmail))
      .first()

    await recordSystemEvent(db, {
      category: 'driver',
      title:
        issueType === 'password_reset'
          ? 'Solicitud de recuperación de contraseña'
          : 'Solicitud de soporte de acceso',
      description:
        issueType === 'password_reset'
          ? `${driver?.name ?? normalizedEmail} solicitó apoyo para recuperar su contraseña de conductor.`
          : `${driver?.name ?? normalizedEmail} solicitó soporte desde el login del conductor.`,
      actorName: driver?.name ?? normalizedEmail,
      targetType: driver ? 'driver' : undefined,
      targetId: driver?._id,
    })

    return {
      requested: true,
      email: normalizedEmail,
    }
  },
})
