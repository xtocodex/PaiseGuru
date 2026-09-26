import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

/** Migrations need a direct connection, not Neon's pooler (host suffix -pooler). */
export function directUrl(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL is not set')
  return url.replace('-pooler.', '.')
}

export async function runMigrations(url: string | undefined) {
  const client = new pg.Client({ connectionString: directUrl(url) })
  await client.connect()
  try {
    await migrate(drizzle(client), { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname })
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  await runMigrations(process.env.DATABASE_URL)
  console.log(JSON.stringify({ level: 'info', msg: 'migrations applied' }))
}
