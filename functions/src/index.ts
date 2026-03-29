import { setGlobalOptions } from 'firebase-functions/v2';
import {
  assignUserToAcademy,
  createAcademy,
  createUserWithRole,
  setUserRole,
  validateSessionAccess,
} from './modules/auth';
import {
  generateClassQrCode,
  finishClassSession,
  startClassSession,
  upsertClassSchedule,
} from './modules/classes';
import {
  onAttendanceCreated,
  onAttendanceDeleted,
  registerAttendance,
} from './modules/attendance';
import {
  evaluateUserProgression,
  rebuildUserDerivedState,
  upsertAcademyProgressionRules,
} from './modules/progression';
import {
  onFightWritten,
  recalculateAcademyRankings,
  recalculateUserRanking,
} from './modules/ranking';
import {
  syncUserMissionProgress,
  upsertMission,
} from './modules/missions';
import {
  markNotificationRead,
  registerDeviceToken,
  sendSegmentedNotification,
} from './modules/notifications';

setGlobalOptions({
  region: 'southamerica-east1',
  maxInstances: 10,
});

export {
  assignUserToAcademy,
  createAcademy,
  createUserWithRole,
  createUserWithRole as createUser,
  evaluateUserProgression,
  finishClassSession,
  generateClassQrCode,
  markNotificationRead,
  onAttendanceCreated,
  onAttendanceDeleted,
  onFightWritten,
  recalculateAcademyRankings,
  recalculateUserRanking,
  rebuildUserDerivedState,
  registerAttendance,
  registerDeviceToken,
  sendSegmentedNotification,
  setUserRole,
  startClassSession,
  syncUserMissionProgress,
  upsertAcademyProgressionRules,
  upsertClassSchedule,
  upsertMission,
  validateSessionAccess,
};
