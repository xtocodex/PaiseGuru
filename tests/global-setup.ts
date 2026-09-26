import { loadEnv } from 'vite'
import { runMigrations } from '../src/server/migrate.ts'

export default async function () {
  const url = loadEnv('test', process.cwd(), '').TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL is not set')
  await runMigrations(url)
}
