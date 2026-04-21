import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { PassengerMapSnapshot } from '../../../types/domain'

export function usePassengerMapSnapshot(nowMs?: number) {
  const routes = useQuery(api.passengerMap.getRoutes, {})
  const activeVehicles = useQuery(
    api.passengerMap.getActiveVehicles,
    nowMs === undefined ? {} : { nowMs },
  )
  const stops = useQuery(api.passengerMap.getStops, {})

  const snapshot = useMemo(
    () =>
      routes !== undefined && activeVehicles !== undefined && stops !== undefined
        ? {
            routes,
            activeVehicles,
            stops,
          }
        : undefined,
    [activeVehicles, routes, stops],
  )
  const [lastSnapshot, setLastSnapshot] = useState<PassengerMapSnapshot | undefined>(undefined)
  const storeSnapshot = useEffectEvent((nextSnapshot: PassengerMapSnapshot) => {
    setLastSnapshot((current) =>
      current?.routes === nextSnapshot.routes &&
      current?.activeVehicles === nextSnapshot.activeVehicles
        ? current
        : nextSnapshot,
    )
  })

  useEffect(() => {
    if (snapshot === undefined) {
      return
    }

    storeSnapshot(snapshot)
  }, [snapshot])

  return snapshot ?? lastSnapshot
}
