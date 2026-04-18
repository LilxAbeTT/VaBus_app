import { Link } from 'react-router'

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

export function PassengerMapHeader({
  selectedRouteName,
  visibleVehiclesCount,
  activeRoutesCount,
  onOpenRoutes,
}: {
  selectedRouteName: string | null
  visibleVehiclesCount: number
  activeRoutesCount: number
  onOpenRoutes: () => void
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
            {activeRoutesCount} ruta{activeRoutesCount === 1 ? '' : 's'} con servicio en esta vista
          </span>
          <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800">
            {visibleVehiclesCount} unidad{visibleVehiclesCount === 1 ? '' : 'es'} visible
            {visibleVehiclesCount === 1 ? '' : 's'}
            {' '}en el mapa
          </span>
          
          {selectedRouteName ? (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              Enfocada: {selectedRouteName}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  )
}
