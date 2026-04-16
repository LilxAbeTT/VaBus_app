import { Navigate } from 'react-router'
import { useEffect } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { AdminOverview } from '../features/admin/components/AdminOverview'
import { useStoredAuthSession } from '../features/auth/hooks/useStoredAuthSession'
import { adminSessionStorageKey } from '../features/auth/lib/sessionKeys'
import { convexUrl } from '../lib/env'

function AdminAuthEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="panel px-4 py-5 sm:px-6 sm:py-6">
      <p className="eyebrow">Admin</p>
      <h2 className="mt-3 font-display text-xl text-slate-900 sm:text-2xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        {description}
      </p>
    </section>
  )
}

export function AdminDashboardPage() {
  const { session, clearSession } = useStoredAuthSession(adminSessionStorageKey)
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
      <AdminAuthEmptyState
        title="Convex aún no está configurado"
        description="Inicia Convex para habilitar el acceso administrativo."
      />
    )
  }

  if (!session) {
    return <Navigate to="/admin/login" replace />
  }

  if (verifiedSession === undefined) {
    return (
      <AdminAuthEmptyState
        title="Validando sesión"
        description="Comprobando que la sesión administrativa siga activa."
      />
    )
  }

  if (!verifiedSession || verifiedSession.user.role !== 'admin') {
    return <Navigate to="/admin/login" replace />
  }

  return <AdminOverview session={verifiedSession} onLogout={clearSession} />
}
