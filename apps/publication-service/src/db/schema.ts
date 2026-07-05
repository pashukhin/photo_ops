import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    // cluster node id the post was drafted from; the run id that node lives in.
    // Cross-service refs (UUID v7), no FK — cluster results are immutable and the
    // post's photo membership is snapshotted into post_photos at creation.
    sourceClusterId: uuid('source_cluster_id').notNull(),
    sourceResultId: uuid('source_result_id').notNull(),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    status: text('status').notNull().default('draft'),
    visibility: text('visibility').notNull().default('private'),
    // slug + published_at stay null until publish (session 019).
    slug: text('slug'),
    locationLabel: text('location_label').notNull().default(''),
    dateFrom: timestamp('date_from', { withTimezone: true }),
    dateTo: timestamp('date_to', { withTimezone: true }),
    mapEnabled: boolean('map_enabled').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    // Matches the migration's (user_id, created_at DESC) — newest-first list scan.
    userCreatedAtIdx: index('posts_user_created_at_idx').on(table.userId, table.createdAt.desc())
  })
);

export const postPhotos = pgTable(
  'post_photos',
  {
    postId: uuid('post_id').notNull(),
    photoId: uuid('photo_id').notNull(),
    order: integer('order').notNull(),
    caption: text('caption').notNull().default('')
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.photoId] }),
    postOrderIdx: index('post_photos_post_order_idx').on(table.postId, table.order)
  })
);
