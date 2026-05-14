import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  AcademyDoc,
  COLLECTIONS,
  FightDoc,
  MissionDoc,
  MissionMetric,
  RankingDoc,
  RANKING_WEIGHTS,
  Role,
  UserDoc,
  UserMissionDoc,
} from '../domain/models';
import { db } from '../lib/firebase';
import { findSingleByFields, getUserDoc } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { syncGraduationApprovalRequest } from './graduationRequests';
import { resolveProgressionTargets } from './progression';

interface EngagementMetrics {
  attendanceCount: number;
  qrCheckinsCount: number;
  currentStreak: number;
  longestStreak: number;
  competitionPoints: number;
  beltPromotions: number;
  lastAttendanceAt?: FirebaseFirestore.Timestamp;
}

interface RankingBreakdown {
  attendancePoints: number;
  consistencyPoints: number;
  competitionPoints: number;
  missionPoints: number;
  score: number;
}

export interface UserSyncResult {
  academyId: string;
  attendanceCount: number;
  belt: string;
  stripes: number;
  kidsCategory?: string;
  missionPoints: number;
  rankingPoints: number;
  nextStripeAttendanceTarget: number | null;
  nextBeltAttendanceTarget: number | null;
  currentStripeProgress: number;
  classesToNextStripe: number;
  currentBeltProgress: number;
  totalClassesToNextBelt: number;
}

function toDateKey(timestamp: FirebaseFirestore.Timestamp): string {
  return timestamp.toDate().toISOString().slice(0, 10);
}

function getDayDifference(left: string, right: string): number {
  const leftDate = new Date(`${left}T00:00:00.000Z`);
  const rightDate = new Date(`${right}T00:00:00.000Z`);
  return Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000);
}

function computeStreaks(attendanceDates: FirebaseFirestore.Timestamp[]): Pick<EngagementMetrics, 'currentStreak' | 'longestStreak' | 'lastAttendanceAt'> {
  if (attendanceDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  const uniqueDays = [...new Set(attendanceDates.map(toDateKey))].sort();
  let longestStreak = 1;
  let currentRun = 1;

  for (let index = 1; index < uniqueDays.length; index += 1) {
    const previous = uniqueDays[index - 1];
    const current = uniqueDays[index];

    if (getDayDifference(current, previous) === 1) {
      currentRun += 1;
      longestStreak = Math.max(longestStreak, currentRun);
    } else {
      currentRun = 1;
    }
  }

  const latestAttendance = attendanceDates[0];
  const latestKey = toDateKey(latestAttendance);
  const todayKey = new Date().toISOString().slice(0, 10);
  const latestGap = Math.abs(getDayDifference(todayKey, latestKey));
  const currentStreak = latestGap <= 7
    ? (() => {
        let streak = 1;

        for (let index = uniqueDays.length - 1; index > 0; index -= 1) {
          if (getDayDifference(uniqueDays[index], uniqueDays[index - 1]) === 1) {
            streak += 1;
          } else {
            break;
          }
        }

        return streak;
      })()
    : 0;

  return {
    currentStreak,
    longestStreak,
    lastAttendanceAt: latestAttendance,
  };
}

function resolveFightPoints(fight: FightDoc): number {
  if (typeof fight.rankingPointsAwarded === 'number') {
    return fight.rankingPointsAwarded;
  }

  switch (fight.result) {
    case 'submission':
      return 80;
    case 'win':
      return 60;
    case 'points':
      return 50;
    case 'draw':
      return 25;
    case 'walkover':
      return 15;
    case 'loss':
    default:
      return 10;
  }
}

function calculateRanking(metrics: EngagementMetrics, missionPoints: number): RankingBreakdown {
  const attendancePoints = metrics.attendanceCount * RANKING_WEIGHTS.attendance;
  const consistencyPoints =
    metrics.currentStreak * RANKING_WEIGHTS.currentStreak +
    metrics.longestStreak * RANKING_WEIGHTS.longestStreak;
  const competitionPoints = metrics.competitionPoints;
  const score = attendancePoints + consistencyPoints + competitionPoints + missionPoints;

  return {
    attendancePoints,
    consistencyPoints,
    competitionPoints,
    missionPoints,
    score,
  };
}

function resolveMissionValue(metric: MissionMetric, metrics: EngagementMetrics): number {
  switch (metric) {
    case 'attendance_count':
      return metrics.attendanceCount;
    case 'attendance_streak':
      return metrics.currentStreak;
    case 'qr_checkins':
      return metrics.qrCheckinsCount;
    case 'competition_points':
      return metrics.competitionPoints;
    case 'belt_promotions':
      return metrics.beltPromotions;
    default:
      return 0;
  }
}

async function computeEngagementMetrics(userId: string, academyId: string): Promise<EngagementMetrics> {
  const attendanceBaseQuery = db
    .collection(COLLECTIONS.attendances)
    .where('academyId', '==', academyId)
    .where('userId', '==', userId);

  const [attendanceCountSnapshot, nonCountingSnapshot, qrAttendanceCountSnapshot, attendanceTimelineSnapshot, fightsSnapshot, graduationCountSnapshot] =
    await Promise.all([
      attendanceBaseQuery.count().get(),
      attendanceBaseQuery.where('countsAsAttendance', '==', false).count().get(),
      attendanceBaseQuery.where('checkInMethod', '==', 'qr').count().get(),
      attendanceBaseQuery.orderBy('checkedInAt', 'desc').limit(180).get(),
      db
        .collection(COLLECTIONS.fights)
        .where('academyId', '==', academyId)
        .where('athleteId', '==', userId)
        .orderBy('occurredAt', 'desc')
        .get(),
      db
        .collection(COLLECTIONS.graduations)
        .where('academyId', '==', academyId)
        .where('userId', '==', userId)
        .count()
        .get(),
    ]);

  const attendanceDates = attendanceTimelineSnapshot.docs.map((doc) => doc.get('checkedInAt') as FirebaseFirestore.Timestamp);
  const streaks = computeStreaks(attendanceDates);
  const competitionPoints = fightsSnapshot.docs.reduce((total, doc) => total + resolveFightPoints(doc.data() as FightDoc), 0);

  return {
    attendanceCount: attendanceCountSnapshot.data().count - nonCountingSnapshot.data().count,
    qrCheckinsCount: qrAttendanceCountSnapshot.data().count,
    competitionPoints,
    beltPromotions: graduationCountSnapshot.data().count,
    ...streaks,
  };
}

async function loadAcademyRules(academyId: string): Promise<AcademyDoc['progressionRules'] | undefined> {
  const academySnap = await db.collection(COLLECTIONS.academies).doc(academyId).get();
  if (!academySnap.exists) {
    return undefined;
  }

  const academy = academySnap.data() as AcademyDoc;
  return academy.progressionRules;
}

async function syncUserMissions(userId: string, userRole: Role, academyId: string, metrics: EngagementMetrics): Promise<number> {
  const [missionsSnapshot, userMissionsSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.missions).where('academyId', '==', academyId).where('active', '==', true).get(),
    db.collection(COLLECTIONS.userMissions).where('academyId', '==', academyId).where('userId', '==', userId).get(),
  ]);

  const existingByMissionId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>>();
  for (const doc of userMissionsSnapshot.docs) {
    existingByMissionId.set(doc.get('missionId') as string, doc);
  }

  const now = Timestamp.now();
  const batch = db.batch();
  let totalRewardPoints = 0;
  const activeMissionIds = new Set<string>();

  for (const doc of missionsSnapshot.docs) {
    const missionId = doc.id;
    const mission = doc.data() as MissionDoc;
    activeMissionIds.add(missionId);

    if (mission.targetRole && mission.targetRole !== userRole) {
      continue;
    }

    const currentValue = resolveMissionValue(mission.metric, metrics);
    const isCompleted = currentValue >= mission.targetValue;
    const existing = existingByMissionId.get(missionId);
    const userMissionRef = existing?.ref ?? db.collection(COLLECTIONS.userMissions).doc();

    const payload: UserMissionDoc = {
      academyId,
      userId,
      missionId,
      missionName: mission.name,
      metric: mission.metric,
      progressCurrent: currentValue,
      targetValue: mission.targetValue,
      rewardPoints: mission.rewardPoints,
      status: isCompleted ? 'completed' : 'in_progress',
      completedAt: isCompleted ? ((existing?.get('completedAt') as FirebaseFirestore.Timestamp | undefined) ?? now) : undefined,
      updatedAt: now,
    };

    batch.set(userMissionRef, payload, { merge: true });
    if (isCompleted) {
      totalRewardPoints += mission.rewardPoints;
    }
  }

  for (const existing of userMissionsSnapshot.docs) {
    const missionId = existing.get('missionId') as string;
    if (!activeMissionIds.has(missionId) && existing.get('status') === 'completed') {
      totalRewardPoints += (existing.get('rewardPoints') as number) ?? 0;
    }
  }

  await batch.commit();
  return totalRewardPoints;
}

async function upsertRanking(userId: string, academyId: string, user: UserDoc, ranking: RankingBreakdown): Promise<void> {
  const existing = await findSingleByFields<RankingDoc>(COLLECTIONS.rankings, [
    ['academyId', '==', academyId],
    ['userId', '==', userId],
  ]);

  const rankingRef = existing ? db.collection(COLLECTIONS.rankings).doc(existing.id) : db.collection(COLLECTIONS.rankings).doc();
  const now = Timestamp.now();
  const payload: RankingDoc = {
    academyId,
    userId,
    displayName: user.displayName,
    belt: user.belt,
    score: ranking.score,
    position: existing?.data.position ?? 0,
    attendancePoints: ranking.attendancePoints,
    consistencyPoints: ranking.consistencyPoints,
    competitionPoints: ranking.competitionPoints,
    missionPoints: ranking.missionPoints,
    updatedAt: now,
  };

  await rankingRef.set(payload, { merge: true });
}

export async function recalculateAcademyRankingPositions(academyId: string): Promise<void> {
  const snapshot = await db
    .collection(COLLECTIONS.rankings)
    .where('academyId', '==', academyId)
    .orderBy('score', 'desc')
    .orderBy('competitionPoints', 'desc')
    .get();

  const batch = db.batch();
  snapshot.docs.forEach((doc, index) => {
    batch.update(doc.ref, {
      position: index + 1,
      updatedAt: Timestamp.now(),
    });
  });
  await batch.commit();
}

export async function syncUserDerivedState(
  userId: string,
  academyId: string,
  options?: { recalculatePositions?: boolean },
): Promise<UserSyncResult> {
  const normalizedAcademyId = academyId.trim();
  assertCondition(
    normalizedAcademyId.length > 0,
    'failed-precondition',
    'Usuario precisa estar vinculado a uma academia antes de sincronizar estado derivado.',
  );

  const user = await getUserDoc(userId);
  const rawMetrics = await computeEngagementMetrics(userId, normalizedAcademyId);
  const bonus = Math.max(0, Math.floor(user.attendanceCountBonus ?? 0));
  const metrics = bonus > 0 ? { ...rawMetrics, attendanceCount: rawMetrics.attendanceCount + bonus } : rawMetrics;
  const rules = await loadAcademyRules(normalizedAcademyId);
  const progression = resolveProgressionTargets(user.belt, user.stripes, metrics.attendanceCount, rules, {
    birthDate: user.birthDate,
    kidsCategory: user.kidsCategory,
    attendanceCountBonus: bonus,
    attendanceCountAtBeltStart: user.attendanceCountAtBeltStart ?? null,
  });
  const missionPoints = await syncUserMissions(userId, user.role, normalizedAcademyId, metrics);
  const ranking = calculateRanking(metrics, missionPoints);
  const now = Timestamp.now();
  const batch = db.batch();

  batch.update(db.collection(COLLECTIONS.users).doc(userId), {
    attendanceCount: metrics.attendanceCount,
    qrCheckinsCount: metrics.qrCheckinsCount,
    currentStreak: metrics.currentStreak,
    longestStreak: metrics.longestStreak,
    competitionPoints: metrics.competitionPoints,
    missionPoints,
    rankingPoints: ranking.score,
    beltPromotions: metrics.beltPromotions,
    nextStripeAttendanceTarget: progression.nextStripeAttendanceTarget,
    nextBeltAttendanceTarget: progression.nextBeltAttendanceTarget,
    currentStripeProgress: progression.currentStripeProgress,
    classesToNextStripe: progression.classesToNextStripe,
    currentBeltProgress: progression.currentBeltProgress,
    totalClassesToNextBelt: progression.totalClassesToNextBelt,
    lastAttendanceAt: metrics.lastAttendanceAt,
    updatedAt: now,
  });

  await batch.commit();
  await syncGraduationApprovalRequest({
    academyId: normalizedAcademyId,
    userId,
    user,
    attendanceCount: metrics.attendanceCount,
    rules,
  });
  await upsertRanking(
    userId,
    normalizedAcademyId,
    {
      ...user,
      missionPoints,
      rankingPoints: ranking.score,
    },
    ranking,
  );

  if (options?.recalculatePositions !== false) {
    await recalculateAcademyRankingPositions(normalizedAcademyId);
  }

  return {
    academyId: normalizedAcademyId,
    attendanceCount: metrics.attendanceCount,
    belt: user.belt,
    stripes: user.stripes,
    kidsCategory: user.kidsCategory,
    missionPoints,
    rankingPoints: ranking.score,
    nextStripeAttendanceTarget: progression.nextStripeAttendanceTarget,
    nextBeltAttendanceTarget: progression.nextBeltAttendanceTarget,
    currentStripeProgress: progression.currentStripeProgress,
    classesToNextStripe: progression.classesToNextStripe,
    currentBeltProgress: progression.currentBeltProgress,
    totalClassesToNextBelt: progression.totalClassesToNextBelt,
  };
}

export async function syncAllUsersInAcademy(academyId: string): Promise<number> {
  const usersSnapshot = await db
    .collection(COLLECTIONS.users)
    .where('academyId', '==', academyId)
    .limit(2000)
    .get();

  const userIds = usersSnapshot.docs.map((doc) => doc.id);
  const BATCH_SIZE = 10;

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    await Promise.all(
      userIds.slice(i, i + BATCH_SIZE).map((uid) =>
        syncUserDerivedState(uid, academyId, { recalculatePositions: false }),
      ),
    );
  }

  await recalculateAcademyRankingPositions(academyId);
  return usersSnapshot.size;
}

export async function bumpClassAttendanceCounter(classId: string, delta: 1 | -1): Promise<void> {
  const classRef = db.collection(COLLECTIONS.classes).doc(classId);
  await classRef.set(
    {
      currentAttendanceCount: FieldValue.increment(delta),
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}
