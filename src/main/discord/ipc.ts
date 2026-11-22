import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { connect, type Socket } from 'node:net'
import { join } from 'node:path'

/**
 * Minimaler Client für die lokale Discord-RPC-Schnittstelle (Rich Presence).
 * Protokoll: Frames aus Opcode (uint32 LE) + Länge (uint32 LE) + JSON.
 * Unter Windows eine Named Pipe, unter Linux/macOS ein Unix-Socket.
 */
export enum Op {
  Handshake = 0,
  Frame = 1,
  Close = 2,
  Ping = 3,
  Pong = 4
}

export interface DiscordUser {
  id: string
  username: string
  global_name?: string | null
}

/** Mögliche Socket-Pfade (Discord, Discord Canary/PTB, Flatpak, Snap, Vesktop). */
export function candidatePaths(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  const paths: string[] = []
  if (platform === 'win32') {
    for (let i = 0; i < 10; i++) paths.push(`\\\\?\\pipe\\discord-ipc-${i}`)
    return paths
  }
  const bases = [env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, '/tmp'].filter((b): b is string => !!b)
  const subdirs = ['', 'app/com.discordapp.Discord', 'app/com.discordapp.DiscordCanary', 'snap.discord', 'snap.discord-canary', '.flatpak/dev.vencord.Vesktop/xdg-run']
  for (const base of [...new Set(bases)]) {
    for (const sub of subdirs) {
      for (let i = 0; i < 10; i++) paths.push(join(base, sub, `discord-ipc-${i}`))
    }
  }
  return paths
}

export function encodeFrame(op: Op, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(8)
  header.writeUInt32LE(op, 0)
  header.writeUInt32LE(json.length, 4)
  return Buffer.concat([header, json])
}

/** Zerlegt einen Byte-Strom in Frames (auch über mehrere data-Events verteilt). */
export class FrameDecoder {
  private buf = Buffer.alloc(0)
  push(chunk: Buffer): { op: Op; data: unknown }[] {
    this.buf = Buffer.concat([this.buf, chunk])
    const out: { op: Op; data: unknown }[] = []
    while (this.buf.length >= 8) {
      const op = this.buf.readUInt32LE(0) as Op
      const len = this.buf.readUInt32LE(4)
      if (this.buf.length < 8 + len) break
      const body = this.buf.subarray(8, 8 + len).toString('utf8')
      this.buf = this.buf.subarray(8 + len)
      let data: unknown = null
      try {
        data = JSON.parse(body)
      } catch {
        /* defekter Frame */
      }
      out.push({ op, data })
    }
    return out
  }
}

function tryConnect(path: string, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const sock = connect(path)
    const timer = setTimeout(() => {
      sock.destroy()
      reject(new Error('timeout'))
    }, timeoutMs)
    sock.once('connect', () => {
      clearTimeout(timer)
      resolve(sock)
    })
    sock.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

/**
 * Events: 'ready' (user), 'close' (reason)
 */
export class DiscordIpcClient extends EventEmitter {
  private socket: Socket | null = null
  private decoder = new FrameDecoder()
  user: DiscordUser | null = null

  constructor(
    private readonly clientId: string,
    private readonly paths: string[] = candidatePaths()
  ) {
    super()
  }

  get connected(): boolean {
    return !!this.socket && !!this.user
  }

  /** Verbindet sich mit dem ersten erreichbaren Discord-Client und wartet auf READY. */
  async connect(timeoutMs = 5000): Promise<DiscordUser> {
    let sock: Socket | null = null
    for (const p of this.paths) {
      try {
        sock = await tryConnect(p, 1000)
        break
      } catch {
        /* nächster Pfad */
      }
    }
    if (!sock) throw Object.assign(new Error('Discord not running'), { code: 'NOT_RUNNING' })
    this.socket = sock
    this.decoder = new FrameDecoder()

    return new Promise<DiscordUser>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.destroy()
        reject(Object.assign(new Error('Discord handshake timeout'), { code: 'TIMEOUT' }))
      }, timeoutMs)
      let settled = false
      sock!.on('data', (chunk: Buffer) => {
        for (const { op, data } of this.decoder.push(chunk)) {
          const msg = (data ?? {}) as { cmd?: string; evt?: string; data?: { user?: DiscordUser; message?: string; code?: number }; code?: number; message?: string }
          if (op === Op.Ping) {
            sock!.write(encodeFrame(Op.Pong, data))
          } else if (op === Op.Close) {
            const reason = msg.message ?? 'closed'
            if (!settled) {
              settled = true
              clearTimeout(timer)
              reject(Object.assign(new Error(reason), { code: msg.code === 4000 ? 'INVALID_CLIENT_ID' : 'CLOSED' }))
            }
            this.destroy(reason)
          } else if (op === Op.Frame && msg.cmd === 'DISPATCH' && msg.evt === 'READY') {
            this.user = msg.data?.user ?? { id: '', username: '' }
            if (!settled) {
              settled = true
              clearTimeout(timer)
              resolve(this.user)
            }
            this.emit('ready', this.user)
          } else if (op === Op.Frame && msg.evt === 'ERROR') {
            this.emit('error-response', msg.data)
          }
        }
      })
      sock!.on('close', () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(Object.assign(new Error('Discord closed the connection'), { code: 'CLOSED' }))
        }
        this.destroy('socket closed')
      })
      sock!.on('error', () => undefined)
      sock!.write(encodeFrame(Op.Handshake, { v: 1, client_id: this.clientId }))
    })
  }

  /** Setzt oder (mit null) entfernt die Aktivität. */
  setActivity(activity: Record<string, unknown> | null): void {
    if (!this.socket) return
    this.socket.write(
      encodeFrame(Op.Frame, {
        cmd: 'SET_ACTIVITY',
        args: activity ? { pid: process.pid, activity } : { pid: process.pid },
        nonce: randomUUID()
      })
    )
  }

  destroy(reason = 'destroyed'): void {
    const sock = this.socket
    if (!sock) return
    this.socket = null
    this.user = null
    try {
      sock.end()
      sock.destroy()
    } catch {
      /* ignore */
    }
    this.emit('close', reason)
  }
}
