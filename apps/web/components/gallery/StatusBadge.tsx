export interface StatusBadgeProps {
  status: string;
}

// GREEN obligation (session 011): render the status as a labelled badge whose
// text contains the status name (PhotoGallery.spec.tsx queries it by text).
// Distinct visual treatment per status (e.g. ready/processing/failed) is a
// styling concern for the implementer (shadcn Badge).
export function StatusBadge(_props: StatusBadgeProps) {
  return null; // GREEN is the implementer's job
}
