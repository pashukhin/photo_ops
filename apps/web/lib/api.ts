const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export interface PhotoAsset {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: string;
  objectKey: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function createUploadIntent(file: File) {
  const response = await fetch(`${API_BASE_URL}/photos/upload-intents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: String(file.size) })
  });
  if (!response.ok) {
    throw new Error(`CreateUploadIntent failed: ${response.status}`);
  }
  return response.json() as Promise<{ photoId: string; uploadUrl: string }>;
}

export async function completeUpload(photoId: string) {
  const response = await fetch(`${API_BASE_URL}/photos/${photoId}/complete-upload`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`CompleteUpload failed: ${response.status}`);
  }
  return response.json() as Promise<PhotoAsset>;
}

export async function listPhotos() {
  const response = await fetch(`${API_BASE_URL}/photos`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`ListPhotos failed: ${response.status}`);
  }
  const body = await response.json();
  return (body.photos ?? []) as PhotoAsset[];
}

export async function uploadFileToPresignedUrl(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file
  });
  if (!response.ok) {
    throw new Error(`MinIO upload failed: ${response.status}`);
  }
}
