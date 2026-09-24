/* Service Worker do Firebase Cloud Messaging (notificacoes em segundo plano).
 *
 * A config do Firebase (chaves PUBLICAS do app web) e passada via query string
 * no momento do registro em services/firebase/messaging.ts, evitando hardcode.
 * Ex.: navigator.serviceWorker.register('/firebase-messaging-sw.js?apiKey=...&...')
 */
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js');

const params = new URL(self.location).searchParams;

const firebaseConfig = {
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (firebaseConfig.apiKey && firebaseConfig.messagingSenderId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Quando a mensagem traz o bloco "notification" (caso de todos os envios do
  // servidor), o proprio SDK ja exibe a notificacao; exibir de novo aqui
  // duplicaria. So as mensagens com apenas "data" precisam ser montadas a mao.
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) {
      return;
    }
    const data = payload.data || {};
    const title = data.title || 'LEVEL';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      data: { ...data, click_action: data.click_action || data.url || '/' },
    };
    self.registration.showNotification(title, options);
  });
}

// Ao clicar na notificacao, abre/foca o app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.click_action) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(target);
      }
    }),
  );
});
