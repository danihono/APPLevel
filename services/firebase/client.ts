import { Capacitor } from '@capacitor/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { getMessaging, isSupported } from 'firebase/messaging';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export { firebaseConfig };

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const functionsRegion = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'southamerica-east1';
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

export const firebaseApp = app;
// No app nativo (Capacitor) a interface roda em `capacitor://localhost`. O
// `getAuth` padrao instala o resolver de popup/redirect, que carrega um iframe
// de `https://<authDomain>/__/auth/iframe`; esse iframe nao carrega na WKWebView
// e o `onAuthStateChanged` nunca dispara, prendendo o app na tela de
// carregamento. Como o login e so por e-mail e senha, nao precisamos do
// resolver. A persistencia tambem passa a ser IndexedDB, que e a confiavel em
// esquema de URL customizado.
function createFirebaseAuth() {
  if (!Capacitor.isNativePlatform()) {
    return getAuth(app);
  }

  try {
    return initializeAuth(app, { persistence: indexedDBLocalPersistence });
  } catch {
    // Ja inicializado (hot reload, por exemplo): reaproveita a instancia.
    return getAuth(app);
  }
}

export const firebaseAuth = createFirebaseAuth();
export const firebaseDb = getFirestore(app);
export const firebaseFunctions = getFunctions(app, functionsRegion);
export const firebaseStorage = getStorage(app);
export const messagingSupported = isSupported();

let emulatorsConnected = false;

if (useEmulators && !emulatorsConnected) {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firebaseDb, '127.0.0.1', 8080);
  connectFunctionsEmulator(firebaseFunctions, '127.0.0.1', 5001);
  connectStorageEmulator(firebaseStorage, '127.0.0.1', 9199);
  emulatorsConnected = true;
}

export async function getFirebaseMessaging() {
  const supported = await messagingSupported;
  if (!supported) {
    return null;
  }

  return getMessaging(app);
}
