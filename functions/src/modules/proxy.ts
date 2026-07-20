import { onRequest } from 'firebase-functions/v2/https';

const CALLABLE_PROXY_REGION = 'southamerica-east1';
const callableProxyOptions = {
  region: CALLABLE_PROXY_REGION,
  cors: true,
  invoker: 'public' as const,
};

const ALLOWED_CALLABLES = new Set([
  'listSignupAcademies',
  'submitStudentSignup',
  'createAcademy',
  'createUserWithRole',
  'assignUserToAcademy',
  'switchActiveAcademy',
  'requestAdditionalAcademy',
  'setUserRole',
  'updateStudentBeltGrade',
  'validateSessionAccess',
  'upsertClassSchedule',
  'createClassScheduleBatch',
  'updateRecurringClassSeries',
  'deleteClassSchedule',
  'startClassSession',
  'finishClassSession',
  'generateClassQrCode',
  'registerAttendance',
  'removeAttendance',
  'submitAttendanceRequest',
  'approveAttendanceRequest',
  'rejectAttendanceRequest',
  'approveJoinRequest',
  'approveFightVideoSubmission',
  'approveGraduationRequest',
  'rejectJoinRequest',
  'updateJoinRequest',
  'transferJoinRequest',
  'rejectFightVideoSubmission',
  'updateOwnStudentProfile',
  'syncOwnUserEmail',
  'submitFightVideoSubmission',
  'upsertAcademyProgressionRules',
  'repairAcademyProgressionRules',
  'evaluateUserProgression',
  'rebuildUserDerivedState',
  'repairPendingGraduationNotifications',
  'recalculateUserRanking',
  'recalculateAcademyRankings',
  'upsertMission',
  'syncUserMissionProgress',
  'registerDeviceToken',
  'sendSegmentedNotification',
  'markNotificationRead',
  'clearNotifications',
  'clearGraduationRequests',
  'upsertLearningTrack',
  'upsertLearningCourse',
  'upsertLearningLesson',
  'upsertLessonQuiz',
  'recordLessonPlayback',
  'recordLearningBlockPlayback',
  'replaceLearningLessonBlocks',
  'markLearningBlockComplete',
  'startLessonQuiz',
  'submitLessonQuiz',
  'setStudentAttendanceBonus',
  'updateOwnStaffBeltGrade',
  'adminUpdateStudentProfile',
  'adminUpdateStudentTimeline',
  'adminUpdateInstructorProfile',
  'adminSetUserMemberships',
  'toggleClassRsvp',
  'upsertFinanceProduct',
  'deleteOrArchiveFinanceProduct',
  'adjustProductStock',
  'upsertFinanceService',
  'deleteOrArchiveFinanceService',
  'createFinanceSale',
  'updateFinanceSale',
  'recordSalePayment',
  'cancelFinanceSale',
  'createStockWithdrawal',
  'settleStockWithdrawal',
  'cancelStockWithdrawal',
  'upsertManualRevenue',
  'upsertExpense',
  'markExpensePaid',
  'deactivateStudent',
  'reactivateStudent',
  'requestReactivation',
  'resolveReactivationRequest',
]);

const FORWARDED_HEADERS = [
  'authorization',
  'content-type',
  'firebase-instance-id-token',
  'x-client-version',
  'x-firebase-appcheck',
  'x-firebase-gmpid',
] as const;

function resolveCallableName(rawValue: unknown): string {
  if (typeof rawValue === 'string') {
    return rawValue.trim();
  }

  if (Array.isArray(rawValue) && typeof rawValue[0] === 'string') {
    return rawValue[0].trim();
  }

  return '';
}

export const callableProxy = onRequest(callableProxyOptions, async (request, response) => {
  if (request.method !== 'POST') {
    response.set('Allow', 'POST');
    response.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const functionName = resolveCallableName(request.query.fn);
  if (!ALLOWED_CALLABLES.has(functionName)) {
    response.status(404).json({ error: 'Callable nao encontrada.' });
    return;
  }

  const projectId = process.env.GCLOUD_PROJECT;
  if (!projectId) {
    response.status(500).json({ error: 'Projeto Firebase indisponivel.' });
    return;
  }

  const targetUrl = `https://${CALLABLE_PROXY_REGION}-${projectId}.cloudfunctions.net/${functionName}`;
  const headers = new Headers();

  for (const headerName of FORWARDED_HEADERS) {
    const headerValue = request.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  const body = request.rawBody?.length
    ? request.rawBody
    : Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body,
    });

    response.status(upstreamResponse.status);

    const upstreamContentType = upstreamResponse.headers.get('content-type');
    if (upstreamContentType) {
      response.set('Content-Type', upstreamContentType);
    }

    response.send(await upstreamResponse.text());
  } catch {
    response.status(502).json({
      error: {
        status: 'unavailable',
        message: 'Nao foi possivel encaminhar a requisicao para a callable.',
      },
    });
  }
});
