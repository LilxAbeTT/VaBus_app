import type { TransportType } from '../../src/types/domain.ts'
import type { ImportedRouteSeed } from '../../convex/data/importedRoutes.ts'
import {
  extractRouteDetails,
  repairPossibleMojibake,
} from '../../shared/routeDetails.ts'
import type { ParsedKmlDocument, ParsedKmlPlacemark } from './kml.ts'
import { getPlacemarkColor } from './kml.ts'

interface MultiLineStringGeometry {
  type: 'MultiLineString'
  coordinates: number[][][]
}

interface RouteFeatureProperties {
  importKey: string
  slug: string
  name: string
  direction: string
  transportType: TransportType
  sourceFile: string
  color: string
  passengerInfo: ImportedRouteSeed['passengerInfo']
}

interface RouteFeature {
  type: 'Feature'
  properties: RouteFeatureProperties
  geometry: MultiLineStringGeometry
}

interface RouteFeatureCollection {
  type: 'FeatureCollection'
  features: RouteFeature[]
}

function slugify(value: string) {
  return repairPossibleMojibake(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildRouteName(placemark: ParsedKmlPlacemark) {
  return repairPossibleMojibake(placemark.folderName || placemark.name)
}

function buildDirection(placemark: ParsedKmlPlacemark) {
  if (placemark.name && placemark.name !== placemark.folderName) {
    return repairPossibleMojibake(placemark.name)
  }

  if (placemark.description) {
    return repairPossibleMojibake(placemark.description)
  }

  return repairPossibleMojibake(placemark.folderName)
}

function buildImportKey(
  transportType: TransportType,
  folderName: string,
  placemarkCountForFolder: number,
  placemarkIndex: number,
) {
  const folderSlug = slugify(folderName) || `${transportType}-route-${placemarkIndex + 1}`

  if (placemarkCountForFolder === 1) {
    return `${transportType}:${folderSlug}`
  }

  return `${transportType}:${folderSlug}-${placemarkIndex + 1}`
}

export function normalizeImportedRoutes(documents: ParsedKmlDocument[]) {
  const routes: ImportedRouteSeed[] = []
  const features: RouteFeature[] = []

  for (const document of documents) {
    const placemarkCountByFolder = new Map<string, number>()

    document.placemarks.forEach((placemark) => {
      placemarkCountByFolder.set(
        placemark.folderName,
        (placemarkCountByFolder.get(placemark.folderName) ?? 0) + 1,
      )
    })

    document.placemarks.forEach((placemark) => {
      const name = buildRouteName(placemark)
      const direction = buildDirection(placemark)
      const importKey = buildImportKey(
        document.transportType,
        placemark.folderName,
        placemarkCountByFolder.get(placemark.folderName) ?? 1,
        placemark.placemarkIndex,
      )
      const slug = importKey.split(':')[1]
      const color = getPlacemarkColor(document, placemark)
      const passengerInfo = extractRouteDetails(direction)

      const route: ImportedRouteSeed = {
        importKey,
        slug,
        name,
        direction,
        transportType: document.transportType,
        sourceFile: document.sourceFile,
        status: 'active',
        color,
        passengerInfo,
        segments: placemark.segments,
      }

      routes.push(route)
      features.push({
        type: 'Feature',
        properties: {
          importKey,
          slug,
          name,
          direction,
          transportType: route.transportType,
          sourceFile: route.sourceFile,
          color: route.color,
        },
        geometry: {
          type: 'MultiLineString',
          coordinates: route.segments.map((segment) =>
            segment.map((point) => [point.lng, point.lat]),
          ),
        },
      })
    })
  }

  routes.sort((left, right) => left.importKey.localeCompare(right.importKey, 'es'))
  features.sort((left, right) =>
    left.properties.importKey.localeCompare(right.properties.importKey, 'es'),
  )

  const geoJson: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features,
  }

  return {
    routes,
    geoJson,
  }
}
