import { Capacitor } from '@capacitor/core';
import { deleteToken, getToken, onMessage } from 'firebase/messaging';
import { backendFunctions } from './functions';
import { firebaseConfig, getFirebaseMessaging } from './client';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '';

// Escopo proprio para o service worker do FCM. O app ja registra o /sw.js no
// escopo "/"; registrar outro script no mesmo escopo faria um substituir o
// outro a cada carregamento e o token de notificacao ficaria trocando.
const MESSAGING_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

export type PushStatus = 'unsupported' | 'default' | 'granted' | 'denied';

let registeredToken: string | null = null;

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

  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`, {
    scope: MESSAGING_SW_SCOPE,
  });
}

// O app do iPhone roda dentro de um WebView, onde a notificacao web nao existe:
// ele vai precisar do push nativo (APNs), tratado a parte.
export async function getPushStatus(): Promise<PushStatus> {
  if (
    Capacitor.isNativePlatform()
    || !VAPID_KEY
    || typeof window === 'undefined'
    || !('Notification' in window)
  ) {
    return 'unsupported';
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return 'unsupported';
  }

  return window.Notification.permission as PushStatus;
}

async function registerCurrentDevice(): Promise<string | null> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return null;
  }

  const serviceWorkerRegistration = await registerMessagingServiceWorker();
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration });
  if (!token) {
    return null;
  }

  await backendFunctions.registerDeviceToken({ token });
  registeredToken = token;
  return token;
}

// Pede a permissao (precisa vir de um toque do usuario) e cadastra o aparelho.
export async function enablePushNotifications(): Promise<PushStatus> {
  if ((await getPushStatus()) === 'unsupported') {
    return 'unsupported';
  }

  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') {
    return permission as PushStatus;
  }

  await registerCurrentDevice();
  return 'granted';
}

// Na abertura do app: se a permissao ja foi dada, reconfirma o cadastro sem
// perguntar nada (o FCM pode trocar o token com o tempo).
export async function refreshPushRegistration(): Promise<void> {
  if ((await getPushStatus()) !== 'granted') {
    return;
  }

  try {
    await registerCurrentDevice();
  } catch (error) {
    console.warn('[push:refresh]', error);
  }
}

// No logout: este aparelho deixa de receber as notificacoes desta conta.
export async function releasePushRegistration(): Promise<void> {
  const token = registeredToken;
  if (!token) {
    return;
  }

  registeredToken = null;
  try {
    await backendFunctions.unregisterDeviceToken({ token });
    const messaging = await getFirebaseMessaging();
    if (messaging) {
      await deleteToken(messaging);
    }
  } catch (error) {
    console.warn('[push:release]', error);
  }
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
