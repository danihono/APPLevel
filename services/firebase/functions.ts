import { httpsCallable, httpsCallableFromURL } from 'firebase/functions';
import type {
  AppRole,
  AttendanceRequestStatus,
  CreateAcademyPayload,
  CreateUserPayload,
  FightVideoSourceKind,
  FightVideoSubmissionStatus,
  JoinRequestStatus,
  LearningContentStatus,
  LearningLessonBlockType,
  NotificationChannel,
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
    academyId: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    cpf: string;
    birthDate: string;
    isCompetitor?: boolean;
    belt: string;
    grade: number;
  }) => callFunction<{ requestId: string; academyId: string; status: JoinRequestStatus }>('submitStudentSignup', payload),

  createAcademy: (payload: CreateAcademyPayload) =>
    callFunction<{ academyId: string; name: string; slug: string }>('createAcademy', payload),

  createUserWithRole: (payload: CreateUserPayload) =>
    callFunction<{ uid: string; academyId: string; role: AppRole }>('createUserWithRole', payload),

  assignUserToAcademy: (payload: { userId: string; academyId: string }) =>
    callFunction<{ userId: string; academyId: string }>('assignUserToAcademy', payload),

  setUserRole: (payload: { userId: string; role: AppRole }) =>
    callFunction<{ userId: string; role: AppRole }>('setUserRole', payload),

  updateStudentBeltGrade: (payload: { userId: string; belt: string; grade: number; stripes?: number; kidsCategory?: string }) =>
    callFunction<{ userId: string; belt: string; grade: number; stripes: number; kidsCategory?: string | null }>('updateStudentBeltGrade', payload),

  setStudentAttendanceBonus: (payload: { userId: string; attendanceCountBonus: number }) =>
    callFunction<{ userId: string; attendanceCountBonus: number }>('setStudentAttendanceBonus', payload),

  adminUpdateStudentProfile: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    cpf?: string;
    birthDate?: string;
    isCompetitor?: boolean;
  }) => callFunction<{ userId: string; displayName: string }>('adminUpdateStudentProfile', payload),

  adminUpdateStudentTimeline: (payload: {
    userId: string;
    trainingStartDate?: string;
    lastGraduationDateOverride?: string;
    lastStripeDateOverride?: string;
  }) => callFunction<{ userId: string }>('adminUpdateStudentTimeline', payload),

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

  evaluateUserProgression: (payload: { userId?: string }) =>
    callFunction('evaluateUserProgression', payload),

  rebuildUserDerivedState: (payload: { userId?: string }) =>
    callFunction('rebuildUserDerivedState', payload),

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
};
