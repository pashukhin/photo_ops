import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const photoAssets = pgTable(
  'photo_assets',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    objectKey: text('object_key').notNull().unique(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userCreatedAtIdx: index('photo_assets_user_created_at_idx').on(table.userId, table.createdAt),
    statusIdx: index('photo_assets_status_idx').on(table.status)
  })
);
