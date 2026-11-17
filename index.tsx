
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ConfirmProvider } from './components/ConfirmDialog';
import FaceEnrollmentHost from './components/FaceEnrollmentHost';
import { LanguageProvider } from './i18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <ConfirmProvider>
        <App />
        <FaceEnrollmentHost />
      </ConfirmProvider>
    </LanguageProvider>
  </React.StrictMode>
);
