const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export interface PhotoVariant {
  variantType: string; // 'thumbnail' | 'preview'
  url: string; // short-lived owner-scoped presigned GET url
  width: number;
  height: number;
}

export interface PhotoAsset {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: string;
  objectKey: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  // Extracted attributes (present once processing finishes; absent/0 before).
  width?: number;
  height?: number;
  takenAtLocal?: string;
  takenAtUtc?: string;
  takenAtTzSource?: string;
  cameraMake?: string;
  cameraModel?: string;
  orientation?: number;
  lat?: number;
  lon?: number;
  variants?: PhotoVariant[];
}

export type PhotoSortField = 'created_at' | 'taken_at' | 'filename' | 'size_bytes';

export type SortDirection = 'asc' | 'desc';

export interface ListPhotosParams {
  page?: number;
  pageSize?: number;
  sort?: PhotoSortField;
  dir?: SortDirection;
  status?: string[]; // status names to filter by; empty/undefined = all
  q?: string; // filename substring search
}

export interface ListPhotosResult {
  photos: PhotoAsset[];
  totalCount: number;
}

export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
}

export async function signUp(input: { email: string; password: string; displayName: string }) {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `SignUp failed: ${response.status}`));
  }
  return response.json() as Promise<CurrentUser>;
}

export async function login(input: { email: string; password: string }) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Login failed: ${response.status}`));
  }
  return response.json() as Promise<CurrentUser>;
}

export async function logout() {
  const response = await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Logout failed: ${response.status}`));
  }
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include', cache: 'no-store' });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `GetCurrentUser failed: ${response.status}`));
  }
  return response.json() as Promise<CurrentUser>;
}

export async function createUploadIntent(file: File) {
  const response = await fetch(`${API_BASE_URL}/photos/upload-intents`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: String(file.size) })
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `CreateUploadIntent failed: ${response.status}`));
  }
  return response.json() as Promise<{ photoId: string; uploadUrl: string }>;
}

export async function completeUpload(photoId: string) {
  const response = await fetch(`${API_BASE_URL}/photos/${photoId}/complete-upload`, { method: 'POST', credentials: 'include' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `CompleteUpload failed: ${response.status}`));
  }
  return response.json() as Promise<PhotoAsset>;
}

// GREEN obligation (session 011): build a query string from params — page,
// pageSize, sort, dir, repeated `status` for each filter value, q — appending
// `?<query>` only when at least one param is present (pinned by api.spec.ts).
// GET it with credentials, then return { photos: body.photos ?? [], totalCount:
// body.totalCount ?? 0 }.
export async function listPhotos(_params: ListPhotosParams = {}): Promise<ListPhotosResult> {
  throw new Error('NotImplemented: listPhotos'); // GREEN is the implementer's job
}

// GREEN obligation (session 011): GET `${API_BASE_URL}/photos/${photoId}` with
// credentials and return the parsed PhotoAsset (throw readErrorMessage on !ok).
export async function getPhoto(_photoId: string): Promise<PhotoAsset> {
  throw new Error('NotImplemented: getPhoto'); // GREEN is the implementer's job
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

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.clone().json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.trim() ? body.message : fallback;
  } catch {
    return fallback;
  }
}
