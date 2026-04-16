import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'

export function useAdminManagementCatalog(sessionToken: string) {
  return useQuery(api.admin.getManagementCatalog, {
    sessionToken,
  })
}
