/** @type {import('next').NextConfig} */
const nextConfig = {
  // Linting is the one canonical `make lint` (root eslint.config.mjs over the
  // whole repo); `next build` must not run its own ESLint pass.
  eslint: { ignoreDuringBuilds: true }
};

module.exports = nextConfig;
