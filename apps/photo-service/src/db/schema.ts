import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const photoAssets = pgTable(
  'photo_assets',
  {
    id: uuid('id').primaryKey(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    objectKey: text('object_key').notNull().unique(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    createdAtIdx: index('photo_assets_created_at_idx').on(table.createdAt),
    statusIdx: index('photo_assets_status_idx').on(table.status)
  })
);
