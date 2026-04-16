import { useMemo, useState } from 'react'
import { ConvexError } from 'convex/values'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type {
  AdminDashboardState,
  AdminManagementCatalogState,
  AdminOperationalFeed,
  AuthenticatedSession,
} from '../../../types/domain'
import { useCurrentTime } from '../../../hooks/useCurrentTime'
import {
  formatElapsedSignalTime,
  getOperationalStatusLabel,
} from '../../../lib/trackingSignal'
import { useAdminManagementCatalog } from '../hooks/useAdminManagementCatalog'
import { useAdminOperationalOverview } from '../hooks/useAdminOperationalOverview'

function formatDateTime(value?: string) {
  return value
    ? new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Sin registro'
}

function getErrorMessage(error: unknown) {
  if (error instanceof ConvexError) return String(error.data)
  if (error instanceof Error) return error.message
  return 'Ocurrió un error inesperado.'
}

function getPillTone(value: string) {
  switch (value) {
    case 'active':
    case 'active_recent':
    case 'available':
      return 'bg-emerald-100 text-emerald-700'
    case 'paused':
    case 'active_stale':
    case 'maintenance':
      return 'bg-amber-100 text-amber-700'
    case 'inactive':
    case 'probably_stopped':
      return 'bg-rose-100 text-rose-700'
    case 'in_service':
      return 'bg-sky-100 text-sky-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function getSupportStatusTone(value: 'open' | 'closed') {
  return value === 'open'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-slate-100 text-slate-600'
}

function getSupportStatusLabel(value: 'open' | 'closed') {
  return value === 'open' ? 'Abierta' : 'Cerrada'
}

function getSupportSenderLabel(value?: 'driver' | 'admin') {
  if (value === 'driver') {
    return 'Ultimo mensaje del conductor'
  }

  if (value === 'admin') {
    return 'Ultimo mensaje de admin'
  }

  return 'Sin mensajes'
}

function AdminEmptyState(props: { title: string; description: string }) {
  return (
    <section className="panel px-4 py-5 sm:px-6 sm:py-6">
      <p className="eyebrow">Admin</p>
      <h2 className="mt-3 font-display text-xl text-slate-900 sm:text-2xl">
        {props.title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
        {props.description}
      </p>
    </section>
  )
}

function AdminDashboardContent({
  dashboard,
  currentTimeMs,
  onLogout,
  sessionToken,
}: {
  dashboard: AdminDashboardState
  currentTimeMs: number
  onLogout: () => void
  sessionToken: string
}) {
  const logout = useMutation(api.auth.logout)
  const createDriver = useMutation(api.admin.createDriver)
  const updateDriver = useMutation(api.admin.updateDriver)
  const setDriverStatus = useMutation(api.admin.setDriverStatus)
  const createVehicle = useMutation(api.admin.createVehicle)
  const updateVehicle = useMutation(api.admin.updateVehicle)
  const setVehicleStatus = useMutation(api.admin.setVehicleStatus)
  const setRouteStatus = useMutation(api.admin.setRouteStatus)
  const pauseService = useMutation(api.admin.pauseService)
  const resumeService = useMutation(api.admin.resumeService)
  const finishService = useMutation(api.admin.finishService)
  const replySupportThread = useMutation(api.admin.replySupportThread)
  const markSupportThreadSeen = useMutation(api.admin.markSupportThreadSeen)
  const setSupportThreadStatus = useMutation(api.admin.setSupportThreadStatus)

  const [driverForm, setDriverForm] = useState({
    name: '',
    email: '',
    status: 'active' as 'active' | 'inactive',
    password: '',
    defaultRouteId: '',
    defaultVehicleId: '',
  })
  const [vehicleForm, setVehicleForm] = useState({
    unitNumber: '',
    label: '',
    status: 'available' as 'available' | 'maintenance' | 'in_service',
    defaultRouteId: '',
  })
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null)
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null)
  const [serviceSearch, setServiceSearch] = useState('')
  const [routeSearch, setRouteSearch] = useState('')
  const [supportSearch, setSupportSearch] = useState('')
  const [driverSearch, setDriverSearch] = useState('')
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [supportReplyDrafts, setSupportReplyDrafts] = useState<
    Record<string, string>
  >({})
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const editingVehicle =
    dashboard.vehicles.find((vehicle) => vehicle.id === editingVehicleId) ?? null

  const filteredServices = useMemo(
    () =>
      dashboard.overview.services.filter((service) =>
        `${service.unitNumber} ${service.routeName} ${service.driverName}`
          .toLowerCase()
          .includes(serviceSearch.toLowerCase()),
      ),
    [dashboard.overview.services, serviceSearch],
  )
  const filteredRoutes = useMemo(
    () =>
      dashboard.routeCatalog.filter((route) =>
        `${route.name} ${route.direction} ${route.importKey} ${route.sourceFile}`
          .toLowerCase()
          .includes(routeSearch.toLowerCase()),
      ),
    [dashboard.routeCatalog, routeSearch],
  )
  const filteredSupportThreads = useMemo(
    () =>
      dashboard.supportThreads.filter((thread) =>
        `${thread.driverName} ${thread.driverEmail} ${thread.routeName ?? ''} ${thread.latestMessagePreview ?? ''}`
          .toLowerCase()
          .includes(supportSearch.toLowerCase()),
      ),
    [dashboard.supportThreads, supportSearch],
  )
  const filteredDrivers = useMemo(
    () =>
      dashboard.drivers.filter((driver) =>
        `${driver.name} ${driver.email} ${driver.defaultRouteName ?? ''} ${driver.defaultVehicleLabel ?? ''}`
          .toLowerCase()
          .includes(driverSearch.toLowerCase()),
      ),
    [dashboard.drivers, driverSearch],
  )
  const filteredVehicles = useMemo(
    () =>
      dashboard.vehicles.filter((vehicle) =>
        `${vehicle.unitNumber} ${vehicle.label} ${vehicle.defaultRouteName ?? ''} ${vehicle.assignedDriverNames.join(' ')}`
          .toLowerCase()
          .includes(vehicleSearch.toLowerCase()),
      ),
    [dashboard.vehicles, vehicleSearch],
  )

  const updateSupportReplyDraft = (threadId: string, value: string) => {
    setSupportReplyDrafts((current) => ({
      ...current,
      [threadId]: value,
    }))
  }

  const runMutation = (runner: () => Promise<void>) => {
    setErrorMessage(null)
    setFeedbackMessage(null)
    void (async () => {
      setIsSubmitting(true)
      try {
        await runner()
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  const handleDriverSubmit = () =>
    runMutation(async () => {
      if (editingDriverId) {
        await updateDriver({
          sessionToken,
          driverId: editingDriverId as Id<'users'>,
          name: driverForm.name,
          email: driverForm.email,
          status: driverForm.status,
          password: driverForm.password.trim() || undefined,
          defaultRouteId: driverForm.defaultRouteId
            ? (driverForm.defaultRouteId as Id<'routes'>)
            : undefined,
          defaultVehicleId: driverForm.defaultVehicleId
            ? (driverForm.defaultVehicleId as Id<'vehicles'>)
            : undefined,
        })
        setFeedbackMessage('Conductor actualizado.')
      } else {
        await createDriver({
          sessionToken,
          name: driverForm.name,
          email: driverForm.email,
          password: driverForm.password,
          status: driverForm.status,
          defaultRouteId: driverForm.defaultRouteId
            ? (driverForm.defaultRouteId as Id<'routes'>)
            : undefined,
          defaultVehicleId: driverForm.defaultVehicleId
            ? (driverForm.defaultVehicleId as Id<'vehicles'>)
            : undefined,
        })
        setFeedbackMessage('Conductor creado.')
      }
      setDriverForm({
        name: '',
        email: '',
        status: 'active',
        password: '',
        defaultRouteId: '',
        defaultVehicleId: '',
      })
      setEditingDriverId(null)
    })

  const handleVehicleSubmit = () =>
    runMutation(async () => {
      if (editingVehicleId) {
        await updateVehicle({
          sessionToken,
          vehicleId: editingVehicleId as Id<'vehicles'>,
          unitNumber: vehicleForm.unitNumber,
          label: vehicleForm.label,
          status: vehicleForm.status,
          defaultRouteId: vehicleForm.defaultRouteId
            ? (vehicleForm.defaultRouteId as Id<'routes'>)
            : undefined,
        })
        setFeedbackMessage('Unidad actualizada.')
      } else {
        await createVehicle({
          sessionToken,
          unitNumber: vehicleForm.unitNumber,
          label: vehicleForm.label,
          status:
            vehicleForm.status === 'maintenance' ? 'maintenance' : 'available',
          defaultRouteId: vehicleForm.defaultRouteId
            ? (vehicleForm.defaultRouteId as Id<'routes'>)
            : undefined,
        })
        setFeedbackMessage('Unidad creada.')
      }
      setVehicleForm({
        unitNumber: '',
        label: '',
        status: 'available',
        defaultRouteId: '',
      })
      setEditingVehicleId(null)
    })

  const handleSupportReply = (threadId: string) => {
    const draftMessage = supportReplyDrafts[threadId]?.trim() ?? ''

    if (!draftMessage) {
      setErrorMessage('Escribe una respuesta antes de enviarla.')
      setFeedbackMessage(null)
      return
    }

    runMutation(async () => {
      await replySupportThread({
        sessionToken,
        threadId: threadId as Id<'supportThreads'>,
        message: draftMessage,
      })
      setSupportReplyDrafts((current) => ({
        ...current,
        [threadId]: '',
      }))
      setFeedbackMessage('Respuesta de soporte enviada.')
    })
  }

  const handleSupportStatusChange = (
    threadId: string,
    status: 'open' | 'closed',
  ) =>
    runMutation(async () => {
      await setSupportThreadStatus({
        sessionToken,
        threadId: threadId as Id<'supportThreads'>,
        status,
      })
      setFeedbackMessage(
        status === 'closed'
          ? 'Conversacion de soporte cerrada.'
          : 'Conversacion de soporte reabierta.',
      )
    })

  const handleSupportSeen = (threadId: string) =>
    runMutation(async () => {
      await markSupportThreadSeen({
        sessionToken,
        threadId: threadId as Id<'supportThreads'>,
      })
      setFeedbackMessage('Conversacion marcada como revisada.')
    })

  return (
    <section className="space-y-6">
      <section className="panel overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <p className="eyebrow">Admin</p>
            <h2 className="mt-2 font-display text-2xl text-slate-900 sm:text-3xl">
              Centro operativo CaboBus
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Gestiona servicios abiertos, conductores, unidades y el catálogo de
              rutas reales desde un solo panel.
            </p>
          </div>
          <aside className="rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(237,249,245,0.98),rgba(248,244,234,0.95))] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
              Sesión admin
            </p>
            <p className="mt-4 font-display text-2xl text-slate-900">
              {dashboard.admin.name}
            </p>
            <button
              type="button"
              onClick={() => {
                setIsLoggingOut(true)
                void (async () => {
                  try {
                    await logout({ sessionToken })
                  } finally {
                    onLogout()
                    setIsLoggingOut(false)
                  }
                })()
              }}
              disabled={isLoggingOut}
              className="mt-5 flex min-h-11 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
            </button>
          </aside>
        </div>
      </section>

      {dashboard.alerts.length > 0 ? (
        <section className="grid gap-3 xl:grid-cols-2">
          {dashboard.alerts.map((alert) => (
            <article
              key={alert.id}
              className={`rounded-2xl border px-4 py-4 text-sm ${alert.severity === 'critical' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
            >
              <p className="font-semibold">{alert.title}</p>
              <p className="mt-1 leading-6">{alert.description}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
        <article className="panel px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Servicios</p>
              <h3 className="mt-2 font-display text-xl text-slate-900 sm:text-2xl">
                Operación abierta
              </h3>
            </div>
            <input
              type="text"
              value={serviceSearch}
              onChange={(event) => setServiceSearch(event.target.value)}
              placeholder="Buscar servicio"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 sm:max-w-sm"
            />
          </div>
          <div className="mt-5 space-y-4">
            {filteredServices.length > 0 ? filteredServices.map((service) => (
              <article key={service.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-display text-xl text-slate-900">{service.unitNumber}</p>
                    <p className="mt-2 text-sm text-slate-600">{service.routeName} · {service.routeDirection}</p>
                    <p className="mt-2 text-sm text-slate-600">Operador: {service.driverName}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPillTone(service.status)}`}>{service.status === 'active' ? 'Activo' : 'Pausado'}</span>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPillTone(service.operationalStatus)}`}>{getOperationalStatusLabel(service.operationalStatus)}</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                  <p>Inicio: {formatDateTime(service.startedAt)}</p>
                  <p>Última señal: {formatDateTime(service.lastSignalAt)}</p>
                  <p>Tiempo desde la señal: {formatElapsedSignalTime(service.lastSignalAt, currentTimeMs)}</p>
                  <p>Origen: {service.lastSignalSource === 'device' ? 'Dispositivo' : service.lastSignalSource === 'seed' ? 'Inicial' : 'Sin registro'}</p>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={() => runMutation(async () => { await pauseService({ sessionToken, serviceId: service.id as Id<'activeServices'> }); setFeedbackMessage('Servicio pausado.') })} disabled={service.status !== 'active' || isSubmitting} className="flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-amber-300 hover:text-amber-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">Pausar</button>
                  <button type="button" onClick={() => runMutation(async () => { await resumeService({ sessionToken, serviceId: service.id as Id<'activeServices'> }); setFeedbackMessage('Servicio reanudado.') })} disabled={service.status !== 'paused' || isSubmitting} className="flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">Reanudar</button>
                  <button type="button" onClick={() => runMutation(async () => { await finishService({ sessionToken, serviceId: service.id as Id<'activeServices'> }); setFeedbackMessage('Servicio finalizado.') })} disabled={isSubmitting} className="flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">Finalizar</button>
                </div>
              </article>
            )) : <p className="text-sm text-slate-600">No hay servicios que coincidan con la búsqueda.</p>}
          </div>
        </article>

        <aside className="space-y-6">
          <article className="panel px-4 py-5 sm:px-5 sm:py-6">
            <p className="eyebrow">Rutas</p>
            <h3 className="mt-2 font-display text-lg text-slate-900 sm:text-xl">Catálogo operativo</h3>
            <input type="text" value={routeSearch} onChange={(event) => setRouteSearch(event.target.value)} placeholder="Buscar ruta" className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />
            <div className="mt-5 space-y-3">
              {filteredRoutes.map((route) => (
                <article key={route.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-10 rounded-full" style={{ backgroundColor: route.color }} />
                        <p className="truncate font-display text-lg text-slate-900">{route.name}</p>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{route.direction}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPillTone(route.status)}`}>{route.status === 'active' ? 'Activa' : 'Draft'}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-600">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2 text-center">{route.activeServiceCount} servicio(s)</div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2 text-center">{route.assignedDriverCount} conductor(es)</div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2 text-center">{route.assignedVehicleCount} unidad(es)</div>
                  </div>
                  <button type="button" onClick={() => runMutation(async () => { await setRouteStatus({ sessionToken, routeId: route.id as Id<'routes'>, status: route.status === 'active' ? 'draft' : 'active' }); setFeedbackMessage(`${route.name} actualizada.`) })} disabled={isSubmitting} className="mt-4 flex min-h-11 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">{route.status === 'active' ? 'Pasar a draft' : 'Activar ruta'}</button>
                </article>
              ))}
            </div>
          </article>

          <article className="panel px-4 py-5 sm:px-5 sm:py-6">
            <p className="eyebrow">Eventos</p>
            <h3 className="mt-2 font-display text-lg text-slate-900 sm:text-xl">Bitácora reciente</h3>
            <div className="mt-5 space-y-3">
              {dashboard.events.map((event) => (
                <article key={event.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{event.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{event.description}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">{event.category}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{event.actorName ? `${event.actorName} · ` : ''}{formatDateTime(event.createdAt)}</p>
                </article>
              ))}
            </div>
          </article>
        </aside>
      </section>

      <section className="panel px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">Soporte</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h3 className="font-display text-xl text-slate-900 sm:text-2xl">
                Inbox de conductores
              </h3>
              {dashboard.supportThreads.some((thread) => thread.hasUnreadForAdmin) ? (
                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  {
                    dashboard.supportThreads.filter(
                      (thread) => thread.hasUnreadForAdmin,
                    ).length
                  }{' '}
                  pendiente(s)
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Revisa solicitudes operativas, responde desde admin y cierra la
              conversacion cuando el caso quede resuelto.
            </p>
          </div>
          <input
            type="text"
            value={supportSearch}
            onChange={(event) => setSupportSearch(event.target.value)}
            placeholder="Buscar solicitud"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 lg:max-w-sm"
          />
        </div>

        <div className="mt-5 space-y-4">
          {filteredSupportThreads.length > 0 ? (
            filteredSupportThreads.map((thread) => (
              <article
                key={thread.id}
                className="rounded-[1.6rem] border border-slate-200 bg-white px-4 py-4 sm:px-5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-xl text-slate-900">
                        {thread.driverName}
                      </p>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getSupportStatusTone(thread.status)}`}
                      >
                        {getSupportStatusLabel(thread.status)}
                      </span>
                      {thread.hasUnreadForAdmin ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                          Mensaje nuevo
                        </span>
                      ) : null}
                      <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                        {getSupportSenderLabel(thread.latestMessageRole)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {thread.driverEmail}
                    </p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-500 sm:grid-cols-2 xl:grid-cols-4">
                      <p>Ruta: {thread.routeName ?? 'Sin ruta activa'}</p>
                      <p>Creada: {formatDateTime(thread.createdAt)}</p>
                      <p>Actualizada: {formatDateTime(thread.updatedAt)}</p>
                      <p>
                        Ultimo conductor:{' '}
                        {formatDateTime(thread.lastDriverMessageAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {thread.hasUnreadForAdmin ? (
                      <button
                        type="button"
                        onClick={() => handleSupportSeen(thread.id)}
                        disabled={isSubmitting}
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Marcar revisado
                      </button>
                    ) : null}
                    {thread.status === 'open' ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleSupportStatusChange(thread.id, 'closed')
                        }
                        disabled={isSubmitting}
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Cerrar caso
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleSupportStatusChange(thread.id, 'open')
                        }
                        disabled={isSubmitting}
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Reabrir caso
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 max-h-[24rem] space-y-3 overflow-y-auto rounded-[1.2rem] border border-slate-200 bg-slate-50 px-3 py-3">
                  {thread.messages.map((message) => {
                    const isDriverMessage = message.senderRole === 'driver'

                    return (
                      <article
                        key={message.id}
                        className={`rounded-[1.1rem] px-4 py-3 ${
                          isDriverMessage
                            ? 'mr-8 bg-white text-slate-800'
                            : 'ml-8 bg-teal-50 text-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">
                            {message.senderName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(message.createdAt)}
                          </p>
                        </div>
                        <p className="mt-2 text-sm leading-6">{message.body}</p>
                      </article>
                    )
                  })}
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <textarea
                    value={supportReplyDrafts[thread.id] ?? ''}
                    onChange={(event) =>
                      updateSupportReplyDraft(thread.id, event.target.value)
                    }
                    rows={3}
                    placeholder="Responder al conductor..."
                    className="w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  />
                  <div className="flex flex-col gap-3 xl:w-48">
                    <button
                      type="button"
                      onClick={() => handleSupportReply(thread.id)}
                      disabled={isSubmitting}
                      className="flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      Responder
                    </button>
                    <p className="text-xs leading-5 text-slate-500">
                      Si respondes una conversacion cerrada, el hilo vuelve a
                      quedar abierto.
                    </p>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-600">
              No hay solicitudes de soporte que coincidan con la busqueda.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="panel px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Conductores</p>
              <h3 className="mt-2 font-display text-xl text-slate-900 sm:text-2xl">Gestión de conductores</h3>
            </div>
            {editingDriverId ? <button type="button" onClick={() => { setEditingDriverId(null); setDriverForm({ name: '', email: '', status: 'active', password: '', defaultRouteId: '', defaultVehicleId: '' }) }} className="text-sm font-semibold text-slate-500 transition hover:text-slate-800">Cancelar edición</button> : null}
          </div>
          <input type="text" value={driverSearch} onChange={(event) => setDriverSearch(event.target.value)} placeholder="Buscar conductor" className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />
          <div className="mt-5 grid gap-4">
            <input type="text" value={driverForm.name} onChange={(event) => setDriverForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre del conductor" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />
            <input type="email" value={driverForm.email} onChange={(event) => setDriverForm((current) => ({ ...current, email: event.target.value }))} placeholder="conductor@cabobus.app" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />
            <input type="password" value={driverForm.password} onChange={(event) => setDriverForm((current) => ({ ...current, password: event.target.value }))} placeholder={editingDriverId ? 'Nueva contraseña opcional' : 'Contraseña inicial'} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />
            <select value={driverForm.defaultRouteId} onChange={(event) => setDriverForm((current) => ({ ...current, defaultRouteId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"><option value="">Sin ruta asignada</option>{dashboard.routes.map((route) => <option key={route.id} value={route.id}>{route.name} - {route.direction}</option>)}</select>
            <select value={driverForm.defaultVehicleId} onChange={(event) => setDriverForm((current) => ({ ...current, defaultVehicleId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"><option value="">Sin unidad asignada</option>{dashboard.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.unitNumber} - {vehicle.label}{vehicle.assignedDriverNames.length > 0 ? ` (${vehicle.assignedDriverNames.join(', ')})` : ''}</option>)}</select>
            <button type="button" onClick={handleDriverSubmit} disabled={isSubmitting} className="flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300">{editingDriverId ? 'Guardar cambios' : 'Crear conductor'}</button>
          </div>
          <div className="mt-6 space-y-3">
            {filteredDrivers.map((driver) => (
              <article key={driver.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-display text-lg text-slate-900">{driver.name}</p>
                    <p className="mt-2 text-sm text-slate-600">{driver.email}</p>
                    <p className="mt-2 text-sm text-slate-500">Ruta base: {driver.defaultRouteName ?? 'Sin asignar'}</p>
                    <p className="mt-2 text-sm text-slate-500">Unidad base: {driver.defaultVehicleLabel ?? 'Sin asignar'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPillTone(driver.status)}`}>{driver.status === 'active' ? 'Activo' : 'Inactivo'}</span>
                    <button type="button" onClick={() => { setEditingDriverId(driver.id); setDriverForm({ name: driver.name, email: driver.email, status: driver.status, password: '', defaultRouteId: driver.defaultRouteId ?? '', defaultVehicleId: driver.defaultVehicleId ?? '' }) }} className="inline-flex rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700">Editar</button>
                    <button type="button" onClick={() => runMutation(async () => { await setDriverStatus({ sessionToken, driverId: driver.id as Id<'users'>, status: driver.status === 'active' ? 'inactive' : 'active' }); setFeedbackMessage(`${driver.name} actualizado.`) })} disabled={isSubmitting} className="inline-flex rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">{driver.status === 'active' ? 'Inactivar' : 'Activar'}</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Unidades</p>
              <h3 className="mt-2 font-display text-xl text-slate-900 sm:text-2xl">Gestión de unidades</h3>
            </div>
            {editingVehicleId ? <button type="button" onClick={() => { setEditingVehicleId(null); setVehicleForm({ unitNumber: '', label: '', status: 'available', defaultRouteId: '' }) }} className="text-sm font-semibold text-slate-500 transition hover:text-slate-800">Cancelar edición</button> : null}
          </div>
          <input type="text" value={vehicleSearch} onChange={(event) => setVehicleSearch(event.target.value)} placeholder="Buscar unidad" className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />
          <div className="mt-5 grid gap-4">
            <input type="text" value={vehicleForm.unitNumber} onChange={(event) => setVehicleForm((current) => ({ ...current, unitNumber: event.target.value }))} placeholder="Unidad 31" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />
            <input type="text" value={vehicleForm.label} onChange={(event) => setVehicleForm((current) => ({ ...current, label: event.target.value }))} placeholder="Mercedes Sprinter" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100" />
            <select value={vehicleForm.status} onChange={(event) => setVehicleForm((current) => ({ ...current, status: event.target.value as 'available' | 'maintenance' | 'in_service' }))} disabled={editingVehicle?.hasOpenService} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"><option value="available">Disponible</option><option value="maintenance">Mantenimiento</option>{editingVehicle?.hasOpenService ? <option value="in_service">En servicio</option> : null}</select>
            <select value={vehicleForm.defaultRouteId} onChange={(event) => setVehicleForm((current) => ({ ...current, defaultRouteId: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"><option value="">Sin ruta por defecto</option>{dashboard.routes.map((route) => <option key={route.id} value={route.id}>{route.name} - {route.direction}</option>)}</select>
            <button type="button" onClick={handleVehicleSubmit} disabled={isSubmitting} className="flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300">{editingVehicleId ? 'Guardar cambios' : 'Crear unidad'}</button>
          </div>
          <div className="mt-6 space-y-3">
            {filteredVehicles.map((vehicle) => (
              <article key={vehicle.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-display text-lg text-slate-900">{vehicle.unitNumber}</p>
                    <p className="mt-2 text-sm text-slate-600">{vehicle.label}</p>
                    <p className="mt-2 text-sm text-slate-500">Ruta por defecto: {vehicle.defaultRouteName ?? 'Sin configuración'}</p>
                    <p className="mt-2 text-sm text-slate-500">Conductores base: {vehicle.assignedDriverNames.length > 0 ? vehicle.assignedDriverNames.join(', ') : 'Sin asignar'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPillTone(vehicle.status)}`}>{vehicle.status === 'available' ? 'Disponible' : vehicle.status === 'maintenance' ? 'Mantenimiento' : 'En servicio'}</span>
                    <button type="button" onClick={() => { setEditingVehicleId(vehicle.id); setVehicleForm({ unitNumber: vehicle.unitNumber, label: vehicle.label, status: vehicle.status, defaultRouteId: vehicle.defaultRouteId ?? '' }) }} className="inline-flex rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700">Editar</button>
                    {vehicle.status !== 'in_service' ? <button type="button" onClick={() => runMutation(async () => { await setVehicleStatus({ sessionToken, vehicleId: vehicle.id as Id<'vehicles'>, status: vehicle.status === 'maintenance' ? 'available' : 'maintenance' }); setFeedbackMessage(`${vehicle.unitNumber} actualizada.`) })} disabled={isSubmitting} className="inline-flex rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">{vehicle.status === 'maintenance' ? 'Marcar disponible' : 'Mantenimiento'}</button> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      {feedbackMessage ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{feedbackMessage}</p> : null}
      {errorMessage ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p> : null}
    </section>
  )
}

export function AdminOverview({
  session,
  onLogout,
}: {
  session: AuthenticatedSession
  onLogout: () => void
}) {
  const currentTimeMs = useCurrentTime(30_000)
  const managementCatalog = useAdminManagementCatalog(session.token)
  const operationalFeed = useAdminOperationalOverview(session.token)
  const dashboard = useMemo<AdminDashboardState | undefined>(() => {
    if (!managementCatalog || !operationalFeed) {
      return undefined
    }

    const catalog = managementCatalog as AdminManagementCatalogState
    const feed = operationalFeed as AdminOperationalFeed

    return {
      ...catalog,
      overview: feed.overview,
      events: feed.events,
    }
  }, [managementCatalog, operationalFeed])

  if (dashboard === undefined) {
    return (
      <AdminEmptyState
        title="Cargando dashboard administrativo"
        description="Obteniendo monitoreo, rutas, unidades y conductores desde Convex."
      />
    )
  }

  return (
    <AdminDashboardContent
      dashboard={dashboard}
      currentTimeMs={currentTimeMs}
      onLogout={onLogout}
      sessionToken={session.token}
    />
  )
}
