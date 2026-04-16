import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'

export function useAdminOperationalOverview(
  sessionToken: string,
) {
  return useQuery(api.admin.getOperationalOverview, {
    sessionToken,
  })
}
