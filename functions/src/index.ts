import { setGlobalOptions } from 'firebase-functions/v2';
import {
  approveJoinRequest,
  assignUserToAcademy,
  createAcademy,
  createUserWithRole,
  listSignupAcademies,
  rejectJoinRequest,
  setUserRole,
  syncOwnUserEmail,
  submitStudentSignup,
  updateOwnStudentProfile,
  updateStudentBeltGrade,
  validateSessionAccess,
} from './modules/auth';
import {
  generateClassQrCode,
  finishClassSession,
  startClassSession,
  upsertClassSchedule,
} from './modules/classes';
import {
  approveAttendanceRequest,
  onAttendanceCreated,
  onAttendanceDeleted,
  rejectAttendanceRequest,
  registerAttendance,
  submitAttendanceRequest,
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
  approveJoinRequest,
  approveAttendanceRequest,
  assignUserToAcademy,
  createAcademy,
  createUserWithRole,
  createUserWithRole as createUser,
  evaluateUserProgression,
  finishClassSession,
  generateClassQrCode,
  listSignupAcademies,
  markNotificationRead,
  onAttendanceCreated,
  onAttendanceDeleted,
  onFightWritten,
  recalculateAcademyRankings,
  recalculateUserRanking,
  rejectAttendanceRequest,
  rejectJoinRequest,
  rebuildUserDerivedState,
  registerAttendance,
  registerDeviceToken,
  sendSegmentedNotification,
  setUserRole,
  syncOwnUserEmail,
  startClassSession,
  submitAttendanceRequest,
  submitStudentSignup,
  syncUserMissionProgress,
  updateOwnStudentProfile,
  updateStudentBeltGrade,
  upsertAcademyProgressionRules,
  upsertClassSchedule,
  upsertMission,
  validateSessionAccess,
};
