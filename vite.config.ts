import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// A7: Build-time security gate: throw on any VITE_* variable containing secrets
const FORBIDDEN_VITE_TERMS = ['SECRET', 'PASS', 'KEY', 'TOKEN', 'TIDB', 'GEMINI'];
for (const key of Object.keys(process.env)) {
  if (key.startsWith('VITE_')) {
    const upper = key.toUpperCase();
    for (const term of FORBIDDEN_VITE_TERMS) {
      if (upper.includes(term)) {
        throw new Error(
          `\n======================================================\nFATAL SECURITY VIOLATION: Forbidden secret variable "${key}" detected in Vite build environment. VITE_* variables are embedded in the browser client bundle. Backend secrets must never use VITE_* prefixes.\n======================================================\n`
        );
      }
    }
  }
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
