import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export function loadEnv(rootDir) {
  const root = rootDir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return root
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
  return root
}

export const PROJECT_REF = 'tvytsnnujaucoluoyvjq'
