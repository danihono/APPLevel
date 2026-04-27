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
        { belt: BeltColor.BRANCA, stripeEvery: 15, maxStripes: 4 },
        { belt: BeltColor.CINZA_BRANCA, stripeEvery: 15, maxStripes: 4 },
        { belt: BeltColor.CINZA, stripeEvery: 15, maxStripes: 4 },
        { belt: BeltColor.CINZA_PRETA, stripeEvery: 15, maxStripes: 4 },
        { belt: BeltColor.AMARELA_BRANCA, stripeEvery: 20, maxStripes: 4 },
        { belt: BeltColor.AMARELA, stripeEvery: 20, maxStripes: 4 },
        { belt: BeltColor.AMARELA_PRETA, stripeEvery: 20, maxStripes: 4 },
        { belt: BeltColor.LARANJA_BRANCA, stripeEvery: 20, maxStripes: 4 },
        { belt: BeltColor.LARANJA, stripeEvery: 20, maxStripes: 4 },
        { belt: BeltColor.LARANJA_PRETA, stripeEvery: 20, maxStripes: 4 },
        { belt: BeltColor.VERDE_BRANCA, stripeEvery: 25, maxStripes: 4 },
        { belt: BeltColor.VERDE, stripeEvery: 25, maxStripes: 4 },
        { belt: BeltColor.VERDE_PRETA, stripeEvery: 25, maxStripes: 4 },
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

function sanitizeBeltRule(entry: Partial<ProgressionBeltRule> | undefined, fallback?: ProgressionBeltRule): ProgressionBeltRule {
  const stripeEvery = typeof entry?.stripeEvery === 'number'
    ? Math.max(0, Math.floor(entry.stripeEvery))
    : Math.max(0, Math.floor(fallback?.stripeEvery ?? 0));
  const maxStripes = typeof entry?.maxStripes === 'number'
    ? Math.max(0, Math.floor(entry.maxStripes))
    : Math.max(0, Math.floor(fallback?.maxStripes ?? 0));

  return {
    belt: normalizeBeltId(entry?.belt ?? fallback?.belt),
    stripeEvery,
    maxStripes,
    beltPromotionOffset: typeof entry?.beltPromotionOffset === 'number'
      ? Math.max(0, Math.floor(entry.beltPromotionOffset))
      : Math.max(0, Math.floor(fallback?.beltPromotionOffset ?? 0)),
  };
}

function sanitizeSegment(input: ProgressionRuleSegment | undefined, fallback: ProgressionRuleSegment): ProgressionRuleSegment {
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

  return { belts: [...belts, ...extras] };
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
  return BELT_ALIASES[slashNormalized] ?? BELT_ALIASES[loose] ?? BeltColor.BRANCA;
}

export function normalizeProgressionRules(input?: ProgressionRules | null): ProgressionRulesV2 {
  if (!input) {
    return DEFAULT_PROGRESSION_RULES;
  }

  if ('schema' in input || 'adult' in input || 'kids' in input) {
    const v2 = input as Partial<ProgressionRulesV2>;
    return {
      version: typeof v2.version === 'number' ? v2.version : DEFAULT_PROGRESSION_RULES.version,
      schema: 'v2',
      adult: sanitizeSegment(v2.adult, DEFAULT_PROGRESSION_RULES.adult),
      kids: {
        level_infantil: sanitizeSegment(v2.kids?.level_infantil, DEFAULT_PROGRESSION_RULES.kids.level_infantil),
      },
    };
  }

  const legacy = [...(input.milestones ?? [])]
    .map((entry) => ({
      belt: entry.belt,
      minAttendances: Math.max(0, Math.floor(entry.minAttendances)),
      stripeEvery: Math.max(0, Math.floor(entry.stripeEvery)),
      maxStripes: Math.max(0, Math.floor(entry.maxStripes)),
    }))
    .sort((left, right) => left.minAttendances - right.minAttendances);

  return {
    version: typeof input.version === 'number' ? input.version : DEFAULT_PROGRESSION_RULES.version,
    schema: 'v2',
    adult: sanitizeSegment({
      belts: legacy.map((entry, index) => {
        const nextEntry = legacy[index + 1];
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
      }),
    }, DEFAULT_PROGRESSION_RULES.adult),
    kids: DEFAULT_PROGRESSION_RULES.kids,
  };
}

export function getBeltMeta(value?: string | null): BeltMeta {
  return BELT_META_BY_ID.get(normalizeBeltId(value)) ?? BELT_META_BY_ID.get(BeltColor.BRANCA)!;
}

export function beltLabel(value?: string | null): string {
  return getBeltMeta(value).label;
}

export function inferTrainingTypeFromBirthDate(birthDate?: string | null): TrainingType {
  if (!birthDate) {
    return 'Adulto';
  }

  const birthday = new Date(birthDate);
  if (Number.isNaN(birthday.valueOf())) {
    return 'Adulto';
  }

  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  const monthDelta = today.getMonth() - birthday.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthday.getDate())) {
    age -= 1;
  }

  return age < 16 ? 'Kids' : 'Adulto';
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
