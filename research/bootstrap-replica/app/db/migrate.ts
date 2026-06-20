import { sql } from 'drizzle-orm'
import type { Db } from './client.ts'

// Ephemeral PGlite carries no migration history, so the replica creates its
// schema on boot. Faithful enough — a real app runs drizzle-kit migrations
// at this seam; here the DDL mirrors `schema.ts` directly.
const statements = [
  sql`CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    email text NOT NULL UNIQUE,
    display_name text,
    locale text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS otps (
    email text PRIMARY KEY,
    code_hash text NOT NULL,
    nonce text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    expires_at timestamptz NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS posts (
    id text PRIMARY KEY,
    author_id text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    orig_format text NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS comments (
    id text PRIMARY KEY,
    post_id text NOT NULL,
    author_id text NOT NULL,
    parent_id text,
    body text NOT NULL,
    orig_format text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS render_cache (
    content_type text NOT NULL,
    content_id text NOT NULL,
    surface text NOT NULL,
    output text NOT NULL,
    source text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (content_type, content_id, surface)
  )`,
]

export const migrate = async (db: Db): Promise<void> => {
  for (const statement of statements) await db.execute(statement)
}
