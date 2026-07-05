import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDb() {
  const connectionString = process.env.PUBLICATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error('PUBLICATION_DATABASE_URL is required');
  }
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}
