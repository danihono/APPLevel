import { beltLabel } from './beltCatalog';
import { t } from './i18n';
import type { BroadcastFilters, UserRecord } from './services/firebase/models';

// Espelho de `matchesBroadcastFilters` em functions/src/services/broadcasts.ts.
// Aqui serve para a previa "vai para N pessoas"; quem decide de verdade e o
// servidor. Mantenha as duas regras iguais.
export function matchesBroadcastFilters(
  userId: string,
  user: Pick<UserRecord, 'role' | 'belt' | 'kidsCategory' | 'status' | 'isCompetitor'>,
  filters: BroadcastFilters,
): boolean {
  if (filters.userIds && filters.userIds.length > 0) {
    return filters.userIds.includes(userId);
  }

  const role = user.role === 'admin' ? 'professor' : user.role;
  if (filters.roles && filters.roles.length > 0 && !filters.roles.includes(role)) {
    return false;
  }
  if (filters.belts && filters.belts.length > 0 && !filters.belts.includes(user.belt)) {
    return false;
  }
  const isKids = user.kidsCategory === 'level_infantil';
  if (filters.audience === 'kids' && !isKids) {
    return false;
  }
  if (filters.audience === 'adult' && isKids) {
    return false;
  }
  if (filters.onlyActive && user.status === 'suspended') {
    return false;
  }
  if (filters.onlyCompetitors && !user.isCompetitor) {
    return false;
  }
  return true;
}

export const DEFAULT_BROADCAST_FILTERS: BroadcastFilters = {
  roles: ['student'],
  belts: [],
  userIds: [],
  audience: 'all',
  onlyActive: true,
  onlyCompetitors: false,
};

// Resumo curto dos filtros para o card do comunicado enviado.
export function describeBroadcastFilters(filters: BroadcastFilters): string[] {
  if (filters.userIds && filters.userIds.length > 0) {
    return [filters.userIds.length === 1
      ? t('1 pessoa escolhida')
      : t('{count} pessoas escolhidas', { count: filters.userIds.length })];
  }

  const parts: string[] = [];
  const roles = filters.roles ?? [];
  if (roles.length === 0) {
    parts.push(t('Todos os perfis'));
  } else {
    if (roles.includes('student')) parts.push(t('Alunos'));
    if (roles.includes('professor')) parts.push(t('Professores'));
  }
  if (filters.audience === 'adult') parts.push(t('Adulto'));
  if (filters.audience === 'kids') parts.push(t('Kids'));
  if (filters.belts && filters.belts.length > 0) {
    parts.push(filters.belts.map((belt) => beltLabel(belt)).join(', '));
  }
  if (filters.onlyActive) parts.push(t('Só ativos'));
  if (filters.onlyCompetitors) parts.push(t('Só competidores'));
  return parts;
}

// Valor aceito por <input type="datetime-local"> no fuso do aparelho.
export function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
