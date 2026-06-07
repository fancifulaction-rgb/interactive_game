import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

const LOG_DIR = 'diagnostic'
const LOG_FILE = 'client-logs.jsonl'

export function clientLogsFilePlugin(): Plugin {
  const absDir = path.resolve(__dirname, LOG_DIR)
  const absFile = path.join(absDir, LOG_FILE)

  function ensureDir() {
    if (!fs.existsSync(absDir)) {
      fs.mkdirSync(absDir, { recursive: true })
    }
  }

  return {
    name: 'quest-client-logs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''

        if (url === '/__client_logs/export' && req.method === 'GET') {
          ensureDir()
          if (!fs.existsSync(absFile)) {
            res.statusCode = 204
            res.end()
            return
          }
          res.setHeader('Content-Type', 'application/x-ndjson')
          res.end(fs.readFileSync(absFile, 'utf8'))
          return
        }

        if (url === '/__client_logs' && req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (c) => chunks.push(c))
          req.on('end', () => {
            ensureDir()
            const body = Buffer.concat(chunks).toString('utf8')
            if (body.trim()) {
              fs.appendFileSync(absFile, body.endsWith('\n') ? body : `${body}\n`)
            }
            res.statusCode = 204
            res.end()
          })
          return
        }

        next()
      })
    },
  }
}
