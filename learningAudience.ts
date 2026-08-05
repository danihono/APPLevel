import { ALL_BELTS, beltLabel, normalizeBeltId } from './beltCatalog';
import type {
  LearningAudienceConfig,
  LearningAudienceRole,
  LearningCourseRecord,
  LearningLessonRecord,
  LearningTrackRecord,
} from './services/firebase/models';

/**
 * Espelho de `functions/src/services/learningAudience.ts`.
 * Mantenha os dois arquivos em sincronia: o backend e a fonte de verdade e o
 * frontend usa estas regras apenas para filtrar e pre-visualizar.
 */

export const AUDIENCE_ROLE_OPTIONS: Array<{ value: LearningAudienceRole; label: string; hint: string }> = [
  { value: 'student', label: 'Alunos', hint: 'Todos os alunos das academias da rede' },
  { value: 'professor', label: 'Professores', hint: 'Professores e administradores de academia' },
];

/**
 * Conteudo anterior a segmentacao continuava visivel so para professores.
 */
export const LEGACY_TRACK_AUDIENCE: LearningAudienceConfig = {
  mode: 'custom',
  roles: ['professor'],
  belts: [],
};

export function normalizeAudienceRole(role?: string | null): LearningAudienceRole | null {
  if (role === 'admin' || role === 'professor') {
    return 'professor';
  }

  if (role === 'student') {
    return 'student';
  }

  return null;
}

export function resolveTrackAudience(track: Pick<LearningTrackRecord, 'audience'>): LearningAudienceConfig {
  const audience = track.audience;
  if (!audience || audience.mode !== 'custom') {
    return LEGACY_TRACK_AUDIENCE;
  }

  return { mode: 'custom', roles: audience.roles ?? [], belts: audience.belts ?? [] };
}

export function resolveCourseAudience(
  course: Pick<LearningCourseRecord, 'audience'>,
  track: Pick<LearningTrackRecord, 'audience'>,
): LearningAudienceConfig {
  if (course.audience?.mode === 'custom') {
    return { mode: 'custom', roles: course.audience.roles ?? [], belts: course.audience.belts ?? [] };
  }

  return resolveTrackAudience(track);
}

export function resolveLessonAudience(
  lesson: Pick<LearningLessonRecord, 'audience'>,
  course: Pick<LearningCourseRecord, 'audience'>,
  track: Pick<LearningTrackRecord, 'audience'>,
): LearningAudienceConfig {
  if (lesson.audience?.mode === 'custom') {
    return { mode: 'custom', roles: lesson.audience.roles ?? [], belts: lesson.audience.belts ?? [] };
  }

  return resolveCourseAudience(course, track);
}

export const AUDIENCE_NOBODY = '__none__';

const ALL_AUDIENCE_ROLES: LearningAudienceRole[] = ['student', 'professor'];

function intersectLists(left: string[], right: string[]): string[] {
  return left.filter((entry) => right.includes(entry));
}

/** Lista vazia na configuracao significa "todos" — aqui isso vira a lista completa. */
function expandRoles(roles: LearningAudienceRole[]): string[] {
  return roles.length > 0 ? roles : [...ALL_AUDIENCE_ROLES];
}

function expandBelts(belts: string[]): string[] {
  return belts.length > 0 ? belts : [...ALL_BELTS];
}

function sortRoles(roles: string[]): string[] {
  return ALL_AUDIENCE_ROLES.filter((role) => roles.includes(role));
}

function sortBelts(belts: string[]): string[] {
  return ALL_BELTS.filter((belt) => belts.includes(belt));
}

export type EffectiveAudience = { roles: string[]; belts: string[] };

/**
 * Intersecao entre trilha, curso e modulo. Um override nunca amplia o alcance
 * do pai. As listas voltam sempre expandidas (nunca vazias); `__none__` = ninguem.
 */
export function computeEffectiveAudience(
  track: Pick<LearningTrackRecord, 'audience'>,
  course: Pick<LearningCourseRecord, 'audience'>,
  lesson: Pick<LearningLessonRecord, 'audience'>,
): EffectiveAudience {
  return intersectAudiences(
    resolveCourseAudience(course, track),
    resolveLessonAudience(lesson, course, track),
    resolveTrackAudience(track),
  );
}

/**
 * Intersecao de audiencias ja resolvidas. Usada tambem para previsualizar o
 * alcance real enquanto o superadmin edita um filho.
 */
export function intersectAudiences(...audiences: LearningAudienceConfig[]): EffectiveAudience {
  const roles = audiences
    .map((audience) => expandRoles(audience.roles))
    .reduce((left, right) => intersectLists(left, right), [...ALL_AUDIENCE_ROLES]);
  const belts = audiences
    .map((audience) => expandBelts(audience.belts))
    .reduce((left, right) => intersectLists(left, right), [...ALL_BELTS] as string[]);

  return {
    roles: roles.length > 0 ? sortRoles(roles) : [AUDIENCE_NOBODY],
    belts: belts.length > 0 ? sortBelts(belts) : [AUDIENCE_NOBODY],
  };
}

export function matchesEffectiveAudience(
  effective: EffectiveAudience,
  user: { role?: string | null; belt?: string | null },
): boolean {
  const role = normalizeAudienceRole(user.role);

  return !!role
    && effective.roles.includes(role)
    && effective.belts.includes(normalizeBeltId(user.belt));
}

export function isEmptyAudience(effective: EffectiveAudience): boolean {
  return effective.roles.includes(AUDIENCE_NOBODY) || effective.belts.includes(AUDIENCE_NOBODY);
}

/** Rotulo curto para chips: "Alunos e professores · todas as faixas". */
export function describeAudience(effective: EffectiveAudience): string {
  if (isEmptyAudience(effective)) {
    return 'Ninguém — configuração conflitante';
  }

  const roleLabel = effective.roles.length === ALL_AUDIENCE_ROLES.length
    ? 'Alunos e professores'
    : effective.roles
      .map((role) => AUDIENCE_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role)
      .join(' e ');

  if (effective.belts.length === ALL_BELTS.length) {
    return `${roleLabel} · todas as faixas`;
  }

  if (effective.belts.length > 4) {
    return `${roleLabel} · ${effective.belts.length} faixas`;
  }

  return `${roleLabel} · ${effective.belts.map((belt) => beltLabel(belt)).join(', ')}`;
}
