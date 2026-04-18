import { useEffect, useState } from 'react'

import type { BusRoute } from '../../../types/domain'

const passengerRouteSelectionStorageKey = 'cabobus.passenger-map.selected-route-id'

export function usePassengerRouteSelection(
  routes: BusRoute[],
  preferredRouteId?: string | null,
) {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? preferredRouteId ?? null
      : preferredRouteId ??
        window.localStorage.getItem(passengerRouteSelectionStorageKey),
  )
  const effectiveSelectedRouteId =
    selectedRouteId && routes.some((route) => route.id === selectedRouteId)
      ? selectedRouteId
      : null

  useEffect(() => {
    if (!effectiveSelectedRouteId) {
      window.localStorage.removeItem(passengerRouteSelectionStorageKey)
      return
    }

    window.localStorage.setItem(
      passengerRouteSelectionStorageKey,
      effectiveSelectedRouteId,
    )
  }, [effectiveSelectedRouteId])

  return {
    hasHydratedSelection: true,
    selectedRouteId: effectiveSelectedRouteId,
    setSelectedRouteId,
    clearSelectedRoute: () => setSelectedRouteId(null),
  }
}
