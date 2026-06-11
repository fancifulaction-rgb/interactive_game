import fs from 'fs'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Plugin } from 'vite'

const LOG_DIR = 'diagnostic'
const LOG_FILE = 'client-logs.jsonl'
const PRODUCT_EVENTS_FILE = 'product-events.jsonl'
const DEVICES_DIR = 'devices'
const EXPORTS_DIR = 'exports'
const MANIFEST_FILE = 'devices-manifest.json'
/** Сессия считается «активной», если логи приходили не позже этого интервала. */
const ACTIVE_IDLE_MS = 2 * 60 * 1000

type DeviceManifestEntry = {
  sessionId: string
  ua: string
  host: string
  route: string
  firstSeen: number
  lastSeen: number
  lineCount: number
  file: string
}

type ClientLogCtx = {
  sessionId?: string
  ua?: string
  host?: string
  route?: string
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function safeSessionFileName(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

export function clientLogsFilePlugin(): Plugin {
  const absDir = path.resolve(__dirname, LOG_DIR)
  const absFile = path.join(absDir, LOG_FILE)
  const absProductFile = path.join(absDir, PRODUCT_EVENTS_FILE)
  const absDevicesDir = path.join(absDir, DEVICES_DIR)
  const absExportsDir = path.join(absDir, EXPORTS_DIR)
  const absManifest = path.join(absDir, MANIFEST_FILE)

  function ensureDirs() {
    for (const dir of [absDir, absDevicesDir, absExportsDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }
  }

  function readManifest(): Record<string, DeviceManifestEntry> {
    ensureDirs()
    if (!fs.existsSync(absManifest)) return {}
    try {
      return JSON.parse(fs.readFileSync(absManifest, 'utf8')) as Record<string, DeviceManifestEntry>
    } catch {
      return {}
    }
  }

  function writeManifest(manifest: Record<string, DeviceManifestEntry>) {
    ensureDirs()
    fs.writeFileSync(absManifest, JSON.stringify(manifest, null, 2), 'utf8')
  }

  function ingestNdjson(body: string) {
    if (!body.trim()) return
    ensureDirs()
    const normalized = body.endsWith('\n') ? body : `${body}\n`
    fs.appendFileSync(absFile, normalized)

    const manifest = readManifest()
    const lines = normalized.split('\n').filter(Boolean)

    for (const line of lines) {
      let entry: { ts?: number; ctx?: ClientLogCtx }
      try {
        entry = JSON.parse(line) as { ts?: number; ctx?: ClientLogCtx }
      } catch {
        continue
      }
      const sessionId = entry.ctx?.sessionId?.trim()
      if (!sessionId) continue

      const deviceFile = path.join(absDevicesDir, `${safeSessionFileName(sessionId)}.jsonl`)
      fs.appendFileSync(deviceFile, `${line}\n`)

      const prev = manifest[sessionId]
      const ts = typeof entry.ts === 'number' ? entry.ts : Date.now()
      manifest[sessionId] = {
        sessionId,
        ua: entry.ctx?.ua ?? prev?.ua ?? '',
        host: entry.ctx?.host ?? prev?.host ?? '',
        route: entry.ctx?.route ?? prev?.route ?? '',
        firstSeen: prev?.firstSeen ?? ts,
        lastSeen: ts,
        lineCount: (prev?.lineCount ?? 0) + 1,
        file: path.relative(absDir, deviceFile).replace(/\\/g, '/'),
      }
    }

    writeManifest(manifest)
  }

  function removeDeviceFromManifest(sessionId: string): boolean {
    const manifest = readManifest()
    const entry = manifest[sessionId]
    if (!entry) return false
    delete manifest[sessionId]
    writeManifest(manifest)
    const deviceFile = path.join(absDevicesDir, `${safeSessionFileName(sessionId)}.jsonl`)
    if (fs.existsSync(deviceFile)) {
      try {
        fs.unlinkSync(deviceFile)
      } catch {
        // ignore
      }
    }
    return true
  }

  function cleanupInactiveDevices(olderThanMs: number): string[] {
    const manifest = readManifest()
    const now = Date.now()
    const removed: string[] = []
    for (const [sessionId, entry] of Object.entries(manifest)) {
      if (now - entry.lastSeen >= olderThanMs) {
        delete manifest[sessionId]
        removed.push(sessionId)
        const deviceFile = path.join(absDevicesDir, `${safeSessionFileName(sessionId)}.jsonl`)
        if (fs.existsSync(deviceFile)) {
          try {
            fs.unlinkSync(deviceFile)
          } catch {
            // ignore
          }
        }
      }
    }
    if (removed.length > 0) writeManifest(manifest)
    return removed
  }

  function deviceWithActivity(entry: DeviceManifestEntry) {
    const idleMs = Date.now() - entry.lastSeen
    return {
      ...entry,
      idleMs,
      active: idleMs < ACTIVE_IDLE_MS,
    }
  }

  function sendJson(res: ServerResponse, status: number, data: unknown) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(data))
  }

  return {
    name: 'quest-client-logs',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''

        if (url === '/__client_logs/export' && req.method === 'GET') {
          ensureDirs()
          if (!fs.existsSync(absFile)) {
            res.statusCode = 204
            res.end()
            return
          }
          res.setHeader('Content-Type', 'application/x-ndjson')
          res.end(fs.readFileSync(absFile, 'utf8'))
          return
        }

        if (url === '/__client_logs/devices' && req.method === 'GET') {
          const manifest = readManifest()
          const now = Date.now()
          let devices = Object.values(manifest)
            .map(deviceWithActivity)
            .sort((a, b) => b.lastSeen - a.lastSeen)
          const activeOnly = req.url?.includes('activeOnly=1')
          if (activeOnly) {
            devices = devices.filter((d) => d.active)
          }
          sendJson(res, 200, {
            devices,
            updatedAt: now,
            activeIdleMs: ACTIVE_IDLE_MS,
            total: Object.keys(manifest).length,
            activeCount: Object.values(manifest).filter(
              (e) => now - e.lastSeen < ACTIVE_IDLE_MS
            ).length,
          })
          return
        }

        if (url === '/__client_logs/devices/cleanup' && req.method === 'POST') {
          try {
            const body = await readBody(req)
            let olderThanMs = ACTIVE_IDLE_MS
            if (body.trim()) {
              const parsed = JSON.parse(body) as { olderThanMs?: number }
              if (typeof parsed.olderThanMs === 'number' && parsed.olderThanMs > 0) {
                olderThanMs = parsed.olderThanMs
              }
            }
            const removed = cleanupInactiveDevices(olderThanMs)
            sendJson(res, 200, { ok: true, removed, count: removed.length })
          } catch {
            sendJson(res, 400, { ok: false, error: 'invalid body' })
          }
          return
        }

        if (url.startsWith('/__client_logs/device/') && req.method === 'DELETE') {
          const sessionId = decodeURIComponent(url.slice('/__client_logs/device/'.length))
          const ok = removeDeviceFromManifest(sessionId)
          sendJson(res, ok ? 200 : 404, { ok })
          return
        }

        if (url.startsWith('/__client_logs/device/') && req.method === 'GET') {
          const sessionId = decodeURIComponent(url.slice('/__client_logs/device/'.length))
          const file = path.join(absDevicesDir, `${safeSessionFileName(sessionId)}.jsonl`)
          if (!fs.existsSync(file)) {
            res.statusCode = 404
            res.end('not found')
            return
          }
          res.setHeader('Content-Type', 'application/x-ndjson')
          res.end(fs.readFileSync(file, 'utf8'))
          return
        }

        if (url === '/__client_logs/bundle' && req.method === 'POST') {
          try {
            const body = await readBody(req)
            const bundle = JSON.parse(body) as {
              exportedAt?: string
              entries?: unknown[]
              meta?: { ua?: string; host?: string; route?: string }
            }
            const sessionId =
              (bundle.entries?.[0] as { ctx?: ClientLogCtx } | undefined)?.ctx?.sessionId ??
              `export-${Date.now()}`
            ensureDirs()
            const stamp = new Date().toISOString().replace(/[:.]/g, '-')
            const outFile = path.join(
              absExportsDir,
              `quest-diagnostic-${safeSessionFileName(sessionId)}-${stamp}.json`
            )
            fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2), 'utf8')

            if (Array.isArray(bundle.entries) && bundle.entries.length > 0) {
              const ndjson =
                bundle.entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
              ingestNdjson(ndjson)
            }

            sendJson(res, 200, {
              ok: true,
              path: path.relative(absDir, outFile).replace(/\\/g, '/'),
            })
          } catch {
            sendJson(res, 400, { ok: false, error: 'invalid bundle' })
          }
          return
        }

        if (url === '/__client_logs' && req.method === 'POST') {
          try {
            const body = await readBody(req)
            ingestNdjson(body)
            res.statusCode = 204
            res.end()
          } catch {
            res.statusCode = 500
            res.end('ingest failed')
          }
          return
        }

        if (url === '/__product_events' && req.method === 'POST') {
          try {
            const body = await readBody(req)
            const parsed = JSON.parse(body) as { events?: unknown[] }
            const events = Array.isArray(parsed.events) ? parsed.events : []
            if (events.length > 0) {
              ensureDirs()
              const lines =
                events
                  .map((ev) =>
                    JSON.stringify({
                      ts: Date.now(),
                      kind: 'product',
                      ...(typeof ev === 'object' && ev !== null ? ev : { event: ev }),
                    })
                  )
                  .join('\n') + '\n'
              fs.appendFileSync(absProductFile, lines)
            }
            res.statusCode = 204
            res.end()
          } catch {
            res.statusCode = 400
            res.end('invalid product events')
          }
          return
        }

        next()
      })
    },
  }
}
