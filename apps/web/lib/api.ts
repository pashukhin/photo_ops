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
  const response = await fetch(`${API_BASE_URL}/v1/usage/summary`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `GetUsageSummary failed: ${response.status}`));
  }
  return response.json() as Promise<UsageSummary>;
}

// GREEN obligation (s012 add-on): build a query string from params — `from`,
// `to`, `resource_type`, `event_type`, `page`, `page_size` — appending each only
// when present, then GET `${API_BASE_URL}/v1/usage/events[?<query>]` with
// credentials and parse the UsageEvents (query construction pinned by api.spec.ts).
export async function listUsageEvents(_params: ListUsageEventsParams = {}): Promise<UsageEvents> {
  const params = _params;
  const qs = new URLSearchParams();

  if (params.from !== undefined) qs.append('from', params.from);
  if (params.to !== undefined) qs.append('to', params.to);
  if (params.resourceType !== undefined) qs.append('resource_type', params.resourceType);
  if (params.eventType !== undefined) qs.append('event_type', params.eventType);
  if (params.page !== undefined) qs.append('page', String(params.page));
  if (params.pageSize !== undefined) qs.append('page_size', String(params.pageSize));

  const queryString = qs.toString();
  const url = queryString ? `${API_BASE_URL}/v1/usage/events?${queryString}` : `${API_BASE_URL}/v1/usage/events`;

  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `ListUsageEvents failed: ${response.status}`));
  }
  return response.json() as Promise<UsageEvents>;
}

// --- Clustering (session 013) -----------------------------------------------

export interface ClusteringMethod {
  id: string;
  displayName: string;
  description: string;
  requiredPhotoFields: string[];
  defaultParamsJson: string;
}

export interface ClusterNode {
  id: string;
  kind: string; // 'root' | 'internal' | 'leaf' | 'not_clusterable' | 'segment'
  mergeDistance: number;
  dateFrom: string;
  dateTo: string;
  photoCount: number;
  coverPhotoId: string;
  segmentLabel: string;
  children: ClusterNode[];
  items: string[]; // photo ids entering at this node
}

export interface ClusteringResult {
  id: string;
  userId: string;
  method: string;
  paramsJson: string;
  inputFingerprint: string;
  status: string; // 'pending' | 'ready' | 'failed'
  errorMessage: string;
  createdAt: string;
  root: ClusterNode | null;
}

export interface ClusteringResultSummary {
  id: string;
  method: string;
  status: string;
  photoCount: number;
  dateFrom: string;
  dateTo: string;
  createdAt: string;
}

export async function listClusteringMethods(): Promise<{ methods: ClusteringMethod[] }> {
  const response = await fetch(`${API_BASE_URL}/v1/clustering-methods`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `ListClusteringMethods failed: ${response.status}`));
  }
  const body = (await response.json()) as { methods?: ClusteringMethod[] };
  return { methods: body.methods ?? [] };
}

export async function listClusteringResults(): Promise<{ results: ClusteringResultSummary[] }> {
  const response = await fetch(`${API_BASE_URL}/v1/clustering-results`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `ListClusteringResults failed: ${response.status}`));
  }
  const body = (await response.json()) as { results?: ClusteringResultSummary[] };
  return { results: body.results ?? [] };
}

export async function getClusteringResult(resultId: string): Promise<ClusteringResult> {
  const response = await fetch(`${API_BASE_URL}/v1/clustering-results/${resultId}`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `GetClusteringResult failed: ${response.status}`));
  }
  return response.json() as Promise<ClusteringResult>;
}

export async function generateClusters(input: {
  method: string;
  scope?: string;
  params?: Record<string, unknown>;
}): Promise<{ resultId: string; status: string }> {
  const response = await fetch(`${API_BASE_URL}/v1/clusters/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method: input.method, scope: input.scope ?? 'all', params: input.params })
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `GenerateClusters failed: ${response.status}`));
  }
  return response.json() as Promise<{ resultId: string; status: string }>;
}

// --- Publication (session 018) ----------------------------------------------

export interface PostPhoto {
  photoId: string;
  order: number;
  caption: string;
}

export interface Post {
  id: string;
  userId: string;
  sourceClusterId: string;
  sourceResultId: string;
  title: string;
  body: string;
  status: string;
  visibility: string;
  slug: string;
  locationLabel: string;
  dateFrom: string;
  dateTo: string;
  mapEnabled: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  photos: PostPhoto[];
}

// Replace-all photos: the post's photos become exactly this list (order =
// position). Omit `photos` for a scalar-only PATCH (leaves photos untouched).
export interface UpdatePostPatch {
  title?: string;
  body?: string;
  photos?: { photoId: string; caption: string }[];
}

export async function createPost(input: { resultId: string; nodeId: string; title?: string }): Promise<Post> {
  const response = await fetch(`${API_BASE_URL}/v1/posts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `CreatePost failed: ${response.status}`));
  }
  return response.json() as Promise<Post>;
}

export async function getPost(postId: string): Promise<Post> {
  const response = await fetch(`${API_BASE_URL}/v1/posts/${postId}`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `GetPost failed: ${response.status}`));
  }
  return response.json() as Promise<Post>;
}

export async function updatePost(postId: string, patch: UpdatePostPatch): Promise<Post> {
  const response = await fetch(`${API_BASE_URL}/v1/posts/${postId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `UpdatePost failed: ${response.status}`));
  }
  return response.json() as Promise<Post>;
}

// Publish a draft/unpublished post as public|unlisted (session 019). Client call
// (cookie-authed); the server mints slug + published_at on first publish.
export async function publishPost(postId: string, visibility: 'public' | 'unlisted'): Promise<Post> {
  const response = await fetch(`${API_BASE_URL}/v1/posts/${postId}/publish`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visibility })
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `PublishPost failed: ${response.status}`));
  }
  return response.json() as Promise<Post>;
}

export async function unpublishPost(postId: string): Promise<Post> {
  const response = await fetch(`${API_BASE_URL}/v1/posts/${postId}/unpublish`, {
    method: 'POST',
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `UnpublishPost failed: ${response.status}`));
  }
  return response.json() as Promise<Post>;
}

// A published post as seen by an anonymous visitor — no owner/status/visibility
// fields; photos carry only order/caption + resolved variant urls.
export interface PublicPostPhoto {
  order: number;
  caption: string;
  variants: { variantType: string; url: string; width: number; height: number }[];
}
export interface PublicPost {
  slug: string;
  title: string;
  body: string;
  locationLabel: string;
  dateFrom: string;
  dateTo: string;
  publishedAt: string;
  photos: PublicPostPhoto[];
}

// SERVER-ONLY (session 019): the public SSR page fetches this with NO session
// cookie against the internal gateway URL (inside docker the web container reaches
// the gateway by service name, not localhost). 404 → null (→ notFound()); any
// other non-OK throws (→ Next error boundary / 500, never a fake 404).
export async function getPublicPost(slug: string): Promise<PublicPost | null> {
  const base = process.env.API_BASE_URL_INTERNAL ?? API_BASE_URL;
  const response = await fetch(`${base}/v1/public/posts/${slug}`, { cache: 'no-store' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `GetPublicPost failed: ${response.status}`));
  }
  return response.json() as Promise<PublicPost>;
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

// --- Owner post listing (session 020) ---------------------------------------

// A post as it appears in the owner's "My posts" list — the gateway's mapSummary
// shape. No slug (rows link to the editor); no photos/body.
export interface PostSummary {
  id: string;
  title: string;
  status: string;
  visibility: string;
  dateFrom: string;
  dateTo: string;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

// GET the owner's posts (owner-scoped at the gateway) — the "My posts" listing.
export async function listPosts(): Promise<{ posts: PostSummary[] }> {
  const response = await fetch(`${API_BASE_URL}/v1/posts`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `ListPosts failed: ${response.status}`));
  }
  const body = (await response.json()) as { posts?: PostSummary[] };
  return { posts: body.posts ?? [] };
}
