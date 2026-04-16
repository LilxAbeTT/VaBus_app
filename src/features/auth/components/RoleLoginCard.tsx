import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ConvexError } from 'convex/values'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { AuthenticatedSession } from '../../../types/domain'

function getErrorMessage(error: unknown) {
  if (error instanceof ConvexError) {
    return String(error.data)
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Ocurrió un error inesperado al iniciar sesión.'
}

export function RoleLoginCard({
  role,
  title,
  description,
  badgeLabel,
  onSuccess,
  showLogo = false,
  showDriverSupport = false,
}: {
  role: 'driver' | 'admin'
  title: string
  description: string
  badgeLabel: string
  onSuccess: (
    session: AuthenticatedSession,
    options?: { persistent?: boolean },
  ) => void
  showLogo?: boolean
  showDriverSupport?: boolean
}) {
  const login = useMutation(api.auth.login)
  const requestDriverLoginHelp = useMutation(api.auth.requestDriverLoginHelp)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberSession, setRememberSession] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [supportMessage, setSupportMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRequestingSupport, setIsRequestingSupport] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setSupportMessage(null)

    void (async () => {
      setIsSubmitting(true)

      try {
        const session = await login({
          email,
          password,
          role,
        })

        onSuccess(session, {
          persistent: rememberSession,
        })
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  const handleDriverHelpRequest = (
    issueType: 'password_reset' | 'general_support',
  ) => {
    if (!showDriverSupport) {
      return
    }

    if (!email.trim()) {
      setErrorMessage(
        'Ingresa tu correo operativo para que administración sepa a quién responder.',
      )
      return
    }

    setErrorMessage(null)
    setSupportMessage(null)

    void (async () => {
      setIsRequestingSupport(true)

      try {
        await requestDriverLoginHelp({
          email,
          issueType,
        })

        setSupportMessage(
          issueType === 'password_reset'
            ? 'Se registró tu solicitud para recuperar la contraseña. Administración la verá en el panel.'
            : 'Se registró tu solicitud de soporte. Administración la verá en el panel.',
        )
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
      } finally {
        setIsRequestingSupport(false)
      }
    })()
  }

  return (
    <section className="panel overflow-hidden">
      <div className="grid gap-0">
        <form className="space-y-6 px-4 py-5 sm:px-6 sm:py-7" onSubmit={handleSubmit}>
          {showLogo ? (
            <div className="text-center">
              <img
                src="/logo.png"
                alt="CaboBus"
                className="mx-auto h-24 w-40 object-contain sm:h-28 sm:w-48"
              />
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="eyebrow">{badgeLabel}</p>
            <h2 className="font-display text-2xl text-slate-900 sm:text-3xl">
              {title}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          </div>

          <div className="grid gap-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Correo</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="operacion@cabobus.app"
                autoComplete="username"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">
                Contraseña
              </span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-24 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((currentValue) => !currentValue)}
                  className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                >
                  {showPassword ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={rememberSession}
                onChange={(event) => setRememberSession(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Recordar este dispositivo
            </label>

            {showDriverSupport ? (
              <button
                type="button"
                onClick={() => handleDriverHelpRequest('password_reset')}
                disabled={isSubmitting || isRequestingSupport}
                className="text-sm font-semibold text-teal-700 transition hover:text-teal-800 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Recuperar contraseña
              </button>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? 'Ingresando...' : 'Entrar'}
            </button>

            <Link
              to="/"
              className="flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700"
            >
              Volver al inicio
            </Link>
          </div>

          {showDriverSupport ? (
            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">
                Aún no hay recuperación automática de contraseña en esta versión.
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Si olvidaste tu acceso o necesitas ayuda, registra la solicitud y
                administración la verá en el panel.
              </p>
              <button
                type="button"
                onClick={() => handleDriverHelpRequest('general_support')}
                disabled={isSubmitting || isRequestingSupport}
                className="mt-4 flex min-h-11 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {isRequestingSupport ? 'Enviando...' : 'Contactar soporte'}
              </button>
            </div>
          ) : null}

          {supportMessage ? (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {supportMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  )
}
