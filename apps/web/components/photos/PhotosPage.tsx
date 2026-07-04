'use client';

// GREEN obligation (session 014): render <PhotoGallery reloadToken> plus the upload
// action moved verbatim from the old app/page.tsx — a file input + Upload button
// running createUploadIntent → uploadFileToPresignedUrl → completeUpload, then
// bumping reloadToken so the new photo appears. No gallery-internal changes. The
// stub renders a placeholder so the gallery + upload tests are RED.
export function PhotosPage() {
  return <div data-photospage-stub />;
}
