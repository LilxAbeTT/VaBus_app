import { Link, Navigate } from 'react-router'
import { isNativeApp } from '../lib/platform'

const passengerAccess = {
  title: 'Mapa para pasajeros',
  href: '/passenger-map',
  description: 'Consulta rutas activas y unidades de San José del Cabo en tiempo real.',
  actionLabel: 'Ver mapa',
}

const driverAccess = {
  title: 'Ingreso para conductor',
  href: '/driver/login',
  description: 'Inicia sesión para elegir ruta y compartir ubicación en tiempo real.',
  actionLabel: 'Entrar como conductor',
}

function BusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M7 4.75h10c2.07 0 3.75 1.68 3.75 3.75v5.75A2.75 2.75 0 0 1 18 17h-1.1a1.9 1.9 0 0 1-3.8 0h-2.2a1.9 1.9 0 0 1-3.8 0H6A2.75 2.75 0 0 1 3.25 14.25V8.5C3.25 6.43 4.93 4.75 7 4.75Z"
        fill="currentColor"
        opacity="0.14"
      />
      <path
        d="M7 4.75h10c2.07 0 3.75 1.68 3.75 3.75v5.75A2.75 2.75 0 0 1 18 17h-1.1a1.9 1.9 0 0 1-3.8 0h-2.2a1.9 1.9 0 0 1-3.8 0H6A2.75 2.75 0 0 1 3.25 14.25V8.5C3.25 6.43 4.93 4.75 7 4.75Zm0 0V3.25M17 4.75V3.25M6.5 9.25h11m-10 3h1m7 0h1M8.2 17a.4.4 0 1 0 0 .8a.4.4 0 0 0 0-.8Zm7.6 0a.4.4 0 1 0 0 .8a.4.4 0 0 0 0-.8Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function HomePage() {
  if (isNativeApp) {
    return <Navigate to="/driver/login" replace />
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl items-center justify-center">
      <div className="panel relative w-full overflow-hidden">
        <div className="absolute -left-12 top-14 h-40 w-40 rounded-full bg-teal-200/40 blur-3xl" />
        <div className="absolute -right-10 top-8 h-36 w-36 rounded-full bg-amber-200/45 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-28 w-56 -translate-x-1/2 rounded-full bg-cyan-100/40 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400" />

        <div className="relative px-4 py-6 sm:px-8 sm:py-8">
          <div className="text-center">
            <img
              src="/logo.png"
              alt="CaboBus"
              className="mx-auto h-44 w-72 object-contain sm:h-52 sm:w-80"
            />
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50/90 px-3 py-1.5 text-xs font-semibold text-teal-800">
                <BusIcon />
                San José del Cabo, BCS
              </span>
              
            </div>
          </div>

          <div className="mt-6 space-y-4 sm:mt-8">
            <article className="rounded-[2rem] border border-white/90 bg-gradient-to-br from-teal-100 via-cyan-50 to-white p-5 text-left shadow-[0_24px_45px_-30px_rgba(15,35,54,0.38)] sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="mt-3 font-display text-3xl text-slate-900">
                    {passengerAccess.title}
                  </h2>
                </div>
                
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                {passengerAccess.description}
              </p>
              
              <Link
                to={passengerAccess.href}
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 sm:mt-6"
              >
                {passengerAccess.actionLabel}
                <ArrowIcon />
              </Link>
            </article>

            <Link
              to={driverAccess.href}
              className="group block rounded-[1.75rem] border border-amber-100 bg-gradient-to-r from-white via-white to-amber-50/70 p-4 shadow-[0_18px_35px_-28px_rgba(148,84,21,0.4)] transition hover:border-amber-200 hover:shadow-[0_22px_40px_-28px_rgba(148,84,21,0.48)] sm:p-5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <BusIcon />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">
                    Conductor
                  </p>
                  <h3 className="mt-1 font-display text-xl text-slate-900 sm:text-2xl">
                    {driverAccess.title}
                  </h3>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                {driverAccess.description}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-[1.25rem] bg-slate-900 px-4 py-3 text-white transition group-hover:bg-amber-500">
                <span className="text-sm font-semibold">{driverAccess.actionLabel}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/14">
                  <ArrowIcon />
                </span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
