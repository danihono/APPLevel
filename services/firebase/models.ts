import type { Timestamp } from 'firebase/firestore';
import type { ProgressionRules } from '../../beltCatalog';
import type { KidsCategory } from '../../types';

export type AppRole = 'student' | 'professor' | 'admin' | 'superadmin';
export type ClassStatus = 'scheduled' | 'active' | 'finished' | 'cancelled';
export type CheckInMethod = 'qr' | 'manual' | 'request';
export type MissionMetric =
  | 'attendance_count'
  | 'attendance_streak'
  | 'qr_checkins'
  | 'competition_points'
  | 'belt_promotions';
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

export interface AcademyRecord {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  status: 'active' | 'inactive' | 'suspended';
  timezone: string;
  classCheckinWindowMinutes: number;
  masterBlackLimit?: number;
  progressionRules?: ProgressionRules;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface UserRecord {
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
  role: AppRole;
  status: 'active' | 'invited' | 'suspended';
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
  lastAttendanceAt?: Timestamp;
  lastLoginAt?: Timestamp;
  fcmTokens?: string[];
  trainingStartDate?: Timestamp;
  lastGraduationDateOverride?: Timestamp;
  lastStripeDateOverride?: Timestamp;
  plainPassword?: string;
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
  recurrenceSeriesId?: string;
  status: ClassStatus;
  scheduledStart?: Timestamp;
  scheduledEnd?: Timestamp;
  startedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  capacity?: number;
  currentAttendanceCount: number;
  rsvpCount?: number;
  checkinWindowMinutes: number;
  activeQrToken?: string | null;
  activeQrExpiresAt?: Timestamp | null;
  activeQrVersion?: number | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ClassRsvpRecord {
  academyId: string;
  classId: string;
  userId: string;
  userDisplayName: string;
  scheduledStart?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AttendanceRecord {
  academyId: string;
  classId: string;
  userId: string;
  checkInMethod: CheckInMethod;
  checkedInBy: string;
  countsAsAttendance?: boolean;
  checkedInAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AttendanceRequestRecord {
  academyId: string;
  classId: string;
  classTitle: string;
  userId: string;
  userDisplayName: string;
  professorId: string;
  professorName?: string;
  status: AttendanceRequestStatus;
  requestedAt?: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  reviewedByRole?: AppRole;
  notificationDismissedAt?: Timestamp;
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
  channel: NotificationChannel;
  kind: NotificationKind;
  status: 'queued' | 'sent' | 'read' | 'stored' | 'failed';
  recipientUserId?: string;
  targetRole?: AppRole;
  targetBelt?: string;
  actionRef?: string;
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
  reason: 'automatic_progression' | 'manual_progression';
}

export interface GraduationApprovalRequestRecord {
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  approvedAt?: Timestamp;
  approvedBy?: string;
  approvedByRole?: AppRole;
  archivedAt?: Timestamp;
  archivedBy?: string;
  notificationDismissedAt?: Timestamp;
}

export interface JoinRequestRecord {
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  resolvedByRole?: AppRole;
  notificationDismissedAt?: Timestamp;
}

export interface ReactivationRequestRecord {
  academyId: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  status: ReactivationRequestStatus;
  requestedAt?: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  resolvedByRole?: AppRole;
  notificationDismissedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
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

export interface FightVideoSubmissionRecord {
  academyId: string;
  athleteId: string;
  athleteName: string;
  title: string;
  opponentName?: string;
  occurredAt?: Timestamp;
  sourceKind: FightVideoSourceKind;
  sourceUrl: string;
  storagePath?: string;
  mimeType?: string;
  fileName?: string;
  status: FightVideoSubmissionStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  reviewedByRole?: AppRole;
  notificationDismissedAt?: Timestamp;
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

export interface LearningTrackRecord {
  title: string;
  description?: string;
  order: number;
  status: LearningContentStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LearningCourseRecord {
  trackId: string;
  title: string;
  description?: string;
  order: number;
  status: LearningContentStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LearningLessonRecord {
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LearningLessonBlockRecord {
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LearningQuizQuestionRecord {
  prompt: string;
  options: string[];
  correctOptionIndex: number;
}

export interface LearningQuizRecord {
  lessonId: string;
  trackId: string;
  courseId: string;
  passingScore: number;
  questions: LearningQuizQuestionRecord[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LearningProgressRecord {
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
  unlockedAt?: Timestamp;
  passedAt?: Timestamp;
  lastAttemptAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LearningQuizAttemptRecord {
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ProductPriceHistoryEntry {
  changedAt: Timestamp;
  changedBy?: string;
  changedByName?: string;
  purchasePrice: number;
  salePriceFilial: number;
  salePriceDiretoria: number;
}

export interface FinanceProductRecord {
  name: string;
  category: string;
  description?: string;
  purchasePrice: number;
  salePriceFilial: number;
  salePriceDiretoria: number;
  stockCurrent: number;
  stockMinimum: number;
  status: FinanceStatus;
  priceHistory?: ProductPriceHistoryEntry[];
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FinanceServiceRecord {
  academyId: string;
  name: string;
  description?: string;
  cost: number;
  salePrice: number;
  status: FinanceStatus;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type FinanceBuyerType = 'filial' | 'diretoria';

export interface FinanceSaleRecord {
  academyId: string;
  buyerType?: FinanceBuyerType;
  customerId?: string;
  customerName: string;
  sellerId?: string;
  sellerName?: string;
  saleDate?: Timestamp;
  paymentMethod?: string;
  paymentStatus: FinanceSalePaymentStatus;
  paidAt?: Timestamp;
  dueDate?: Timestamp;
  subtotal: number;
  discountTotal: number;
  total: number;
  amountReceived: number;
  balanceDue: number;
  notes?: string;
  cancelledAt?: Timestamp;
  cancelledBy?: string;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FinanceSaleItemRecord {
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FinancePaymentRecord {
  academyId: string;
  saleId: string;
  amount: number;
  paymentDate?: Timestamp;
  paymentMethod: string;
  notes?: string;
  status: FinanceRevenueStatus;
  reversalOfPaymentId?: string;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FinanceRevenueRecord {
  academyId: string;
  category: string;
  description: string;
  amount: number;
  receivedAt?: Timestamp;
  paymentMethod?: string;
  origin: FinanceRevenueOrigin;
  status: FinanceRevenueStatus;
  saleId?: string;
  paymentId?: string;
  reversalOfRevenueId?: string;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FinanceExpenseRecord {
  academyId: string;
  category: string;
  description: string;
  amount: number;
  dueDate?: Timestamp;
  paidAt?: Timestamp;
  status: FinanceExpenseStatus;
  supplier?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface InventoryMovementRecord {
  academyId: string;
  productId: string;
  productName: string;
  type: InventoryMovementType;
  quantityDelta: number;
  stockBefore: number;
  stockAfter: number;
  saleId?: string;
  reason?: string;
  createdBy?: string;
  createdAt?: Timestamp;
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
  cpf?: string;
  phone?: string;
  birthDate?: string;
  isCompetitor?: boolean;
  belt?: string;
  grade?: number;
  stripes?: number;
  plainPassword?: string;
}
