export const COLLECTIONS = {
  academies: 'academies',
  attendances: 'attendances',
  attendanceRequests: 'attendance_requests',
  classRsvps: 'class_rsvps',
  classes: 'classes',
  competitions: 'competitions',
  fights: 'fights',
  fightVideoSubmissions: 'fight_video_submissions',
  graduationRequests: 'graduation_requests',
  graduations: 'graduations',
  joinRequests: 'join_requests',
  learningCourses: 'learning_courses',
  learningLessonBlocks: 'learning_lesson_blocks',
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
export type NotificationKind = 'notice' | 'join_request' | 'attendance_request' | 'graduation' | 'fight_video_submission';
export type GraduationRequestStatus = 'pending' | 'approved' | 'superseded';
export type GraduationTargetType = 'stripe' | 'belt';
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';
export type AttendanceRequestStatus = 'pending' | 'approved' | 'rejected';
export type FightVideoSourceKind = 'youtube' | 'external' | 'upload';
export type FightVideoSubmissionStatus = 'pending' | 'approved' | 'rejected';
export type LearningContentStatus = 'draft' | 'published';
export type LearningLessonBlockType = 'youtube' | 'uploaded_video' | 'pdf' | 'image';
export type KidsCategory = 'level_kids' | 'level_infanto_juvenil' | 'level_juvenil';

export interface ProgressionMilestone {
  belt: string;
  minAttendances: number;
  stripeEvery: number;
  maxStripes: number;
}

export interface ProgressionBeltRule {
  belt: string;
  stripeEvery: number;
  maxStripes: number;
  beltPromotionOffset?: number;
}

export interface ProgressionRuleSegment {
  belts: ProgressionBeltRule[];
}

export type KidsProgressionSegments = Record<KidsCategory, ProgressionRuleSegment>;

export interface LegacyProgressionRules {
  version: number;
  milestones: ProgressionMilestone[];
}

export interface ProgressionRulesV2 {
  version: number;
  schema: 'v2';
  adult: ProgressionRuleSegment;
  kids: KidsProgressionSegments;
}

export type ProgressionRules = LegacyProgressionRules | ProgressionRulesV2;

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
  kidsCategory?: KidsCategory;
  isCompetitor?: boolean;
  role: Role;
  status: UserStatus;
  belt: string;
  stripes: number;
  grade: number;
  photoPath?: string;
  attendanceCount: number;
  attendanceCountBonus?: number;
  qrCheckinsCount: number;
  currentStreak: number;
  longestStreak: number;
  competitionPoints: number;
  missionPoints: number;
  rankingPoints: number;
  beltPromotions: number;
  nextStripeAttendanceTarget?: number | null;
  nextBeltAttendanceTarget?: number | null;
  currentStripeProgress?: number;
  classesToNextStripe?: number;
  currentBeltProgress?: number;
  totalClassesToNextBelt?: number;
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
  recurrenceSeriesId?: string;
  status: ClassStatus;
  scheduledStart: FirebaseFirestore.Timestamp;
  scheduledEnd: FirebaseFirestore.Timestamp;
  startedAt?: FirebaseFirestore.Timestamp;
  endedAt?: FirebaseFirestore.Timestamp;
  capacity?: number;
  currentAttendanceCount: number;
  rsvpCount?: number;
  checkinWindowMinutes: number;
  activeQrHash?: string;
  activeQrExpiresAt?: FirebaseFirestore.Timestamp;
  activeQrVersion?: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface ClassRsvpDoc {
  academyId: string;
  classId: string;
  userId: string;
  userDisplayName: string;
  scheduledStart: FirebaseFirestore.Timestamp;
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

export interface GraduationApprovalRequestDoc {
  academyId: string;
  userId: string;
  userDisplayName: string;
  currentBelt: string;
  currentStripes: number;
  targetType: GraduationTargetType;
  targetBelt: string;
  targetStripes: number;
  attendanceCount: number;
  attendanceTarget: number;
  remainingClasses: number;
  ruleVersion: number;
  status: GraduationRequestStatus;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  approvedAt?: FirebaseFirestore.Timestamp;
  approvedBy?: string;
  approvedByRole?: Role;
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

export interface FightVideoSubmissionDoc {
  academyId: string;
  athleteId: string;
  athleteName: string;
  title: string;
  opponentName?: string;
  occurredAt?: FirebaseFirestore.Timestamp;
  sourceKind: FightVideoSourceKind;
  sourceUrl: string;
  storagePath?: string;
  mimeType?: string;
  fileName?: string;
  status: FightVideoSubmissionStatus;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  reviewedAt?: FirebaseFirestore.Timestamp;
  reviewedBy?: string;
  reviewedByRole?: Role;
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
  videoUrl?: string;
  order: number;
  status: LearningContentStatus;
  passingScore: number;
  requiredWatchPercent: number;
  quizQuestionCount: number;
  contentBlockCount: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface LearningLessonBlockDoc {
  lessonId: string;
  trackId: string;
  courseId: string;
  type: LearningLessonBlockType;
  title: string;
  order: number;
  sourceUrl?: string;
  storagePath?: string;
  mimeType?: string;
  fileName?: string;
  thumbnailUrl?: string;
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
  lessonCompleted?: boolean;
  completedContentIds?: string[];
  contentProgressMap?: Record<string, number>;
  contentCompletionPercent?: number;
  contentCompleted?: boolean;
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
  kidsCategory?: KidsCategory;
  isCompetitor: boolean;
  requestedBelt: string;
  requestedGrade: number;
  approvedBelt?: string;
  approvedGrade?: number;
  status: JoinRequestStatus;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  resolvedAt?: FirebaseFirestore.Timestamp;
  resolvedBy?: string;
  resolvedByRole?: Role;
}

export const DEFAULT_PROGRESSION_RULES: ProgressionRules = {
  version: 2,
  schema: 'v2',
  adult: {
    belts: [
      { belt: 'white', stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
      { belt: 'blue', stripeEvery: 65, maxStripes: 4, beltPromotionOffset: 1 },
      { belt: 'purple', stripeEvery: 75, maxStripes: 4, beltPromotionOffset: 1 },
      { belt: 'brown', stripeEvery: 85, maxStripes: 4, beltPromotionOffset: 1 },
      { belt: 'black', stripeEvery: 0, maxStripes: 0 },
    ],
  },
  kids: {
    level_kids: {
      belts: [
        { belt: 'white', stripeEvery: 12, maxStripes: 4 },
        { belt: 'gray-white', stripeEvery: 12, maxStripes: 4 },
        { belt: 'gray', stripeEvery: 12, maxStripes: 4 },
        { belt: 'gray-black', stripeEvery: 12, maxStripes: 4 },
      ],
    },
    level_infanto_juvenil: {
      belts: [
        { belt: 'white', stripeEvery: 15, maxStripes: 4 },
        { belt: 'gray-white', stripeEvery: 15, maxStripes: 4 },
        { belt: 'gray', stripeEvery: 15, maxStripes: 4 },
        { belt: 'gray-black', stripeEvery: 15, maxStripes: 4 },
        { belt: 'yellow-white', stripeEvery: 20, maxStripes: 4 },
        { belt: 'yellow', stripeEvery: 20, maxStripes: 4 },
        { belt: 'yellow-black', stripeEvery: 20, maxStripes: 4 },
        { belt: 'orange-white', stripeEvery: 20, maxStripes: 4 },
        { belt: 'orange', stripeEvery: 20, maxStripes: 4 },
        { belt: 'orange-black', stripeEvery: 20, maxStripes: 4 },
      ],
    },
    level_juvenil: {
      belts: [
        { belt: 'white', stripeEvery: 20, maxStripes: 4 },
        { belt: 'gray-white', stripeEvery: 20, maxStripes: 4 },
        { belt: 'gray', stripeEvery: 20, maxStripes: 4 },
        { belt: 'gray-black', stripeEvery: 20, maxStripes: 4 },
        { belt: 'yellow-white', stripeEvery: 22, maxStripes: 4 },
        { belt: 'yellow', stripeEvery: 22, maxStripes: 4 },
        { belt: 'yellow-black', stripeEvery: 22, maxStripes: 4 },
        { belt: 'orange-white', stripeEvery: 22, maxStripes: 4 },
        { belt: 'orange', stripeEvery: 22, maxStripes: 4 },
        { belt: 'orange-black', stripeEvery: 22, maxStripes: 4 },
        { belt: 'green-white', stripeEvery: 25, maxStripes: 4 },
        { belt: 'green', stripeEvery: 25, maxStripes: 4 },
        { belt: 'green-black', stripeEvery: 25, maxStripes: 4 },
      ],
    },
  },
};

export const RANKING_WEIGHTS = {
  attendance: 10,
  currentStreak: 15,
  longestStreak: 5,
};
