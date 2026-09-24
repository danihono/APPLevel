import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
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

// No app do iPhone (Capacitor) a notificacao web nao existe: o push vem da
// Apple (APNs) pelo plugin nativo, que devolve um token FCM no mesmo formato
// do Android/web — o servidor trata os dois igual.
const isNativeApp = () => Capacitor.isNativePlatform();

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

export async function getPushStatus(): Promise<PushStatus> {
  if (isNativeApp()) {
    try {
      const { receive } = await FirebaseMessaging.checkPermissions();
      if (receive === 'granted' || receive === 'denied') {
        return receive;
      }
      return 'default';
    } catch {
      return 'unsupported';
    }
  }

  if (!VAPID_KEY || typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return 'unsupported';
  }

  return window.Notification.permission as PushStatus;
}

async function fetchDeviceToken(): Promise<string | null> {
  if (isNativeApp()) {
    const { token } = await FirebaseMessaging.getToken();
    return token || null;
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return null;
  }

  const serviceWorkerRegistration = await registerMessagingServiceWorker();
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration });
  return token || null;
}

async function registerCurrentDevice(): Promise<string | null> {
  const token = await fetchDeviceToken();
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

  let permission: PushStatus;
  if (isNativeApp()) {
    const { receive } = await FirebaseMessaging.requestPermissions();
    permission = receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'default';
  } else {
    permission = (await window.Notification.requestPermission()) as PushStatus;
  }

  if (permission !== 'granted') {
    return permission;
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
    if (isNativeApp()) {
      await FirebaseMessaging.deleteToken();
      return;
    }
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
