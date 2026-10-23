import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db.ts',
  out: './drizzle',
  // direct host, not Neon's pooler (same rule as src/server/migrate.ts)
  dbCredentials: { url: (process.env.DATABASE_URL ?? '').replace('-pooler.', '.') },
})
