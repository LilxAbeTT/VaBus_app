import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { BusRoute } from '../../../types/domain'
import {
  getTransportTypeLabel,
  hasRouteSchedule,
  parseRouteDirection,
} from './driverStatusCardUtils'

function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(children, document.body)
}

export function DriverPanelEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="panel px-4 py-5 sm:px-6 sm:py-6">
      <h2 className="mt-3 font-display text-xl text-slate-900 sm:text-2xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        {description}
      </p>
    </section>
  )
}

export function DriverRouteInfoModal({
  route,
  onClose,
  onReportMissingSchedule,
  isReportingMissingSchedule,
}: {
  route: BusRoute
  onClose: () => void
  onReportMissingSchedule: () => void
  isReportingMissingSchedule: boolean
}) {
  const routeDetails = parseRouteDirection(route.direction)
  const routeHasSchedule = hasRouteSchedule(route.direction)

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-950/35 p-4 backdrop-blur-[2px] sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Información de ${route.name}`}
          className="panel w-full max-w-md px-5 py-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Info de ruta</p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">
                {route.name}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {getTransportTypeLabel(route.transportType)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Cerrar información de ruta"
            >
              X
            </button>
          </div>

          <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
              Trayecto
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {routeDetails.summary}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Inicio
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {routeDetails.startTime ?? 'Pendiente'}
              </p>
            </div>
            <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Finaliza
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {routeDetails.endTime ?? 'Pendiente'}
              </p>
            </div>
            <div className="rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Frecuencia
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {routeDetails.frequency ?? 'Pendiente'}
              </p>
            </div>
          </div>

          {!routeHasSchedule ? (
            <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-sm font-semibold text-amber-900">
                Esta ruta no trae horario cargado en los datos actuales.
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                Puedes avisar a administración para que revise la importación o
                complete el horario operativo.
              </p>
              <button
                type="button"
                onClick={onReportMissingSchedule}
                disabled={isReportingMissingSchedule}
                className="mt-4 min-h-10 rounded-full border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-amber-100 disabled:text-amber-500"
              >
                {isReportingMissingSchedule ? 'Avisando...' : 'Notificar a admin'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  )
}

export function DriverRouteChangeModal({
  routes,
  currentRouteId,
  pendingRouteId,
  onPendingRouteChange,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  routes: BusRoute[]
  currentRouteId: string
  pendingRouteId: string
  onPendingRouteChange: (routeId: string) => void
  onClose: () => void
  onConfirm: () => void
  isSubmitting: boolean
}) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-950/35 p-4 backdrop-blur-[2px] sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cambiar ruta del conductor"
          className="panel w-full max-w-md px-5 py-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Cambio de ruta</p>
              <h2 className="mt-2 font-display text-2xl text-slate-900">
                Elige la nueva ruta
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Cerrar cambio de ruta"
            >
              X
            </button>
          </div>

          <div className="mt-4 rounded-[1.15rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Al confirmar, administración verá tu nuevo cambio de ruta.
          </div>

          <div className="mt-4 max-h-[48svh] space-y-2 overflow-y-auto pr-1">
            {routes.map((route) => {
              const isSelected = route.id === pendingRouteId
              const isCurrent = route.id === currentRouteId

              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => onPendingRouteChange(route.id)}
                  className={`w-full rounded-[1.2rem] border bg-white px-4 py-3 text-left transition ${
                    isSelected
                      ? 'border-slate-900 shadow-[0_18px_30px_-24px_rgba(15,23,42,0.6)]'
                      : 'border-slate-200 hover:border-teal-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className="block h-2.5 w-14 rounded-full"
                        style={{ backgroundColor: route.color }}
                      />
                      <p className="mt-2 truncate font-display text-lg text-slate-900">
                        {route.name}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {getTransportTypeLabel(route.transportType)}
                      </span>
                      {isCurrent ? (
                        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                          Actual
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting || pendingRouteId === currentRouteId}
              className="min-h-11 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? 'Guardando...' : 'Confirmar cambio'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
