import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { PassengerMapSnapshot } from '../../../types/domain'

export function usePassengerMapSnapshot(nowMs?: number) {
  const routes = useQuery(api.passengerMap.getRoutes, {})
  const activeVehicles = useQuery(
    api.passengerMap.getActiveVehicles,
    nowMs === undefined ? {} : { nowMs },
  )
  const [lastSnapshot, setLastSnapshot] = useState<PassengerMapSnapshot | undefined>(
    undefined,
  )

  useEffect(() => {
    if (routes === undefined || activeVehicles === undefined) {
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastSnapshot({
      routes,
      activeVehicles,
    })
  }, [activeVehicles, routes])

  if (routes !== undefined && activeVehicles !== undefined) {
    return {
      routes,
      activeVehicles,
    }
  }

  return lastSnapshot
}
