import { useEffect, useState } from 'react';
import type { AppRole } from './models';

// Suporte ao uso sem internet: deteccao de conexao e a ultima sessao validada
// salva no aparelho, para o app abrir com os dados em cache quando o servidor
// nao responde.

export type StoredValidatedSession = {
  uid: string;
  academyId: string;
  role: AppRole;
  validatedAt: number;
};

const VALIDATED_SESSION_STORAGE_PREFIX = 'applevel:validated-session';
const APP_ROLES: ReadonlySet<string> = new Set(['student', 'professor', 'admin', 'superadmin']);

// Codigos que, na pratica, significam "nao chegou no servidor". Uma callable
// sem rede termina em `internal` (o SDK nao recebe resposta HTTP), por isso
// ele entra aqui quando o aparelho tambem esta sem conexao.
const NETWORK_ERROR_CODES = new Set([
  'unavailable',
  'functions/unavailable',
  'deadline-exceeded',
  'functions/deadline-exceeded',
  'auth/network-request-failed',
]);

export function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function isNetworkError(error: unknown): boolean {
  if (isDeviceOffline()) {
    return true;
  }

  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
  if (NETWORK_ERROR_CODES.has(code)) {
    return true;
  }

  // fetch sem rede: "Failed to fetch" (Chrome) / "Load failed" (Safari/WKWebView).
  return error instanceof TypeError && /failed to fetch|load failed|network/i.test(error.message);
}

function storageKey(uid: string) {
  return `${VALIDATED_SESSION_STORAGE_PREFIX}:${uid}`;
}

export function saveValidatedSession(session: Omit<StoredValidatedSession, 'validatedAt'>) {
  try {
    const value: StoredValidatedSession = { ...session, validatedAt: Date.now() };
    window.localStorage.setItem(storageKey(session.uid), JSON.stringify(value));
  } catch {
    // localStorage indisponivel: o app so nao abre offline, segue normal online.
  }
}

export function readValidatedSession(uid: string): StoredValidatedSession | null {
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredValidatedSession>;
    if (
      parsed.uid !== uid
      || typeof parsed.academyId !== 'string'
      || typeof parsed.role !== 'string'
      || !APP_ROLES.has(parsed.role)
    ) {
      return null;
    }

    return {
      uid,
      academyId: parsed.academyId,
      role: parsed.role as AppRole,
      validatedAt: typeof parsed.validatedAt === 'number' ? parsed.validatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function clearValidatedSession(uid: string | null | undefined) {
  if (!uid) {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey(uid));
  } catch {
    // Sem localStorage nao ha o que limpar.
  }
}

/** `true` enquanto o aparelho estiver conectado; atualiza com os eventos online/offline. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => !isDeviceOffline());

  useEffect(() => {
    const update = () => setOnline(!isDeviceOffline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
