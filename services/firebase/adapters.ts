import type { Timestamp } from 'firebase/firestore';
import {
  inferKidsCategoryFromBirthDate,
  inferTrainingTypeFromBirthDate,
  normalizeBeltId,
} from '../../beltCatalog';
import type { Branch, Product, User, UserVideo } from '../../types';
import { UserRole } from '../../types';
import { getVideoSourceKindFromUrl } from '../../utils';
import type {
  AcademyRecord,
  AppRole,
  FightRecord,
  FightVideoSubmissionRecord,
  GraduationRecord,
  StoreItemRecord,
  UserRecord,
} from './models';
import type { FirestoreEntity } from './data';

function normalizeTimestamp(value?: Timestamp | Date | null): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  return value.toDate();
}

function buildSafeDate(value?: Timestamp | Date | null, fallback?: Date): Date {
  return normalizeTimestamp(value) ?? fallback ?? new Date();
}

function videoTime(value?: Timestamp | Date | null): number {
  return normalizeTimestamp(value)?.getTime() ?? 0;
}

export function formatDate(value?: Timestamp | Date | null): string {
  const normalized = normalizeTimestamp(value);
  if (!normalized) {
    return '';
  }

  return normalized.toISOString();
}

export function formatDateLabel(value?: Timestamp | Date | null): string {
  const normalized = normalizeTimestamp(value);
  if (!normalized) {
    return 'Sem registro';
  }

  return normalized.toLocaleDateString('pt-BR');
}

export function formatTimeLabel(value?: Timestamp | Date | null): string {
  const normalized = normalizeTimestamp(value);
  if (!normalized) {
    return '--:--';
  }

  return normalized.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toUserRole(role: AppRole): UserRole {
  switch (role) {
    case 'student':
      return UserRole.ALUNO;
    case 'professor':
      return UserRole.PROFESSOR;
    case 'admin':
      return UserRole.PROFESSOR;
    case 'superadmin':
      return UserRole.SUPERADMIN;
    default:
      return UserRole.ALUNO;
  }
}

export function toBeltColor(belt?: string) {
  return normalizeBeltId(belt);
}

export function toBranch(academy: FirestoreEntity<AcademyRecord> | null): Branch {
  return {
    id: academy?.id ?? 'academy',
    name: academy?.name ?? 'Academia',
    location: academy?.timezone ?? 'America/Sao_Paulo',
    commissionBalance: 0,
  };
}

export function toProduct(item: FirestoreEntity<StoreItemRecord>): Product {
  return {
    id: item.id,
    name: item.name,
    price: item.cashPrice ?? item.pointsCost,
    vendor: 'LEVEL Store',
    category: item.rewardType,
    image: item.imagePath && item.imagePath.startsWith('http')
      ? item.imagePath
      : `https://picsum.photos/seed/${item.id}/400/400`,
  };
}

export function toUserVideoLibrary(params: {
  fights: Array<FirestoreEntity<FightRecord>>;
  submissions?: Array<FirestoreEntity<FightVideoSubmissionRecord>>;
}): UserVideo[] {
  const fightVideos = params.fights
    .filter((fight) => !!fight.videoUrl)
    .map((fight) => ({
      id: fight.id,
      title: fight.opponentName ? `Luta vs ${fight.opponentName}` : 'Video de luta',
      url: fight.videoUrl as string,
      date: formatDateLabel(fight.occurredAt),
      sourceKind: getVideoSourceKindFromUrl(fight.videoUrl as string),
      origin: 'fight' as const,
      sortTime: videoTime(fight.occurredAt),
    }));

  const approvedSubmissions = (params.submissions ?? [])
    .filter((submission) => submission.status === 'approved' && !!submission.sourceUrl)
    .map((submission) => ({
      id: submission.id,
      title: submission.title,
      url: submission.sourceUrl,
      date: formatDateLabel(submission.occurredAt ?? submission.createdAt),
      sourceKind: submission.sourceKind,
      origin: 'submission' as const,
      sortTime: videoTime(submission.occurredAt ?? submission.createdAt),
    }));

  return [...fightVideos, ...approvedSubmissions]
    .sort((left, right) => right.sortTime - left.sortTime || left.title.localeCompare(right.title, 'pt-BR'))
    .map(({ sortTime: _sortTime, ...item }) => item);
}

export function toUiUser(params: {
  id: string;
  user: FirestoreEntity<UserRecord>;
  graduations: Array<FirestoreEntity<GraduationRecord>>;
  fights: Array<FirestoreEntity<FightRecord>>;
  submissions?: Array<FirestoreEntity<FightVideoSubmissionRecord>>;
  videoLibrary?: User['videos'];
}): User {
  const { id, user, graduations, fights, submissions = [], videoLibrary } = params;
  const latestGraduationAt = graduations[0]?.promotedAt ?? user.updatedAt ?? user.createdAt;
  const attendanceCount = user.attendanceCount ?? 0;
  const trainingType = inferTrainingTypeFromBirthDate(user.birthDate);
  const stripeTarget = user.nextStripeAttendanceTarget && user.nextStripeAttendanceTarget > 0
    ? user.nextStripeAttendanceTarget
    : Math.max(attendanceCount, 1);
  const beltTarget = user.nextBeltAttendanceTarget && user.nextBeltAttendanceTarget > 0
    ? user.nextBeltAttendanceTarget
    : Math.max(attendanceCount, 1);
  const relativeStripeTotal = user.classesToNextStripe ?? stripeTarget;
  const relativeBeltTotal = user.totalClassesToNextBelt ?? beltTarget;
  const relativeStripeProgress = user.currentStripeProgress ?? Math.min(attendanceCount, relativeStripeTotal);
  const relativeBeltProgress = user.currentBeltProgress ?? Math.min(attendanceCount, relativeBeltTotal);

  return {
    id,
    name: user.displayName || `${user.firstName} ${user.lastName}`.trim(),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    cpf: user.cpf,
    role: toUserRole(user.role),
    avatar: user.photoPath && user.photoPath.startsWith('http') ? user.photoPath : undefined,
    belt: toBeltColor(user.belt),
    grade: user.grade ?? user.stripes ?? 0,
    stripes: user.stripes,
    status: user.status,
    classesToNextStripe: relativeStripeTotal,
    totalClassesToNextBelt: relativeBeltTotal,
    currentStripeProgress: relativeStripeProgress,
    currentBeltProgress: relativeBeltProgress,
    attendanceCountBonus: user.attendanceCountBonus ?? 0,
    lastGraduation: buildSafeDate(user.lastGraduationDateOverride ?? latestGraduationAt).toISOString(),
    branchId: user.academyId,
    type: trainingType,
    kidsCategory: user.kidsCategory ?? inferKidsCategoryFromBirthDate(user.birthDate),
    isCompetitor: user.isCompetitor ?? false,
    phone: user.phone,
    birthDate: user.birthDate,
    startDate: formatDate(user.trainingStartDate ?? user.createdAt) || undefined,
    lastStripeDate: formatDate(user.lastStripeDateOverride ?? latestGraduationAt) || undefined,
    trainingStartDate: formatDate(user.trainingStartDate) || undefined,
    lastGraduationDateOverride: formatDate(user.lastGraduationDateOverride) || undefined,
    lastStripeDateOverride: formatDate(user.lastStripeDateOverride) || undefined,
    videos: videoLibrary ?? toUserVideoLibrary({ fights, submissions }),
  };
}
