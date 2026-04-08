import type { PropsWithChildren } from 'react'
import { NavLink, useLocation } from 'react-router'

const navigationItems = [
  { to: '/', label: 'Inicio' },
  { to: '/passenger-map', label: 'Mapa' },
  { to: '/driver', label: 'Conductor' },
]

export function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation()
  const isHomePage = location.pathname === '/'
  const isPassengerMapPage = location.pathname === '/passenger-map'
  const isDriverFlow = location.pathname.startsWith('/driver')
  const hideShellChrome = isHomePage || isPassengerMapPage || isDriverFlow

  return (
    <div className="app-shell">
      {!hideShellChrome ? (
        <header className="panel mt-3 overflow-hidden sm:mt-4">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400" />
          <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 pr-0 lg:pr-6">
              <img
                src="/logo.png"
                alt="VaBus"
                className="h-12 w-12 rounded-2xl bg-white/70 p-2 object-contain sm:h-14 sm:w-14"
              />
              <div>
                <p className="eyebrow">Movilidad urbana</p>
                <h1 className="font-display text-2xl text-slate-900 sm:text-4xl">
                  VaBus
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Rutas y unidades activas en tiempo real para consulta rapida
                  desde el celular en San Jose del Cabo.
                </p>
              </div>
            </div>

            <nav className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              {navigationItems.map((item, index) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'flex min-h-11 items-center justify-center rounded-full border px-3 py-2 text-center text-sm font-semibold transition sm:min-h-0 sm:px-4',
                      index === navigationItems.length - 1
                        ? 'col-span-2 sm:col-span-1'
                        : '',
                      isActive
                        ? 'border-teal-600 bg-teal-600 text-white shadow-lg shadow-teal-900/15'
                        : 'border-slate-200 bg-white/70 text-slate-700 hover:border-teal-300 hover:text-teal-700',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>
      ) : null}

      <main
        className={
          isHomePage
            ? 'flex flex-1 items-center py-3 sm:py-6'
            : isPassengerMapPage
              ? 'flex-1 py-3 sm:py-4'
              : isDriverFlow
                ? 'flex-1 py-3 sm:py-4'
              : 'flex-1 py-5 sm:py-8'
        }
      >
        {children}
      </main>

      {!hideShellChrome ? (
        <footer className="px-1 pb-6 text-sm leading-6 text-slate-500 sm:px-2 sm:pb-8">
          Acceso publico para pasajeros, acceso operativo para conductores y
          administracion protegida por ruta directa.
        </footer>
      ) : null}
    </div>
  )
}
