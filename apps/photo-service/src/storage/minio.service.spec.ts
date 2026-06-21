import { afterEach, describe, expect, it } from 'vitest';
import { MinioStorageService } from './minio.service';

describe('MinioStorageService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('signs upload URLs with the browser-accessible endpoint', async () => {
    process.env.MINIO_ENDPOINT = 'http://minio:9000';
    process.env.MINIO_BROWSER_ENDPOINT = 'http://localhost:9000';
    process.env.MINIO_BUCKET = 'photo-ops-originals';
    process.env.MINIO_ROOT_USER = 'minioadmin';
    process.env.MINIO_ROOT_PASSWORD = 'minioadmin';

    const storage = new MinioStorageService();

    const { uploadUrl } = await storage.createPresignedPutUrl('originals/smoke.jpg', 'image/jpeg');

    expect(new URL(uploadUrl).origin).toBe('http://localhost:9000');
  });
});
