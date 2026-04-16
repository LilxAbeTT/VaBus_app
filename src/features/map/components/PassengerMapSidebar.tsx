import type { BusRoute, TransportType } from '../../../types/domain'
import type { PassengerGeolocationPermissionState } from '../hooks/usePassengerGeolocation'
import type {
  PassengerLocationStatusCopy,
  PassengerRouteDistanceEntry,
  PassengerRouteGroup,
} from './passengerMapViewUtils'
import {
  formatDistanceRange,
  getRouteDistanceTone,
  getTransportTypeLabel,
} from './passengerMapViewUtils'

function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="M5 16l.9 2.1L8 19l-2.1.9L5 22l-.9-2.1L2 19l2.1-.9L5 16Z" />
      <path d="M19 14l.7 1.3L21 16l-1.3.7L19 18l-.7-1.3L17 16l1.3-.7L19 14Z" />
    </svg>
  )
}

function DistanceIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12h16" />
      <path d="M8 8l-4 4 4 4" />
      <path d="M16 8l4 4-4 4" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s5-4.4 5-9a5 5 0 1 0-10 0c0 4.6 5 9 5 9Z" />
      <circle cx="12" cy="12" r="1.8" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 10v5" />
      <path d="M12 7.25h.01" />
    </svg>
  )
}

function BusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 5h10a3 3 0 0 1 3 3v6a2 2 0 0 1-2 2h-1a2 2 0 0 1-4 0h-2a2 2 0 0 1-4 0H6a2 2 0 0 1-2-2V8a3 3 0 0 1 3-3Z" />
      <path d="M7 5V3.5" />
      <path d="M17 5V3.5" />
      <path d="M6.5 9.5h11" />
      <path d="M8 12.5h.01" />
      <path d="M16 12.5h.01" />
    </svg>
  )
}

export function PassengerMapSidebar({
  routeGroups,
  activeTransportType,
  activeRouteGroup,
  hasTransportTypeFilter,
  recommendedRoute,
  permissionState,
  locationStatusCopy,
  selectedRoute,
  routeDistanceById,
  vehicleStatsByRoute,
  routeSearchTerm,
  showOnlyRoutesWithVisibleVehicles,
  canResetView,
  onRequestPermission,
  onFocusRecommended,
  onRouteSearchTermChange,
  onToggleShowOnlyRoutesWithVisibleVehicles,
  onTransportTypeChange,
  onResetView,
  onToggleRoute,
  onShowRouteInfo,
}: {
  routeGroups: PassengerRouteGroup[]
  activeTransportType: TransportType
  activeRouteGroup: PassengerRouteGroup | null
  hasTransportTypeFilter: boolean
  recommendedRoute: PassengerRouteDistanceEntry | null
  permissionState: PassengerGeolocationPermissionState
  locationStatusCopy: PassengerLocationStatusCopy
  selectedRoute: BusRoute | null
  routeDistanceById: Map<string, number | null>
  vehicleStatsByRoute: Map<string, { visible: number; stopped: number }>
  routeSearchTerm: string
  showOnlyRoutesWithVisibleVehicles: boolean
  canResetView: boolean
  onRequestPermission: () => void
  onFocusRecommended: () => void
  onRouteSearchTermChange: (value: string) => void
  onToggleShowOnlyRoutesWithVisibleVehicles: () => void
  onTransportTypeChange: (transportType: TransportType) => void
  onResetView: () => void
  onToggleRoute: (routeId: string) => void
  onShowRouteInfo: (routeId: string) => void
}) {
  const recommendedRouteDetails =
    permissionState === 'granted' ? recommendedRoute : null
  const hasRecommendedRoute = recommendedRouteDetails !== null
  const recommendedDistanceLabel =
    recommendedRouteDetails?.distanceMeters !== null && recommendedRouteDetails
      ? recommendedRouteDetails.distanceMeters <= 600
        ? 'Muy cerca de ti'
        : formatDistanceRange(recommendedRouteDetails.distanceMeters)
      : null

  return (
    <section className="panel overflow-hidden px-3 py-3 sm:px-4">
      <div className="overflow-hidden rounded-[1.4rem] border border-teal-200 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.18),_transparent_48%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.16),_transparent_42%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(240,249,255,0.94))] px-4 py-4 shadow-[0_24px_45px_-32px_rgba(15,23,42,0.45)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-700 shadow-sm">
              <SparkIcon />
              {hasTransportTypeFilter ? 'Ruta más cercana' : 'Ruta sugerida'}
            </span>
            <p className="mt-3 font-display text-2xl text-slate-900">
              {hasRecommendedRoute
                ? recommendedRouteDetails.route.name
                : locationStatusCopy.title}
            </p>
          </div>
          {hasRecommendedRoute ? (
            <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              {getTransportTypeLabel(recommendedRouteDetails.route.transportType)}
            </span>
          ) : null}
        </div>

        {hasRecommendedRoute ? (
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center gap-3 rounded-[1.1rem] bg-white/80 px-3 py-2.5 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <DistanceIcon />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Distancia
                </p>
                <p className="truncate text-sm font-semibold text-slate-900">
                  {recommendedDistanceLabel ?? 'Calculando cercanía'}
                </p>
              </div>
            </div>

        
          </div>
        ) : (
          <div className="mt-4 rounded-[1.1rem] bg-white/80 px-3 py-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                <LocationIcon />
              </div>
              <p className="text-sm leading-6 text-slate-600">
                {locationStatusCopy.description}
              </p>
            </div>
          </div>
        )}

        {hasRecommendedRoute ? (
          <button
            type="button"
            onClick={onFocusRecommended}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            Ver esta ruta
            <ArrowIcon />
          </button>
        ) : null}

        {permissionState !== 'granted' && permissionState !== 'unsupported' ? (
          <button
            type="button"
            onClick={onRequestPermission}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            <LocationIcon />
            Activar ubicación
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-slate-100 p-1">
          {routeGroups.map((group) => (
            <button
              key={group.transportType}
              type="button"
              onClick={() => onTransportTypeChange(group.transportType)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                group.transportType === activeTransportType
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {group.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onResetView}
          disabled={!canResetView}
          className="text-sm font-semibold text-slate-500 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          General
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <label className="block">
          <span className="sr-only">Buscar ruta</span>
          <input
            type="text"
            value={routeSearchTerm}
            onChange={(event) => onRouteSearchTermChange(event.target.value)}
            placeholder="Buscar ruta o trayecto"
            className="w-full rounded-[1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-teal-400"
          />
        </label>

        <button
          type="button"
          onClick={onToggleShowOnlyRoutesWithVisibleVehicles}
          className={`inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition ${
            showOnlyRoutesWithVisibleVehicles
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {showOnlyRoutesWithVisibleVehicles
            ? 'Mostrando solo rutas con unidades activas'
            : 'Mostrar solo rutas con unidades activas'}
        </button>
      </div>

      <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden xl:pb-0">
        {activeRouteGroup?.routes.map((route) => {
          const isSelected = route.id === selectedRoute?.id
          const routeStats = vehicleStatsByRoute.get(route.id) ?? {
            visible: 0,
            stopped: 0,
          }
          const distanceMeters = routeDistanceById.get(route.id) ?? null
          const distanceLabel =
            distanceMeters === null
              ? null
              : distanceMeters <= 600
                ? 'Cerca de ti'
                : formatDistanceRange(distanceMeters)

          return (
            <article
              key={route.id}
              className={`min-w-[190px] snap-start rounded-[1.45rem] border bg-white px-4 py-4 text-left shadow-[0_16px_28px_-24px_rgba(15,23,42,0.45)] transition xl:min-w-0 ${
                isSelected
                  ? 'border-slate-900 shadow-[0_20px_34px_-24px_rgba(15,23,42,0.62)]'
                  : 'border-slate-200 hover:border-teal-300 hover:shadow-[0_20px_34px_-24px_rgba(15,23,42,0.45)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onToggleRoute(route.id)}
                  className="flex-1 text-left"
                >
                  <span
                    className="block h-2.5 w-18 rounded-full"
                    style={{ backgroundColor: route.color }}
                  />
                  <span className="mt-3 block font-display text-xl text-slate-900">
                    {route.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onShowRouteInfo(route.id)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  aria-label={`Ver información de ${route.name}`}
                  title="Información de ruta"
                >
                  <InfoIcon />
                </button>
              </div>
              <div className="mt-4 space-y-2.5">
                {distanceLabel ? (
                  <div
                    className={`flex items-center gap-2 rounded-[1rem] px-3 py-2 text-xs font-semibold ${getRouteDistanceTone(
                      distanceMeters,
                    )}`}
                  >
                    <DistanceIcon />
                    <span>{distanceLabel}</span>
                  </div>
                ) : null}

                <div className="flex items-center gap-2 rounded-[1rem] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  <BusIcon />
                  <span>
                    {routeStats.visible} unidad
                    {routeStats.visible === 1 ? '' : 'es'} visible
                    {routeStats.visible === 1 ? '' : 's'}
                  </span>
                </div>

                {routeStats.stopped > 0 ? (
                  <div className="flex items-center gap-2 rounded-[1rem] bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    <LocationIcon />
                    <span>
                      {routeStats.stopped} detenida
                      {routeStats.stopped === 1 ? '' : 's'}
                    </span>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onToggleRoute(route.id)}
                className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                  isSelected
                    ? 'border border-amber-400 bg-amber-50 text-slate-800'
                    : 'bg-slate-900 text-white hover:bg-teal-700'
                }`}
              >
                {isSelected ? 'Ruta seleccionada' : 'Ver en el mapa'}
                {isSelected ? null : <ArrowIcon />}
              </button>
            </article>
          )
        })}

        {activeRouteGroup && activeRouteGroup.routes.length === 0 ? (
          <div className="w-full rounded-[1.25rem] border border-dashed border-slate-200 bg-white/80 px-4 py-5 text-sm text-slate-500">
            No hay rutas que coincidan con tus filtros actuales.
          </div>
        ) : null}
      </div>
    </section>
  )
}
