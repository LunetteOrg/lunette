import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  locale: text('locale'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Passwordless one-time codes, keyed by email; the verifyCode window locks the
// row FOR UPDATE, increments attempts, then consumes it.
export const otps = pgTable('otps', {
  email: text('email').primaryKey(),
  codeHash: text('code_hash').notNull(),
  nonce: text('nonce').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

// Authored content. `origFormat` is the source format the renderer reads; the
// idempotency key doubles as the primary key (idempotency-key-as-PK).
export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  origFormat: text('orig_format').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const comments = pgTable('comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  authorId: text('author_id').notNull(),
  parentId: text('parent_id'),
  body: text('body').notNull(),
  origFormat: text('orig_format').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// The render cache: one row per (contentType, contentId, surface). `source`
// records whether it was warmed upfront or filled lazily on read.
export const renderCache = pgTable(
  'render_cache',
  {
    contentType: text('content_type').notNull(),
    contentId: text('content_id').notNull(),
    surface: text('surface').notNull(),
    output: text('output').notNull(),
    source: text('source').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contentType, t.contentId, t.surface] })],
)
