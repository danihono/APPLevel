import type { Timestamp } from 'firebase/firestore';
import {
  inferKidsCategoryFromBirthDate,
  inferTrainingTypeFromBirthDate,
  normalizeBeltId,
} from '../../beltCatalog';
import type { Branch, Product, User } from '../../types';
import { UserRole } from '../../types';
import type {
  AcademyRecord,
  AppRole,
  FightRecord,
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

export function toUiUser(params: {
  id: string;
  user: FirestoreEntity<UserRecord>;
  graduations: Array<FirestoreEntity<GraduationRecord>>;
  fights: Array<FirestoreEntity<FightRecord>>;
}): User {
  const { id, user, graduations, fights } = params;
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
    lastGraduation: buildSafeDate(latestGraduationAt).toISOString(),
    branchId: user.academyId,
    type: trainingType,
    kidsCategory: user.kidsCategory ?? inferKidsCategoryFromBirthDate(user.birthDate),
    isCompetitor: user.isCompetitor ?? false,
    birthDate: user.birthDate,
    startDate: formatDate(user.createdAt) || undefined,
    lastStripeDate: formatDate(latestGraduationAt) || undefined,
    videos: fights
      .filter((fight) => !!fight.videoUrl)
      .map((fight) => ({
        id: fight.id,
        title: fight.opponentName ? `Luta vs ${fight.opponentName}` : 'Vídeo de luta',
        url: fight.videoUrl as string,
        date: formatDateLabel(fight.occurredAt),
    })),
  };
}
