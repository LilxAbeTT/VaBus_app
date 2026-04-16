import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import type { BusRoute, Coordinates } from '../../../types/domain'

function getRouteBounds(route: BusRoute) {
  return route.segments.flatMap((segment) =>
    segment.map((point) => [point.lat, point.lng] as [number, number]),
  )
}

function areCoordinatesEqual(
  left: Coordinates | null,
  right: Coordinates | null,
) {
  if (!left || !right) {
    return false
  }

  return left.lat === right.lat && left.lng === right.lng
}

export function DriverRouteMap({
  route,
  livePosition,
  lastSharedPosition,
}: {
  route: BusRoute | null
  livePosition: Coordinates | null
  lastSharedPosition: Coordinates | null
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const primaryMarkerRef = useRef<L.CircleMarker | null>(null)
  const sharedMarkerRef = useRef<L.CircleMarker | null>(null)
  const lastFittedRouteIdRef = useRef<string | null>(null)

  const primaryPosition = livePosition ?? lastSharedPosition ?? null
  const routeBoundsPoints = useMemo(
    () => (route ? getRouteBounds(route) : []),
    [route],
  )

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }

    const map = L.map(mapContainerRef.current, {
      scrollWheelZoom: false,
      zoomControl: false,
    })

    mapRef.current = map
    routeLayerRef.current = L.layerGroup().addTo(map)
    markerLayerRef.current = L.layerGroup().addTo(map)

    L.control.zoom({ position: 'topright' }).addTo(map)

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    map.setView([23.058, -109.701], 13)

    return () => {
      map.remove()
      mapRef.current = null
      routeLayerRef.current = null
      markerLayerRef.current = null
      primaryMarkerRef.current = null
      sharedMarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    const routeLayer = routeLayerRef.current

    if (!routeLayer) {
      return
    }

    routeLayer.clearLayers()

    if (!route) {
      return
    }

    route.segments.forEach((segment) => {
      const path = segment.map((point) => [point.lat, point.lng] as [number, number])

      if (path.length === 0) {
        return
      }

      L.polyline(path, {
        color: route.color,
        weight: 6,
        opacity: 0.88,
      }).addTo(routeLayer)
    })
  }, [route])

  useEffect(() => {
    const markerLayer = markerLayerRef.current

    if (!markerLayer) {
      return
    }

    if (!route) {
      if (primaryMarkerRef.current) {
        markerLayer.removeLayer(primaryMarkerRef.current)
        primaryMarkerRef.current = null
      }

      if (sharedMarkerRef.current) {
        markerLayer.removeLayer(sharedMarkerRef.current)
        sharedMarkerRef.current = null
      }

      return
    }

    const referencePosition = primaryPosition ?? route.segments[0]?.[0] ?? null

    if (referencePosition) {
      const primaryLatLng: L.LatLngExpression = [
        referencePosition.lat,
        referencePosition.lng,
      ]

      if (!primaryMarkerRef.current) {
        primaryMarkerRef.current = L.circleMarker(primaryLatLng, {
          radius: 9,
          color: '#1d4ed8',
          fillColor: '#60a5fa',
          fillOpacity: 1,
          weight: 3,
        })
          .addTo(markerLayer)
          .bindPopup('Tu ubicacion actual')
      } else {
        primaryMarkerRef.current.setLatLng(primaryLatLng)
      }
    } else if (primaryMarkerRef.current) {
      markerLayer.removeLayer(primaryMarkerRef.current)
      primaryMarkerRef.current = null
    }

    if (
      lastSharedPosition &&
      primaryPosition &&
      !areCoordinatesEqual(lastSharedPosition, primaryPosition)
    ) {
      const sharedLatLng: L.LatLngExpression = [
        lastSharedPosition.lat,
        lastSharedPosition.lng,
      ]

      if (!sharedMarkerRef.current) {
        sharedMarkerRef.current = L.circleMarker(sharedLatLng, {
          radius: 6,
          color: '#0f766e',
          fillColor: '#2dd4bf',
          fillOpacity: 0.8,
          weight: 2,
        })
          .addTo(markerLayer)
          .bindPopup('Ultima ubicacion compartida')
      } else {
        sharedMarkerRef.current.setLatLng(sharedLatLng)
      }
    } else if (sharedMarkerRef.current) {
      markerLayer.removeLayer(sharedMarkerRef.current)
      sharedMarkerRef.current = null
    }
  }, [lastSharedPosition, primaryPosition, route])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !route) {
      return
    }

    if (lastFittedRouteIdRef.current !== route.id && routeBoundsPoints.length > 0) {
      map.fitBounds(L.latLngBounds(routeBoundsPoints), {
        paddingTopLeft: [24, 24],
        paddingBottomRight: [24, 24],
        maxZoom: 14.75,
      })
      lastFittedRouteIdRef.current = route.id
    }
  }, [route, routeBoundsPoints])

  return (
    <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white">
      <div
        ref={mapContainerRef}
        className="h-[33svh] min-h-[260px] w-full sm:h-[40svh] xl:h-[calc(100svh-22rem)] xl:min-h-[360px]"
      />
    </div>
  )
}
