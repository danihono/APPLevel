const path = require('node:path');
const fs = require('node:fs');

const projectId = 'applevel-c5e73';
const region = 'southamerica-east1';
const functionIds = [
  'approveJoinRequest',
  'approveAttendanceRequest',
  'assignUserToAcademy',
  'callableProxy',
  'createAcademy',
  'createUserWithRole',
  'evaluateUserProgression',
  'finishClassSession',
  'generateClassQrCode',
  'getPublicSignupAcademies',
  'listSignupAcademies',
  'markNotificationRead',
  'recalculateAcademyRankings',
  'recalculateUserRanking',
  'recordLessonPlayback',
  'registerAttendance',
  'registerDeviceToken',
  'rejectAttendanceRequest',
  'rejectJoinRequest',
  'rebuildUserDerivedState',
  'sendSegmentedNotification',
  'setUserRole',
  'startClassSession',
  'startLessonQuiz',
  'submitAttendanceRequest',
  'submitLessonQuiz',
  'submitStudentSignup',
  'syncOwnUserEmail',
  'syncUserMissionProgress',
  'updateOwnStudentProfile',
  'updateStudentBeltGrade',
  'upsertAcademyProgressionRules',
  'upsertClassSchedule',
  'upsertLearningCourse',
  'upsertLearningLesson',
  'upsertLearningTrack',
  'upsertLessonQuiz',
  'upsertMission',
];

const firebaseToolsConfigPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config',
  'configstore',
  'firebase-tools.json',
);

async function getAccessToken() {
  const rawConfig = fs.readFileSync(firebaseToolsConfigPath, 'utf8');
  const config = JSON.parse(rawConfig);
  const refreshToken = config?.tokens?.refresh_token;

  if (!refreshToken) {
    throw new Error('Refresh token do Firebase CLI nao encontrado.');
  }

  const tokenResponse = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      grant_type: 'refresh_token',
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloudplatformprojects.readonly openid email',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Falha ao renovar access token: ${tokenResponse.status} ${await tokenResponse.text()}`);
  }

  const tokenPayload = await tokenResponse.json();
  if (!tokenPayload.access_token) {
    throw new Error('A renovacao do access token nao retornou token valido.');
  }

  return tokenPayload.access_token;
}

async function getIamPolicy(accessToken, serviceId) {
  const response = await fetch(
    `https://run.googleapis.com/v1/projects/${projectId}/locations/${region}/services/${serviceId}:getIamPolicy`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Falha ao ler IAM de ${serviceId}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function setIamPolicy(accessToken, serviceId, policy) {
  const response = await fetch(
    `https://run.googleapis.com/v1/projects/${projectId}/locations/${region}/services/${serviceId}:setIamPolicy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        policy,
        updateMask: 'bindings,etag,version',
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Falha ao atualizar IAM de ${serviceId}: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const accessToken = await getAccessToken();

  for (const functionId of functionIds) {
    const serviceId = functionId.toLowerCase();
    process.stdout.write(`Setting public invoker on ${functionId}... `);
    const currentPolicy = await getIamPolicy(accessToken, serviceId);
    const bindings = (currentPolicy.bindings || []).filter((binding) => binding.role !== 'roles/run.invoker');

    bindings.push({
      role: 'roles/run.invoker',
      members: ['allUsers'],
    });

    await setIamPolicy(accessToken, serviceId, {
      bindings,
      etag: currentPolicy.etag || '',
      version: 3,
    });
    process.stdout.write('ok\n');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
