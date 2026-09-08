import { Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { assertCondition } from './errors';
import { db } from './firebase';

/**
 * Rate limit por janela fixa, persistido no Firestore.
 *
 * Motivacao (auditoria de seguranca): nenhuma callable tinha limite de chamadas.
 * `submitStudentSignup` e publica e cria conta real no Firebase Auth + N documentos
 * de solicitacao + push para todos os aprovadores, entao servia como torneira aberta
 * de spam e como oraculo de enumeracao de e-mail/CPF.
 *
 * A colecao `rate_limits` e negada a todos os clientes em firestore.rules; so o
 * Admin SDK escreve nela.
 */
const RATE_LIMIT_COLLECTION = 'rate_limits';

function sanitizeKey(key: string): string {
  // Firestore proibe '/' em id de documento; normalizamos e limitamos o tamanho.
  return key.replace(/[^a-zA-Z0-9:._@-]/g, '_').slice(0, 400);
}

export interface RateLimitParams {
  key: string;
  limit: number;
  windowSeconds: number;
  message?: string;
}

export async function enforceRateLimit(params: RateLimitParams): Promise<void> {
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(sanitizeKey(params.key));
  const nowMs = Date.now();
  const windowMs = params.windowSeconds * 1000;

  const exceeded = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const windowStart = snap.exists ? (snap.get('windowStart') as Timestamp | undefined) : undefined;
    const count = snap.exists ? ((snap.get('count') as number | undefined) ?? 0) : 0;
    const withinWindow = !!windowStart && nowMs - windowStart.toMillis() < windowMs;

    if (!withinWindow) {
      tx.set(ref, { count: 1, windowStart: Timestamp.fromMillis(nowMs), updatedAt: Timestamp.fromMillis(nowMs) });
      return false;
    }

    if (count >= params.limit) return true;

    tx.set(ref, { count: count + 1, windowStart, updatedAt: Timestamp.fromMillis(nowMs) }, { merge: true });
    return false;
  });

  assertCondition(
    !exceeded,
    'resource-exhausted',
    params.message ?? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  );
}

/**
 * IP do chamador. Depende do `x-forwarded-for` encaminhado pelo callableProxy;
 * quando indisponivel, devolve 'unknown' e o limite passa a ser global para esse balde.
 */
export function resolveClientIp(request: CallableRequest<unknown>): string {
  const raw = request.rawRequest as { headers?: Record<string, unknown>; ip?: string } | undefined;
  const injected = raw?.headers?.['x-applevel-client-ip'];
  const header = Array.isArray(injected) ? injected[0] : injected;
  if (typeof header === 'string' && header.trim()) {
    return header.split(',')[0]!.trim();
  }
  return raw?.ip?.trim() || 'unknown';
}
