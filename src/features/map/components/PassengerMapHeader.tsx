import { memo } from 'react'
import { Link } from 'react-router'
import type { BusRoute } from '../../../types/domain'

function RouteListIcon() {
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
      <path d="M9 6h10" />
      <path d="M9 12h10" />
      <path d="M9 18h10" />
      <circle cx="5" cy="6" r="1.25" />
      <circle cx="5" cy="12" r="1.25" />
      <circle cx="5" cy="18" r="1.25" />
    </svg>
  )
}

export const PassengerMapHeader = memo(function PassengerMapHeader({
  visibleVehiclesCount,
  activeRoutesCount,
  personalRoutes,
  onOpenRoutes,
  onOpenPersonalRoute,
}: {
  visibleVehiclesCount: number
  activeRoutesCount: number
  personalRoutes: BusRoute[]
  onOpenRoutes: () => void
  onOpenPersonalRoute: (routeId: string) => void
}) {
  return (
    <header className="panel px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-1 transition hover:border-teal-300"
            aria-label="Volver al inicio"
          >
            <img
              src="/logo.png"
              alt="CaboBus"
              className="h-12 w-16 object-contain"
            />
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenRoutes}
              className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-teal-700"
            >
              <RouteListIcon />
              Rutas
            </button>
            
            <Link
              to="/"
              className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700"
            >
              Regresar
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800">
            {activeRoutesCount} ruta{activeRoutesCount === 1 ? '' : 's'} con servicio
          </span>
          <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800">
            {visibleVehiclesCount} unidad{visibleVehiclesCount === 1 ? '' : 'es'} visible
            {visibleVehiclesCount === 1 ? '' : 's'}
            {' '}
          </span>
        </div>

        {personalRoutes.length > 0 ? (
          <div className="rounded-[1rem] border border-slate-200 bg-slate-50/90 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Tus rutas
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Acceso rapido a tus rutas mas usadas.
                </p>
              </div>
            </div>

            <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2">
                {personalRoutes.map((route) => (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => onOpenPersonalRoute(route.id)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: route.color }}
                    />
                    <span className="max-w-[11rem] truncate">{route.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
})
