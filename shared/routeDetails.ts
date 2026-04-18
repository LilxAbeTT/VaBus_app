export interface PassengerRouteInfo {
  summary: string
  landmarks: string[]
  startTime?: string
  endTime?: string
  frequency?: string
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function dedupeStrings(values: string[]) {
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index)
}

export function repairPossibleMojibake(value: string) {
  if (!value || !/[ÃƒÃ‚]/.test(value)) {
    return value
  }

  const bytes = Uint8Array.from(value, (character) => character.charCodeAt(0))

  try {
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return value
  }
}

export function extractRouteDetails(direction: string): PassengerRouteInfo {
  const normalizedDirection = normalizeWhitespace(repairPossibleMojibake(direction))
  const startTimeMatch = normalizedDirection.match(
    /Inicio:\s*(.+?)(?=Finaliza:|Frecuencia:|$)/i,
  )
  const endTimeMatch = normalizedDirection.match(
    /Finaliza:\s*(.+?)(?=Frecuencia:|$)/i,
  )
  const frequencyMatch = normalizedDirection.match(/Frecuencia:\s*(.+)$/i)
  const summary = normalizedDirection
    .replace(/^Trayecto:\s*/i, '')
    .replace(/Inicio:\s*.+$/i, '')
    .trim()
    .replace(/[.,]\s*$/, '')
  const landmarks = dedupeStrings(
    summary
      .split(/\s+-\s+|,\s*/)
      .map((stop) => stop.trim()),
  )

  return {
    summary,
    landmarks,
    startTime: startTimeMatch?.[1]?.trim() || undefined,
    endTime: endTimeMatch?.[1]?.trim() || undefined,
    frequency: frequencyMatch?.[1]?.trim() || undefined,
  }
}

export function normalizeTextForSearch(value: string) {
  return repairPossibleMojibake(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
