import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
  Position,
} from 'geojson'

export type LatLngPoint = {
  lat: number
  lng: number
}

export function buildLineStringFeatures(
  segments: LatLngPoint[][],
): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: segments
      .map((segment) => segment.map((point) => [point.lng, point.lat] as Position))
      .filter((coordinates) => coordinates.length > 1)
      .map(
        (coordinates): Feature<LineString> => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates,
          },
          properties: {},
        }),
      ),
  }
}

export function buildPointFeatureCollection<TProperties extends Record<string, unknown>>(
  points: Array<{
    coordinates: LatLngPoint
    properties: TProperties
  }>,
): FeatureCollection<Point, TProperties> {
  return {
    type: 'FeatureCollection',
    features: points.map(
      ({ coordinates, properties }): Feature<Point, TProperties> => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [coordinates.lng, coordinates.lat],
        },
        properties,
      }),
    ),
  }
}

export function buildCirclePolygon(
  center: LatLngPoint,
  radiusMeters: number,
  steps = 48,
): Feature<Polygon> {
  const latRadians = (center.lat * Math.PI) / 180
  const metersPerDegreeLat = 111_320
  const metersPerDegreeLng = Math.max(111_320 * Math.cos(latRadians), 1)
  const coordinates: Position[] = []

  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2
    const deltaLat = (Math.sin(angle) * radiusMeters) / metersPerDegreeLat
    const deltaLng = (Math.cos(angle) * radiusMeters) / metersPerDegreeLng
    coordinates.push([center.lng + deltaLng, center.lat + deltaLat])
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
    properties: {},
  }
}

export function getBoundsFromPoints(points: LatLngPoint[]) {
  if (points.length === 0) {
    return null
  }

  let minLat = points[0].lat
  let maxLat = points[0].lat
  let minLng = points[0].lng
  let maxLng = points[0].lng

  points.forEach((point) => {
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
  })

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]]
}
