import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { BusRoute, TransportType } from '../../../types/domain'
import type { PassengerRouteGroup } from './passengerMapViewUtils'
import {
  formatDistanceRange,
  getTransportTypeLabel,
} from './passengerMapViewUtils'

function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

export function PassengerMapEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="panel px-4 py-5 sm:px-6 sm:py-6">
      <p className="eyebrow">Mapa</p>
      <h2 className="mt-3 font-display text-xl text-slate-900 sm:text-2xl">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
    </section>
  )
}

export function PassengerMapInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-950/35 p-4 backdrop-blur-[2px] sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ayuda del mapa"
          className="panel w-full max-w-md px-5 py-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Ayuda</p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">Como usar el mapa</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Cerrar ayuda"
            >
              X
            </button>
          </div>

          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <p>Elige una ruta para limpiar el ruido visual y ver solo sus unidades.</p>
            <p>Si activas ubicacion, CaboBus puede sugerirte rutas cercanas sin obligarte a seguir el mapa todo el tiempo.</p>
            <p>La lista lateral tambien funciona como vista rapida para usuarios que prefieren leer rutas y unidades.</p>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

export function PassengerRouteInfoModal({
  route,
  onClose,
}: {
  route: BusRoute
  onClose: () => void
}) {
  const routeDetails = route.passengerInfo

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-950/35 p-4 backdrop-blur-[2px] sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Informacion de ${route.name}`}
          className="panel w-full max-w-md px-5 py-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Informacion de ruta</p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">{route.name}</h2>
              <p className="mt-2 text-sm text-slate-600">{getTransportTypeLabel(route.transportType)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Cerrar informacion de ruta"
            >
              X
            </button>
          </div>

          <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
              Trayecto
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{routeDetails.summary}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Inicio
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {routeDetails.startTime ?? 'No disponible'}
              </p>
            </div>
            <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Finaliza
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {routeDetails.endTime ?? 'No disponible'}
              </p>
            </div>
            <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Frecuencia
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {routeDetails.frequency ?? 'No disponible'}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
              Colonias y puntos clave
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {routeDetails.landmarks.length > 0 ? (
                routeDetails.landmarks.map((stop) => (
                  <span
                    key={stop}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                  >
                    {stop}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500">
                  No hay detalle adicional disponible.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

export function PassengerRoutePickerModal({
  isOpen,
  activeTransportType,
  routeGroups,
  selectedRouteId,
  routeSearchTerm,
  routeDistanceById,
  vehicleStatsByRoute,
  showOnlyRoutesWithVisibleVehicles,
  onClose,
  onRouteSearchTermChange,
  onToggleShowOnlyRoutesWithVisibleVehicles,
  onTransportTypeChange,
  onRouteSelect,
  onClearSelection,
  onClearSearch,
}: {
  isOpen: boolean
  activeTransportType: TransportType
  routeGroups: PassengerRouteGroup[]
  selectedRouteId: string | null
  routeSearchTerm: string
  routeDistanceById: Map<string, number | null>
  vehicleStatsByRoute: Map<string, { visible: number; stopped: number }>
  showOnlyRoutesWithVisibleVehicles: boolean
  onClose: () => void
  onRouteSearchTermChange: (value: string) => void
  onToggleShowOnlyRoutesWithVisibleVehicles: () => void
  onTransportTypeChange: (transportType: TransportType) => void
  onRouteSelect: (routeId: string) => void
  onClearSelection: () => void
  onClearSearch: () => void
}) {
  if (!isOpen) {
    return null
  }

  const activeGroup =
    routeGroups.find((group) => group.transportType === activeTransportType) ??
    routeGroups[0] ??
    null

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:p-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Seleccionar ruta"
          className="panel max-h-[88svh] w-full max-w-xl rounded-b-none px-4 py-4 sm:max-h-[80svh] sm:rounded-[1.8rem] sm:px-5 sm:py-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Rutas</p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">
                Elige el tipo y la ruta
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Esta vista esta pensada para encontrar una ruta rapido incluso sin mirar el mapa.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Cerrar selector de ruta"
            >
              X
            </button>
          </div>

          <div className="mt-4 inline-flex rounded-full bg-slate-100 p-1">
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

          <div className="mt-4 space-y-2">
            <label className="block">
              <span className="sr-only">Buscar ruta</span>
              <input
                type="text"
                value={routeSearchTerm}
                onChange={(event) => onRouteSearchTermChange(event.target.value)}
                placeholder="Buscar ruta, colonia o punto clave"
                className="w-full rounded-[1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-teal-400"
              />
            </label>

            <div className="flex flex-wrap gap-2">
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
                  ? 'Solo rutas con unidades visibles'
                  : 'Mostrar solo rutas con unidades visibles'}
              </button>

              {routeSearchTerm ? (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                >
                  Limpiar busqueda
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 max-h-[48svh] space-y-3 overflow-y-auto pr-1">
            {activeGroup?.routes.map((route) => {
              const isSelected = route.id === selectedRouteId
              const routeStats = vehicleStatsByRoute.get(route.id) ?? { visible: 0, stopped: 0 }
              const distanceMeters = routeDistanceById.get(route.id) ?? null

              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => onRouteSelect(route.id)}
                  className={`w-full rounded-[1.3rem] border bg-white px-4 py-4 text-left shadow-sm transition ${
                    isSelected
                      ? 'border-slate-900 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.6)]'
                      : 'border-slate-200 hover:border-teal-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className="block h-2.5 w-14 rounded-full"
                        style={{ backgroundColor: route.color }}
                      />
                      <span className="mt-3 block font-display text-lg text-slate-900">
                        {route.name}
                      </span>
                      <span className="mt-2 line-clamp-2 block text-sm leading-6 text-slate-600">
                        {route.passengerInfo.summary}
                      </span>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {distanceMeters === null
                        ? `${routeStats.visible} activas`
                        : distanceMeters <= 600
                          ? 'Cerca'
                          : formatDistanceRange(distanceMeters)}
                    </span>
                  </div>
                </button>
              )
            })}

            {activeGroup && activeGroup.routes.length === 0 ? (
              <div className="w-full rounded-[1.25rem] border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                No hay rutas disponibles con los filtros actuales.
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClearSelection}
              className="text-sm font-semibold text-slate-600 transition hover:text-slate-900"
            >
              Ver mapa general
            </button>
            <p className="text-xs text-slate-500">Toca una ruta para enfocarla.</p>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
