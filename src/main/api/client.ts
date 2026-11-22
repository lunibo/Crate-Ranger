import { net, type Session } from 'electron'
import type { ApiParams } from '@shared/types'

export const SITE = 'https://www.soundscout.com'
export const API_BASE = `${SITE}/api`

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function toSearchParams(params?: ApiParams): URLSearchParams {
  const sp = new URLSearchParams()
  if (!params) return sp
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      for (const item of v) sp.append(k, String(item))
    } else sp.set(k, String(v))
  }
  return sp
}

export function apiUrl(path: string, params?: ApiParams): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const qs = toSearchParams(params).toString()
  return `${API_BASE}${p}${qs ? `?${qs}` : ''}`
}

/** API-Client, der die Cookies der Login-Session (goldloginz + cf_clearance) mitnutzt. */
export class SoundScoutApi {
  constructor(
    private readonly ses: Session,
    private readonly userAgent: string
  ) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Accept: 'application/json',
      'User-Agent': this.userAgent,
      Origin: SITE,
      Referer: `${SITE}/player`,
      ...extra
    }
  }

  private async handle<T>(res: Response): Promise<T> {
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* kein JSON */
    }
    if (!res.ok) {
      const err = (json as { Error?: { Message?: string; Code?: string } } | null)?.Error
      throw new ApiError(err?.Message || res.statusText || `HTTP ${res.status}`, res.status, err?.Code || '')
    }
    return json as T
  }

  async get<T>(path: string, params?: ApiParams): Promise<T> {
    const res = await this.ses.fetch(apiUrl(path, params), { headers: this.headers() })
    return this.handle<T>(res)
  }

  async post<T>(path: string, body?: unknown, params?: ApiParams): Promise<T> {
    const res = await this.ses.fetch(apiUrl(path, params), {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return this.handle<T>(res)
  }

  /** Folgt einer 302-Weiterleitung NICHT, sondern liefert deren Ziel (z.B. signierte GCS-URL beim Stream). */
  resolveRedirect(path: string, params?: ApiParams): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = net.request({
        url: apiUrl(path, params),
        session: this.ses,
        useSessionCookies: true,
        redirect: 'manual'
      })
      req.setHeader('User-Agent', this.userAgent)
      req.setHeader('Referer', `${SITE}/player`)
      let done = false
      req.on('redirect', (_status, _method, redirectUrl) => {
        done = true
        resolve(redirectUrl)
        req.abort()
      })
      req.on('response', (res) => {
        if (done) return
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(Buffer.from(c)))
        res.on('end', () => {
          let msg = `HTTP ${res.statusCode}`
          let code = ''
          try {
            const j = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            msg = j?.Error?.Message ?? msg
            code = j?.Error?.Code ?? ''
          } catch {
            /* ignore */
          }
          reject(new ApiError(msg, res.statusCode, code))
        })
      })
      req.on('error', (e) => {
        if (!done) reject(e)
      })
      req.end()
    })
  }

  /** Lädt eine absolute URL (z.B. signierte Download-URL) als Response. */
  fetchAbsolute(url: string, init?: RequestInit): Promise<Response> {
    return this.ses.fetch(url, { ...init, headers: { 'User-Agent': this.userAgent, ...(init?.headers ?? {}) } })
  }
}
