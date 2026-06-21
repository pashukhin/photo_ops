import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ObjectStoragePort } from '../photo/photo.service';

@Injectable()
export class MinioStorageService implements ObjectStoragePort {
  private readonly bucket = process.env.MINIO_BUCKET ?? 'photo-ops-originals';
  private readonly client = new S3Client({
    region: 'us-east-1',
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://minio:9000',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin'
    }
  });
  private readonly uploadClient = new S3Client({
    region: 'us-east-1',
    endpoint: process.env.MINIO_BROWSER_ENDPOINT ?? process.env.MINIO_ENDPOINT ?? 'http://minio:9000',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin'
    }
  });

  async createPresignedPutUrl(objectKey: string, contentType: string) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType });
    const uploadUrl = await getSignedUrl(this.uploadClient, command, { expiresIn: 900 });
    return { uploadUrl, expiresAt: new Date(Date.now() + 900_000) };
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return true;
    } catch {
      return false;
    }
  }
}
