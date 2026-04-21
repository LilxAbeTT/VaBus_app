import { useCallback, useEffect, useMemo, useState } from 'react'

import type { BusRoute } from '../../../types/domain'

const passengerRouteLibraryStorageKey = 'cabobus.passenger-route-library.v1'
const MAX_PERSONAL_ROUTES = 4

type PassengerRouteUsageReason =
  | 'selected'
  | 'searched'
  | 'recommended'
  | 'nearby'
  | 'info'
  | 'quick_access'

type StoredPassengerRouteLibrary = {
  favoriteRouteIds: string[]
  routeScores: Record<string, number>
  routeLastUsedAt: Record<string, string>
}

const emptyPassengerRouteLibrary: StoredPassengerRouteLibrary = {
  favoriteRouteIds: [],
  routeScores: {},
  routeLastUsedAt: {},
}

const routeUsageScoreByReason: Record<PassengerRouteUsageReason, number> = {
  selected: 3,
  searched: 4,
  recommended: 3,
  nearby: 2,
  info: 1,
  quick_access: 2,
}

function parsePassengerRouteLibrary(
  rawValue: string | null,
): StoredPassengerRouteLibrary {
  if (!rawValue) {
    return emptyPassengerRouteLibrary
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredPassengerRouteLibrary>

    return {
      favoriteRouteIds: Array.isArray(parsed.favoriteRouteIds)
        ? parsed.favoriteRouteIds.filter((value): value is string => typeof value === 'string')
        : [],
      routeScores:
        parsed.routeScores && typeof parsed.routeScores === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.routeScores).filter(
                (entry): entry is [string, number] =>
                  typeof entry[0] === 'string' && typeof entry[1] === 'number',
              ),
            )
          : {},
      routeLastUsedAt:
        parsed.routeLastUsedAt && typeof parsed.routeLastUsedAt === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.routeLastUsedAt).filter(
                (entry): entry is [string, string] =>
                  typeof entry[0] === 'string' && typeof entry[1] === 'string',
              ),
            )
          : {},
    }
  } catch {
    return emptyPassengerRouteLibrary
  }
}

function sanitizePassengerRouteLibrary(
  library: StoredPassengerRouteLibrary,
  validRouteIds: Set<string>,
) {
  const favoriteRouteIds = library.favoriteRouteIds.filter((routeId) =>
    validRouteIds.has(routeId),
  )
  const routeScores = Object.fromEntries(
    Object.entries(library.routeScores).filter(([routeId]) => validRouteIds.has(routeId)),
  )
  const routeLastUsedAt = Object.fromEntries(
    Object.entries(library.routeLastUsedAt).filter(([routeId]) => validRouteIds.has(routeId)),
  )

  return {
    favoriteRouteIds,
    routeScores,
    routeLastUsedAt,
  } satisfies StoredPassengerRouteLibrary
}

export function usePassengerRouteLibrary(routes: BusRoute[]) {
  const routeIds = useMemo(() => new Set(routes.map((route) => route.id)), [routes])
  const routeById = useMemo(
    () => new Map(routes.map((route) => [route.id, route] as const)),
    [routes],
  )
  const [storedLibrary, setStoredLibrary] = useState<StoredPassengerRouteLibrary>(() =>
    typeof window === 'undefined'
      ? emptyPassengerRouteLibrary
      : parsePassengerRouteLibrary(
          window.localStorage.getItem(passengerRouteLibraryStorageKey),
        ),
  )

  const sanitizedLibrary = useMemo(
    () => sanitizePassengerRouteLibrary(storedLibrary, routeIds),
    [routeIds, storedLibrary],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      passengerRouteLibraryStorageKey,
      JSON.stringify(sanitizedLibrary),
    )
  }, [sanitizedLibrary])

  const favoriteRouteIdSet = useMemo(
    () => new Set(sanitizedLibrary.favoriteRouteIds),
    [sanitizedLibrary.favoriteRouteIds],
  )

  const personalRoutes = useMemo(() => {
    const favoriteRoutes = sanitizedLibrary.favoriteRouteIds
      .map((routeId) => routeById.get(routeId) ?? null)
      .filter((route): route is BusRoute => route !== null)

    const frequentRoutes = Object.entries(sanitizedLibrary.routeScores)
      .filter(([routeId]) => !favoriteRouteIdSet.has(routeId))
      .sort((leftEntry, rightEntry) => {
        const scoreDifference = rightEntry[1] - leftEntry[1]

        if (scoreDifference !== 0) {
          return scoreDifference
        }

        const rightLastUsedAt = sanitizedLibrary.routeLastUsedAt[rightEntry[0]] ?? ''
        const leftLastUsedAt = sanitizedLibrary.routeLastUsedAt[leftEntry[0]] ?? ''
        return rightLastUsedAt.localeCompare(leftLastUsedAt)
      })
      .map(([routeId]) => routeById.get(routeId) ?? null)
      .filter((route): route is BusRoute => route !== null)

    return [...favoriteRoutes, ...frequentRoutes].slice(0, MAX_PERSONAL_ROUTES)
  }, [
    favoriteRouteIdSet,
    routeById,
    sanitizedLibrary.favoriteRouteIds,
    sanitizedLibrary.routeLastUsedAt,
    sanitizedLibrary.routeScores,
  ])

  const toggleFavoriteRoute = useCallback(
    (routeId: string) => {
      if (!routeIds.has(routeId)) {
        return
      }

      setStoredLibrary((currentLibrary) => {
        const isAlreadyFavorite = currentLibrary.favoriteRouteIds.includes(routeId)

        return {
          ...currentLibrary,
          favoriteRouteIds: isAlreadyFavorite
            ? currentLibrary.favoriteRouteIds.filter(
                (currentRouteId) => currentRouteId !== routeId,
              )
            : [...currentLibrary.favoriteRouteIds, routeId],
          routeScores: {
            ...currentLibrary.routeScores,
            [routeId]: Math.max(currentLibrary.routeScores[routeId] ?? 0, 2),
          },
          routeLastUsedAt: {
            ...currentLibrary.routeLastUsedAt,
            [routeId]: new Date().toISOString(),
          },
        }
      })
    },
    [routeIds],
  )

  const recordRouteUsage = useCallback(
    (routeId: string, reason: PassengerRouteUsageReason) => {
      if (!routeIds.has(routeId)) {
        return
      }

      setStoredLibrary((currentLibrary) => ({
        ...currentLibrary,
        routeScores: {
          ...currentLibrary.routeScores,
          [routeId]:
            (currentLibrary.routeScores[routeId] ?? 0) + routeUsageScoreByReason[reason],
        },
        routeLastUsedAt: {
          ...currentLibrary.routeLastUsedAt,
          [routeId]: new Date().toISOString(),
        },
      }))
    },
    [routeIds],
  )

  return {
    personalRoutes,
    favoriteRouteIdSet,
    toggleFavoriteRoute,
    recordRouteUsage,
  }
}
