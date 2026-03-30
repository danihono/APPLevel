import type { Timestamp } from 'firebase/firestore';

export type AppRole = 'student' | 'professor' | 'admin' | 'superadmin';
export type ClassStatus = 'scheduled' | 'active' | 'finished' | 'cancelled';
export type CheckInMethod = 'qr' | 'manual';
export type MissionMetric =
  | 'attendance_count'
  | 'attendance_streak'
  | 'qr_checkins'
  | 'competition_points'
  | 'belt_promotions';

export interface AcademyRecord {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  status: 'active' | 'inactive' | 'suspended';
  timezone: string;
  classCheckinWindowMinutes: number;
  masterBlackLimit?: number;
  progressionRules?: {
    version: number;
    milestones: Array<{
      belt: string;
      minAttendances: number;
      stripeEvery: number;
      maxStripes: number;
    }>;
  };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface UserRecord {
  academyId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone?: string;
  birthDate?: string;
  role: AppRole;
  status: 'active' | 'invited' | 'suspended';
  belt: string;
  stripes: number;
  grade: number;
  photoPath?: string;
  attendanceCount: number;
  qrCheckinsCount: number;
  currentStreak: number;
  longestStreak: number;
  competitionPoints: number;
  missionPoints: number;
  rankingPoints: number;
  beltPromotions: number;
  nextStripeAttendanceTarget?: number | null;
  nextBeltAttendanceTarget?: number | null;
  lastAttendanceAt?: Timestamp;
  lastLoginAt?: Timestamp;
  fcmTokens?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ClassRecord {
  academyId: string;
  title: string;
  description?: string;
  professorId: string;
  professorName?: string;
  tatame: string;
  status: ClassStatus;
  scheduledStart?: Timestamp;
  scheduledEnd?: Timestamp;
  startedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  capacity?: number;
  currentAttendanceCount: number;
  checkinWindowMinutes: number;
  activeQrExpiresAt?: Timestamp | null;
  activeQrVersion?: number | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AttendanceRecord {
  academyId: string;
  classId: string;
  userId: string;
  checkInMethod: CheckInMethod;
  checkedInBy: string;
  checkedInAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MissionRecord {
  academyId: string;
  name: string;
  description?: string;
  metric: MissionMetric;
  targetValue: number;
  rewardPoints: number;
  active: boolean;
  targetRole?: AppRole;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RankingRecord {
  academyId: string;
  userId: string;
  displayName: string;
  belt: string;
  score: number;
  position: number;
  attendancePoints: number;
  consistencyPoints: number;
  competitionPoints: number;
  missionPoints: number;
  updatedAt?: Timestamp;
}

export interface NotificationRecord {
  academyId: string;
  title: string;
  body: string;
  status: 'queued' | 'sent' | 'read' | 'stored' | 'failed';
  recipientUserId?: string;
  targetRole?: AppRole;
  targetBelt?: string;
  data?: Record<string, string>;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  readAt?: Timestamp;
}

export interface UserMissionRecord {
  academyId: string;
  userId: string;
  missionId: string;
  missionName: string;
  metric: MissionMetric;
  progressCurrent: number;
  targetValue: number;
  rewardPoints: number;
  status: 'in_progress' | 'completed';
  completedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface GraduationRecord {
  academyId: string;
  userId: string;
  previousBelt: string;
  previousStripes: number;
  newBelt: string;
  newStripes: number;
  attendanceCount: number;
  promotedAt?: Timestamp;
  ruleVersion: number;
  reason: 'automatic_progression';
}

export interface CompetitionRecord {
  academyId: string;
  name: string;
  location?: string;
  organizer?: string;
  status: 'draft' | 'published' | 'finished';
  startDate?: Timestamp;
  endDate?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FightRecord {
  academyId: string;
  competitionId?: string;
  athleteId: string;
  athleteName: string;
  opponentName?: string;
  result: 'win' | 'loss' | 'draw' | 'submission' | 'points' | 'walkover';
  rankingPointsAwarded?: number;
  videoPath?: string;
  videoUrl?: string;
  occurredAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface StoreItemRecord {
  academyId: string;
  name: string;
  description?: string;
  rewardType: 'product' | 'discount' | 'experience';
  pointsCost: number;
  cashPrice?: number;
  stock?: number;
  imagePath?: string;
  status: 'active' | 'inactive';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CreateAcademyPayload {
  name: string;
  slug?: string;
  ownerUserId?: string;
  timezone?: string;
  classCheckinWindowMinutes?: number;
  masterBlackLimit?: number;
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role: AppRole;
  academyId?: string;
  phone?: string;
  belt?: string;
  grade?: number;
  stripes?: number;
}
