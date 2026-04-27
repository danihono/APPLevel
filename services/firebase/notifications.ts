import type {
  AttendanceRequestRecord,
  FightVideoSubmissionRecord,
  GraduationApprovalRequestRecord,
  JoinRequestRecord,
  NotificationRecord,
} from './models';

type Entity<T> = T & { id: string };

export type NotificationActionState = {
  joinRequests?: Array<Entity<JoinRequestRecord>>;
  attendanceRequests?: Array<Entity<AttendanceRequestRecord>>;
  graduationRequests?: Array<Entity<GraduationApprovalRequestRecord>>;
  fightVideoSubmissions?: Array<Entity<FightVideoSubmissionRecord>>;
};

function hasPendingRecord<T extends { status: string }>(
  records: Array<Entity<T>> | undefined,
  id: string,
) {
  return records?.some((entry) => entry.id === id && entry.status === 'pending') ?? true;
}

export function isNotificationInViewerInbox(
  notification: NotificationRecord,
  viewerUserId: string,
  includeAcademyFeed: boolean,
) {
  if (!includeAcademyFeed || !notification.recipientUserId) {
    return true;
  }

  return notification.recipientUserId === viewerUserId;
}

function isResolvedStaffActionNotification(
  notification: NotificationRecord,
  actionState: NotificationActionState,
) {
  if (!notification.actionRef) {
    return false;
  }

  switch (notification.kind) {
    case 'join_request':
      return !hasPendingRecord(actionState.joinRequests, notification.actionRef);
    case 'attendance_request':
      return !hasPendingRecord(actionState.attendanceRequests, notification.actionRef);
    case 'graduation':
      return !hasPendingRecord(actionState.graduationRequests, notification.actionRef);
    case 'fight_video_submission':
      return !hasPendingRecord(actionState.fightVideoSubmissions, notification.actionRef);
    default:
      return false;
  }
}

export function isUnreadNotificationForViewer(
  notification: NotificationRecord,
  params: {
    viewerRole?: string;
    actionState?: NotificationActionState;
  } = {},
) {
  if (notification.status === 'read') {
    return false;
  }

  if (
    params.viewerRole !== 'student'
    && params.actionState
    && isResolvedStaffActionNotification(notification, params.actionState)
  ) {
    return false;
  }

  return true;
}
