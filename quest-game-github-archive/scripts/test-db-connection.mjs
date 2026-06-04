import { loadEnv } from './lib/load-env.mjs'
import { connectPostgres } from './lib/db-connect.mjs'

loadEnv()
const { client, label } = await connectPostgres()
console.log('OK:', label)
await client.end()
