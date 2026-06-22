import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export function createDb() {
  const connectionString = process.env.IDENTITY_DATABASE_URL;
  if (!connectionString) {
    throw new Error('IDENTITY_DATABASE_URL is required');
  }
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}
