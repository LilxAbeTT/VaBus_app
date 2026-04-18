import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import {
  mapAttribution,
  mapInitialCenter,
  mapInitialZoom,
  mapMaxZoom,
  mapStyleUrl,
} from '../../../lib/env'
import {
  buildLineStringFeatures,
  buildPointFeatureCollection,
  getBoundsFromPoints,
} from '../../../lib/mapGeometry'
import type { BusRoute, Coordinates } from '../../../types/domain'

function getRouteBounds(route: BusRoute) {
  return route.segments.flatMap((segment) => segment)
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

const DRIVER_ROUTE_SOURCE_ID = 'driver-route'
const DRIVER_PRIMARY_SOURCE_ID = 'driver-primary-position'
const DRIVER_SHARED_SOURCE_ID = 'driver-shared-position'

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
  const mapRef = useRef<maplibregl.Map | null>(null)
  const lastFittedRouteIdRef = useRef<string | null>(null)
  const [isMapReady, setMapReady] = useState(false)

  const primaryPosition = livePosition ?? lastSharedPosition ?? null
  const routeBoundsPoints = useMemo(
    () => (route ? getRouteBounds(route) : []),
    [route],
  )
  const routeFeatureCollection = useMemo(
    () => buildLineStringFeatures(route?.segments ?? []),
    [route],
  )
  const primaryFeatureCollection = useMemo(
    () =>
      buildPointFeatureCollection(
        route && (primaryPosition ?? route.segments[0]?.[0] ?? null)
          ? [
              {
                coordinates: primaryPosition ?? route.segments[0][0],
                properties: {
                  label: 'Tu ubicacion actual',
                },
              },
            ]
          : [],
      ),
    [primaryPosition, route],
  )
  const sharedFeatureCollection = useMemo(
    () =>
      buildPointFeatureCollection(
        lastSharedPosition &&
          primaryPosition &&
          !areCoordinatesEqual(lastSharedPosition, primaryPosition)
          ? [
              {
                coordinates: lastSharedPosition,
                properties: {
                  label: 'Ultima ubicacion compartida',
                },
              },
            ]
          : [],
      ),
    [lastSharedPosition, primaryPosition],
  )

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyleUrl,
      center: mapInitialCenter,
      zoom: mapInitialZoom,
      maxZoom: mapMaxZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })

    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-left')
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: mapAttribution,
      }),
      'bottom-right',
    )

    const handleLoad = () => {
      setMapReady(true)
    }

    map.on('load', handleLoad)

    return () => {
      map.off('load', handleLoad)
      map.remove()
      mapRef.current = null
      lastFittedRouteIdRef.current = null
      setMapReady(false)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isMapReady) {
      return
    }

    if (!map.getSource(DRIVER_ROUTE_SOURCE_ID)) {
      map.addSource(DRIVER_ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: routeFeatureCollection,
      })

      map.addLayer({
        id: `${DRIVER_ROUTE_SOURCE_ID}-casing`,
        type: 'line',
        source: DRIVER_ROUTE_SOURCE_ID,
        paint: {
          'line-color': '#082f49',
          'line-width': 9,
          'line-opacity': 0.16,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      })

      map.addLayer({
        id: `${DRIVER_ROUTE_SOURCE_ID}-line`,
        type: 'line',
        source: DRIVER_ROUTE_SOURCE_ID,
        paint: {
          'line-color': route?.color ?? '#0f766e',
          'line-width': 6,
          'line-opacity': 0.92,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      })
    }

    if (!map.getSource(DRIVER_PRIMARY_SOURCE_ID)) {
      map.addSource(DRIVER_PRIMARY_SOURCE_ID, {
        type: 'geojson',
        data: primaryFeatureCollection,
      })

      map.addLayer({
        id: `${DRIVER_PRIMARY_SOURCE_ID}-halo`,
        type: 'circle',
        source: DRIVER_PRIMARY_SOURCE_ID,
        paint: {
          'circle-radius': 18,
          'circle-color': '#60a5fa',
          'circle-opacity': 0.18,
        },
      })

      map.addLayer({
        id: `${DRIVER_PRIMARY_SOURCE_ID}-circle`,
        type: 'circle',
        source: DRIVER_PRIMARY_SOURCE_ID,
        paint: {
          'circle-radius': 9,
          'circle-color': '#60a5fa',
          'circle-stroke-color': '#1d4ed8',
          'circle-stroke-width': 3,
        },
      })
    }

    if (!map.getSource(DRIVER_SHARED_SOURCE_ID)) {
      map.addSource(DRIVER_SHARED_SOURCE_ID, {
        type: 'geojson',
        data: sharedFeatureCollection,
      })

      map.addLayer({
        id: `${DRIVER_SHARED_SOURCE_ID}-circle`,
        type: 'circle',
        source: DRIVER_SHARED_SOURCE_ID,
        paint: {
          'circle-radius': 6,
          'circle-color': '#2dd4bf',
          'circle-stroke-color': '#0f766e',
          'circle-stroke-width': 2,
          'circle-opacity': 0.88,
        },
      })
    }
  }, [isMapReady, primaryFeatureCollection, route?.color, routeFeatureCollection, sharedFeatureCollection])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !isMapReady) {
      return
    }

    ;(map.getSource(DRIVER_ROUTE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      routeFeatureCollection,
    )
    ;(map.getSource(DRIVER_PRIMARY_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      primaryFeatureCollection,
    )
    ;(map.getSource(DRIVER_SHARED_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      sharedFeatureCollection,
    )

    if (map.getLayer(`${DRIVER_ROUTE_SOURCE_ID}-line`)) {
      map.setPaintProperty(
        `${DRIVER_ROUTE_SOURCE_ID}-line`,
        'line-color',
        route?.color ?? '#0f766e',
      )
    }
  }, [
    isMapReady,
    primaryFeatureCollection,
    route?.color,
    routeFeatureCollection,
    sharedFeatureCollection,
  ])

  useEffect(() => {
    const map = mapRef.current
    const bounds = getBoundsFromPoints(routeBoundsPoints)

    if (!map || !route || !bounds) {
      return
    }

    if (lastFittedRouteIdRef.current !== route.id) {
      map.fitBounds(bounds, {
        padding: {
          top: 24,
          right: 24,
          bottom: 24,
          left: 24,
        },
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
