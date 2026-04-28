import {
  DEFAULT_PROGRESSION_RULES,
  KidsCategory,
  LegacyProgressionRules,
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

function isKnownStaleAdultSegment(segment: ProgressionRuleSegment): boolean {
  const byBelt = new Map(segment.belts.map((entry) => [normalizeBeltId(entry.belt), entry]));
  const staleAdultBelts = ['white', 'blue', 'purple', 'brown'];

  return staleAdultBelts.every((belt) => {
    const entry = byBelt.get(belt);
    return !!entry
      && Math.max(0, Math.floor(entry.stripeEvery)) === 30
      && Math.max(0, Math.floor(entry.maxStripes)) === 4
      && getClassesToNextBelt(entry) === 150;
  });
}

function normalizeAdultSegment(segment: ProgressionRuleSegment): ProgressionRuleSegment {
  return isKnownStaleAdultSegment(segment)
    ? (DEFAULT_PROGRESSION_RULES as ProgressionRulesV2).adult
    : segment;
}

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
const LEGACY_TWENTY_CLASS_STRIPE_GOAL = 20;
const STANDARD_THIRTY_CLASS_STRIPE_GOAL = 30;

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

function normalizeStripeEvery(value: number): number {
  return value === LEGACY_TWENTY_CLASS_STRIPE_GOAL
    ? STANDARD_THIRTY_CLASS_STRIPE_GOAL
    : value;
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
  const rawStripeEvery = typeof rule?.stripeEvery === 'number'
    ? Math.max(0, Math.floor(rule.stripeEvery))
    : Math.max(0, Math.floor(fallback?.stripeEvery ?? 0));
  const maxStripes = typeof rule?.maxStripes === 'number'
    ? Math.max(0, Math.floor(rule.maxStripes))
    : Math.max(0, Math.floor(fallback?.maxStripes ?? 0));

  return {
    belt: normalizeBeltId(rule?.belt ?? fallback?.belt),
    stripeEvery: normalizeStripeEvery(rawStripeEvery),
    maxStripes,
    beltPromotionOffset: typeof rule?.beltPromotionOffset === 'number'
      ? Math.max(0, Math.floor(rule.beltPromotionOffset))
      : Math.max(0, Math.floor(fallback?.beltPromotionOffset ?? 0)),
  };
}

function sanitizeSegment(
  input: ProgressionRuleSegment | undefined,
  fallback: ProgressionRuleSegment,
): ProgressionRuleSegment {
  const fallbackRules = fallback.belts.map((entry) => sanitizeBeltRule(entry));
  const customByBelt = new Map<string, ProgressionBeltRule>();

  for (const entry of input?.belts ?? []) {
    customByBelt.set(normalizeBeltId(entry.belt), entry);
  }

  const belts = fallbackRules.map((fallbackRule) => sanitizeBeltRule(customByBelt.get(fallbackRule.belt), fallbackRule));
  const knownBelts = new Set(belts.map((entry) => entry.belt));
  const extras = [...customByBelt.entries()]
    .filter(([belt]) => !knownBelts.has(belt))
    .map(([, entry]) => sanitizeBeltRule(entry));

  return {
    belts: [...belts, ...extras],
  };
}

function convertLegacyRules(input: LegacyProgressionRules): ProgressionRulesV2 {
  const legacyAdult = [...input.milestones]
    .map((entry) => ({
      belt: normalizeBeltId(entry.belt),
      minAttendances: Math.max(0, Math.floor(entry.minAttendances)),
      stripeEvery: Math.max(0, Math.floor(entry.stripeEvery)),
      maxStripes: Math.max(0, Math.floor(entry.maxStripes)),
    }))
    .sort((left, right) => left.minAttendances - right.minAttendances)
    .map((entry, index, entries) => {
      const nextEntry = entries[index + 1];
      const totalClassesToNextBelt = nextEntry == null
        ? entry.stripeEvery * entry.maxStripes
        : Math.max(0, nextEntry.minAttendances - entry.minAttendances);

      return {
        belt: entry.belt,
        stripeEvery: entry.stripeEvery,
        maxStripes: entry.maxStripes,
        beltPromotionOffset: entry.stripeEvery > 0
          ? Math.max(0, Math.floor(totalClassesToNextBelt / entry.stripeEvery) - entry.maxStripes)
          : 0,
      };
    });

  return {
    version: typeof input.version === 'number' ? input.version : (DEFAULT_PROGRESSION_RULES as ProgressionRulesV2).version,
    schema: 'v2',
    adult: normalizeAdultSegment(sanitizeSegment({ belts: legacyAdult }, (DEFAULT_PROGRESSION_RULES as ProgressionRulesV2).adult)),
    kids: {
      level_infantil: sanitizeSegment(undefined, (DEFAULT_PROGRESSION_RULES as ProgressionRulesV2).kids.level_infantil),
    },
  };
}

export function normalizeProgressionRules(input?: Partial<ProgressionRules> | null): ProgressionRulesV2 {
  const defaultRules = DEFAULT_PROGRESSION_RULES as ProgressionRulesV2;
  if (!input) {
    return defaultRules;
  }

  if ('schema' in input || 'adult' in input || 'kids' in input) {
    const rules = input as Partial<ProgressionRulesV2>;
    const adult = sanitizeSegment(rules.adult, defaultRules.adult);

    return {
      version: typeof rules.version === 'number' ? rules.version : defaultRules.version,
      schema: 'v2',
      adult: normalizeAdultSegment(adult),
      kids: {
        level_infantil: sanitizeSegment(rules.kids?.level_infantil, defaultRules.kids.level_infantil),
      },
    };
  }

  if ('milestones' in input && Array.isArray(input.milestones) && input.milestones.length > 0) {
    return convertLegacyRules(input as LegacyProgressionRules);
  }

  return defaultRules;
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
  options?: { birthDate?: string | null; kidsCategory?: KidsCategory | null },
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
  options?: { birthDate?: string | null; kidsCategory?: KidsCategory | null },
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

  const nextStripeAttendanceTarget =
    stripes < currentMilestone.maxStripes && currentMilestone.stripeEvery > 0
      ? currentMilestone.minAttendances + (stripes + 1) * currentMilestone.stripeEvery
      : null;
  const nextBeltAttendanceTarget = nextMilestone?.minAttendances ?? null;
  const classesToNextStripe = nextStripeAttendanceTarget == null ? 0 : currentMilestone.stripeEvery;
  const currentStripeFloor = currentMilestone.minAttendances + stripes * currentMilestone.stripeEvery;
  const currentStripeProgress = classesToNextStripe === 0
    ? 0
    : Math.max(0, Math.min(totalAttendances - currentStripeFloor, classesToNextStripe));
  const totalClassesToNextBelt = nextBeltAttendanceTarget == null
    ? 0
    : Math.max(0, nextBeltAttendanceTarget - currentMilestone.minAttendances);
  const currentBeltProgress = totalClassesToNextBelt === 0
    ? 0
    : Math.max(0, Math.min(totalAttendances - currentMilestone.minAttendances, totalClassesToNextBelt));

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
    ruleVersion: normalizedRules.version,
  };
}

export function resolveNextProgressionStep(
  currentBelt: string,
  currentStripes: number,
  totalAttendances: number,
  rules?: Partial<ProgressionRules> | null,
  options?: { birthDate?: string | null; kidsCategory?: KidsCategory | null },
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

  if (stripes < currentMilestone.maxStripes && currentMilestone.stripeEvery > 0) {
    const attendanceTarget = currentMilestone.minAttendances + (stripes + 1) * currentMilestone.stripeEvery;
    return {
      targetType: 'stripe',
      targetBelt: currentMilestone.belt,
      targetStripes: stripes + 1,
      attendanceTarget,
      remainingClasses: Math.max(attendanceTarget - totalAttendances, 0),
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
    attendanceTarget: nextMilestone.minAttendances,
    remainingClasses: Math.max(nextMilestone.minAttendances - totalAttendances, 0),
    ruleVersion: normalizedRules.version,
  };
}

export function resolveProgression(
  totalAttendances: number,
  rules?: Partial<ProgressionRules> | null,
  options?: { birthDate?: string | null; kidsCategory?: KidsCategory | null; currentBelt?: string | null },
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
