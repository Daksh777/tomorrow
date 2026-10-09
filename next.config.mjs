/** @type {import('next').NextConfig} */
// NEXT_DIST_DIR lets a production build run next to a running dev server without clobbering `.next`.
const nextConfig = { reactStrictMode: true, distDir: process.env.NEXT_DIST_DIR || ".next" };
export default nextConfig;
