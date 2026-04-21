import { memo } from 'react'
import type { BusRoute } from '../../../types/domain'

export const PassengerMapSelectionSummary = memo(function PassengerMapSelectionSummary({
  selectedRoute,
}: {
  selectedRoute: BusRoute | null
}) {
  if (!selectedRoute) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-2 z-10 flex justify-center sm:bottom-3">
      <div className="max-w-[min(92vw,30rem)] rounded-full border border-white/80 bg-white/94 px-4 py-2 shadow-[0_18px_32px_-28px_rgba(15,23,42,0.7)] backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-10 shrink-0 rounded-full"
            style={{ backgroundColor: selectedRoute.color }}
          />
          <p className="truncate text-sm font-semibold text-slate-900">
            {selectedRoute.name}
          </p>
        </div>
      </div>
    </div>
  )
})
