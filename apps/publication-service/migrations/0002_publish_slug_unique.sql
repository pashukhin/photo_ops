-- Session 019: slug is minted (an opaque token) only at first publish; enforce
-- uniqueness defensively. Token entropy carries real uniqueness; this index is a
-- backstop. NULLs are distinct in a standard unique index, so the many null-slug
-- drafts never collide.
CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_unique ON posts (slug);
