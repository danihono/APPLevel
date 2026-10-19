/**
 * Classifica o erro do registro de presenca por QR para a tela de check-in mostrar uma explicacao
 * humana ("Esse QR ja virou.") em vez do texto tecnico. So le os codigos e as mensagens que o backend
 * ja devolve (functions/src/modules/attendance.ts); nada muda no servidor.
 */
export type CheckinErrorKind = 'expired' | 'wrong-class' | 'closed' | 'ended' | 'already' | 'generic';

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

  // "QR Code invalido." quase sempre e um QR que ja girou (o professor gera outro a cada poucos minutos e o
  // link do QR ja leva o id da aula certa): mesma explicacao e mesma acao do expirado.
  if (backend.includes('qr code expirado') || backend.includes('qr code invalido')) return { kind: 'expired', detail };
  if (backend.includes('aula nao encontrada') || backend.includes('aula fora da sua academia')) {
    return { kind: 'wrong-class', detail };
  }
  if (backend.includes('qr code indisponivel')) return { kind: 'closed', detail };
  // QR vale com a aula agendada ou ativa: "precisa estar ativa" = aula encerrada ou cancelada.
  if (backend.includes('precisa estar ativa')) return { kind: 'ended', detail };
  if (code === 'already-exists' || backend.includes('ja registrada')) return { kind: 'already', detail };
  return { kind: 'generic', detail };
}
