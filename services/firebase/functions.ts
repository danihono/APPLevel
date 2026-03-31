import { httpsCallable } from 'firebase/functions';
import type {
  AppRole,
  AttendanceRequestStatus,
  CreateAcademyPayload,
  CreateUserPayload,
  JoinRequestStatus,
  MissionMetric,
  NotificationChannel,
} from './models';
import { firebaseFunctions } from './client';

async function callFunction<TResponse, TPayload = unknown>(
  functionName: string,
  payload: TPayload,
): Promise<TResponse> {
  const callable = httpsCallable<TPayload, TResponse>(firebaseFunctions, functionName);
  const response = await callable(payload);
  return response.data;
}

export const backendFunctions = {
  listSignupAcademies: () =>
    callFunction<Array<{ academyId: string; name: string; timezone: string }>>('listSignupAcademies', {}),

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

  updateStudentBeltGrade: (payload: { userId: string; belt: string; grade: number; stripes?: number }) =>
    callFunction<{ userId: string; belt: string; grade: number; stripes: number }>('updateStudentBeltGrade', payload),

  validateSessionAccess: () =>
    callFunction<{
      uid: string;
      academyId: string;
      role: AppRole;
      displayName: string;
      belt: string;
      stripes: number;
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

  approveJoinRequest: (payload: { requestId: string }) =>
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

  upsertAcademyProgressionRules: (payload: {
    academyId?: string;
    milestones: Array<{
      belt: string;
      minAttendances: number;
      stripeEvery: number;
      maxStripes: number;
    }>;
  }) => callFunction<{ academyId: string; rules: unknown }>('upsertAcademyProgressionRules', payload),

  evaluateUserProgression: (payload: { userId?: string }) =>
    callFunction('evaluateUserProgression', payload),

  rebuildUserDerivedState: (payload: { userId?: string }) =>
    callFunction('rebuildUserDerivedState', payload),

  recalculateUserRanking: (payload: { userId?: string }) =>
    callFunction('recalculateUserRanking', payload),

  recalculateAcademyRankings: (payload: { academyId?: string }) =>
    callFunction<{ academyId: string; totalProcessed: number }>('recalculateAcademyRankings', payload),

  upsertMission: (payload: {
    missionId?: string;
    academyId?: string;
    name: string;
    description?: string;
    metric: MissionMetric;
    targetValue: number;
    rewardPoints: number;
    active?: boolean;
    targetRole?: AppRole;
  }) => callFunction<{ missionId: string; academyId: string }>('upsertMission', payload),

  syncUserMissionProgress: (payload: { userId?: string }) =>
    callFunction('syncUserMissionProgress', payload),

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
};
