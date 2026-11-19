
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import { ConfirmProvider } from './components/ConfirmDialog';
import { LanguageProvider } from './i18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Galeria do redesign: em desenvolvimento via http://localhost:3000/?preview=redesign, e sempre no
// build de demonstracao para o cliente (`npm run build:demo`). No build de producao isto some do bundle.
const isDemoBuild = import.meta.env.VITE_DEMO_PREVIEW === 'true';
const isRedesignPreview = isDemoBuild || (import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('preview') === 'redesign');

if ((import.meta.env.DEV || isDemoBuild) && isRedesignPreview) {
  void import('./dev/RedesignPreview').then(({ default: RedesignPreview }) => {
    root.render(
      <React.StrictMode>
        <LanguageProvider>
          <ConfirmProvider>
            <RedesignPreview />
          </ConfirmProvider>
        </LanguageProvider>
      </React.StrictMode>,
    );
    (window as Window & { __lvAppMounted?: boolean }).__lvAppMounted = true;
  });
} else {
  root.render(
    <React.StrictMode>
      <LanguageProvider>
        <AppErrorBoundary>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </AppErrorBoundary>
      </LanguageProvider>
    </React.StrictMode>
  );
}
