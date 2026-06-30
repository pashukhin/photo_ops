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
  const params = _params;
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.append('page', String(params.page));
  }
  if (params.pageSize !== undefined) {
    qs.append('pageSize', String(params.pageSize));
  }
  if (params.sort !== undefined) {
    qs.append('sort', params.sort);
  }
  if (params.dir !== undefined) {
    qs.append('dir', params.dir);
  }
  if (params.status && params.status.length > 0) {
    params.status.forEach(s => qs.append('status', s));
  }
  if (params.q !== undefined) {
    qs.append('q', params.q);
  }

  const queryString = qs.toString();
  const url = queryString ? `${API_BASE_URL}/photos?${queryString}` : `${API_BASE_URL}/photos`;

  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `ListPhotos failed: ${response.status}`));
  }
  const body = (await response.json()) as { photos?: PhotoAsset[]; totalCount?: number };
  return { photos: body.photos ?? [], totalCount: body.totalCount ?? 0 };
}

// GREEN obligation (session 011): GET `${API_BASE_URL}/photos/${photoId}` with
// credentials and return the parsed PhotoAsset (throw readErrorMessage on !ok).
export async function getPhoto(_photoId: string): Promise<PhotoAsset> {
  const response = await fetch(`${API_BASE_URL}/photos/${_photoId}`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `GetPhoto failed: ${response.status}`));
  }
  return response.json() as Promise<PhotoAsset>;
}

// --- Usage report (session 012 add-on) --------------------------------------

export interface UsageSummaryLine {
  eventType: string;
  resourceType: string;
  totalQuantity: number;
  unit: string;
}

export interface UsageSummary {
  lines: UsageSummaryLine[];
  estimatedMonthlyCost: string;
  currency: string;
}

export interface UsageEventLine {
  occurredAt: string;
  eventType: string;
  resourceType: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  amount: string;
  currency: string;
  sourceEntityType: string;
  sourceEntityId: string;
}

export interface UsageEvents {
  lines: UsageEventLine[];
  totalCount: number;
  filteredTotalAmount: string;
  currency: string;
}

export interface ListUsageEventsParams {
  from?: string; // ISO date/instant lower bound on occurred_at
  to?: string; // ISO date/instant upper bound
  resourceType?: string;
  eventType?: string;
  page?: number;
  pageSize?: number;
}

// GREEN obligation (s012 add-on): GET `${API_BASE_URL}/v1/usage/summary` with
// credentials; parse and return the UsageSummary (throw readErrorMessage on !ok).
export async function getUsageSummary(): Promise<UsageSummary> {
  throw new Error('not implemented'); // GREEN is the implementer's job
}

// GREEN obligation (s012 add-on): build a query string from params — `from`,
// `to`, `resource_type`, `event_type`, `page`, `page_size` — appending each only
// when present, then GET `${API_BASE_URL}/v1/usage/events[?<query>]` with
// credentials and parse the UsageEvents (query construction pinned by api.spec.ts).
export async function listUsageEvents(_params: ListUsageEventsParams = {}): Promise<UsageEvents> {
  throw new Error('not implemented'); // GREEN is the implementer's job
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
