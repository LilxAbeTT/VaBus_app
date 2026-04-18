import { useMemo } from 'react'
import { Link, Navigate } from 'react-router'
import { usePassengerMapSnapshot } from '../features/map/hooks/usePassengerMapSnapshot'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { convexUrl } from '../lib/env'
import { isNativeApp } from '../lib/platform'
import type { BusRoute, PassengerMapVehicle } from '../types/domain'

const HOME_ROUTE_REFRESH_INTERVAL_MS = 15_000

const passengerAccess = {
  title: 'Mapa para pasajeros',
  href: '/passenger-map',
  description:
    'Consulta rutas activas y unidades de San Jos\u00e9 del Cabo en tiempo real.',
  actionLabel: 'Ver mapa',
}

const driverAccess = {
  title: 'Conductor',
  href: '/driver/login',
  description: 'Inicia sesi\u00f3n, elige ruta y comparte ubicaci\u00f3n en tiempo real.',
  actionLabel: 'Entrar como conductor',
}

function BusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5">
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

function RouteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M5 18c0-1.1.9-2 2-2h1l2-8h4l2 8h1a2 2 0 1 1 0 4H7a2 2 0 0 1-2-2Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M7 18h10M10 8h4M9.5 16l1-8m4 8-1-8M7 18a2 2 0 1 0 0 4m10-4a2 2 0 1 1 0 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.14" />
      <path
        d="M12 10.25v5m0-8.5h.01"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function PassengerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <circle cx="12" cy="7.5" r="3" fill="currentColor" opacity="0.14" />
      <path
        d="M6.5 18.5a5.5 5.5 0 0 1 11 0M12 10.5a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function DriverIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M5 17.5a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 17.5v1.5H5v-1.5Z"
        fill="currentColor"
        opacity="0.14"
      />
      <path
        d="M8.5 9.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 0 0-7 0Zm-3.5 9v-1a2.5 2.5 0 0 1 2.5-2.5h9a2.5 2.5 0 0 1 2.5 2.5v1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M4 17.5a8 8 0 0 1 16 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M7.5 17.5a4.5 4.5 0 0 1 9 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="17.5" r="1.25" fill="currentColor" />
    </svg>
  )
}

function getTransportTypeLabel(transportType: BusRoute['transportType']) {
  return transportType === 'colectivo' ? 'Colectivo' : 'Urbano'
}

function formatCompactRelativeTime(value: string | null) {
  if (!value) return 'Sin señal'

  const elapsedSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  )

  if (elapsedSeconds < 60) {
    return 'Ahora'
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60)

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min`
  }

  return `${Math.round(elapsedMinutes / 60)} h`
}

function scrollToAboutSection() {
  document
    .getElementById('home-about-cabobus')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function HomeRoutesCarouselFallback() {
  return (
    <div className="rounded-[1.25rem] border border-white/70 bg-white/80 px-3 py-3 shadow-[0_14px_24px_-24px_rgba(15,35,54,0.34)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-teal-700">
          Rutas activas
        </p>
        <Link
          to={passengerAccess.href}
          className="inline-flex min-h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[0.72rem] font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700"
        >
          Abrir mapa
        </Link>
      </div>
    </div>
  )
}

type HomeRouteEntry = {
  route: BusRoute
  visibleVehicleCount: number
  latestVehicleUpdate: string | null
}

function buildHomeRouteEntries(routes: BusRoute[], activeVehicles: PassengerMapVehicle[]) {
  const groupedVehicles = new Map<string, PassengerMapVehicle[]>()

  activeVehicles.forEach((vehicle) => {
    const current = groupedVehicles.get(vehicle.routeId) ?? []
    current.push(vehicle)
    groupedVehicles.set(vehicle.routeId, current)
  })

  return routes
    .map((route) => {
      const routeVehicles = groupedVehicles.get(route.id) ?? []
      const latestVehicleUpdate =
        routeVehicles
          .map((vehicle) => vehicle.lastUpdate)
          .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ??
        null

      return {
        route,
        visibleVehicleCount: routeVehicles.length,
        latestVehicleUpdate,
      } satisfies HomeRouteEntry
    })
    .sort((left, right) => {
      if (right.visibleVehicleCount !== left.visibleVehicleCount) {
        return right.visibleVehicleCount - left.visibleVehicleCount
      }

      if (left.latestVehicleUpdate && right.latestVehicleUpdate) {
        return (
          new Date(right.latestVehicleUpdate).getTime() -
          new Date(left.latestVehicleUpdate).getTime()
        )
      }

      if (left.latestVehicleUpdate) return -1
      if (right.latestVehicleUpdate) return 1

      return left.route.name.localeCompare(right.route.name, 'es')
    })
}

function HomeRoutesCarousel() {
  const currentTimeMs = useCurrentTime(HOME_ROUTE_REFRESH_INTERVAL_MS)
  const snapshot = usePassengerMapSnapshot(currentTimeMs)

  const routeEntries = useMemo(
    () =>
      snapshot
        ? buildHomeRouteEntries(snapshot.routes, snapshot.activeVehicles).slice(0, 12)
        : [],
    [snapshot],
  )

  if (snapshot === undefined) {
    return (
      <div className="rounded-[1.25rem] border border-white/70 bg-white/80 px-3 py-3 shadow-[0_14px_24px_-24px_rgba(15,35,54,0.34)] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-teal-700">
            Rutas activas
          </p>
          <div className="h-6 w-16 animate-pulse rounded-full bg-slate-200/80" />
        </div>
        <div className="mt-2.5 flex gap-2 overflow-hidden">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-16 min-w-[9.5rem] animate-pulse rounded-[1rem] bg-slate-200/75"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <section className="rounded-[1.25rem] border border-white/72 bg-white/80 px-3 py-3 shadow-[0_14px_24px_-24px_rgba(15,35,54,0.34)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-teal-700">
          Rutas activas
        </p>
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[0.64rem] font-semibold text-white">
          {snapshot.activeVehicles.length} unidades
        </span>
      </div>

      <div className="mt-2 flex snap-x gap-1 overflow-x-auto pb-1">
        {routeEntries.map((entry) => (
          <Link
            key={entry.route.id}
            to={`/passenger-map?route=${encodeURIComponent(entry.route.id)}`}
            className="group min-w-[9.75rem] snap-start rounded-[1rem] border border-slate-200/80 bg-gradient-to-br from-white via-white to-teal-50/70 px-2.5 py-2 text-left shadow-[0_12px_20px_-22px_rgba(15,35,54,0.34)] transition hover:-translate-y-0.5 hover:border-teal-300"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-900"
                style={{
                  backgroundColor: `${entry.route.color}22`,
                  color: entry.route.color,
                }}
              >
              </span>
              <span className="rounded-full bg-slate-900 px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-white">
                {getTransportTypeLabel(entry.route.transportType)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                <BusIcon />
                {entry.visibleVehicleCount}
              </span>
            </div>

            <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-[0.86rem] font-semibold leading-5 text-slate-900">
              {entry.route.name}
            </p>

            <div className="mt-1.5 flex items-center gap-1 text-[0.68rem] font-semibold text-slate-500">
              <SignalIcon />
              {formatCompactRelativeTime(entry.latestVehicleUpdate)}
            </div>

          </Link>
        ))}
      </div>
    </section>
  )
}

function HomeConnectedRoutesCarousel() {
  if (!convexUrl) {
    return <HomeRoutesCarouselFallback />
  }

  return <HomeRoutesCarousel />
}

function HomeAboutSection() {
  return (
    <section
      id="home-about-cabobus"
      className="rounded-[2rem] border border-slate-900/10 bg-[linear-gradient(135deg,rgba(14,116,144,0.98),rgba(8,47,73,0.96))] p-5 text-white shadow-[0_28px_52px_-34px_rgba(8,47,73,0.9)] sm:p-6"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-cyan-100/88">
            {'Qué es CaboBus'}
          </p>
          <h2 className="mt-3 font-display text-3xl text-white sm:text-[2.15rem]">
            {'Rutas reales, visibilidad rápida y acceso claro.'}
          </h2>
          
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-3 lg:w-[27rem]">
          <div className="rounded-[1.35rem] border border-white/14 bg-white/10 p-3.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 text-cyan-100">
              <PassengerIcon />
            </span>
            <p className="mt-3 font-semibold text-white">{'Mapa público'}</p>
            <p className="mt-1 text-cyan-50/80">{'Consulta rápida desde el celular.'}</p>
          </div>
          <div className="rounded-[1.35rem] border border-white/14 bg-white/10 p-3.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 text-cyan-100">
              <SignalIcon />
            </span>
            <p className="mt-3 font-semibold text-white">{'Señal en vivo'}</p>
            <p className="mt-1 text-cyan-50/80">Rutas y unidades activas visibles.</p>
          </div>
          <div className="rounded-[1.35rem] border border-white/14 bg-white/10 p-3.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 text-cyan-100">
              <DriverIcon />
            </span>
            <p className="mt-3 font-semibold text-white">Flujo conductor</p>
            <p className="mt-1 text-cyan-50/80">{'Activa servicio y comparte ubicación.'}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.35rem] border border-white/12 bg-white/8 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/88">
            1
          </p>
          <p className="mt-2 font-semibold text-white">Elige una ruta</p>
          <p className="mt-1 text-sm text-cyan-50/78">Desde el carrusel o el mapa.</p>
        </div>
        <div className="rounded-[1.35rem] border border-white/12 bg-white/8 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/88">
            2
          </p>
          <p className="mt-2 font-semibold text-white">Ubica la unidad</p>
          <p className="mt-1 text-sm text-cyan-50/78">{'Ve proximidad y última señal.'}</p>
        </div>
        <div className="rounded-[1.35rem] border border-white/12 bg-white/8 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/88">
            3
          </p>
          <p className="mt-2 font-semibold text-white">Sigue el servicio</p>
          <p className="mt-1 text-sm text-cyan-50/78">{'Sin menús pesados ni pasos extra.'}</p>
        </div>
      </div>
    </section>
  )
}

export function HomePage() {
  if (isNativeApp) {
    return <Navigate to="/driver/login" replace />
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl items-start justify-center">
      <div className="panel relative w-full overflow-hidden border border-white/82 bg-[linear-gradient(180deg,rgba(255,251,245,0.98),rgba(239,246,255,0.96))]">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400" />
        <div className="absolute -left-16 top-8 h-44 w-44 rounded-full bg-teal-200/45 blur-3xl" />
        <div className="absolute -right-12 top-16 h-40 w-40 rounded-full bg-amber-200/50 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-28 w-72 -translate-x-1/2 rounded-full bg-cyan-100/45 blur-3xl" />

        <div className="relative space-y-3 px-4 py-4 sm:px-6 sm:py-6">
          <div className="rounded-[1.45rem] border border-white/65 bg-slate-950/[0.04] px-3 py-3">
            <div className="flex items-start justify-between gap-2.5">
              <img
                src="/logo.png"
                alt="CaboBus"
                className="h-12 w-24 shrink-0 object-contain sm:h-14 sm:w-28"
              />

              <div className="flex max-w-[14rem] flex-wrap justify-end gap-2">
                

                <button
                  type="button"
                  onClick={scrollToAboutSection}
                  className="inline-flex min-h-8 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-[0.72rem] font-semibold text-slate-700 shadow-[0_12px_20px_-24px_rgba(15,23,42,0.45)] transition hover:border-teal-300 hover:text-teal-700"
                >
                  <InfoIcon />
                  {'Qué es CaboBus'}
                </button>
              </div>
            </div>

            <div className="mt-2.5">
              {HomeConnectedRoutesCarousel()}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.8fr)]">
            <article className="rounded-[1.8rem] border border-white/90 bg-gradient-to-br from-teal-100 via-cyan-50 to-white p-4 text-left shadow-[0_22px_38px_-30px_rgba(15,35,54,0.34)] sm:p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-[0_14px_26px_-20px_rgba(15,23,42,0.7)]">
                  <PassengerIcon />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-teal-800">
                    {'Acceso público'}
                  </p>
                  <h1 className="mt-1 font-display text-[2.05rem] leading-9 text-slate-900 sm:text-[2.2rem]">
                    {passengerAccess.title}
                  </h1>
                </div>
              </div>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                {passengerAccess.description}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/88 px-2.5 py-1.5 text-[0.68rem] font-semibold text-slate-700">
                  <RouteIcon />
                  Rutas reales
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/88 px-2.5 py-1.5 text-[0.68rem] font-semibold text-slate-700">
                  <SignalIcon />
                  Unidades activas
                </span>
                
              </div>

              <Link
                to={passengerAccess.href}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700"
              >
                {passengerAccess.actionLabel}
                <ArrowIcon />
              </Link>
            </article>

            <aside className="rounded-[1.7rem] border border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,255,255,0.94))] p-4 shadow-[0_18px_34px_-30px_rgba(148,84,21,0.4)] sm:p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <DriverIcon />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-amber-700">
                    Acceso operativo
                  </p>
                  <h2 className="mt-1 font-display text-[1.85rem] leading-8 text-slate-900">
                    {driverAccess.title}
                  </h2>
                </div>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                {driverAccess.description}
              </p>

              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <div className="flex items-center gap-2 rounded-[1.05rem] bg-white/85 px-3 py-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <BusIcon />
                  </span>
                  <span>Activa tu servicio</span>
                </div>
                <div className="flex items-center gap-2 rounded-[1.05rem] bg-white/85 px-3 py-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <SignalIcon />
                  </span>
                  <span>{'Comparte ubicación'}</span>
                </div>
              </div>

              <Link
                to={driverAccess.href}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-900 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-amber-400 hover:bg-amber-400/90"
              >
                {driverAccess.actionLabel}
                <ArrowIcon />
              </Link>
            </aside>
          </div>

          <HomeAboutSection />
        </div>
      </div>
    </section>
  )
}
