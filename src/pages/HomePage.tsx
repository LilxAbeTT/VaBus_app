import { Link } from 'react-router'

const passengerAccess = {
  title: 'Pasajero',
  href: '/passenger-map',
  description: 'Consulta rutas y unidades activas en tiempo real sin pasos extra.',
  actionLabel: 'Entrar al mapa',
}

const driverAccess = {
  title: 'Conductor',
  href: '/driver/login',
  description: 'Acceso operativo para iniciar servicio y compartir ubicacion.',
  actionLabel: 'Ingresar',
}

export function HomePage() {
  return (
    <section className="mx-auto flex w-full max-w-4xl items-center justify-center">
      <div className="panel relative w-full overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400" />

        <div className="px-4 py-5 sm:px-8 sm:py-8">
          <div className="text-center">
            <img
              src="/logo.png"
              alt="VaBus"
              className="mx-auto h-48 w-48 object-contain sm:h-50 sm:w-50"
            />
            <p className="eyebrow mt-4">Movilidad urbana</p>
          
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Consulta rutas activas desde el celular y deja el acceso del
              conductor como entrada operativa aparte.
            </p>
          </div>

          <div className="mt-6 space-y-3 sm:mt-8 sm:space-y-4">
            <article className="rounded-[2rem] border border-white/80 bg-gradient-to-br from-teal-100 via-cyan-50 to-white p-5 text-left shadow-[0_24px_45px_-30px_rgba(15,35,54,0.38)] sm:p-6">
              <p className="eyebrow">Acceso principal</p>
              <h2 className="mt-3 font-display text-3xl text-slate-900">
                {passengerAccess.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                {passengerAccess.description}
              </p>
              <Link
                to={passengerAccess.href}
                className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 sm:mt-6"
              >
                {passengerAccess.actionLabel}
              </Link>
            </article>

            <Link
              to={driverAccess.href}
              className="flex w-full items-center justify-between gap-4 rounded-full border border-amber-100 bg-white/80 px-5 py-3.5 text-left shadow-[0_18px_35px_-28px_rgba(148,84,21,0.4)] transition hover:border-amber-200 hover:bg-amber-50/70"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">
                  {driverAccess.title}
                </p>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  {driverAccess.description}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                {driverAccess.actionLabel}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
