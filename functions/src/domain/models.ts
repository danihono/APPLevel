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
  reactivationRequests: 'reactivation_requests',
  learningCourses: 'learning_courses',
  learningLessonBlocks: 'learning_lesson_blocks',
  learningLessons: 'learning_lessons',
  learningProgress: 'learning_progress',
  learningQuizAttempts: 'learning_quiz_attempts',
  learningQuizzes: 'learning_quizzes',
  learningTracks: 'learning_tracks',
  financeProducts: 'finance_products',
  financeServices: 'finance_services',
  financeSales: 'finance_sales',
  financeSaleItems: 'finance_sale_items',
  financePayments: 'finance_payments',
  financeRevenues: 'finance_revenues',
  financeExpenses: 'finance_expenses',
  inventoryMovements: 'inventory_movements',
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
export type NotificationKind = 'notice' | 'join_request' | 'attendance_request' | 'graduation' | 'fight_video_submission' | 'reactivation_request';
export type ReactivationRequestStatus = 'pending' | 'approved' | 'rejected';
export type GraduationRequestStatus = 'pending' | 'approved' | 'superseded' | 'archived';
export type GraduationTargetType = 'stripe' | 'belt';
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';
export type AttendanceRequestStatus = 'pending' | 'approved' | 'rejected';
export type FightVideoSourceKind = 'youtube' | 'external' | 'upload';
export type FightVideoSubmissionStatus = 'pending' | 'approved' | 'rejected';
export type LearningContentStatus = 'draft' | 'published';
export type LearningLessonBlockType = 'youtube' | 'uploaded_video' | 'pdf' | 'image';
export type KidsCategory = 'level_infantil';
export type FinanceStatus = 'active' | 'inactive';
export type FinanceSalePaymentStatus = 'paid' | 'partial' | 'pending' | 'cancelled';
export type FinanceSaleItemType = 'product' | 'service';
export type FinanceRevenueOrigin = 'sale' | 'product' | 'service' | 'manual' | 'estorno';
export type FinanceRevenueStatus = 'received' | 'reversed';
export type FinanceExpenseStatus = 'paid' | 'pending' | 'overdue';
export type InventoryMovementType =
  | 'manual_entry'
  | 'manual_adjustment'
  | 'sale_decrement'
  | 'sale_cancel_reversal'
  | 'sale_edit_adjustment';

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
  attendanceCountAtBeltStart?: number;
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
  trainingStartDate?: FirebaseFirestore.Timestamp;
  lastGraduationDateOverride?: FirebaseFirestore.Timestamp;
  lastStripeDateOverride?: FirebaseFirestore.Timestamp;
  plainPassword?: string;
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
  activeQrToken?: string;
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
  countsAsAttendance?: boolean;
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
  archivedAt?: FirebaseFirestore.Timestamp;
  archivedBy?: string;
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

export interface FinanceProductDoc {
  academyId: string;
  name: string;
  category: string;
  description?: string;
  purchasePrice: number;
  salePrice: number;
  stockCurrent: number;
  stockMinimum: number;
  status: FinanceStatus;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface FinanceServiceDoc {
  academyId: string;
  name: string;
  description?: string;
  cost: number;
  salePrice: number;
  status: FinanceStatus;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface FinanceSaleDoc {
  academyId: string;
  customerId?: string;
  customerName: string;
  sellerId?: string;
  sellerName?: string;
  saleDate: FirebaseFirestore.Timestamp;
  paymentMethod?: string;
  paymentStatus: FinanceSalePaymentStatus;
  paidAt?: FirebaseFirestore.Timestamp;
  dueDate?: FirebaseFirestore.Timestamp;
  subtotal: number;
  discountTotal: number;
  total: number;
  amountReceived: number;
  balanceDue: number;
  notes?: string;
  cancelledAt?: FirebaseFirestore.Timestamp;
  cancelledBy?: string;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface FinanceSaleItemDoc {
  academyId: string;
  saleId: string;
  type: FinanceSaleItemType;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount: number;
  finalUnitPrice: number;
  total: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface FinancePaymentDoc {
  academyId: string;
  saleId: string;
  amount: number;
  paymentDate: FirebaseFirestore.Timestamp;
  paymentMethod: string;
  notes?: string;
  status: FinanceRevenueStatus;
  reversalOfPaymentId?: string;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface FinanceRevenueDoc {
  academyId: string;
  category: string;
  description: string;
  amount: number;
  receivedAt: FirebaseFirestore.Timestamp;
  paymentMethod?: string;
  origin: FinanceRevenueOrigin;
  status: FinanceRevenueStatus;
  saleId?: string;
  paymentId?: string;
  reversalOfRevenueId?: string;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface FinanceExpenseDoc {
  academyId: string;
  category: string;
  description: string;
  amount: number;
  dueDate: FirebaseFirestore.Timestamp;
  paidAt?: FirebaseFirestore.Timestamp;
  status: FinanceExpenseStatus;
  supplier?: string;
  notes?: string;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface InventoryMovementDoc {
  academyId: string;
  productId: string;
  productName: string;
  type: InventoryMovementType;
  quantityDelta: number;
  stockBefore: number;
  stockAfter: number;
  saleId?: string;
  reason?: string;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
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

export interface ReactivationRequestDoc {
  academyId: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  status: ReactivationRequestStatus;
  requestedAt: FirebaseFirestore.Timestamp;
  resolvedAt?: FirebaseFirestore.Timestamp;
  resolvedBy?: string;
  resolvedByRole?: Role;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
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
    level_infantil: {
      belts: [
        { belt: 'white', stripeEvery: 15, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'gray-white', stripeEvery: 15, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'gray', stripeEvery: 15, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'gray-black', stripeEvery: 15, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'yellow-white', stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'yellow', stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'yellow-black', stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'orange-white', stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'orange', stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'orange-black', stripeEvery: 30, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'green-white', stripeEvery: 25, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'green', stripeEvery: 25, maxStripes: 4, beltPromotionOffset: 1 },
        { belt: 'green-black', stripeEvery: 25, maxStripes: 4, beltPromotionOffset: 1 },
      ],
    },
  },
};

export const RANKING_WEIGHTS = {
  attendance: 10,
  currentStreak: 15,
  longestStreak: 5,
};
