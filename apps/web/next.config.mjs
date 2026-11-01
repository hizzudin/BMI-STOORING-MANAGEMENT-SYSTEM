// @ts-check

/**
 * Next.js configuration for the BMI Stooring System web app (TASK-117).
 *
 * `@bmi/shared` is a workspace package shipped as source + built `dist`; it is
 * transpiled here so the App Router build can consume its ESM directly. The web
 * app reaches data ONLY through the NestJS API (NFR-18): the base URL is read
 * server-side from `BMI_API_URL` and never exposed to the browser (all API
 * calls run in Server Components / Route Handlers behind the session cookie).
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@bmi/shared'],
  // The app is an internal operations tool, not a public site; keep the build
  // lean and deterministic.
  poweredByHeader: false,
  eslint: {
    // Linting is owned by the repo-root ESLint run (pnpm lint); do not run a
    // second, differently-configured pass inside `next build`.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
