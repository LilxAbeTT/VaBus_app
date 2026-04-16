import { CapacitorHttp } from '@capacitor/core'

import { convexSiteUrl } from '../../../lib/env'
import type { DriverLocationReading } from '../hooks/locationTrackingTypes'

const DRIVER_LOCATION_UPLOAD_PATH = '/driver/location'

interface NativeLocationUploadResponse {
  ok?: boolean
  recordedAt?: string
  error?: string
}

export class NativeLocationUploadError extends Error {
  retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'NativeLocationUploadError'
    this.retryable = retryable
  }
}

function parseUploadResponsePayload(data: unknown): NativeLocationUploadResponse {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as NativeLocationUploadResponse
    } catch {
      return {}
    }
  }

  if (typeof data === 'object' && data !== null) {
    return data as NativeLocationUploadResponse
  }

  return {}
}

function buildRetryableUploadError() {
  return new NativeLocationUploadError(
    'No fue posible sincronizar la ubicación en este momento. Se reintentará cuando vuelva la conexión.',
    true,
  )
}

export async function uploadNativeLocationUpdate({
  sessionToken,
  reading,
}: {
  sessionToken: string
  reading: DriverLocationReading
}) {
  if (!convexSiteUrl) {
    throw new NativeLocationUploadError(
      'La app no tiene configurado el endpoint HTTP de Convex para tracking nativo.',
      false,
    )
  }

  let response: Awaited<ReturnType<typeof CapacitorHttp.post>>

  try {
    response = await CapacitorHttp.post({
      url: `${convexSiteUrl}${DRIVER_LOCATION_UPLOAD_PATH}`,
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        sessionToken,
        lat: reading.coordinates.lat,
        lng: reading.coordinates.lng,
        accuracyMeters: reading.accuracyMeters ?? undefined,
        capturedAt: reading.capturedAt,
      },
      connectTimeout: 15_000,
      readTimeout: 15_000,
    })
  } catch {
    throw buildRetryableUploadError()
  }

  const payload = parseUploadResponsePayload(response.data)
  const errorMessage = payload.error ?? 'No fue posible sincronizar la ubicación.'

  if (response.status >= 500 || response.status === 408 || response.status === 429) {
    throw buildRetryableUploadError()
  }

  if (response.status >= 400 || !payload.ok || !payload.recordedAt) {
    throw new NativeLocationUploadError(errorMessage, false)
  }

  return {
    recordedAt: payload.recordedAt,
  }
}
