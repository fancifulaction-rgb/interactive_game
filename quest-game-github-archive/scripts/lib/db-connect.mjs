import pg from 'pg'

const REF = 'tvytsnnujaucoluoyvjq'

/** Варианты подключения (прямой хост + pooler для IPv4) */
export function getDatabaseUrlCandidates() {
  const pwd = process.env.SUPABASE_DB_PASSWORD
  const enc = pwd ? encodeURIComponent(pwd) : ''

  const urls = []
  if (process.env.DATABASE_URL) urls.push({ label: 'DATABASE_URL', url: process.env.DATABASE_URL })
  if (process.env.DATABASE_URL_SESSION_POOLER) {
    urls.push({ label: 'DATABASE_URL_SESSION_POOLER', url: process.env.DATABASE_URL_SESSION_POOLER })
  }
  if (pwd) {
    urls.push({
      label: 'direct (Connect → Connection string)',
      url: `postgresql://postgres:${enc}@db.${REF}.supabase.co:5432/postgres`,
    })
    for (const pooler of ['aws-1-eu-central-1', 'aws-0-eu-central-1']) {
      urls.push({
        label: `session pooler ${pooler}`,
        url: `postgresql://postgres.${REF}:${enc}@${pooler}.pooler.supabase.com:5432/postgres`,
      })
      urls.push({
        label: `transaction pooler ${pooler}`,
        url: `postgresql://postgres.${REF}:${enc}@${pooler}.pooler.supabase.com:6543/postgres`,
      })
    }
  }
  return urls
}

function sortCandidatesForDdl(candidates) {
  const score = (label) => {
    if (label.includes('direct') || label === 'DATABASE_URL') return 0
    if (label.includes('session pooler')) return 1
    return 2
  }
  return [...candidates].sort((a, b) => score(a.label) - score(b.label))
}

function attachClientErrorGuard(client) {
  client.on('error', (err) => {
    console.error('Postgres connection error:', err.message)
  })
}

export async function connectPostgres(options = {}) {
  const preferDdl = options.preferDdl === true
  let candidates = getDatabaseUrlCandidates()
  if (!candidates.length) {
    throw new Error('Задайте SUPABASE_DB_PASSWORD или DATABASE_URL в .env')
  }
  if (preferDdl) candidates = sortCandidatesForDdl(candidates)

  const errors = []
  for (const { label, url } of candidates) {
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
    attachClientErrorGuard(client)
    try {
      await client.connect()
      await client.query('SELECT 1')
      return { client, label, url }
    } catch (err) {
      errors.push(`${label}: ${err.message}`)
      try {
        await client.end()
      } catch {
        /* ignore */
      }
    }
  }

  throw new Error(`Не удалось подключиться к Postgres:\n${errors.join('\n')}`)
}
