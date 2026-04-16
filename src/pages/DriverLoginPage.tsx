import { Navigate, useNavigate } from 'react-router'
import { useEffect } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { RoleLoginCard } from '../features/auth/components/RoleLoginCard'
import { useStoredAuthSession } from '../features/auth/hooks/useStoredAuthSession'
import { driverSessionStorageKey } from '../features/auth/lib/sessionKeys'
import { convexUrl } from '../lib/env'

function DriverLoginEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="panel px-4 py-5 sm:px-6 sm:py-6">
      <p className="eyebrow">Conductor</p>
      <h2 className="mt-3 font-display text-xl text-slate-900 sm:text-2xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        {description}
      </p>
    </section>
  )
}

export function DriverLoginPage() {
  const navigate = useNavigate()
  const { session, setSession, clearSession } = useStoredAuthSession(
    driverSessionStorageKey,
  )
  const verifiedSession = useQuery(
    api.auth.getSession,
    session ? { sessionToken: session.token } : 'skip',
  )

  useEffect(() => {
    if (session && verifiedSession === null) {
      clearSession()
    }
  }, [clearSession, session, verifiedSession])

  if (!convexUrl) {
    return (
      <DriverLoginEmptyState
        title="Convex aún no está configurado"
        description="Inicia Convex para habilitar el login del conductor."
      />
    )
  }

  if (session && verifiedSession === undefined) {
    return (
      <DriverLoginEmptyState
        title="Validando sesión"
        description="Comprobando si el acceso del conductor sigue vigente."
      />
    )
  }

  if (verifiedSession?.user.role === 'driver') {
    return <Navigate to="/driver" replace />
  }

  return (
    <RoleLoginCard
      role="driver"
      title="Ingreso del conductor"
      description="Accede con tus credenciales operativas para abrir, pausar, reanudar o finalizar tu servicio desde el celular."
      badgeLabel="Acceso conductor"
      showLogo
      showDriverSupport
      onSuccess={(nextSession, options) => {
        setSession(nextSession, options)
        navigate('/driver', { replace: true })
      }}
    />
  )
}
