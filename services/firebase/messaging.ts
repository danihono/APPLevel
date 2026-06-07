import { getToken, onMessage } from 'firebase/messaging';
import { backendFunctions } from './functions';
import { firebaseConfig, getFirebaseMessaging } from './client';

// Registra o service worker do FCM passando a config publica do Firebase via
// query string (lida em public/firebase-messaging-sw.js). Necessario para que as
// notificacoes em segundo plano funcionem na web e dentro do app Android (TWA).
async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return undefined;
  }

  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey ?? '',
    projectId: firebaseConfig.projectId ?? '',
    messagingSenderId: firebaseConfig.messagingSenderId ?? '',
    appId: firebaseConfig.appId ?? '',
  });

  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`);
}

export async function registerBrowserPush(vapidKey: string): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null;
  }

  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') {
    return null;
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return null;
  }

  const serviceWorkerRegistration = await registerMessagingServiceWorker();

  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  if (!token) {
    return null;
  }

  await backendFunctions.registerDeviceToken({ token });
  return token;
}

export async function subscribeToForegroundMessages(
  listener: (payload: unknown) => void,
) {
  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return () => undefined;
  }

  return onMessage(messaging, listener);
}
