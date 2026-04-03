import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const functionsRegion = env.VITE_FIREBASE_FUNCTIONS_REGION || 'southamerica-east1';
    const functionsProjectId = env.VITE_FIREBASE_PROJECT_ID;

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: functionsProjectId
          ? {
            '/api/callable': {
              target: `https://${functionsRegion}-${functionsProjectId}.cloudfunctions.net`,
              changeOrigin: true,
              rewrite: () => '/callableProxy',
            },
          }
          : undefined,
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
