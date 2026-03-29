import { getToken, onMessage } from 'firebase/messaging';
import { backendFunctions } from './functions';
import { getFirebaseMessaging } from './client';

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

  const token = await getToken(messaging, { vapidKey });
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
