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
      // SEGURANCA: removido o bloco `define` que injetava GEMINI_API_KEY (sem prefixo
      // VITE_) em process.env.API_KEY. `loadEnv(mode, '.', '')` carrega TODAS as
      // variaveis, inclusive as que um dev assumiria serem so de servidor, e o `define`
      // as substituia literalmente no bundle publico. Nenhum codigo lia esses
      // identificadores: era so uma armadilha esperando alguem preencher a variavel.
      // Chamadas ao Gemini devem passar por uma Cloud Function, nunca pelo navegador.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
