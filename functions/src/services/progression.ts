import {
  DEFAULT_PROGRESSION_RULES,
  KidsCategory,
  ProgressionBeltRule,
  ProgressionMilestone,
  ProgressionRuleSegment,
  ProgressionRules,
  ProgressionRulesV2,
} from '../domain/models';

export interface ProgressionSnapshot {
  belt: string;
  stripes: number;
  track: 'adult' | 'kids';
  kidsCategory?: KidsCategory;
  nextStripeAttendanceTarget: number | null;
  nextBeltAttendanceTarget: number | null;
  currentStripeProgress: number;
  classesToNextStripe: number;
  currentBeltProgress: number;
  totalClassesToNextBelt: number;
  isManuallyPlaced: boolean;
  ruleVersion: number;
}

export interface ProgressionNextStep {
  targetType: 'stripe' | 'belt';
  targetBelt: string;
  targetStripes: number;
  attendanceTarget: number;
  remainingClasses: number;
  ruleVersion: number;
}

const ADULT_ONLY_BELTS = new Set(['blue', 'purple', 'brown', 'black']);
const KIDS_ONLY_BELTS = new Set([
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
]);

function getClassesToNextBelt(rule: Pick<ProgressionBeltRule, 'stripeEvery' | 'maxStripes' | 'beltPromotionOffset'>): number {
  const stripeEvery = Math.max(0, Math.floor(rule.stripeEvery));
  const maxStripes = Math.max(0, Math.floor(rule.maxStripes));
  const beltPromotionOffset = Math.max(0, Math.floor(rule.beltPromotionOffset ?? 0));
  return stripeEvery * (maxStripes + beltPromotionOffset);
}

type ProgressionContextOptions = {
  birthDate?: string | null;
  kidsCategory?: KidsCategory | null;
  attendanceCountBonus?: number | null;
  attendanceCountAtBeltStart?: number | null;
};

const GRAY_FAMILY_BELTS = new Set(['white', 'gray-white', 'gray', 'gray-black']);
const YELLOW_ORANGE_FAMILY_BELTS = new Set([
  'yellow-white',
  'yellow',
  'yellow-black',
  'orange-white',
  'orange',
  'orange-black',
]);
const GREEN_FAMILY_BELTS = new Set(['green-white', 'green', 'green-black']);

const BELT_ALIASES: Record<string, string> = {
  branca: 'white',
  white: 'white',
  azul: 'blue',
  blue: 'blue',
  roxa: 'purple',
  purple: 'purple',
  marrom: 'brown',
  brown: 'brown',
  preta: 'black',
  black: 'black',
  cinza: 'gray',
  gray: 'gray',
  'cinza/branca': 'gray-white',
  'cinza branca': 'gray-white',
  'gray/white': 'gray-white',
  'gray white': 'gray-white',
  'cinza/preta': 'gray-black',
  'cinza preta': 'gray-black',
  'gray/black': 'gray-black',
  'gray black': 'gray-black',
  amarela: 'yellow',
  yellow: 'yellow',
  'amarela/branca': 'yellow-white',
  'amarela branca': 'yellow-white',
  'yellow/white': 'yellow-white',
  'yellow white': 'yellow-white',
  'amarela/preta': 'yellow-black',
  'amarela preta': 'yellow-black',
  'yellow/black': 'yellow-black',
  'yellow black': 'yellow-black',
  laranja: 'orange',
  orange: 'orange',
  'laranja/branca': 'orange-white',
  'laranja branca': 'orange-white',
  'orange/white': 'orange-white',
  'orange white': 'orange-white',
  'laranja/preta': 'orange-black',
  'laranja preta': 'orange-black',
  'orange/black': 'orange-black',
  'orange black': 'orange-black',
  verde: 'green',
  green: 'green',
  'verde/branca': 'green-white',
  'verde branca': 'green-white',
  'green/white': 'green-white',
  'green white': 'green-white',
  'verde/preta': 'green-black',
  'verde preta': 'green-black',
  'green/black': 'green-black',
  'green black': 'green-black',
};

const KIDS_CATEGORY_ORDER: KidsCategory[] = ['level_infantil'];
const LEGACY_KIDS_CATEGORIES = new Set(['level_kids', 'level_infanto_juvenil', 'level_juvenil']);

function normalizeLooseKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizeBeltId(value?: string | null): string {
  if (!value) {
    return 'white';
  }

  const loose = normalizeLooseKey(value);
  const slashNormalized = loose.replace(/\s*\/\s*/g, '/');
  return BELT_ALIASES[slashNormalized] ?? BELT_ALIASES[loose] ?? slashNormalized.replace(/\//g, '-').replace(/\s+/g, '-');
}

function normalizeKidsCategory(value?: string | null): KidsCategory | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (LEGACY_KIDS_CATEGORIES.has(normalized)) {
    return 'level_infantil';
  }
  return KIDS_CATEGORY_ORDER.find((entry) => entry === normalized);
}

function getBirthYear(birthDate?: string | null): number | null {
  if (!birthDate) {
    return null;
  }

  const value = birthDate.trim();
  if (!value) {
    return null;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(value);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    if (
      parsedDate.getUTCFullYear() !== year
      || parsedDate.getUTCMonth() !== month - 1
      || parsedDate.getUTCDate() !== day
    ) {
      return null;
    }

    return year;
  }

  const birthday = new Date(value);
  if (Number.isNaN(birthday.valueOf())) {
    return null;
  }

  return birthday.getFullYear();
}

function calculateAgeByBirthYear(birthDate?: string | null): number | null {
  const birthYear = getBirthYear(birthDate);
  if (birthYear == null) {
    return null;
  }

  return new Date().getFullYear() - birthYear;
}

export function inferKidsCategoryFromBirthDate(birthDate?: string | null): KidsCategory | undefined {
  const age = calculateAgeByBirthYear(birthDate);
  if (age == null || age >= 16) {
    return undefined;
  }

  return 'level_infantil';
}

export function isAdultOnlyBelt(value?: string | null): boolean {
  return ADULT_ONLY_BELTS.has(normalizeBeltId(value));
}

export function isKidsOnlyBelt(value?: string | null): boolean {
  return KIDS_ONLY_BELTS.has(normalizeBeltId(value));
}

function categorySupportsBelt(category: KidsCategory, belt: string): boolean {
  const defaults = (DEFAULT_PROGRESSION_RULES as ProgressionRulesV2).kids[category].belts;
  return defaults.some((entry) => entry.belt === belt);
}

function deriveKidsCategoryFromBelt(belt: string): KidsCategory | undefined {
  if (GRAY_FAMILY_BELTS.has(belt) || YELLOW_ORANGE_FAMILY_BELTS.has(belt) || GREEN_FAMILY_BELTS.has(belt)) {
    return 'level_infantil';
  }

  return undefined;
}

function sanitizeBeltRule(rule: Partial<ProgressionBeltRule> | undefined, fallback?: ProgressionBeltRule): ProgressionBeltRule {
  const stripeEvery = typeof rule?.stripeEvery === 'number'
    ? Math.max(0, Math.floor(rule.stripeEvery))
    : Math.max(0, Math.floor(fallback?.stripeEvery ?? 0));
  const maxStripes = typeof rule?.maxStripes === 'number'
    ? Math.max(0, Math.floor(rule.maxStripes))
    : Math.max(0, Math.floor(fallback?.maxStripes ?? 0));

  const isNonTerminal = stripeEvery > 0 && maxStripes > 0;
  const entryOffset = typeof rule?.beltPromotionOffset === 'number'
    ? Math.max(0, Math.floor(rule.beltPromotionOffset))
    : null;
  const fallbackOffset = Math.max(0, Math.floor(fallback?.beltPromotionOffset ?? 0));
  const beltPromotionOffset = (entryOffset !== null && (entryOffset > 0 || !isNonTerminal))
    ? entryOffset
    : fallbackOffset;

  return {
    belt: normalizeBeltId(rule?.belt ?? fallback?.belt),
    stripeEvery,
    maxStripes,
    beltPromotionOffset,
  };
}

export function normalizeProgressionRules(_input?: Partial<ProgressionRules> | null): ProgressionRulesV2 {
  const defaultRules = DEFAULT_PROGRESSION_RULES as ProgressionRulesV2;

  return {
    version: defaultRules.version,
    schema: 'v2',
    adult: {
      belts: defaultRules.adult.belts.map((entry) => ({ ...entry })),
    },
    kids: {
      level_infantil: {
        belts: defaultRules.kids.level_infantil.belts.map((entry) => ({ ...entry })),
      },
    },
  };
}

function buildMilestones(segment: ProgressionRuleSegment): ProgressionMilestone[] {
  let minAttendances = 0;

  return segment.belts.map((entry) => {
    const sanitized = sanitizeBeltRule(entry);
    const milestone: ProgressionMilestone = {
      belt: sanitized.belt,
      minAttendances,
      stripeEvery: sanitized.stripeEvery,
      maxStripes: sanitized.maxStripes,
    };

    minAttendances += getClassesToNextBelt(sanitized);
    return milestone;
  });
}

function getCurrentMilestone(totalAttendances: number, milestones: ProgressionMilestone[]): ProgressionMilestone {
  let current = milestones[0];

  for (const milestone of milestones) {
    if (totalAttendances >= milestone.minAttendances) {
      current = milestone;
    } else {
      break;
    }
  }

  return current;
}

function getMilestoneByBelt(belt: string, milestones: ProgressionMilestone[]): ProgressionMilestone | undefined {
  return milestones.find((item) => item.belt === normalizeBeltId(belt));
}

function getEffectiveMilestoneStart(
  totalAttendances: number,
  milestone: ProgressionMilestone,
  options?: Pick<ProgressionContextOptions, 'attendanceCountBonus' | 'attendanceCountAtBeltStart'>,
): number {
  if (options?.attendanceCountAtBeltStart != null) {
    return options.attendanceCountAtBeltStart;
  }
  const bonus = Math.max(0, Math.floor(options?.attendanceCountBonus ?? 0));
  const usesCurrentBeltBonus = milestone.minAttendances > 0 && bonus > 0 && bonus < milestone.minAttendances;

  return totalAttendances >= milestone.minAttendances && !usesCurrentBeltBonus
    ? milestone.minAttendances
    : 0;
}

function getNextMilestoneTarget(
  currentMilestoneStart: number,
  currentMilestone: ProgressionMilestone,
  nextMilestone?: ProgressionMilestone,
): number | null {
  if (!nextMilestone) {
    return null;
  }

  return currentMilestoneStart + Math.max(0, nextMilestone.minAttendances - currentMilestone.minAttendances);
}

function resolveKidsCategory(params: {
  currentBelt: string;
  birthDate?: string | null;
  kidsCategory?: KidsCategory | null;
}): KidsCategory {
  const normalizedBelt = normalizeBeltId(params.currentBelt);
  const requestedCategory = normalizeKidsCategory(params.kidsCategory);

  if (requestedCategory && categorySupportsBelt(requestedCategory, normalizedBelt)) {
    return requestedCategory;
  }

  const beltDrivenCategory = deriveKidsCategoryFromBelt(normalizedBelt);
  if (beltDrivenCategory) {
    return beltDrivenCategory;
  }

  return requestedCategory ?? inferKidsCategoryFromBirthDate(params.birthDate) ?? 'level_infantil';
}

function resolveProgressionContext(
  currentBelt: string,
  rules: ProgressionRulesV2,
  options?: ProgressionContextOptions,
): {
  track: 'adult' | 'kids';
  kidsCategory?: KidsCategory;
  milestones: ProgressionMilestone[];
} {
  const normalizedBelt = normalizeBeltId(currentBelt);

  if (isAdultOnlyBelt(normalizedBelt)) {
    return {
      track: 'adult',
      milestones: buildMilestones(rules.adult),
    };
  }

  if (isKidsOnlyBelt(normalizedBelt)) {
    const kidsCategory = resolveKidsCategory({
      currentBelt: normalizedBelt,
      birthDate: options?.birthDate,
      kidsCategory: options?.kidsCategory,
    });
    return {
      track: 'kids',
      kidsCategory,
      milestones: buildMilestones(rules.kids[kidsCategory]),
    };
  }

  const inferredKidsCategory = resolveKidsCategory({
    currentBelt: normalizedBelt,
    birthDate: options?.birthDate,
    kidsCategory: options?.kidsCategory,
  });

  if (inferKidsCategoryFromBirthDate(options?.birthDate) || options?.kidsCategory) {
    return {
      track: 'kids',
      kidsCategory: inferredKidsCategory,
      milestones: buildMilestones(rules.kids[inferredKidsCategory]),
    };
  }

  return {
    track: 'adult',
    milestones: buildMilestones(rules.adult),
  };
}

export function resolveProgressionTargets(
  currentBelt: string,
  currentStripes: number,
  totalAttendances: number,
  rules?: Partial<ProgressionRules> | null,
  options?: ProgressionContextOptions,
): ProgressionSnapshot {
  const normalizedRules = normalizeProgressionRules(rules);
  const context = resolveProgressionContext(currentBelt, normalizedRules, options);
  const currentMilestone = getMilestoneByBelt(currentBelt, context.milestones) ?? context.milestones[0];
  const currentIndex = context.milestones.findIndex((item) => item.belt === currentMilestone.belt);
  const nextMilestone = context.milestones[currentIndex + 1];
  const stripes = Math.min(
    currentMilestone.maxStripes,
    Math.max(0, Math.floor(currentStripes)),
  );
  const currentMilestoneStart = getEffectiveMilestoneStart(totalAttendances, currentMilestone, options);

  const nextStripeAttendanceTarget =
    stripes < currentMilestone.maxStripes && currentMilestone.stripeEvery > 0
      ? currentMilestoneStart + (stripes + 1) * currentMilestone.stripeEvery
      : null;
  const nextBeltAttendanceTarget = getNextMilestoneTarget(currentMilestoneStart, currentMilestone, nextMilestone);
  const classesToNextStripe = nextStripeAttendanceTarget == null ? 0 : currentMilestone.stripeEvery;
  const currentStripeFloor = currentMilestoneStart + stripes * currentMilestone.stripeEvery;
  const isManuallyPlaced = totalAttendances < currentStripeFloor;
  const gradeProgressForBelt = currentMilestone.stripeEvery > 0
    ? Math.min(totalAttendances, currentMilestone.stripeEvery)
    : 0;
  const currentStripeProgress = classesToNextStripe === 0
    ? 0
    : isManuallyPlaced
      ? Math.min(totalAttendances, classesToNextStripe)
      : Math.max(0, Math.min(totalAttendances - currentStripeFloor, classesToNextStripe));
  const totalClassesToNextBelt = nextBeltAttendanceTarget == null
    ? 0
    : Math.max(0, nextBeltAttendanceTarget - currentMilestoneStart);
  const currentBeltProgress = totalClassesToNextBelt === 0
    ? 0
    : isManuallyPlaced
      ? Math.min(stripes * currentMilestone.stripeEvery + gradeProgressForBelt, totalClassesToNextBelt)
      : Math.max(0, Math.min(totalAttendances - currentMilestoneStart, totalClassesToNextBelt));

  return {
    belt: currentMilestone.belt,
    stripes,
    track: context.track,
    kidsCategory: context.kidsCategory,
    nextStripeAttendanceTarget,
    nextBeltAttendanceTarget,
    currentStripeProgress,
    classesToNextStripe,
    currentBeltProgress,
    totalClassesToNextBelt,
    isManuallyPlaced,
    ruleVersion: normalizedRules.version,
  };
}

export function resolveNextProgressionStep(
  currentBelt: string,
  currentStripes: number,
  totalAttendances: number,
  rules?: Partial<ProgressionRules> | null,
  options?: ProgressionContextOptions,
): ProgressionNextStep | null {
  const normalizedRules = normalizeProgressionRules(rules);
  const context = resolveProgressionContext(currentBelt, normalizedRules, options);
  const currentMilestone = getMilestoneByBelt(currentBelt, context.milestones) ?? context.milestones[0];
  const currentIndex = context.milestones.findIndex((item) => item.belt === currentMilestone.belt);
  const nextMilestone = context.milestones[currentIndex + 1];
  const stripes = Math.min(
    currentMilestone.maxStripes,
    Math.max(0, Math.floor(currentStripes)),
  );
  const currentMilestoneStart = getEffectiveMilestoneStart(totalAttendances, currentMilestone, options);
  const currentStripeFloor = currentMilestoneStart + stripes * currentMilestone.stripeEvery;
  const isManuallyPlaced = totalAttendances < currentStripeFloor;
  const nextBeltAttendanceTarget = nextMilestone
    ? getNextMilestoneTarget(currentMilestoneStart, currentMilestone, nextMilestone) ?? 0
    : null;
  const gradeProgressForBelt = currentMilestone.stripeEvery > 0
    ? Math.min(totalAttendances, currentMilestone.stripeEvery)
    : 0;
  const effectiveAttendances = isManuallyPlaced
    ? currentMilestoneStart + stripes * currentMilestone.stripeEvery + gradeProgressForBelt
    : totalAttendances;

  if (nextMilestone && nextBeltAttendanceTarget !== null && effectiveAttendances >= nextBeltAttendanceTarget) {
    return {
      targetType: 'belt',
      targetBelt: nextMilestone.belt,
      targetStripes: 0,
      attendanceTarget: nextBeltAttendanceTarget,
      remainingClasses: 0,
      ruleVersion: normalizedRules.version,
    };
  }

  if (stripes < currentMilestone.maxStripes && currentMilestone.stripeEvery > 0) {
    const attendanceTarget = currentMilestoneStart + (stripes + 1) * currentMilestone.stripeEvery;
    return {
      targetType: 'stripe',
      targetBelt: currentMilestone.belt,
      targetStripes: stripes + 1,
      attendanceTarget,
      remainingClasses: Math.max(attendanceTarget - effectiveAttendances, 0),
      ruleVersion: normalizedRules.version,
    };
  }

  if (!nextMilestone) {
    return null;
  }

  return {
    targetType: 'belt',
    targetBelt: nextMilestone.belt,
    targetStripes: 0,
    attendanceTarget: nextBeltAttendanceTarget ?? 0,
    remainingClasses: Math.max((nextBeltAttendanceTarget ?? 0) - effectiveAttendances, 0),
    ruleVersion: normalizedRules.version,
  };
}

export function resolveStripeEveryForBelt(
  belt: string,
  options?: ProgressionContextOptions,
  rules?: Partial<ProgressionRules> | null,
): number {
  const normalizedRules = normalizeProgressionRules(rules);
  const context = resolveProgressionContext(belt, normalizedRules, options);
  const milestone = getMilestoneByBelt(belt, context.milestones) ?? context.milestones[0];
  return milestone?.stripeEvery ?? 0;
}

export function resolveMaxStripesForBelt(
  belt: string,
  options?: ProgressionContextOptions,
  rules?: Partial<ProgressionRules> | null,
): number {
  const normalizedRules = normalizeProgressionRules(rules);
  const context = resolveProgressionContext(belt, normalizedRules, options);
  const milestone = getMilestoneByBelt(belt, context.milestones) ?? context.milestones[0];
  return milestone?.maxStripes ?? 0;
}

// Posiciona marco (attendanceCountAtBeltStart) + bonus para que o grau atual exiba exatamente
// `gradeProgress` aulas. Numa graduacao, gradeProgress = 0 (todo grau recem-aprovado comeca em 0).
// Para alunos com aulas reais suficientes, o excedente fica absorvido no marco (bonus zerado);
// para alunos colocados manualmente (poucas aulas reais), completamos a posicao com bonus em vez
// de zera-lo — zerar o bonus aqui rebaixaria o aluno a "colocacao manual" e faria as aulas reais
// restantes reaparecerem como progresso do novo grau (bug: 21/30 e 51/150 em vez de 0/30 e 30/150).
export function resolveBeltStartAndBonus(
  organicAttendances: number,
  stripes: number,
  stripeEvery: number,
  gradeProgress = 0,
): { attendanceCountAtBeltStart: number; attendanceCountBonus: number } {
  const organic = Math.max(0, Math.floor(organicAttendances));
  const targetTotal =
    Math.max(0, Math.floor(stripes)) * Math.max(0, stripeEvery) + Math.max(0, Math.floor(gradeProgress));
  if (organic >= targetTotal) {
    return { attendanceCountAtBeltStart: organic - targetTotal, attendanceCountBonus: 0 };
  }
  return { attendanceCountAtBeltStart: 0, attendanceCountBonus: targetTotal - organic };
}

export function resolveProgression(
  totalAttendances: number,
  rules?: Partial<ProgressionRules> | null,
  options?: ProgressionContextOptions & { currentBelt?: string | null },
): ProgressionSnapshot {
  const normalizedRules = normalizeProgressionRules(rules);
  const currentBelt = normalizeBeltId(options?.currentBelt);
  const context = resolveProgressionContext(currentBelt, normalizedRules, options);
  const currentMilestone = getCurrentMilestone(totalAttendances, context.milestones);
  const automaticStripes = currentMilestone.stripeEvery > 0
    ? Math.min(currentMilestone.maxStripes, Math.floor(Math.max(0, totalAttendances - currentMilestone.minAttendances) / currentMilestone.stripeEvery))
    : 0;

  return resolveProgressionTargets(currentMilestone.belt, automaticStripes, totalAttendances, normalizedRules, options);
}
