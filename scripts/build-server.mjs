import esbuild from 'esbuild';

async function buildServer() {
  console.log('Bundling server for Vercel and production...');
  await esbuild.build({
    entryPoints: ['server/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: 'api/index.js',
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
    },
    external: ['mysql2', 'bcryptjs']
  });
  console.log('Server bundle generated at api/index.js successfully!');
}

buildServer().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
