import { BeltColor, type KidsCategory } from './types';

export type TrainingType = 'Adulto' | 'Kids';

export interface ProgressionBeltRule {
  belt: string;
  stripeEvery: number;
  maxStripes: number;
  beltPromotionOffset?: number;
}

export interface ProgressionRuleSegment {
  belts: ProgressionBeltRule[];
}

export interface UserProgressionSummary {
  track: TrainingType;
  kidsCategory?: KidsCategory;
  activeRules: ProgressionBeltRule[];
  currentRule: ProgressionBeltRule;
  currentBelt: BeltColor;
  currentStripes: number;
  nextBelt?: BeltColor;
  classesPerStripe: number;
  stripeProgress: number;
  stripeTotal: number;
  stripeRemaining: number | null;
  beltProgress: number;
  beltTotal: number;
  beltRemaining: number | null;
}

export interface LegacyProgressionMilestone {
  belt: string;
  minAttendances: number;
  stripeEvery: number;
  maxStripes: number;
}

export interface ProgressionRulesV2 {
  version: number;
  schema: 'v2';
  adult: ProgressionRuleSegment;
  kids: Record<KidsCategory, ProgressionRuleSegment>;
}

export type ProgressionRules = {
  version: number;
  milestones: LegacyProgressionMilestone[];
} | ProgressionRulesV2;

type BeltMeta = {
  id: BeltColor;
  label: string;
  track: 'adult' | 'kids';
  breakdownColor: string;
  main: string;
  outline: string;
  sheen: string;
  strapColor: string;
  avatarFill: string;
  avatarStroke: string;
  avatarBarColor: string;
};

const BELT_ALIASES: Record<string, BeltColor> = {
  branca: BeltColor.BRANCA,
  white: BeltColor.BRANCA,
  azul: BeltColor.AZUL,
  blue: BeltColor.AZUL,
  roxa: BeltColor.ROXA,
  purple: BeltColor.ROXA,
  marrom: BeltColor.MARROM,
  brown: BeltColor.MARROM,
  preta: BeltColor.PRETA,
  black: BeltColor.PRETA,
  cinza: BeltColor.CINZA,
  gray: BeltColor.CINZA,
  'cinza/branca': BeltColor.CINZA_BRANCA,
  'cinza branca': BeltColor.CINZA_BRANCA,
  'gray/white': BeltColor.CINZA_BRANCA,
  'gray white': BeltColor.CINZA_BRANCA,
  'cinza/preta': BeltColor.CINZA_PRETA,
  'cinza preta': BeltColor.CINZA_PRETA,
  'gray/black': BeltColor.CINZA_PRETA,
  'gray black': BeltColor.CINZA_PRETA,
  amarela: BeltColor.AMARELA,
  yellow: BeltColor.AMARELA,
  'amarela/branca': BeltColor.AMARELA_BRANCA,
  'amarela branca': BeltColor.AMARELA_BRANCA,
  'yellow/white': BeltColor.AMARELA_BRANCA,
  'yellow white': BeltColor.AMARELA_BRANCA,
  'amarela/preta': BeltColor.AMARELA_PRETA,
  'amarela preta': BeltColor.AMARELA_PRETA,
  'yellow/black': BeltColor.AMARELA_PRETA,
  'yellow black': BeltColor.AMARELA_PRETA,
  laranja: BeltColor.LARANJA,
  orange: BeltColor.LARANJA,
  'laranja/branca': BeltColor.LARANJA_BRANCA,
  'laranja branca': BeltColor.LARANJA_BRANCA,
  'orange/white': BeltColor.LARANJA_BRANCA,
  'orange white': BeltColor.LARANJA_BRANCA,
  'laranja/preta': BeltColor.LARANJA_PRETA,
  'laranja preta': BeltColor.LARANJA_PRETA,
  'orange/black': BeltColor.LARANJA_PRETA,
  'orange black': BeltColor.LARANJA_PRETA,
  verde: BeltColor.VERDE,
  green: BeltColor.VERDE,
  'verde/branca': BeltColor.VERDE_BRANCA,
  'verde branca': BeltColor.VERDE_BRANCA,
  'green/white': BeltColor.VERDE_BRANCA,
  'green white': BeltColor.VERDE_BRANCA,
  'verde/preta': BeltColor.VERDE_PRETA,
  'verde preta': BeltColor.VERDE_PRETA,
  'green/black': BeltColor.VERDE_PRETA,
  'green black': BeltColor.VERDE_PRETA,
};

const BELT_METADATA: BeltMeta[] = [
  {
    id: BeltColor.BRANCA,
    label: 'Branca',
    track: 'adult',
    breakdownColor: 'rgba(236, 239, 246, 0.92)',
    main: 'linear-gradient(180deg, #ffffff 0%, #edf1f7 100%)',
    outline: 'rgba(148, 163, 184, 0.35)',
    sheen: 'rgba(255, 255, 255, 0.82)',
    strapColor: '#09090b',
    avatarFill: '#ffffff',
    avatarStroke: '#d1d5db',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.AZUL,
    label: 'Azul',
    track: 'adult',
    breakdownColor: 'rgba(90, 144, 255, 0.92)',
    main: 'linear-gradient(180deg, #1d4ed8 0%, #132c74 100%)',
    outline: 'rgba(96, 165, 250, 0.28)',
    sheen: 'rgba(147, 197, 253, 0.42)',
    strapColor: '#09090b',
    avatarFill: '#1d4ed8',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.ROXA,
    label: 'Roxa',
    track: 'adult',
    breakdownColor: 'rgba(148, 92, 255, 0.9)',
    main: 'linear-gradient(180deg, #7e22ce 0%, #4c1d95 100%)',
    outline: 'rgba(192, 132, 252, 0.28)',
    sheen: 'rgba(216, 180, 254, 0.34)',
    strapColor: '#09090b',
    avatarFill: '#6b21a8',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.MARROM,
    label: 'Marrom',
    track: 'adult',
    breakdownColor: 'rgba(172, 109, 72, 0.9)',
    main: 'linear-gradient(180deg, #7c4a2d 0%, #4a2a1c 100%)',
    outline: 'rgba(217, 119, 6, 0.26)',
    sheen: 'rgba(251, 191, 36, 0.2)',
    strapColor: '#09090b',
    avatarFill: '#5d4037',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.PRETA,
    label: 'Preta',
    track: 'adult',
    breakdownColor: 'rgba(42, 44, 51, 0.95)',
    main: 'linear-gradient(180deg, #232329 0%, #050507 100%)',
    outline: 'rgba(255, 255, 255, 0.14)',
    sheen: 'rgba(255, 255, 255, 0.16)',
    strapColor: '#9f1d1d',
    avatarFill: '#262626',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#dc2626',
  },
  {
    id: BeltColor.CINZA_BRANCA,
    label: 'Cinza/Branca',
    track: 'kids',
    breakdownColor: 'rgba(191, 198, 207, 0.92)',
    main: 'linear-gradient(180deg, #f8fafc 0%, #f8fafc 32%, #9ca3af 32%, #9ca3af 68%, #f8fafc 68%, #f8fafc 100%)',
    outline: 'rgba(148, 163, 184, 0.35)',
    sheen: 'rgba(255, 255, 255, 0.56)',
    strapColor: '#09090b',
    avatarFill: '#9ca3af',
    avatarStroke: '#d1d5db',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.CINZA,
    label: 'Cinza',
    track: 'kids',
    breakdownColor: 'rgba(161, 161, 170, 0.95)',
    main: 'linear-gradient(180deg, #cbd5e1 0%, #9ca3af 100%)',
    outline: 'rgba(148, 163, 184, 0.3)',
    sheen: 'rgba(241, 245, 249, 0.32)',
    strapColor: '#09090b',
    avatarFill: '#9ca3af',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.CINZA_PRETA,
    label: 'Cinza/Preta',
    track: 'kids',
    breakdownColor: 'rgba(125, 132, 141, 0.95)',
    main: 'linear-gradient(180deg, #9ca3af 0%, #9ca3af 32%, #111827 32%, #111827 68%, #9ca3af 68%, #9ca3af 100%)',
    outline: 'rgba(82, 82, 91, 0.32)',
    sheen: 'rgba(255, 255, 255, 0.18)',
    strapColor: '#09090b',
    avatarFill: '#6b7280',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.AMARELA_BRANCA,
    label: 'Amarela/Branca',
    track: 'kids',
    breakdownColor: 'rgba(255, 208, 67, 0.95)',
    main: 'linear-gradient(180deg, #fefce8 0%, #fefce8 32%, #facc15 32%, #facc15 68%, #fefce8 68%, #fefce8 100%)',
    outline: 'rgba(245, 158, 11, 0.28)',
    sheen: 'rgba(255, 255, 255, 0.48)',
    strapColor: '#09090b',
    avatarFill: '#facc15',
    avatarStroke: '#fde68a',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.AMARELA,
    label: 'Amarela',
    track: 'kids',
    breakdownColor: 'rgba(250, 204, 21, 0.95)',
    main: 'linear-gradient(180deg, #facc15 0%, #d97706 100%)',
    outline: 'rgba(245, 158, 11, 0.28)',
    sheen: 'rgba(254, 243, 199, 0.28)',
    strapColor: '#09090b',
    avatarFill: '#facc15',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.AMARELA_PRETA,
    label: 'Amarela/Preta',
    track: 'kids',
    breakdownColor: 'rgba(234, 179, 8, 0.95)',
    main: 'linear-gradient(180deg, #facc15 0%, #facc15 32%, #111827 32%, #111827 68%, #facc15 68%, #facc15 100%)',
    outline: 'rgba(245, 158, 11, 0.28)',
    sheen: 'rgba(255, 255, 255, 0.2)',
    strapColor: '#09090b',
    avatarFill: '#eab308',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.LARANJA_BRANCA,
    label: 'Laranja/Branca',
    track: 'kids',
    breakdownColor: 'rgba(251, 146, 60, 0.95)',
    main: 'linear-gradient(180deg, #fff7ed 0%, #fff7ed 32%, #fb923c 32%, #fb923c 68%, #fff7ed 68%, #fff7ed 100%)',
    outline: 'rgba(249, 115, 22, 0.28)',
    sheen: 'rgba(255, 255, 255, 0.44)',
    strapColor: '#09090b',
    avatarFill: '#fb923c',
    avatarStroke: '#fdba74',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.LARANJA,
    label: 'Laranja',
    track: 'kids',
    breakdownColor: 'rgba(249, 115, 22, 0.95)',
    main: 'linear-gradient(180deg, #fb923c 0%, #ea580c 100%)',
    outline: 'rgba(249, 115, 22, 0.28)',
    sheen: 'rgba(255, 237, 213, 0.24)',
    strapColor: '#09090b',
    avatarFill: '#f97316',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.LARANJA_PRETA,
    label: 'Laranja/Preta',
    track: 'kids',
    breakdownColor: 'rgba(234, 88, 12, 0.95)',
    main: 'linear-gradient(180deg, #f97316 0%, #f97316 32%, #111827 32%, #111827 68%, #f97316 68%, #f97316 100%)',
    outline: 'rgba(249, 115, 22, 0.28)',
    sheen: 'rgba(255, 255, 255, 0.16)',
    strapColor: '#09090b',
    avatarFill: '#fb923c',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.VERDE_BRANCA,
    label: 'Verde/Branca',
    track: 'kids',
    breakdownColor: 'rgba(34, 197, 94, 0.95)',
    main: 'linear-gradient(180deg, #f0fdf4 0%, #f0fdf4 32%, #15803d 32%, #15803d 68%, #f0fdf4 68%, #f0fdf4 100%)',
    outline: 'rgba(34, 197, 94, 0.24)',
    sheen: 'rgba(255, 255, 255, 0.42)',
    strapColor: '#09090b',
    avatarFill: '#16a34a',
    avatarStroke: '#bbf7d0',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.VERDE,
    label: 'Verde',
    track: 'kids',
    breakdownColor: 'rgba(22, 163, 74, 0.95)',
    main: 'linear-gradient(180deg, #15803d 0%, #14532d 100%)',
    outline: 'rgba(34, 197, 94, 0.24)',
    sheen: 'rgba(187, 247, 208, 0.2)',
    strapColor: '#09090b',
    avatarFill: '#15803d',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
  {
    id: BeltColor.VERDE_PRETA,
    label: 'Verde/Preta',
    track: 'kids',
    breakdownColor: 'rgba(21, 128, 61, 0.95)',
    main: 'linear-gradient(180deg, #15803d 0%, #15803d 32%, #111827 32%, #111827 68%, #15803d 68%, #15803d 100%)',
    outline: 'rgba(34, 197, 94, 0.24)',
    sheen: 'rgba(255, 255, 255, 0.16)',
    strapColor: '#09090b',
    avatarFill: '#15803d',
    avatarStroke: 'rgba(0,0,0,0.2)',
    avatarBarColor: '#171717',
  },
];

const BELT_META_BY_ID = new Map(BELT_METADATA.map((entry) => [entry.id, entry]));

export const ADULT_BELTS: BeltColor[] = [
  BeltColor.BRANCA,
  BeltColor.AZUL,
  BeltColor.ROXA,
  BeltColor.MARROM,
  BeltColor.PRETA,
];

export const KIDS_BELTS_BY_CATEGORY: Record<KidsCategory, BeltColor[]> = {
  level_infantil: [
    BeltColor.BRANCA,
    BeltColor.CINZA_BRANCA,
    BeltColor.CINZA,
    BeltColor.CINZA_PRETA,
    BeltColor.AMARELA_BRANCA,
    BeltColor.AMARELA,
    BeltColor.AMARELA_PRETA,
    BeltColor.LARANJA_BRANCA,
    BeltColor.LARANJA,
    BeltColor.LARANJA_PRETA,
    BeltColor.VERDE_BRANCA,
    BeltColor.VERDE,
    BeltColor.VERDE_PRETA,
  ],
};

export const KIDS_CATEGORIES: Array<{ value: KidsCategory; label: string }> = [
  { value: 'level_infantil', label: 'Infantil' },
];

export const DEFAULT_PROGRESSION_RULES: ProgressionRulesV2 = {
  version: 2,
  schema: 'v2',
  adult: {
    belts: [
      { belt: BeltColor.BRANCA, stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
      { belt: BeltColor.AZUL, stripeEvery: 65, maxStripes: 4, beltPromotionOffset: 1 },
      { belt: BeltColor.ROXA, stripeEvery: 75, maxStripes: 4, beltPromotionOffset: 1 },
      { belt: BeltColor.MARROM, stripeEvery: 85, maxStripes: 4, beltPromotionOffset: 1 },
      { belt: BeltColor.PRETA, stripeEvery: 0, maxStripes: 0 },
    ],
  },
  kids: {
    level_infantil: {
      belts: [
        { belt: BeltColor.BRANCA, stripeEvery: 15, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.CINZA_BRANCA, stripeEvery: 15, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.CINZA, stripeEvery: 15, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.CINZA_PRETA, stripeEvery: 15, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.AMARELA_BRANCA, stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.AMARELA, stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.AMARELA_PRETA, stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.LARANJA_BRANCA, stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.LARANJA, stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.LARANJA_PRETA, stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.VERDE_BRANCA, stripeEvery: 25, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.VERDE, stripeEvery: 25, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: BeltColor.VERDE_PRETA, stripeEvery: 25, maxStripes: 4, beltPromotionOffset: 1 },
      ],
    },
  },
};

export const ALL_BELTS = BELT_METADATA.map((entry) => entry.id);

export function getClassesToNextBelt(rule: Pick<ProgressionBeltRule, 'stripeEvery' | 'maxStripes' | 'beltPromotionOffset'>): number {
  const stripeEvery = Math.max(0, Math.floor(rule.stripeEvery));
  const maxStripes = Math.max(0, Math.floor(rule.maxStripes));
  const beltPromotionOffset = Math.max(0, Math.floor(rule.beltPromotionOffset ?? 0));
  return stripeEvery * (maxStripes + beltPromotionOffset);
}

function normalizeLooseKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizeBeltId(value?: string | null): BeltColor {
  if (!value) {
    return BeltColor.BRANCA;
  }

  const loose = normalizeLooseKey(value);
  const slashNormalized = loose.replace(/\s*\/\s*/g, '/');
  const hyphenAsSlash = loose.replace(/-/g, '/');
  return BELT_ALIASES[slashNormalized] ?? BELT_ALIASES[loose] ?? BELT_ALIASES[hyphenAsSlash] ?? BeltColor.BRANCA;
}

function cloneOfficialProgressionRules(): ProgressionRulesV2 {
  return {
    version: DEFAULT_PROGRESSION_RULES.version,
    schema: 'v2',
    adult: {
      belts: DEFAULT_PROGRESSION_RULES.adult.belts.map((entry) => ({ ...entry })),
    },
    kids: {
      level_infantil: {
        belts: DEFAULT_PROGRESSION_RULES.kids.level_infantil.belts.map((entry) => ({ ...entry })),
      },
    },
  };
}

export function normalizeProgressionRules(_input?: ProgressionRules | null): ProgressionRulesV2 {
  return cloneOfficialProgressionRules();
}

export function isAdultOnlyBelt(value?: string | null): boolean {
  const belt = normalizeBeltId(value);
  return ADULT_BELTS.includes(belt) && belt !== BeltColor.BRANCA;
}

function resolveProgressionTrack(params: {
  belt?: string | null;
  type?: TrainingType | null;
  kidsCategory?: KidsCategory | null;
  birthDate?: string | null;
}, rules: ProgressionRulesV2): {
  track: TrainingType;
  kidsCategory?: KidsCategory;
  activeRules: ProgressionBeltRule[];
} {
  const beltId = normalizeBeltId(params.belt);
  const inferredKidsCategory = inferKidsCategoryFromBirthDate(params.birthDate);
  const kidsCategory = params.kidsCategory ?? inferredKidsCategory ?? 'level_infantil';

  if (isKidsOnlyBelt(beltId)) {
    return {
      track: 'Kids',
      kidsCategory,
      activeRules: rules.kids[kidsCategory]?.belts ?? rules.kids.level_infantil.belts,
    };
  }

  if (isAdultOnlyBelt(beltId) || params.type === 'Adulto') {
    return {
      track: 'Adulto',
      activeRules: rules.adult.belts,
    };
  }

  if (params.type === 'Kids' || params.kidsCategory || inferredKidsCategory) {
    return {
      track: 'Kids',
      kidsCategory,
      activeRules: rules.kids[kidsCategory]?.belts ?? rules.kids.level_infantil.belts,
    };
  }

  return {
    track: 'Adulto',
    activeRules: rules.adult.belts,
  };
}

export function getProgressionRuleForUser(params: {
  belt?: string | null;
  type?: TrainingType | null;
  kidsCategory?: KidsCategory | null;
  birthDate?: string | null;
}, rules?: ProgressionRules | null): ProgressionBeltRule | undefined {
  const normalizedRules = normalizeProgressionRules(rules);
  const beltId = normalizeBeltId(params.belt);
  const { activeRules } = resolveProgressionTrack(params, normalizedRules);

  return activeRules.find((entry) => normalizeBeltId(entry.belt) === beltId) ?? activeRules[0];
}

function clampProgress(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(Math.floor(value), total));
}

function getBeltStartAttendances(activeRules: ProgressionBeltRule[], currentIndex: number): number {
  return activeRules
    .slice(0, Math.max(0, currentIndex))
    .reduce((total, rule) => total + getClassesToNextBelt(rule), 0);
}

function getEffectiveBeltStartAttendances(
  attendanceCount: number | null,
  beltStartAttendances: number,
  attendanceCountBonus?: number | null,
): number {
  const bonus = Math.max(0, Math.floor(attendanceCountBonus ?? 0));
  const usesCurrentBeltBonus = beltStartAttendances > 0 && bonus > 0 && bonus < beltStartAttendances;

  if (attendanceCount == null || (attendanceCount >= beltStartAttendances && !usesCurrentBeltBonus)) {
    return beltStartAttendances;
  }

  return 0;
}

export function getUserProgressionSummary(params: {
  belt?: string | null;
  grade?: number | null;
  stripes?: number | null;
  type?: TrainingType | null;
  kidsCategory?: KidsCategory | null;
  birthDate?: string | null;
  attendanceCount?: number | null;
  attendanceCountBonus?: number | null;
  currentStripeProgress?: number | null;
  currentBeltProgress?: number | null;
}, rules?: ProgressionRules | null): UserProgressionSummary {
  const normalizedRules = normalizeProgressionRules(rules);
  const currentBelt = normalizeBeltId(params.belt);
  const { track, kidsCategory, activeRules } = resolveProgressionTrack(params, normalizedRules);
  const foundIndex = activeRules.findIndex((entry) => normalizeBeltId(entry.belt) === currentBelt);
  const currentIndex = foundIndex >= 0 ? foundIndex : 0;
  const currentRule = activeRules[currentIndex] ?? normalizedRules.adult.belts[0];
  const nextRule = activeRules[currentIndex + 1];
  const maxStripes = Math.max(0, Math.floor(currentRule.maxStripes));
  const currentStripes = Math.min(
    maxStripes,
    Math.max(0, Math.floor(params.stripes ?? params.grade ?? 0)),
  );
  const classesPerStripe = Math.max(0, Math.floor(currentRule.stripeEvery));
  const hasNextStripe = classesPerStripe > 0 && currentStripes < maxStripes;
  const stripeTotal = hasNextStripe ? classesPerStripe : 0;
  const beltTotal = nextRule && classesPerStripe > 0 ? getClassesToNextBelt(currentRule) : 0;
  const attendanceCount = typeof params.attendanceCount === 'number'
    ? Math.max(0, Math.floor(params.attendanceCount))
    : null;
  const beltStartAttendances = getBeltStartAttendances(activeRules, currentIndex);
  const effectiveBeltStartAttendances = getEffectiveBeltStartAttendances(
    attendanceCount,
    beltStartAttendances,
    params.attendanceCountBonus,
  );
  const stripeStartAttendances = effectiveBeltStartAttendances + currentStripes * classesPerStripe;
  const isManuallyPlaced = attendanceCount !== null && attendanceCount < stripeStartAttendances;
  const gradeProgressForBelt = classesPerStripe > 0 && attendanceCount != null
    ? Math.min(attendanceCount, classesPerStripe)
    : 0;
  const stripeProgress = attendanceCount == null
    ? clampProgress(params.currentStripeProgress ?? 0, stripeTotal)
    : isManuallyPlaced
      ? clampProgress(attendanceCount, stripeTotal)
      : clampProgress(attendanceCount - stripeStartAttendances, stripeTotal);
  const beltProgress = attendanceCount == null
    ? clampProgress(params.currentBeltProgress ?? 0, beltTotal)
    : isManuallyPlaced
      ? clampProgress(currentStripes * classesPerStripe + gradeProgressForBelt, beltTotal)
      : clampProgress(attendanceCount - effectiveBeltStartAttendances, beltTotal);

  return {
    track,
    kidsCategory,
    activeRules,
    currentRule,
    currentBelt,
    currentStripes,
    nextBelt: nextRule ? normalizeBeltId(nextRule.belt) : undefined,
    classesPerStripe,
    stripeProgress,
    stripeTotal,
    stripeRemaining: stripeTotal > 0 ? Math.max(stripeTotal - stripeProgress, 0) : null,
    beltProgress,
    beltTotal,
    beltRemaining: beltTotal > 0 ? Math.max(beltTotal - beltProgress, 0) : null,
  };
}

export function getBeltMeta(value?: string | null): BeltMeta {
  return BELT_META_BY_ID.get(normalizeBeltId(value)) ?? BELT_META_BY_ID.get(BeltColor.BRANCA)!;
}

export function beltLabel(value?: string | null): string {
  return getBeltMeta(value).label;
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

export function inferTrainingTypeFromBirthDate(birthDate?: string | null): TrainingType {
  const birthYear = getBirthYear(birthDate);
  if (birthYear == null) {
    return 'Adulto';
  }

  const today = new Date();
  const ageByBirthYear = today.getFullYear() - birthYear;

  return ageByBirthYear < 13 ? 'Kids' : 'Adulto';
}

export function inferKidsCategoryFromBirthDate(birthDate?: string | null): KidsCategory | undefined {
  if (inferTrainingTypeFromBirthDate(birthDate) === 'Adulto') {
    return undefined;
  }

  return 'level_infantil';
}

export function kidsCategoryLabel(value?: KidsCategory | null): string {
  return KIDS_CATEGORIES.find((entry) => entry.value === value)?.label ?? 'Kids';
}

export function getBeltOptions(type: TrainingType, kidsCategory?: KidsCategory | null): Array<{ value: BeltColor; label: string }> {
  const source = type === 'Kids'
    ? KIDS_BELTS_BY_CATEGORY[kidsCategory ?? 'level_infantil']
    : ADULT_BELTS;

  return source.map((belt) => ({
    value: belt,
    label: type === 'Kids' && belt === BeltColor.BRANCA ? 'Branca Infantil' : beltLabel(belt),
  }));
}

export function isKidsOnlyBelt(value?: string | null): boolean {
  return KIDS_BELTS_BY_CATEGORY.level_infantil.includes(normalizeBeltId(value)) && !ADULT_BELTS.includes(normalizeBeltId(value));
}
