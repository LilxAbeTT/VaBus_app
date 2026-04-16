import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'

export function usePassengerMapSnapshot(nowMs?: number) {
  const routes = useQuery(api.passengerMap.getRoutes, {})
  const activeVehicles = useQuery(
    api.passengerMap.getActiveVehicles,
    nowMs === undefined ? {} : { nowMs },
  )

  if (routes === undefined || activeVehicles === undefined) {
    return undefined
  }

  return {
    routes,
    activeVehicles,
  }
}
