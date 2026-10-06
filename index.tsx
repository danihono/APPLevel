
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ConfirmProvider } from './components/ConfirmDialog';
import { LanguageProvider } from './i18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Galeria do redesign (so em desenvolvimento): http://localhost:3000/?preview=redesign
const isRedesignPreview = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('preview') === 'redesign';

if (import.meta.env.DEV && isRedesignPreview) {
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
  });
} else {
  root.render(
    <React.StrictMode>
      <LanguageProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </LanguageProvider>
    </React.StrictMode>
  );
}
