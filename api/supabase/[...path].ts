import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = { api: { bodyParser: false } }

const DEFAULT_SUPABASE_URL = 'https://zgiixmeanpevvdrcizfh.supabase.co'

type ProxyRequest = IncomingMessage & { url?: string }
type ProxyResponse = ServerResponse & {
  status?: (code: number) => ProxyResponse
  json?: (value: unknown) => void
}

function getSupabaseOrigin() {
  const configured = process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
  return configured
    .replace(/\/(?:rest|auth|storage|functions)\/v1\/?$/, '')
    .replace(/\/$/, '')
}

export default async function handler(req: ProxyRequest, res: ProxyResponse) {
  const incoming = new URL(req.url || '/', 'https://hxuliquor.vercel.app')
  const path = incoming.pathname.replace(/^\/api\/supabase/, '') || '/'
  const target = `${getSupabaseOrigin()}${path}${incoming.search}`
  const method = (req.method || 'GET').toUpperCase()
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || key.toLowerCase() === 'host' || key.toLowerCase() === 'connection') continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : req as unknown as BodyInit,
      // Node fetch requires duplex for a streamed request body.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    res.statusCode = upstream.status
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'transfer-encoding') res.setHeader(key, value)
    })
    const payload = Buffer.from(await upstream.arrayBuffer())
    res.end(payload)
  } catch (error) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Supabase proxy request failed', detail: error instanceof Error ? error.message : 'Unknown proxy error' }))
  }
}
