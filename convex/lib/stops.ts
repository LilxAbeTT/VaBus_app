import type { Doc, Id } from '../_generated/dataModel'

type Coordinates = {
  lat: number
  lng: number
}

export const STOP_SUGGESTION_CLUSTER_RADIUS_METERS = 35
export const STOP_MERGE_RADIUS_METERS = 30

export function getDistanceBetweenCoordinatesMeters(
  left: Coordinates,
  right: Coordinates,
) {
  const earthRadiusMeters = 6_371_000
  const latitudeDelta = toRadians(right.lat - left.lat)
  const longitudeDelta = toRadians(right.lng - left.lng)
  const leftLatitude = toRadians(left.lat)
  const rightLatitude = toRadians(right.lat)
  const haversineValue =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2)

  return (
    2 *
    earthRadiusMeters *
    Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue))
  )
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

export function normalizeStopName(value?: string | null) {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : undefined
}

export function getAverageCoordinates(points: Coordinates[]) {
  const total = points.reduce(
    (current, point) => ({
      lat: current.lat + point.lat,
      lng: current.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  )

  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length,
  }
}

function sortRouteIds(routeIds: Id<'routes'>[]) {
  return [...routeIds].sort((left, right) => left.localeCompare(right))
}

function getLatestTimestamp(values: string[]) {
  return [...values].sort((left, right) => right.localeCompare(left))[0]
}

export type StopSuggestionCluster = {
  id: string
  suggestionIds: Id<'stopSuggestions'>[]
  routeId?: Id<'routes'>
  routeName?: string
  center: Coordinates
  totalReports: number
  officialYesCount: number
  officialNoCount: number
  unknownCount: number
  latestReportedAt: string
  notes: string[]
}

export function buildStopSuggestionClusters(
  suggestions: Doc<'stopSuggestions'>[],
  routeNameById: Map<Id<'routes'>, string>,
) {
  const clusters: StopSuggestionCluster[] = []

  suggestions
    .slice()
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .forEach((suggestion) => {
      const matchingCluster = clusters.find((cluster) => {
        const sameRoute =
          cluster.routeId === suggestion.routeId ||
          cluster.routeId === undefined ||
          suggestion.routeId === undefined

        return (
          sameRoute &&
          getDistanceBetweenCoordinatesMeters(cluster.center, suggestion.position) <=
            STOP_SUGGESTION_CLUSTER_RADIUS_METERS
        )
      })

      if (!matchingCluster) {
        clusters.push({
          id: suggestion._id,
          suggestionIds: [suggestion._id],
          routeId: suggestion.routeId,
          routeName: suggestion.routeId
            ? routeNameById.get(suggestion.routeId)
            : undefined,
          center: suggestion.position,
          totalReports: 1,
          officialYesCount: suggestion.reportedAsOfficial === 'yes' ? 1 : 0,
          officialNoCount: suggestion.reportedAsOfficial === 'no' ? 1 : 0,
          unknownCount: suggestion.reportedAsOfficial === 'unknown' ? 1 : 0,
          latestReportedAt: suggestion.createdAt,
          notes: suggestion.note ? [suggestion.note] : [],
        })
        return
      }

      matchingCluster.suggestionIds.push(suggestion._id)
      matchingCluster.totalReports += 1
      matchingCluster.officialYesCount += suggestion.reportedAsOfficial === 'yes' ? 1 : 0
      matchingCluster.officialNoCount += suggestion.reportedAsOfficial === 'no' ? 1 : 0
      matchingCluster.unknownCount += suggestion.reportedAsOfficial === 'unknown' ? 1 : 0
      matchingCluster.latestReportedAt = getLatestTimestamp([
        matchingCluster.latestReportedAt,
        suggestion.createdAt,
      ])
      if (!matchingCluster.routeId && suggestion.routeId) {
        matchingCluster.routeId = suggestion.routeId
        matchingCluster.routeName = routeNameById.get(suggestion.routeId)
      }
      if (suggestion.note) {
        matchingCluster.notes.push(suggestion.note)
      }
      matchingCluster.center = getAverageCoordinates(
        matchingCluster.suggestionIds.map((suggestionId) => {
          const nextSuggestion = suggestions.find(
            (candidate) => candidate._id === suggestionId,
          )

          return nextSuggestion?.position ?? matchingCluster.center
        }),
      )
    })

  return clusters
    .map((cluster) => ({
      ...cluster,
      notes: [...new Set(cluster.notes.map((note) => note.trim()).filter(Boolean))].slice(
        0,
        3,
      ),
    }))
    .sort((left, right) => right.latestReportedAt.localeCompare(left.latestReportedAt))
}

export function mergeRouteIds(
  left: Id<'routes'>[],
  right: Array<Id<'routes'> | undefined>,
) {
  return sortRouteIds(
    [...left, ...right.filter((value): value is Id<'routes'> => value !== undefined)]
      .filter((value, index, array) => array.indexOf(value) === index),
  )
}
