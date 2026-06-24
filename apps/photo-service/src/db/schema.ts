import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // nullable attribute columns added in migration 0002
    width: integer('width'),
    height: integer('height'),
    takenAtLocal: timestamp('taken_at_local', { withTimezone: false }),
    takenAtUtc: timestamp('taken_at_utc', { withTimezone: true }),
    takenAtTzSource: text('taken_at_tz_source'),
    cameraMake: text('camera_make'),
    cameraModel: text('camera_model'),
    orientation: smallint('orientation'),
    lat: doublePrecision('lat'),
    lon: doublePrecision('lon'),
    metadataJson: jsonb('metadata_json'),
  },
  (table) => ({
    userCreatedAtIdx: index('photo_assets_user_created_at_idx').on(table.userId, table.createdAt),
    statusIdx: index('photo_assets_status_idx').on(table.status)
  })
);

export const photoVariants = pgTable(
  'photo_variants',
  {
    id: uuid('id').primaryKey(),
    photoId: uuid('photo_id').notNull(),
    variantType: text('variant_type').notNull(),
    objectKey: text('object_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    contentType: text('content_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    photoTypeUq: uniqueIndex('photo_variants_photo_type_uq').on(table.photoId, table.variantType),
  })
);

export const processingJobs = pgTable(
  'processing_jobs',
  {
    id: uuid('id').primaryKey(),
    photoId: uuid('photo_id').notNull(),
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('queued'),
    correlationId: text('correlation_id'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    photoIdx: index('processing_jobs_photo_idx').on(table.photoId),
  })
);
