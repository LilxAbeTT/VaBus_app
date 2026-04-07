import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'

export function usePassengerMapSnapshot(nowMs?: number) {
  return useQuery(
    api.passengerMap.getSnapshot,
    nowMs === undefined ? {} : { nowMs },
  )
}
