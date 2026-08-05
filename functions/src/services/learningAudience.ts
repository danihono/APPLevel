import {
  LearningAudienceConfig,
  LearningAudienceRole,
  LearningCourseDoc,
  LearningLessonDoc,
  LearningTrackDoc,
} from '../domain/models';
import { assertCondition } from '../lib/errors';
import { normalizeBeltId } from './progression';

/**
 * Faixas validas para segmentacao de conteudo do Learning Hub.
 * Espelha `BeltColor` do frontend (`types.ts`).
 */
export const LEARNING_AUDIENCE_BELTS = [
  'white',
  'blue',
  'purple',
  'brown',
  'black',
  'gray-white',
  'gray',
  'gray-black',
  'yellow-white',
  'yellow',
  'yellow-black',
  'orange-white',
  'orange',
  'orange-black',
  'green-white',
  'green',
  'green-black',
] as const;

const AUDIENCE_BELT_SET = new Set<string>(LEARNING_AUDIENCE_BELTS);
const AUDIENCE_ROLES: LearningAudienceRole[] = ['student', 'professor'];

/**
 * Conteudo criado antes da segmentacao por publico-alvo continuava visivel apenas
 * para professores. Trilha sem `audience` mantem exatamente esse comportamento.
 */
export const LEGACY_TRACK_AUDIENCE: LearningAudienceConfig = {
  mode: 'custom',
  roles: ['professor'],
  belts: [],
};

export function normalizeAudienceRole(role: string): LearningAudienceRole | null {
  if (role === 'admin' || role === 'professor') {
    return 'professor';
  }

  if (role === 'student') {
    return 'student';
  }

  return null;
}

function sortRoles(roles: LearningAudienceRole[]): LearningAudienceRole[] {
  return AUDIENCE_ROLES.filter((role) => roles.includes(role));
}

function sortBelts(belts: string[]): string[] {
  return LEARNING_AUDIENCE_BELTS.filter((belt) => belts.includes(belt));
}

/**
 * Le e valida o campo `audience` de um payload de callable.
 * Retorna `undefined` quando o campo nao foi enviado (mantem o valor ja gravado).
 */
export function parseAudience(
  data: unknown,
  options?: { allowInherit?: boolean },
): LearningAudienceConfig | undefined {
  const raw = (data as { audience?: unknown } | null)?.audience;
  if (raw === undefined || raw === null) {
    return undefined;
  }

  assertCondition(
    typeof raw === 'object' && !Array.isArray(raw),
    'invalid-argument',
    'Publico-alvo invalido.',
  );

  const record = raw as { mode?: unknown; roles?: unknown; belts?: unknown };
  const allowInherit = options?.allowInherit ?? true;

  assertCondition(
    record.mode === 'custom' || (allowInherit && record.mode === 'inherit'),
    'invalid-argument',
    allowInherit
      ? 'O modo do publico-alvo precisa ser "inherit" ou "custom".'
      : 'A trilha precisa definir o proprio publico-alvo.',
  );

  if (record.mode === 'inherit') {
    return { mode: 'inherit', roles: [], belts: [] };
  }

  assertCondition(
    record.roles === undefined || Array.isArray(record.roles),
    'invalid-argument',
    'Envie os papeis do publico-alvo em formato de lista.',
  );
  assertCondition(
    record.belts === undefined || Array.isArray(record.belts),
    'invalid-argument',
    'Envie as faixas do publico-alvo em formato de lista.',
  );

  const roles = ((record.roles as unknown[]) ?? []).map((entry) => {
    assertCondition(typeof entry === 'string', 'invalid-argument', 'Papel do publico-alvo invalido.');
    const normalized = normalizeAudienceRole(entry as string);
    assertCondition(!!normalized, 'invalid-argument', `Papel "${entry}" nao pode ser usado como publico-alvo.`);
    return normalized as LearningAudienceRole;
  });

  const belts = ((record.belts as unknown[]) ?? []).map((entry) => {
    assertCondition(typeof entry === 'string', 'invalid-argument', 'Faixa do publico-alvo invalida.');
    const normalized = normalizeBeltId(entry as string);
    assertCondition(AUDIENCE_BELT_SET.has(normalized), 'invalid-argument', `Faixa "${entry}" nao existe.`);
    return normalized;
  });

  return {
    mode: 'custom',
    roles: sortRoles(Array.from(new Set(roles))),
    belts: sortBelts(Array.from(new Set(belts))),
  };
}

export function resolveTrackAudience(track: Pick<LearningTrackDoc, 'audience'>): LearningAudienceConfig {
  const audience = track.audience;
  if (!audience || audience.mode !== 'custom') {
    return LEGACY_TRACK_AUDIENCE;
  }

  return {
    mode: 'custom',
    roles: audience.roles ?? [],
    belts: audience.belts ?? [],
  };
}

export function resolveCourseAudience(
  course: Pick<LearningCourseDoc, 'audience'>,
  track: Pick<LearningTrackDoc, 'audience'>,
): LearningAudienceConfig {
  if (course.audience?.mode === 'custom') {
    return {
      mode: 'custom',
      roles: course.audience.roles ?? [],
      belts: course.audience.belts ?? [],
    };
  }

  return resolveTrackAudience(track);
}

export function resolveLessonAudience(
  lesson: Pick<LearningLessonDoc, 'audience'>,
  course: Pick<LearningCourseDoc, 'audience'>,
  track: Pick<LearningTrackDoc, 'audience'>,
): LearningAudienceConfig {
  if (lesson.audience?.mode === 'custom') {
    return {
      mode: 'custom',
      roles: lesson.audience.roles ?? [],
      belts: lesson.audience.belts ?? [],
    };
  }

  return resolveCourseAudience(course, track);
}

function intersectLists(left: string[], right: string[]): string[] {
  return left.filter((entry) => right.includes(entry));
}

/** Lista vazia na configuracao significa "todos" — aqui isso vira a lista completa. */
function expandRoles(roles: LearningAudienceRole[]): string[] {
  return roles.length > 0 ? roles : [...AUDIENCE_ROLES];
}

function expandBelts(belts: string[]): string[] {
  return belts.length > 0 ? belts : [...LEARNING_AUDIENCE_BELTS];
}

/**
 * Sentinela usado quando a intersecao nao sobra ninguem. Nao casa com nenhum
 * usuario real, e mantem as listas denormalizadas sempre nao-vazias.
 */
export const AUDIENCE_NOBODY = '__none__';

/**
 * Publico efetivo de um modulo: intersecao entre trilha, curso e modulo.
 * Um override nunca amplia o alcance do pai — evita curso visivel dentro de
 * trilha invisivel.
 *
 * As listas retornadas sao sempre **expandidas** (nunca vazias): "sem restricao"
 * vira a lista completa de papeis/faixas. Isso permite que o cliente consulte com
 * `array-contains` e que as regras do Firestore validem a mesma condicao — regra
 * do Firestore filtra nada, ela rejeita, entao query e regra precisam casar.
 */
export function computeEffectiveAudience(
  track: Pick<LearningTrackDoc, 'audience'>,
  course: Pick<LearningCourseDoc, 'audience'>,
  lesson: Pick<LearningLessonDoc, 'audience'>,
): { roles: string[]; belts: string[] } {
  const trackAudience = resolveTrackAudience(track);
  const courseAudience = resolveCourseAudience(course, track);
  const lessonAudience = resolveLessonAudience(lesson, course, track);

  const roles = intersectLists(
    intersectLists(expandRoles(trackAudience.roles), expandRoles(courseAudience.roles)),
    expandRoles(lessonAudience.roles),
  );
  const belts = intersectLists(
    intersectLists(expandBelts(trackAudience.belts), expandBelts(courseAudience.belts)),
    expandBelts(lessonAudience.belts),
  );

  return {
    roles: roles.length > 0 ? sortRoles(roles as LearningAudienceRole[]) : [AUDIENCE_NOBODY],
    belts: belts.length > 0 ? sortBelts(belts) : [AUDIENCE_NOBODY],
  };
}

/**
 * Verifica se um usuario casa com um publico efetivo ja expandido.
 */
export function matchesEffectiveAudience(
  effective: { roles: string[]; belts: string[] },
  user: { role: string; belt?: string | null },
): boolean {
  const role = normalizeAudienceRole(user.role);

  return !!role
    && effective.roles.includes(role)
    && effective.belts.includes(normalizeBeltId(user.belt));
}

export function assertLearningAudience(
  actor: { role: string; user: { role: string; belt?: string | null } },
  track: Pick<LearningTrackDoc, 'audience'>,
  course: Pick<LearningCourseDoc, 'audience'>,
  lesson: Pick<LearningLessonDoc, 'audience'>,
): void {
  if (actor.role === 'superadmin') {
    return;
  }

  const effective = computeEffectiveAudience(track, course, lesson);
  assertCondition(
    matchesEffectiveAudience(effective, { role: actor.role, belt: actor.user.belt }),
    'permission-denied',
    'Este conteudo nao foi liberado para o seu perfil.',
  );
}
