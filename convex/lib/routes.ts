import type { Doc } from '../_generated/dataModel'

type RouteDocument = Doc<'routes'>

function getLegacyPath(route: RouteDocument) {
  return 'path' in route && Array.isArray(route.path) ? route.path : undefined
}

export function getRouteSegments(route: RouteDocument) {
  if (route.segments && route.segments.length > 0) {
    return route.segments
  }

  const legacyPath = getLegacyPath(route)

  if (legacyPath && legacyPath.length > 0) {
    return [legacyPath]
  }

  return []
}

export function getRouteTransportType(route: RouteDocument) {
  if (route.transportType) {
    return route.transportType
  }

  if (route.slug.startsWith('colectivo') || route.sourceFile?.includes('colectivo')) {
    return 'colectivo' as const
  }

  return 'urbano' as const
}

export function getRouteSourceFile(route: RouteDocument) {
  return route.sourceFile ?? 'legacy-seed'
}

export function getRouteImportKey(route: RouteDocument) {
  return route.importKey ?? `legacy:${route.slug}`
}

export function toRouteListItem(route: RouteDocument) {
  return {
    id: route._id,
    importKey: getRouteImportKey(route),
    slug: route.slug,
    name: route.name,
    direction: route.direction,
    transportType: getRouteTransportType(route),
    sourceFile: getRouteSourceFile(route),
    status: route.status,
    color: route.color,
  }
}

export function toRouteSummary(route: RouteDocument) {
  return {
    ...toRouteListItem(route),
    segments: getRouteSegments(route),
  }
}
