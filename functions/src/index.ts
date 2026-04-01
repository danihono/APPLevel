import { setGlobalOptions } from 'firebase-functions/v2';
import {
  approveJoinRequest,
  assignUserToAcademy,
  createAcademy,
  createUserWithRole,
  getPublicSignupAcademies,
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
  recordLessonPlayback,
  startLessonQuiz,
  submitLessonQuiz,
  upsertLearningCourse,
  upsertLearningLesson,
  upsertLearningTrack,
  upsertLessonQuiz,
} from './modules/learning';
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
  getPublicSignupAcademies,
  listSignupAcademies,
  markNotificationRead,
  onAttendanceCreated,
  onAttendanceDeleted,
  onFightWritten,
  recalculateAcademyRankings,
  recalculateUserRanking,
  recordLessonPlayback,
  rejectAttendanceRequest,
  rejectJoinRequest,
  rebuildUserDerivedState,
  registerAttendance,
  registerDeviceToken,
  sendSegmentedNotification,
  setUserRole,
  syncOwnUserEmail,
  startLessonQuiz,
  startClassSession,
  submitAttendanceRequest,
  submitStudentSignup,
  submitLessonQuiz,
  syncUserMissionProgress,
  updateOwnStudentProfile,
  updateStudentBeltGrade,
  upsertAcademyProgressionRules,
  upsertClassSchedule,
  upsertLearningCourse,
  upsertLearningLesson,
  upsertLearningTrack,
  upsertLessonQuiz,
  upsertMission,
  validateSessionAccess,
};
