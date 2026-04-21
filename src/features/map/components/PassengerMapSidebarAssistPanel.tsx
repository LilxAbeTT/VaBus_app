import { memo, useCallback, useState } from 'react'
import { useMutation } from 'convex/react'
import type { Id } from '../../../../convex/_generated/dataModel'
import { api } from '../../../../convex/_generated/api'
import type {
  BusRoute,
  Coordinates,
  StopSuggestionReportedAsOfficial,
} from '../../../types/domain'
import {
  PassengerRouteReportModal,
  PassengerStopSuggestionModal,
  type PassengerRouteReportIssueType,
} from './PassengerMapOverlays'

function AlertIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
      <path d="M10.3 3.9 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  )
}

const PASSENGER_HELP_STEPS = [
  'Usa tu ubicacion si quieres que la app te sugiera rutas cercanas.',
  'Desliza el carrusel de rutas y toca "Ver en el mapa" para enfocarla.',
  'Abre "Ver colonias y puntos" solo cuando necesites revisar el recorrido.',
]

const PASSENGER_FAQS = [
  {
    question: 'No veo una ruta sugerida. Que hago?',
    answer:
      'Puedes tocar "Usar mi ubicacion" para calcular cercania. Si prefieres no hacerlo, aun puedes explorar manualmente las rutas y enfocarlas una por una.',
  },
  {
    question: 'Puedo usar el mapa sin compartir mi ubicacion?',
    answer:
      'Si. La ubicacion solo ayuda a centrarte y a ordenar rutas cercanas. El mapa y las rutas siguen disponibles aunque no actives ese permiso.',
  },
  {
    question: 'Que significa ver una ruta en el mapa?',
    answer:
      'La app enfoca esa ruta, resalta su trazo y muestra solo las unidades relacionadas con ella para que la vista sea mas clara.',
  },
  {
    question: 'Donde veo mas informacion de una ruta?',
    answer:
      'En cada card hay un boton de informacion. Ahi puedes revisar trayecto, horario, frecuencia y abrir las colonias y puntos sin saturar la vista principal.',
  },
  {
    question: 'La app me dice exactamente cuando llega la unidad?',
    answer:
      'Todavia no. En esta version la app te ayuda a ubicar rutas y unidades activas, pero no calcula un tiempo exacto de llegada.',
  },
]

const passengerReporterStorageKey = 'cabobus.passenger-reporter-key'

function getPassengerReporterKey() {
  if (typeof window === 'undefined') {
    return 'server-render'
  }

  const existingKey = window.localStorage.getItem(passengerReporterStorageKey)

  if (existingKey) {
    return existingKey
  }

  const nextKey = window.crypto.randomUUID()
  window.localStorage.setItem(passengerReporterStorageKey, nextKey)
  return nextKey
}

export const PassengerMapSidebarAssistPanel = memo(function PassengerMapSidebarAssistPanel({
  routeOptions,
  defaultReportRouteId,
}: {
  routeOptions: BusRoute[]
  defaultReportRouteId: string
}) {
  const submitRouteReport = useMutation(api.passengerMap.submitRouteReport)
  const [isHelpOpen, setHelpOpen] = useState(false)
  const [openFaqQuestion, setOpenFaqQuestion] = useState<string | null>(null)
  const [isReportModalOpen, setReportModalOpen] = useState(false)
  const [reportRouteId, setReportRouteId] = useState('')
  const [reportIssueType, setReportIssueType] =
    useState<PassengerRouteReportIssueType>('bus_never_arrived')
  const [reportDetails, setReportDetails] = useState('')
  const [isSubmittingReport, setSubmittingReport] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null)

  const openReportModal = useCallback(() => {
    setReportSuccessMessage(null)
    setReportRouteId(defaultReportRouteId)
    setReportIssueType('bus_never_arrived')
    setReportDetails('')
    setReportError(null)
    setReportModalOpen(true)
  }, [defaultReportRouteId])

  const closeReportModal = useCallback(() => {
    if (isSubmittingReport) {
      return
    }

    setReportModalOpen(false)
    setReportError(null)
  }, [isSubmittingReport])

  const handleSubmitRouteReport = useCallback(async () => {
    if (!reportRouteId) {
      setReportError('Selecciona una ruta para enviar el reporte.')
      return
    }

    setSubmittingReport(true)
    setReportError(null)

    try {
      await submitRouteReport({
        routeId: reportRouteId as Id<'routes'>,
        issueType: reportIssueType,
        details: reportDetails.trim() ? reportDetails.trim() : undefined,
      })

      setReportModalOpen(false)
      setReportSuccessMessage('Reporte enviado. Gracias por avisar.')
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : 'No fue posible enviar tu reporte.',
      )
    } finally {
      setSubmittingReport(false)
    }
  }, [reportDetails, reportIssueType, reportRouteId, submitRouteReport])

  return (
    <>
      <section className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHelpOpen((current) => !current)}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700"
          >
            {isHelpOpen ? 'Ocultar ayuda' : 'Ayuda'}
          </button>
          <button
            type="button"
            onClick={openReportModal}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-900 transition hover:border-amber-300 hover:bg-amber-100"
          >
            <AlertIcon />
            Reportar ruta
          </button>
        </div>

        {reportSuccessMessage ? (
          <div className="mt-3 rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {reportSuccessMessage}
          </div>
        ) : null}

        {isHelpOpen ? (
          <div className="mt-3 space-y-4 text-sm text-slate-600">
            <div className="rounded-[1.1rem] border border-white bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Como aprovechar el mapa
              </p>
              <div className="mt-3 space-y-2">
                {PASSENGER_HELP_STEPS.map((step, index) => (
                  <div key={step} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[11px] font-bold text-teal-700">
                      {index + 1}
                    </span>
                    <p className="leading-6 text-slate-600">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.1rem] border border-white bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Estado de unidades
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Reciente
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-800">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Desactualizada
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 font-semibold text-rose-800">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Detenida
                </span>
              </div>
              <p className="mt-3 leading-6 text-slate-600">
                Estos estados te ayudan a entender si la unidad trae una senal reciente, una senal vieja o si probablemente ya se detuvo.
              </p>
            </div>

            <div className="rounded-[1.1rem] border border-white bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Preguntas frecuentes
              </p>
              <div className="mt-3 space-y-2">
                {PASSENGER_FAQS.map((item) => {
                  const isOpen = openFaqQuestion === item.question

                  return (
                    <div
                      key={item.question}
                      className="rounded-[1rem] border border-slate-200 bg-slate-50/80"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenFaqQuestion((current) =>
                            current === item.question ? null : item.question,
                          )
                        }
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="font-semibold text-slate-800">{item.question}</span>
                        <span className="text-lg font-semibold text-slate-400">
                          {isOpen ? '-' : '+'}
                        </span>
                      </button>

                      {isOpen ? (
                        <p className="px-4 pb-4 leading-6 text-slate-600">{item.answer}</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <PassengerRouteReportModal
        isOpen={isReportModalOpen}
        routes={routeOptions}
        selectedRouteId={reportRouteId}
        selectedIssueType={reportIssueType}
        details={reportDetails}
        isSubmitting={isSubmittingReport}
        submitError={reportError}
        onClose={closeReportModal}
        onRouteChange={setReportRouteId}
        onIssueTypeChange={setReportIssueType}
        onDetailsChange={setReportDetails}
        onSubmit={() => {
          void handleSubmitRouteReport()
        }}
      />
    </>
  )
})

export const PassengerMapStopSuggestionButton = memo(function PassengerMapStopSuggestionButton({
  routeOptions,
  selectedRoute,
  defaultReportRouteId,
  mapCenter,
  userPosition,
}: {
  routeOptions: BusRoute[]
  selectedRoute: BusRoute | null
  defaultReportRouteId: string
  mapCenter: Coordinates | null
  userPosition: Coordinates | null
}) {
  const submitStopSuggestion = useMutation(api.passengerMap.submitStopSuggestion)
  const [isStopModalOpen, setStopModalOpen] = useState(false)
  const [stopRouteId, setStopRouteId] = useState('')
  const [stopLocationSource, setStopLocationSource] = useState<
    'map_center' | 'current_location'
  >('map_center')
  const [stopReportedAsOfficial, setStopReportedAsOfficial] =
    useState<StopSuggestionReportedAsOfficial>('unknown')
  const [stopDetails, setStopDetails] = useState('')
  const [isSubmittingStop, setSubmittingStop] = useState(false)
  const [stopError, setStopError] = useState<string | null>(null)
  const [stopSuccessMessage, setStopSuccessMessage] = useState<string | null>(null)

  const openStopModal = useCallback(() => {
    setStopSuccessMessage(null)
    setStopRouteId(defaultReportRouteId)
    setStopLocationSource(userPosition ? 'current_location' : 'map_center')
    setStopReportedAsOfficial('unknown')
    setStopDetails('')
    setStopError(null)
    setStopModalOpen(true)
  }, [defaultReportRouteId, userPosition])

  const closeStopModal = useCallback(() => {
    if (isSubmittingStop) {
      return
    }

    setStopModalOpen(false)
    setStopError(null)
  }, [isSubmittingStop])

  const handleSubmitStopSuggestion = useCallback(async () => {
    if (!stopRouteId) {
      setStopError('Selecciona una ruta para enviar la sugerencia.')
      return
    }

    const selectedPosition =
      stopLocationSource === 'current_location' && userPosition
        ? userPosition
        : mapCenter

    if (!selectedPosition) {
      setStopError(
        'Centra el mapa sobre la parada o activa tu ubicacion antes de enviar la sugerencia.',
      )
      return
    }

    setSubmittingStop(true)
    setStopError(null)

    try {
      await submitStopSuggestion({
        routeId: stopRouteId as Id<'routes'>,
        position: selectedPosition,
        reportedAsOfficial: stopReportedAsOfficial,
        note: stopDetails.trim() ? stopDetails.trim() : undefined,
        reporterKey: getPassengerReporterKey(),
        source: stopLocationSource,
      })

      setStopModalOpen(false)
      setStopSuccessMessage(
        'Sugerencia enviada. Administracion la revisara antes de publicarla.',
      )
    } catch (error) {
      setStopError(
        error instanceof Error
          ? error.message
          : 'No fue posible enviar tu sugerencia de parada.',
      )
    } finally {
      setSubmittingStop(false)
    }
  }, [
    mapCenter,
    stopDetails,
    stopLocationSource,
    stopReportedAsOfficial,
    stopRouteId,
    submitStopSuggestion,
    userPosition,
  ])

  return (
    <>
      <section className="panel px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={openStopModal}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100"
        >
          Sugerir parada de Autobus
        </button>

        {stopSuccessMessage ? (
          <div className="mt-3 rounded-[1rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
            {stopSuccessMessage}
          </div>
        ) : null}
      </section>

      <PassengerStopSuggestionModal
        isOpen={isStopModalOpen}
        routes={routeOptions}
        selectedRouteName={selectedRoute?.name ?? null}
        selectedRouteId={stopRouteId}
        selectedLocationSource={stopLocationSource}
        mapCenter={mapCenter}
        userPosition={userPosition}
        reportedAsOfficial={stopReportedAsOfficial}
        details={stopDetails}
        isSubmitting={isSubmittingStop}
        submitError={stopError}
        onClose={closeStopModal}
        onRouteChange={setStopRouteId}
        onLocationSourceChange={setStopLocationSource}
        onReportedAsOfficialChange={setStopReportedAsOfficial}
        onDetailsChange={setStopDetails}
        onSubmit={() => {
          void handleSubmitStopSuggestion()
        }}
      />
    </>
  )
})
