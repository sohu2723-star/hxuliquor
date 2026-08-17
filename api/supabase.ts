import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

export const config = { api: { bodyParser: false } }

const DEFAULT_SUPABASE_URL = 'https://zgiixmeanpevvdrcizfh.supabase.co'

type ProxyRequest = IncomingMessage & { url?: string }

function getSupabaseOrigin() {
  const configured = process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
  return configured
    .replace(/\/(?:rest|auth|storage|functions)\/v1\/?$/, '')
    .replace(/\/$/, '')
}

function sendJson(res: ServerResponse, statusCode: number, value: unknown) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

export default async function handler(req: ProxyRequest, res: ServerResponse) {
  const incoming = new URL(req.url || '/', 'https://hxuliquor.vercel.app')
  const proxyPath = incoming.searchParams.get('path') || ''
  incoming.searchParams.delete('path')
  const normalizedPath = `/${proxyPath.replace(/^\/+/, '')}`
  const target = `${getSupabaseOrigin()}${normalizedPath}${incoming.search}`
  const method = (req.method || 'GET').toUpperCase()
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase()
    if (value === undefined || lower === 'host' || lower === 'connection') continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : req as unknown as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    res.statusCode = upstream.status
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase()
      if (lower !== 'content-encoding' && lower !== 'transfer-encoding') res.setHeader(key, value)
    })
    if (!upstream.body) {
      res.end()
      return
    }
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
  } catch (error) {
    sendJson(res, 502, {
      error: 'Supabase proxy request failed',
      detail: error instanceof Error ? error.message : 'Unknown proxy error',
    })
  }
}
