export const COLLECTIONS = {
  academies: 'academies',
  attendances: 'attendances',
  attendanceRequests: 'attendance_requests',
  classes: 'classes',
  competitions: 'competitions',
  fights: 'fights',
  graduations: 'graduations',
  joinRequests: 'join_requests',
  learningCourses: 'learning_courses',
  learningLessons: 'learning_lessons',
  learningProgress: 'learning_progress',
  learningQuizAttempts: 'learning_quiz_attempts',
  learningQuizzes: 'learning_quizzes',
  learningTracks: 'learning_tracks',
  missions: 'missions',
  notifications: 'notifications',
  rankings: 'rankings',
  storeItems: 'store_items',
  userMissions: 'user_missions',
  users: 'users',
} as const;

export const ROLE_ORDER = ['student', 'professor', 'admin', 'superadmin'] as const;
export type Role = (typeof ROLE_ORDER)[number];

export type AcademyStatus = 'active' | 'inactive' | 'suspended';
export type UserStatus = 'active' | 'invited' | 'suspended';
export type ClassStatus = 'scheduled' | 'active' | 'finished' | 'cancelled';
export type CheckInMethod = 'qr' | 'manual' | 'request';
export type MissionMetric =
  | 'attendance_count'
  | 'attendance_streak'
  | 'qr_checkins'
  | 'competition_points'
  | 'belt_promotions';
export type MissionStatus = 'in_progress' | 'completed';
export type FightResult = 'win' | 'loss' | 'draw' | 'submission' | 'points' | 'walkover';
export type NotificationStatus = 'queued' | 'sent' | 'read' | 'stored' | 'failed';
export type NotificationChannel = 'academy' | 'team' | 'system';
export type NotificationKind = 'notice' | 'join_request' | 'attendance_request' | 'graduation';
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';
export type AttendanceRequestStatus = 'pending' | 'approved' | 'rejected';
export type LearningContentStatus = 'draft' | 'published';

export interface ProgressionMilestone {
  belt: string;
  minAttendances: number;
  stripeEvery: number;
  maxStripes: number;
}

export interface ProgressionRules {
  version: number;
  milestones: ProgressionMilestone[];
}

export interface AcademyDoc {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  status: AcademyStatus;
  timezone: string;
  progressionRules: ProgressionRules;
  classCheckinWindowMinutes: number;
  masterBlackLimit: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface UserDoc {
  academyId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  cpf: string;
  phone?: string;
  birthDate?: string;
  isCompetitor?: boolean;
  role: Role;
  status: UserStatus;
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
  lastAttendanceAt?: FirebaseFirestore.Timestamp;
  lastLoginAt?: FirebaseFirestore.Timestamp;
  fcmTokens?: string[];
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface ClassDoc {
  academyId: string;
  title: string;
  description?: string;
  professorId: string;
  professorName?: string;
  tatame: string;
  status: ClassStatus;
  scheduledStart: FirebaseFirestore.Timestamp;
  scheduledEnd: FirebaseFirestore.Timestamp;
  startedAt?: FirebaseFirestore.Timestamp;
  endedAt?: FirebaseFirestore.Timestamp;
  capacity?: number;
  currentAttendanceCount: number;
  checkinWindowMinutes: number;
  activeQrHash?: string;
  activeQrExpiresAt?: FirebaseFirestore.Timestamp;
  activeQrVersion?: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface AttendanceDoc {
  academyId: string;
  classId: string;
  userId: string;
  checkInMethod: CheckInMethod;
  checkedInAt: FirebaseFirestore.Timestamp;
  checkedInBy: string;
  checkedInByRole: Role;
  qrVersion?: number;
  sourceDevice?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface AttendanceRequestDoc {
  academyId: string;
  classId: string;
  classTitle: string;
  userId: string;
  userDisplayName: string;
  professorId: string;
  professorName?: string;
  status: AttendanceRequestStatus;
  requestedAt: FirebaseFirestore.Timestamp;
  reviewedAt?: FirebaseFirestore.Timestamp;
  reviewedBy?: string;
  reviewedByRole?: Role;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface GraduationDoc {
  academyId: string;
  userId: string;
  previousBelt: string;
  previousStripes: number;
  newBelt: string;
  newStripes: number;
  attendanceCount: number;
  promotedAt: FirebaseFirestore.Timestamp;
  ruleVersion: number;
  reason: 'automatic_progression' | 'manual_progression';
}

export interface MissionDoc {
  academyId: string;
  name: string;
  description?: string;
  metric: MissionMetric;
  targetValue: number;
  rewardPoints: number;
  active: boolean;
  targetRole?: Role;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface UserMissionDoc {
  academyId: string;
  userId: string;
  missionId: string;
  missionName: string;
  metric: MissionMetric;
  progressCurrent: number;
  targetValue: number;
  rewardPoints: number;
  status: MissionStatus;
  completedAt?: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface RankingDoc {
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
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface CompetitionDoc {
  academyId: string;
  name: string;
  location?: string;
  organizer?: string;
  status: 'draft' | 'published' | 'finished';
  startDate: FirebaseFirestore.Timestamp;
  endDate: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface FightDoc {
  academyId: string;
  competitionId?: string;
  athleteId: string;
  athleteName: string;
  opponentName?: string;
  result: FightResult;
  rankingPointsAwarded?: number;
  videoPath?: string;
  videoUrl?: string;
  occurredAt: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface StoreItemDoc {
  academyId: string;
  name: string;
  description?: string;
  rewardType: 'product' | 'discount' | 'experience';
  pointsCost: number;
  cashPrice?: number;
  stock?: number;
  imagePath?: string;
  status: 'active' | 'inactive';
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface LearningTrackDoc {
  title: string;
  description?: string;
  order: number;
  status: LearningContentStatus;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface LearningCourseDoc {
  trackId: string;
  title: string;
  description?: string;
  order: number;
  status: LearningContentStatus;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface LearningLessonDoc {
  trackId: string;
  courseId: string;
  title: string;
  description?: string;
  videoUrl: string;
  order: number;
  status: LearningContentStatus;
  passingScore: number;
  requiredWatchPercent: number;
  quizQuestionCount: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface LearningQuizQuestionDoc {
  prompt: string;
  options: string[];
  correctOptionIndex: number;
}

export interface LearningQuizDoc {
  lessonId: string;
  trackId: string;
  courseId: string;
  passingScore: number;
  questions: LearningQuizQuestionDoc[];
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface LearningProgressDoc {
  academyId: string;
  userId: string;
  userDisplayName: string;
  trackId: string;
  courseId: string;
  lessonId: string;
  videoSecondsWatched: number;
  durationSeconds: number;
  watchPercent: number;
  videoCompleted: boolean;
  quizReady: boolean;
  quizPassed: boolean;
  lastScore: number;
  bestScore: number;
  attemptCount: number;
  unlockedAt: FirebaseFirestore.Timestamp;
  passedAt?: FirebaseFirestore.Timestamp;
  lastAttemptAt?: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface LearningQuizAttemptDoc {
  academyId: string;
  userId: string;
  userDisplayName: string;
  trackId: string;
  courseId: string;
  lessonId: string;
  answers: number[];
  scorePercent: number;
  passed: boolean;
  attemptNumber: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface NotificationDoc {
  academyId: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  status: NotificationStatus;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  deliveredAt?: FirebaseFirestore.Timestamp;
  readAt?: FirebaseFirestore.Timestamp;
  recipientUserId?: string;
  targetRole?: Role;
  targetBelt?: string;
  actionRef?: string;
  data?: Record<string, string>;
}

export interface JoinRequestDoc {
  academyId: string;
  academyName: string;
  authUid: string;
  email: string;
  cpf: string;
  firstName: string;
  lastName: string;
  displayName: string;
  birthDate: string;
  isCompetitor: boolean;
  requestedBelt: string;
  requestedGrade: number;
  status: JoinRequestStatus;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  resolvedAt?: FirebaseFirestore.Timestamp;
  resolvedBy?: string;
  resolvedByRole?: Role;
}

export const DEFAULT_PROGRESSION_RULES: ProgressionRules = {
  version: 1,
  milestones: [
    { belt: 'white', minAttendances: 0, stripeEvery: 20, maxStripes: 4 },
    { belt: 'blue', minAttendances: 80, stripeEvery: 30, maxStripes: 4 },
    { belt: 'purple', minAttendances: 200, stripeEvery: 35, maxStripes: 4 },
    { belt: 'brown', minAttendances: 340, stripeEvery: 40, maxStripes: 4 },
    { belt: 'black', minAttendances: 500, stripeEvery: 50, maxStripes: 6 },
  ],
};

export const RANKING_WEIGHTS = {
  attendance: 10,
  currentStreak: 15,
  longestStreak: 5,
};
