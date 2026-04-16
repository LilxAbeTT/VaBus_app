import { Navigate } from 'react-router'
import { useEffect } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { DriverStatusCard } from '../features/driver/components/DriverStatusCard'
import { useStoredAuthSession } from '../features/auth/hooks/useStoredAuthSession'
import { driverSessionStorageKey } from '../features/auth/lib/sessionKeys'
import { convexUrl } from '../lib/env'

function DriverAuthEmptyState({
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

export function DriverPanelPage() {
  const { session, clearSession } = useStoredAuthSession(driverSessionStorageKey)
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
      <DriverAuthEmptyState
        title="Convex aún no está configurado"
        description="Inicia Convex para habilitar el acceso del conductor."
      />
    )
  }

  if (!session) {
    return <Navigate to="/driver/login" replace />
  }

  if (verifiedSession === undefined) {
    return (
      <DriverAuthEmptyState
        title="Validando sesión"
        description="Comprobando que la sesión del conductor siga activa."
      />
    )
  }

  if (!verifiedSession || verifiedSession.user.role !== 'driver') {
    return <Navigate to="/driver/login" replace />
  }

  return <DriverStatusCard session={verifiedSession} onLogout={clearSession} />
}
