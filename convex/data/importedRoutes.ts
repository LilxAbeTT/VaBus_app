import type { Coordinates, TransportType } from '../../src/types/domain'
import type { PassengerRouteInfo } from '../../shared/routeDetails'

export interface ImportedRouteSeed {
  importKey: string
  slug: string
  name: string
  direction: string
  transportType: TransportType
  sourceFile: string
  status: 'active'
  color: string
  passengerInfo: PassengerRouteInfo
  segments: Coordinates[][]
}
