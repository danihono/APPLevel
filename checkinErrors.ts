/**
 * Classifica o erro do registro de presenca por QR para a tela de check-in mostrar uma explicacao
 * humana ("Esse QR ja virou.") em vez do texto tecnico. So le os codigos e as mensagens que o backend
 * ja devolve (functions/src/modules/attendance.ts); nada muda no servidor.
 */
export type CheckinErrorKind = 'expired' | 'wrong-class' | 'closed' | 'already' | 'generic';

export interface CheckinErrorInfo {
  kind: CheckinErrorKind;
  /** Texto tecnico para o "Detalhes" (a mensagem que o usuario veria antes). */
  detail: string;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function readString(error: unknown, key: string): string {
  if (typeof error !== 'object' || !error || !(key in error)) return '';
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export function classifyCheckinError(error: unknown): CheckinErrorInfo {
  const shown = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const code = normalize(readString(error, 'backendCode') || readString(error, 'code')).replace(/^functions\//, '');
  const backend = normalize(readString(error, 'backendMessage') || shown);
  const detail = shown || readString(error, 'backendMessage');

  if (backend.includes('qr code expirado')) return { kind: 'expired', detail };
  if (backend.includes('qr code invalido') || backend.includes('aula nao encontrada') || backend.includes('aula fora da sua academia')) {
    return { kind: 'wrong-class', detail };
  }
  if (backend.includes('qr code indisponivel') || backend.includes('precisa estar ativa')) {
    return { kind: 'closed', detail };
  }
  if (code === 'already-exists' || backend.includes('ja registrada')) return { kind: 'already', detail };
  return { kind: 'generic', detail };
}
