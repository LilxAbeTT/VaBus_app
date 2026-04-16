import { useEffect, useState } from 'react'
import type { AuthenticatedSession } from '../../../types/domain'

type SessionPersistence = 'local' | 'session'

function readStoredSessionFromStorage(
  storage: Storage | undefined,
  storageKey: string,
) {
  if (!storage) {
    return null
  }

  const storedValue = storage.getItem(storageKey)

  if (!storedValue) {
    return null
  }

  try {
    const parsedValue = JSON.parse(storedValue) as AuthenticatedSession

    if (
      parsedValue.token &&
      parsedValue.expiresAt &&
      parsedValue.user?.id &&
      parsedValue.user?.role
    ) {
      return parsedValue
    }
  } catch {
    storage.removeItem(storageKey)
  }

  storage.removeItem(storageKey)

  return null
}

function readStoredSession(storageKey: string): {
  session: AuthenticatedSession | null
  persistence: SessionPersistence
} {
  if (typeof window === 'undefined') {
    return {
      session: null,
      persistence: 'local',
    }
  }

  const localSession = readStoredSessionFromStorage(window.localStorage, storageKey)

  if (localSession) {
    return {
      session: localSession,
      persistence: 'local',
    }
  }

  const sessionSession = readStoredSessionFromStorage(
    window.sessionStorage,
    storageKey,
  )

  if (sessionSession) {
    return {
      session: sessionSession,
      persistence: 'session',
    }
  }

  return {
    session: null,
    persistence: 'local',
  }
}

export function useStoredAuthSession(storageKey: string) {
  const [{ session, persistence }, setStoredSessionState] = useState(() =>
    readStoredSession(storageKey),
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!session) {
      window.sessionStorage.removeItem(storageKey)
      window.localStorage.removeItem(storageKey)
      return
    }

    const storage =
      persistence === 'session' ? window.sessionStorage : window.localStorage
    const alternateStorage =
      persistence === 'session' ? window.localStorage : window.sessionStorage

    alternateStorage.removeItem(storageKey)
    storage.setItem(storageKey, JSON.stringify(session))
  }, [persistence, session, storageKey])

  return {
    session,
    setSession: (
      nextSession: AuthenticatedSession,
      options?: { persistent?: boolean },
    ) =>
      setStoredSessionState({
        session: nextSession,
        persistence: options?.persistent === false ? 'session' : 'local',
      }),
    clearSession: () =>
      setStoredSessionState({
        session: null,
        persistence: 'local',
      }),
  }
}
