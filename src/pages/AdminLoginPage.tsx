import { Navigate, useNavigate } from 'react-router'
import { useEffect } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { RoleLoginCard } from '../features/auth/components/RoleLoginCard'
import { useStoredAuthSession } from '../features/auth/hooks/useStoredAuthSession'
import { adminSessionStorageKey } from '../features/auth/lib/sessionKeys'
import { convexUrl } from '../lib/env'

function AdminLoginEmptyState({
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

export function AdminLoginPage() {
  const navigate = useNavigate()
  const { session, setSession, clearSession } = useStoredAuthSession(
    adminSessionStorageKey,
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
      <AdminLoginEmptyState
        title="Convex aún no está configurado"
        description="Inicia Convex para habilitar el acceso administrativo."
      />
    )
  }

  if (session && verifiedSession === undefined) {
    return (
      <AdminLoginEmptyState
        title="Validando sesión"
        description="Comprobando si el acceso administrativo sigue vigente."
      />
    )
  }

  if (verifiedSession?.user.role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  return (
    <RoleLoginCard
      role="admin"
      title="Ingreso administrativo"
      description="Accede por este enlace directo para gestionar conductores, unidades y operación en tiempo real."
      badgeLabel="Acceso admin"
      onSuccess={(nextSession) => {
        setSession(nextSession)
        navigate('/admin', { replace: true })
      }}
    />
  )
}
