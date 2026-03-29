import { DEFAULT_PROGRESSION_RULES, ProgressionMilestone, ProgressionRules } from '../domain/models';

export interface ProgressionSnapshot {
  belt: string;
  stripes: number;
  nextStripeAttendanceTarget: number | null;
  nextBeltAttendanceTarget: number | null;
  ruleVersion: number;
}

export function normalizeProgressionRules(input?: Partial<ProgressionRules> | null): ProgressionRules {
  if (!input?.milestones?.length) {
    return DEFAULT_PROGRESSION_RULES;
  }

  const milestones = [...input.milestones]
    .map((item) => ({
      belt: item.belt.trim().toLowerCase(),
      minAttendances: Math.max(0, Math.floor(item.minAttendances)),
      stripeEvery: Math.max(1, Math.floor(item.stripeEvery)),
      maxStripes: Math.max(0, Math.floor(item.maxStripes)),
    }))
    .sort((left, right) => left.minAttendances - right.minAttendances);

  return {
    version: typeof input.version === 'number' ? input.version : DEFAULT_PROGRESSION_RULES.version,
    milestones,
  };
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

export function resolveProgression(totalAttendances: number, rules?: Partial<ProgressionRules> | null): ProgressionSnapshot {
  const normalizedRules = normalizeProgressionRules(rules);
  const milestones = normalizedRules.milestones;
  const currentMilestone = getCurrentMilestone(totalAttendances, milestones);
  const currentIndex = milestones.findIndex((item) => item.belt === currentMilestone.belt);
  const nextMilestone = milestones[currentIndex + 1];
  const withinCurrentBelt = Math.max(0, totalAttendances - currentMilestone.minAttendances);
  const stripes = Math.min(
    currentMilestone.maxStripes,
    Math.floor(withinCurrentBelt / currentMilestone.stripeEvery),
  );

  const nextStripeAttendanceTarget =
    stripes < currentMilestone.maxStripes
      ? currentMilestone.minAttendances + (stripes + 1) * currentMilestone.stripeEvery
      : null;

  const nextBeltAttendanceTarget = nextMilestone?.minAttendances ?? null;

  return {
    belt: currentMilestone.belt,
    stripes,
    nextStripeAttendanceTarget,
    nextBeltAttendanceTarget,
    ruleVersion: normalizedRules.version,
  };
}
