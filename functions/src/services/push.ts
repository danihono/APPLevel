import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '../domain/models';
import { db, messaging } from '../lib/firebase';

const APP_URL = 'https://applevel-c5e73.web.app';
const MULTICAST_LIMIT = 500;

// Codigos do FCM que indicam aparelho que nao existe mais (app desinstalado,
// permissao revogada, token trocado). Esses tokens sao apagados do usuario
// para nao acumular e nao gastar envio a toa.
const STALE_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export interface PushResult {
  tokens: number;
  sent: number;
  failed: number;
}

export async function sendPushToUsers(params: {
  tokensByUser: Map<string, string[]>;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<PushResult> {
  const entries: Array<{ uid: string; token: string }> = [];
  for (const [uid, tokens] of params.tokensByUser) {
    for (const token of new Set(tokens)) {
      entries.push({ uid, token });
    }
  }

  const result: PushResult = { tokens: entries.length, sent: 0, failed: 0 };
  if (entries.length === 0) {
    return result;
  }

  const staleByUser = new Map<string, string[]>();

  for (let index = 0; index < entries.length; index += MULTICAST_LIMIT) {
    const slice = entries.slice(index, index + MULTICAST_LIMIT);

    try {
      const response = await messaging.sendEachForMulticast({
        tokens: slice.map((entry) => entry.token),
        notification: { title: params.title, body: params.body },
        data: params.data,
        android: {
          priority: 'high',
          notification: { sound: 'default' },
        },
        apns: {
          payload: { aps: { sound: 'default' } },
        },
        webpush: {
          notification: { icon: `${APP_URL}/icon-192.png` },
          fcmOptions: { link: `${APP_URL}/` },
        },
      });

      result.sent += response.successCount;
      result.failed += response.failureCount;

      response.responses.forEach((item, position) => {
        const code = item.error?.code;
        if (!code || !STALE_TOKEN_ERRORS.has(code)) {
          return;
        }
        const { uid, token } = slice[position];
        staleByUser.set(uid, [...(staleByUser.get(uid) ?? []), token]);
      });
    } catch (error) {
      result.failed += slice.length;
      logger.error('sendPushToUsers: falha ao enviar notificacoes', {
        tokens: slice.length,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (staleByUser.size > 0) {
    await Promise.all(
      [...staleByUser].map(([uid, tokens]) =>
        db.collection(COLLECTIONS.users).doc(uid)
          .update({ fcmTokens: FieldValue.arrayRemove(...tokens) })
          .catch((error: unknown) => {
            logger.warn('sendPushToUsers: nao foi possivel remover tokens invalidos', {
              uid,
              message: error instanceof Error ? error.message : String(error),
            });
          }),
      ),
    );
  }

  return result;
}
