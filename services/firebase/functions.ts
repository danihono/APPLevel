import { httpsCallable, httpsCallableFromURL } from 'firebase/functions';
import type {
  AppRole,
  AttendanceRequestStatus,
  CreateAcademyPayload,
  CreateUserPayload,
  FightVideoSourceKind,
  FightVideoSubmissionStatus,
  FinanceExpenseStatus,
  FinanceSaleItemType,
  FinanceSalePaymentStatus,
  FinanceStatus,
  JoinRequestStatus,
  LearningContentStatus,
  LearningLessonBlockType,
  NotificationChannel,
  ReactivationRequestStatus,
} from './models';
import type { ProgressionRuleSegment } from '../../beltCatalog';
import { firebaseFunctions } from './client';

type SignupAcademyRecord = {
  academyId: string;
  name: string;
  timezone: string;
};

export interface CreateClassScheduleOccurrencePayload {
  scheduledStart: string;
  scheduledEnd: string;
}

export interface ClassScheduleMutationSkippedItem {
  classId: string;
  scheduledStart: string;
  reason: string;
}

export interface CreateClassScheduleBatchResult {
  requestedCount: number;
  createdCount: number;
  skippedCount: number;
  skipped: Array<{
    scheduledStart: string;
    reason: string;
  }>;
}

export interface UpdateRecurringClassSeriesResult {
  requestedCount: number;
  updatedCount: number;
  skippedCount: number;
  skipped: ClassScheduleMutationSkippedItem[];
}

export interface DeleteClassScheduleResult {
  requestedCount: number;
  deletedCount: number;
  skippedCount: number;
  skipped: ClassScheduleMutationSkippedItem[];
}

export interface FinanceSaleItemPayload {
  type: FinanceSaleItemType;
  itemId: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
  beneficiaryName?: string;
  beneficiaryUserId?: string;
}

export interface FinanceSalePayload {
  saleId?: string;
  academyId: string;
  saleType?: 'product' | 'service';
  buyerType?: 'filial' | 'diretoria' | 'individuo';
  buyerAcademyId?: string;
  customerId?: string;
  customerName: string;
  sellerId?: string;
  sellerName?: string;
  saleDate?: string;
  dueDate?: string;
  notes?: string;
  items: FinanceSaleItemPayload[];
}

const useFirebaseEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const hostedCallableProxyOrigin =
  import.meta.env.VITE_CALLABLE_PROXY_ORIGIN ||
  (import.meta.env.VITE_FIREBASE_PROJECT_ID ? `https://${import.meta.env.VITE_FIREBASE_PROJECT_ID}.web.app` : '');

function resolveCallableUrl(functionName: string): string | null {
  if (useFirebaseEmulators || typeof window === 'undefined') {
    return null;
  }

  const proxyBase =
    import.meta.env.DEV && hostedCallableProxyOrigin
      ? hostedCallableProxyOrigin
      : window.location.origin;

  const proxyUrl = new URL('/api/callable', proxyBase);
  proxyUrl.searchParams.set('fn', functionName);
  return proxyUrl.toString();
}

async function callFunction<TResponse, TPayload = unknown>(
  functionName: string,
  payload: TPayload,
): Promise<TResponse> {
  const callableUrl = resolveCallableUrl(functionName);
  const callable = callableUrl
    ? httpsCallableFromURL<TPayload, TResponse>(firebaseFunctions, callableUrl)
    : httpsCallable<TPayload, TResponse>(firebaseFunctions, functionName);
  const response = await callable(payload);
  return response.data;
}

export function isRetryableSignupAcademyFetchError(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

  return code === 'functions/unavailable' || code === 'functions/deadline-exceeded';
}

export const backendFunctions = {
  listSignupAcademies: () =>
    callFunction<SignupAcademyRecord[]>('listSignupAcademies', {}),

  submitStudentSignup: (payload: {
    academyIds: string[];
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    cpf: string;
    birthDate: string;
    phone?: string;
    isCompetitor?: boolean;
    belt: string;
    grade: number;
  }) => callFunction<{
    authUid: string;
    requestGroupId: string | null;
    requests: Array<{ requestId: string; academyId: string; status: JoinRequestStatus }>;
  }>('submitStudentSignup', payload),

  createAcademy: (payload: CreateAcademyPayload) =>
    callFunction<{ academyId: string; name: string; slug: string }>('createAcademy', payload),

  createUserWithRole: (payload: CreateUserPayload) =>
    callFunction<{ uid: string; academyId: string; role: AppRole }>('createUserWithRole', payload),

  assignUserToAcademy: (payload: { userId: string; academyId: string }) =>
    callFunction<{ userId: string; academyId: string }>('assignUserToAcademy', payload),

  setUserRole: (payload: { userId: string; role: AppRole }) =>
    callFunction<{ userId: string; role: AppRole }>('setUserRole', payload),

  updateStudentBeltGrade: (payload: { userId: string; belt: string; grade: number; stripes?: number; kidsCategory?: string; gradeProgress?: number }) =>
    callFunction<{ userId: string; belt: string; grade: number; stripes: number; kidsCategory?: string | null }>('updateStudentBeltGrade', payload),

  setStudentAttendanceBonus: (payload: { userId: string; attendanceCountBonus: number }) =>
    callFunction<{ userId: string; attendanceCountBonus: number }>('setStudentAttendanceBonus', payload),

  updateOwnStaffBeltGrade: (payload: { belt: string; grade: number; stripes?: number; attendanceCountBonus?: number }) =>
    callFunction<{ userId: string; belt: string; grade: number; stripes: number; attendanceCountBonus: number }>('updateOwnStaffBeltGrade', payload),

  adminUpdateStudentProfile: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    cpf?: string;
    birthDate?: string;
    email?: string;
    isCompetitor?: boolean;
  }) => callFunction<{ userId: string; displayName: string }>('adminUpdateStudentProfile', payload),

  adminUpdateStudentTimeline: (payload: {
    userId: string;
    trainingStartDate?: string;
    lastGraduationDateOverride?: string;
    lastStripeDateOverride?: string;
  }) => callFunction<{ userId: string }>('adminUpdateStudentTimeline', payload),

  adminSetUserMemberships: (payload: { userId: string; memberships: string[] }) =>
    callFunction<{ userId: string; memberships: string[]; academyId: string }>('adminSetUserMemberships', payload),

  adminUpdateInstructorProfile: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    newPassword?: string;
    plainPassword?: string;
    phone?: string;
    belt?: string;
    grade?: number;
    lastGraduationDateOverride?: string;
  }) => callFunction<{ userId: string; displayName: string }>('adminUpdateInstructorProfile', payload),

  approveGraduationRequest: (payload: { requestId: string }) =>
    callFunction<{ requestId: string; userId: string; status: string }>('approveGraduationRequest', payload),

  validateSessionAccess: () =>
    callFunction<{
      uid: string;
      academyId: string;
      role: AppRole;
      displayName: string;
      belt: string;
      stripes: number;
      claimsUpdated: boolean;
    }>('validateSessionAccess', {}),

  upsertClassSchedule: (payload: {
    classId?: string;
    academyId?: string;
    title: string;
    tatame: string;
    description?: string;
    professorId?: string;
    professorName?: string;
    scheduledStart: string;
    scheduledEnd: string;
    capacity?: number;
    checkinWindowMinutes?: number;
  }) => callFunction<{ classId: string; academyId: string; status: string }>('upsertClassSchedule', payload),

  createClassScheduleBatch: (payload: {
    academyId?: string;
    title: string;
    tatame: string;
    description?: string;
    professorId?: string;
    professorName?: string;
    capacity?: number;
    checkinWindowMinutes?: number;
    seriesMode?: 'manual' | 'recurring';
    occurrences: CreateClassScheduleOccurrencePayload[];
  }) => callFunction<CreateClassScheduleBatchResult>('createClassScheduleBatch', payload),

  updateRecurringClassSeries: (payload: {
    classId: string;
    title: string;
    tatame: string;
    description?: string;
    professorId?: string;
    professorName?: string;
    scheduledStart: string;
    scheduledEnd: string;
    scope: 'future';
  }) => callFunction<UpdateRecurringClassSeriesResult>('updateRecurringClassSeries', payload),

  deleteClassSchedule: (payload: {
    classId: string;
    scope: 'single' | 'future';
  }) => callFunction<DeleteClassScheduleResult>('deleteClassSchedule', payload),

  startClassSession: (payload: { classId: string; qrDurationMinutes?: number }) =>
    callFunction<{
      classId: string;
      academyId: string;
      expiresAt: string;
      qrValue: string;
      qrToken: string;
    }>('startClassSession', payload),

  finishClassSession: (payload: { classId: string }) =>
    callFunction<{ classId: string; status: string }>('finishClassSession', payload),

  generateClassQrCode: (payload: { classId: string; qrDurationMinutes?: number }) =>
    callFunction<{
      classId: string;
      academyId: string;
      expiresAt: string;
      qrValue: string;
      qrToken: string;
    }>('generateClassQrCode', payload),

  registerAttendance: (payload: {
    classId: string;
    qrToken?: string;
    sourceDevice?: string;
    targetUserId?: string;
  }) => callFunction<{ attendanceId: string; classId: string; userId: string; method: string }>('registerAttendance', payload),

  removeAttendance: (payload: { classId: string; targetUserId: string }) =>
    callFunction<{ classId: string; userId: string }>('removeAttendance', payload),

  submitAttendanceRequest: (payload: { classId: string }) =>
    callFunction<{ requestId: string; classId: string; status: AttendanceRequestStatus }>('submitAttendanceRequest', payload),

  approveAttendanceRequest: (payload: { requestId: string }) =>
    callFunction<{ requestId: string; attendanceId: string; status: AttendanceRequestStatus }>('approveAttendanceRequest', payload),

  rejectAttendanceRequest: (payload: { requestId: string }) =>
    callFunction<{ requestId: string; status: AttendanceRequestStatus }>('rejectAttendanceRequest', payload),

  approveJoinRequest: (payload: { requestId: string; belt?: string; grade?: number }) =>
    callFunction<{ requestId: string; userId: string; status: JoinRequestStatus }>('approveJoinRequest', payload),

  rejectJoinRequest: (payload: { requestId: string }) =>
    callFunction<{ requestId: string; status: JoinRequestStatus }>('rejectJoinRequest', payload),

  updateJoinRequest: (payload: {
    requestId: string;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    cpf?: string;
    birthDate?: string;
    isCompetitor?: boolean;
    requestedBelt?: string;
    requestedGrade?: number;
  }) => callFunction<{
    requestId: string;
    displayName: string;
    cpf: string;
    requestedBelt: string;
    requestedGrade: number;
  }>('updateJoinRequest', payload),

  transferJoinRequest: (payload: { requestId: string; targetAcademyId: string }) =>
    callFunction<{ requestId: string; academyId: string; academyName: string }>('transferJoinRequest', payload),

  requestAdditionalAcademy: (payload: { academyId: string }) =>
    callFunction<{ requestId: string; academyId: string; status: JoinRequestStatus }>('requestAdditionalAcademy', payload),

  switchActiveAcademy: (payload: { academyId: string }) =>
    callFunction<{ userId: string; academyId: string; role: AppRole }>('switchActiveAcademy', payload),

  updateOwnStudentProfile: (payload: {
    firstName?: string;
    lastName?: string;
    cpf?: string;
    phone?: string;
    birthDate?: string;
    isCompetitor?: boolean;
    photoPath?: string;
  }) => callFunction<{
    userId: string;
    displayName: string;
    cpf: string;
    isCompetitor: boolean;
  }>('updateOwnStudentProfile', payload),

  syncOwnUserEmail: (payload: { email: string }) =>
    callFunction<{ userId: string; email: string }>('syncOwnUserEmail', payload),

  deleteMyAccount: () =>
    callFunction<{ userId: string; status: 'deleted' }>('deleteMyAccount', {}),

  submitFightVideoSubmission: (payload: {
    title: string;
    opponentName?: string;
    occurredAt?: string;
    sourceKind: FightVideoSourceKind;
    sourceUrl: string;
    storagePath?: string;
    mimeType?: string;
    fileName?: string;
  }) => callFunction<{ requestId: string; status: FightVideoSubmissionStatus }>('submitFightVideoSubmission', payload),

  approveFightVideoSubmission: (payload: { requestId: string }) =>
    callFunction<{ requestId: string; status: FightVideoSubmissionStatus }>('approveFightVideoSubmission', payload),

  rejectFightVideoSubmission: (payload: { requestId: string }) =>
    callFunction<{ requestId: string; status: FightVideoSubmissionStatus }>('rejectFightVideoSubmission', payload),

  upsertAcademyProgressionRules: (payload: {
    academyId?: string;
    adult: ProgressionRuleSegment;
    kids: {
      level_infantil: ProgressionRuleSegment;
    };
  }) => callFunction<{ academyId: string; rules: unknown; totalProcessed: number }>('upsertAcademyProgressionRules', payload),

  repairAcademyProgressionRules: (payload: { academyId?: string }) =>
    callFunction<{
      totalAcademies: number;
      results: Array<{ academyId: string; rulesUpdated: boolean; totalProcessed: number }>;
    }>('repairAcademyProgressionRules', payload),

  evaluateUserProgression: (payload: { userId?: string }) =>
    callFunction('evaluateUserProgression', payload),

  rebuildUserDerivedState: (payload: { userId?: string }) =>
    callFunction('rebuildUserDerivedState', payload),

  repairPendingGraduationNotifications: (payload: { academyId?: string }) =>
    callFunction<{
      academyId: string | null;
      scanned: number;
      syncedUsers: number;
      created: number;
      skippedExisting: number;
      skippedDismissed: number;
    }>('repairPendingGraduationNotifications', payload),

  registerDeviceToken: (payload: { token: string }) =>
    callFunction<{ registered: boolean }>('registerDeviceToken', payload),

  sendSegmentedNotification: (payload: {
    title: string;
    body: string;
    academyId?: string;
    channel?: NotificationChannel;
    targetRole?: AppRole;
    targetBelt?: string;
    recipientUserIds?: string[];
    data?: Record<string, string>;
  }) => callFunction<{
    academyId: string;
    recipients: number;
    tokens: number;
    sent: number;
    failed: number;
  }>('sendSegmentedNotification', payload),

  markNotificationRead: (payload: { notificationId: string }) =>
    callFunction<{ notificationId: string; status: string }>('markNotificationRead', payload),

  clearNotifications: (payload: { academyId?: string; skipUnread?: boolean; notificationIds?: string[] }) =>
    callFunction<{ deleted: number }>('clearNotifications', payload),

  clearGraduationRequests: (payload: { academyId?: string }) =>
    callFunction<{ deleted: number }>('clearGraduationRequests', payload),

  upsertLearningTrack: (payload: {
    trackId?: string;
    title: string;
    description?: string;
    order: number;
    status: LearningContentStatus;
  }) => callFunction<{ trackId: string; status: LearningContentStatus }>('upsertLearningTrack', payload),

  upsertLearningCourse: (payload: {
    courseId?: string;
    trackId: string;
    title: string;
    description?: string;
    order: number;
    status: LearningContentStatus;
  }) => callFunction<{ courseId: string; trackId: string; status: LearningContentStatus }>('upsertLearningCourse', payload),

  upsertLearningLesson: (payload: {
    lessonId?: string;
    trackId: string;
    courseId: string;
    title: string;
    description?: string;
    videoUrl?: string;
    order: number;
    status: LearningContentStatus;
    passingScore: number;
    contentBlockCount: number;
  }) => callFunction<{
    lessonId: string;
    courseId: string;
    trackId: string;
    status: LearningContentStatus;
  }>('upsertLearningLesson', payload),

  replaceLearningLessonBlocks: (payload: {
    lessonId: string;
    blocks: Array<{
      blockId?: string;
      type: LearningLessonBlockType;
      title: string;
      order: number;
      sourceUrl?: string;
      storagePath?: string;
      mimeType?: string;
      fileName?: string;
      thumbnailUrl?: string;
    }>;
  }) => callFunction<{ lessonId: string; blockCount: number }>('replaceLearningLessonBlocks', payload),

  upsertLessonQuiz: (payload: {
    lessonId: string;
    questions: Array<{
      prompt: string;
      options: string[];
      correctOptionIndex: number;
    }>;
  }) => callFunction<{ lessonId: string; questionCount: number }>('upsertLessonQuiz', payload),

  recordLessonPlayback: (payload: {
    lessonId: string;
    currentSeconds: number;
    durationSeconds: number;
  }) => callFunction<{ lessonId: string; watchPercent: number; quizReady: boolean }>('recordLessonPlayback', payload),

  recordLearningBlockPlayback: (payload: {
    lessonId: string;
    blockId: string;
    currentSeconds: number;
    durationSeconds: number;
  }) => callFunction<{
    lessonId: string;
    blockId: string;
    watchPercent: number;
    contentCompletionPercent: number;
    contentCompleted: boolean;
    quizReady: boolean;
  }>('recordLearningBlockPlayback', payload),

  markLearningBlockComplete: (payload: {
    lessonId: string;
    blockId: string;
  }) => callFunction<{
    lessonId: string;
    blockId: string;
    contentCompletionPercent: number;
    contentCompleted: boolean;
    lessonCompleted: boolean;
    quizReady: boolean;
  }>('markLearningBlockComplete', payload),

  startLessonQuiz: (payload: { lessonId: string }) =>
    callFunction<{
      questions: Array<{
        id: string;
        prompt: string;
        options: string[];
      }>;
      passingScore: number;
      attemptCount: number;
    }>('startLessonQuiz', payload),

  submitLessonQuiz: (payload: {
    lessonId: string;
    answers: number[];
  }) => callFunction<{
    scorePercent: number;
    passed: boolean;
    unlockedLessonId?: string;
  }>('submitLessonQuiz', payload),

  toggleClassRsvp: (payload: { classId: string }) =>
    callFunction<{ rsvped: boolean; rsvpCount: number }>('toggleClassRsvp', payload),

  deactivateStudent: (payload: { userId: string }) =>
    callFunction<{ userId: string; status: 'suspended' }>('deactivateStudent', payload),

  requestReactivation: () =>
    callFunction<{ requestId: string; status: ReactivationRequestStatus }>('requestReactivation', {}),

  resolveReactivationRequest: (payload: { requestId: string; approve: boolean }) =>
    callFunction<{ requestId: string; status: ReactivationRequestStatus }>('resolveReactivationRequest', payload),

  reactivateStudent: (payload: { userId: string }) =>
    callFunction<{ userId: string; status: 'active' }>('reactivateStudent', payload),

  upsertFinanceProduct: (payload: {
    productId?: string;
    name: string;
    category: string;
    description?: string;
    purchasePrice: number;
    salePrice: number;
    stockCurrent?: number;
    stockMinimum: number;
    status?: FinanceStatus;
  }) => callFunction<{ productId: string; status: FinanceStatus }>('upsertFinanceProduct', payload),

  deleteOrArchiveFinanceProduct: (payload: { productId: string }) =>
    callFunction<{ productId: string; status: FinanceStatus; archived: boolean }>('deleteOrArchiveFinanceProduct', payload),

  adjustProductStock: (payload: { productId: string; quantityDelta: number; reason?: string }) =>
    callFunction<{ productId: string; stockCurrent: number }>('adjustProductStock', payload),

  upsertFinanceService: (payload: {
    serviceId?: string;
    academyId: string;
    name: string;
    category?: string;
    description?: string;
    cost: number;
    salePrice: number;
    status?: FinanceStatus;
  }) => callFunction<{ serviceId: string; status: FinanceStatus }>('upsertFinanceService', payload),

  deleteOrArchiveFinanceService: (payload: { serviceId: string }) =>
    callFunction<{ serviceId: string; status: FinanceStatus; archived: boolean }>('deleteOrArchiveFinanceService', payload),

  createFinanceSale: (payload: FinanceSalePayload & {
    paymentMethod?: string;
    receivedAmount?: number;
    paymentDate?: string;
  }) => callFunction<{ saleId: string; paymentStatus: FinanceSalePaymentStatus; balanceDue: number }>('createFinanceSale', payload),

  updateFinanceSale: (payload: FinanceSalePayload) =>
    callFunction<{ saleId: string; paymentStatus: FinanceSalePaymentStatus; balanceDue: number }>('updateFinanceSale', payload),

  recordSalePayment: (payload: {
    saleId: string;
    amount: number;
    paymentMethod: string;
    paymentDate?: string;
    notes?: string;
  }) => callFunction<{ saleId: string; paymentId: string; paymentStatus: FinanceSalePaymentStatus; balanceDue: number }>('recordSalePayment', payload),

  cancelFinanceSale: (payload: { saleId: string; reason?: string }) =>
    callFunction<{ saleId: string; paymentStatus: 'cancelled' }>('cancelFinanceSale', payload),

  upsertManualRevenue: (payload: {
    revenueId?: string;
    academyId: string;
    category: string;
    description: string;
    amount: number;
    receivedAt?: string;
    paymentMethod?: string;
    status?: 'received' | 'reversed';
  }) => callFunction<{ revenueId: string }>('upsertManualRevenue', payload),

  upsertExpense: (payload: {
    expenseId?: string;
    academyId: string;
    category: string;
    description: string;
    amount: number;
    dueDate?: string;
    paidAt?: string;
    status?: FinanceExpenseStatus;
    supplier?: string;
    notes?: string;
  }) => callFunction<{ expenseId: string; status: FinanceExpenseStatus }>('upsertExpense', payload),

  markExpensePaid: (payload: { expenseId: string; paidAt?: string }) =>
    callFunction<{ expenseId: string; status: 'paid' }>('markExpensePaid', payload),
};
