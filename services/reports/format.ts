import { getLocale } from '../../i18n';

// Formatadores pt-BR compartilhados pelos exportadores de relatorio.
// Mesma convencao de moeda/data usada em ControleTotalView.

export function formatBRL(value: number | undefined | null): string {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return safe.toLocaleString(getLocale(), { style: 'currency', currency: 'BRL' });
}

export function formatDateBR(date: Date | null): string {
  return date ? date.toLocaleDateString(getLocale()) : '-';
}

export function formatDateTimeBR(date: Date): string {
  return date.toLocaleString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
