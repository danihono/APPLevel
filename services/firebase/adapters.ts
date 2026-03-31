import type { Timestamp } from 'firebase/firestore';
import type { Branch, Product, User } from '../../types';
import { BeltColor, UserRole } from '../../types';
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
      return UserRole.ADMIN;
    case 'superadmin':
      return UserRole.SUPERADMIN;
    default:
      return UserRole.ALUNO;
  }
}

export function toBeltColor(belt?: string): BeltColor {
  switch ((belt ?? '').trim().toLowerCase()) {
    case 'blue':
    case 'azul':
      return BeltColor.AZUL;
    case 'purple':
    case 'roxa':
      return BeltColor.ROXA;
    case 'brown':
    case 'marrom':
      return BeltColor.MARROM;
    case 'black':
    case 'preta':
      return BeltColor.PRETA;
    case 'white':
    case 'branca':
    default:
      return BeltColor.BRANCA;
  }
}

function toTrainingType(birthDate?: string): 'Adulto' | 'Kids' {
  if (!birthDate) {
    return 'Adulto';
  }

  const birthday = new Date(birthDate);
  if (Number.isNaN(birthday.valueOf())) {
    return 'Adulto';
  }

  const age = new Date().getFullYear() - birthday.getFullYear();
  return age < 16 ? 'Kids' : 'Adulto';
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
  const stripeTarget = user.nextStripeAttendanceTarget && user.nextStripeAttendanceTarget > 0
    ? user.nextStripeAttendanceTarget
    : Math.max(attendanceCount, 1);
  const beltTarget = user.nextBeltAttendanceTarget && user.nextBeltAttendanceTarget > 0
    ? user.nextBeltAttendanceTarget
    : Math.max(attendanceCount, 1);

  return {
    id,
    name: user.displayName || `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    cpf: user.cpf,
    role: toUserRole(user.role),
    avatar: user.photoPath && user.photoPath.startsWith('http') ? user.photoPath : undefined,
    belt: toBeltColor(user.belt),
    stripes: user.stripes,
    classesToNextStripe: stripeTarget,
    totalClassesToNextBelt: beltTarget,
    currentStripeProgress: Math.min(attendanceCount, stripeTarget),
    currentBeltProgress: Math.min(attendanceCount, beltTarget),
    lastGraduation: buildSafeDate(latestGraduationAt).toISOString(),
    branchId: user.academyId,
    type: toTrainingType(user.birthDate),
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
