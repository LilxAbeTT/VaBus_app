import { httpRouter } from 'convex/server'
import { api } from './_generated/api'
import { httpAction } from './_generated/server'

const http = httpRouter()

const defaultCorsHeaders = {
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'OPTIONS, POST',
  'Access-Control-Allow-Origin': '*',
  Vary: 'Origin',
}

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...defaultCorsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function getRequestErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    error.data !== undefined
  ) {
    return String(error.data)
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'No fue posible procesar la ubicación enviada desde la app.'
}

http.route({
  path: '/driver/location',
  method: 'OPTIONS',
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: defaultCorsHeaders,
    })
  }),
})

http.route({
  path: '/driver/location',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    let body: unknown

    try {
      body = await request.json()
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: 'El payload de ubicación no es JSON válido.',
        },
        400,
      )
    }

    if (typeof body !== 'object' || body === null) {
      return jsonResponse(
        {
          ok: false,
          error: 'El payload de ubicación debe ser un objeto JSON.',
        },
        400,
      )
    }

    const payload = body as {
      accuracyMeters?: number
      capturedAt?: string
      lat?: number
      lng?: number
      sessionToken?: string
    }

    if (
      typeof payload.sessionToken !== 'string' ||
      typeof payload.lat !== 'number' ||
      !Number.isFinite(payload.lat) ||
      typeof payload.lng !== 'number' ||
      !Number.isFinite(payload.lng)
    ) {
      return jsonResponse(
        {
          ok: false,
          error:
            'El payload de ubicación requiere sessionToken, lat y lng válidos.',
        },
        400,
      )
    }

    try {
      const result = await ctx.runMutation(api.driver.addLocationUpdate, {
        sessionToken: payload.sessionToken,
        lat: payload.lat,
        lng: payload.lng,
        accuracyMeters:
          typeof payload.accuracyMeters === 'number'
            ? payload.accuracyMeters
            : undefined,
        capturedAt:
          typeof payload.capturedAt === 'string' ? payload.capturedAt : undefined,
      })

      return jsonResponse(
        {
          ok: true,
          ...result,
        },
        200,
      )
    } catch (error) {
      const errorMessage = getRequestErrorMessage(error)
      const statusCode = errorMessage.includes('La sesión ya no es válida')
        ? 401
        : 400

      return jsonResponse(
        {
          ok: false,
          error: errorMessage,
        },
        statusCode,
      )
    }
  }),
})

export default http
