// Roda as migrations do Drizzle no boot do container (idempotente).
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL não definida')
  process.exit(1)
}

const db = drizzle(url)
console.log('Aplicando migrations…')
await migrate(db, { migrationsFolder: './drizzle' })
console.log('Migrations aplicadas.')
await db.$client.end()
