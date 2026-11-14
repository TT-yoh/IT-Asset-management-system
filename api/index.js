// Vercel serverless entry point (tracked in git).
// The real server bundle is generated at build time by scripts/build-server.mjs
// into api/_server.js (gitignored; the leading underscore keeps Vercel from
// treating it as a separate function). This file must exist in the repo so the
// `functions["api/index.js"]` entry in vercel.json validates before the build runs.
export { default } from './_server.js';
