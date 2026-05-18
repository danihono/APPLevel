import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { firebaseDb } from './client';
import type {
  AcademyRecord,
  AttendanceRecord,
  AttendanceRequestRecord,
  ClassRecord,
  ClassRsvpRecord,
  CompetitionRecord,
  FightRecord,
  FightVideoSubmissionRecord,
  FinanceExpenseRecord,
  FinancePaymentRecord,
  FinanceProductRecord,
  FinanceRevenueRecord,
  FinanceSaleItemRecord,
  FinanceSaleRecord,
  FinanceServiceRecord,
  GraduationApprovalRequestRecord,
  GraduationRecord,
  InventoryMovementRecord,
  JoinRequestRecord,
  LearningCourseRecord,
  LearningLessonBlockRecord,
  LearningLessonRecord,
  LearningProgressRecord,
  LearningQuizRecord,
  LearningTrackRecord,
  NotificationRecord,
  ReactivationRequestRecord,
  StoreItemRecord,
  UserRecord,
} from './models';
import { isNotificationInViewerInbox } from './notifications';

export type FirestoreEntity<T> = T & { id: string };

function normalizeUserRole<T extends { role: string }>(record: T): T {
  if (record.role !== 'admin') {
    return record;
  }

  return {
    ...record,
    role: 'professor',
  };
}

function mapDoc<T>(snapshot: QueryDocumentSnapshot<DocumentData>): FirestoreEntity<T> {
  const baseRecord = {
    id: snapshot.id,
    ...(snapshot.data() as T),
  };

  if ('role' in baseRecord && typeof (baseRecord as { role?: unknown }).role === 'string') {
    return normalizeUserRole(baseRecord as FirestoreEntity<T & { role: string }>) as FirestoreEntity<T>;
  }

  return baseRecord;
}

function toMillis(value: { toMillis(): number } | null | undefined): number {
  return value?.toMillis() ?? 0;
}

export function subscribeToUserProfile(
  uid: string,
  listener: (record: FirestoreEntity<UserRecord> | null) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    doc(firebaseDb, 'users', uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        listener(null);
        return;
      }

      const record = {
        id: snapshot.id,
        ...(snapshot.data() as UserRecord),
      };

      listener(normalizeUserRole(record));
    },
    onError,
  );
}

export function subscribeToAcademy(
  academyId: string,
  listener: (record: FirestoreEntity<AcademyRecord> | null) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    doc(firebaseDb, 'academies', academyId),
    (snapshot) => {
      if (!snapshot.exists()) {
        listener(null);
        return;
      }

      listener({
        id: snapshot.id,
        ...(snapshot.data() as AcademyRecord),
      });
    },
    onError,
  );
}

export function subscribeToAcademies(
  listener: (records: Array<FirestoreEntity<AcademyRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    collection(firebaseDb, 'academies'),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<AcademyRecord>(item))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToAcademyClasses(
  academyId: string,
  listener: (records: Array<FirestoreEntity<ClassRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(firebaseDb, 'classes'), where('academyId', '==', academyId)),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<ClassRecord>(item))
        .sort((left, right) => toMillis(left.scheduledStart) - toMillis(right.scheduledStart));
      listener(records);
    },
    onError,
  );
}

export function subscribeToAcademyUsers(
  academyId: string,
  listener: (records: Array<FirestoreEntity<UserRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(firebaseDb, 'users'), where('academyId', '==', academyId)),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<UserRecord>(item))
        .sort((left, right) => left.displayName.localeCompare(right.displayName, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToAllUsers(
  listener: (records: Array<FirestoreEntity<UserRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    collection(firebaseDb, 'users'),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<UserRecord>(item))
        .sort((left, right) => left.displayName.localeCompare(right.displayName, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToUserAttendances(
  academyId: string,
  userId: string,
  listener: (records: Array<FirestoreEntity<AttendanceRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(firebaseDb, 'attendances'),
      where('academyId', '==', academyId),
      where('userId', '==', userId),
      orderBy('checkedInAt', 'desc'),
    ),
    (snapshot) => {
      listener(snapshot.docs.map((item) => mapDoc<AttendanceRecord>(item)));
    },
    onError,
  );
}

export function subscribeToClassAttendances(
  classId: string,
  academyId: string,
  listener: (records: Array<FirestoreEntity<AttendanceRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(firebaseDb, 'attendances'),
      where('classId', '==', classId),
      where('academyId', '==', academyId),
    ),
    (snapshot) => {
      listener(snapshot.docs.map((item) => mapDoc<AttendanceRecord>(item)));
    },
    onError,
  );
}

export function subscribeToRankingAttendances(
  params: {
    academyId?: string;
    startDate: Date;
    endDate?: Date | null;
  },
  listener: (records: Array<FirestoreEntity<AttendanceRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const snapshotsByDateField = new Map<'checkedInAt' | 'createdAt', Array<FirestoreEntity<AttendanceRecord>>>();

  function buildConstraints(dateField: 'checkedInAt' | 'createdAt'): QueryConstraint[] {
    const constraints: QueryConstraint[] = [];

    if (params.academyId) {
      constraints.push(where('academyId', '==', params.academyId));
    }

    constraints.push(where(dateField, '>=', Timestamp.fromDate(params.startDate)));

    if (params.endDate) {
      constraints.push(where(dateField, '<=', Timestamp.fromDate(params.endDate)));
    }

    constraints.push(orderBy(dateField, 'desc'));

    return constraints;
  }

  function publishMergedRecords() {
    const recordsById = new Map<string, FirestoreEntity<AttendanceRecord>>();

    snapshotsByDateField.forEach((records) => {
      records.forEach((record) => recordsById.set(record.id, record));
    });

    listener(
      [...recordsById.values()]
        .sort((left, right) => toMillis(right.checkedInAt ?? right.createdAt) - toMillis(left.checkedInAt ?? left.createdAt)),
    );
  }

  const unsubscribeCheckedInAt = onSnapshot(
    query(collection(firebaseDb, 'attendances'), ...buildConstraints('checkedInAt')),
    (snapshot) => {
      snapshotsByDateField.set('checkedInAt', snapshot.docs.map((item) => mapDoc<AttendanceRecord>(item)));
      publishMergedRecords();
    },
    onError,
  );

  const unsubscribeCreatedAt = onSnapshot(
    query(collection(firebaseDb, 'attendances'), ...buildConstraints('createdAt')),
    (snapshot) => {
      snapshotsByDateField.set('createdAt', snapshot.docs.map((item) => mapDoc<AttendanceRecord>(item)));
      publishMergedRecords();
    },
    onError,
  );

  return () => {
    unsubscribeCheckedInAt();
    unsubscribeCreatedAt();
  };
}

export function subscribeToAttendanceRequests(
  params: {
    academyId?: string;
    userId?: string;
  },
  listener: (records: Array<FirestoreEntity<AttendanceRequestRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'attendance_requests');
  const attendanceRequestQuery = params.userId
    ? query(baseCollection, where('userId', '==', params.userId))
    : params.academyId
      ? query(baseCollection, where('academyId', '==', params.academyId))
      : baseCollection;

  return onSnapshot(
    attendanceRequestQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<AttendanceRequestRecord>(item))
        .sort((left, right) => toMillis(right.updatedAt ?? right.requestedAt) - toMillis(left.updatedAt ?? left.requestedAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToUserGraduations(
  academyId: string,
  userId: string,
  listener: (records: Array<FirestoreEntity<GraduationRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(firebaseDb, 'graduations'),
      where('academyId', '==', academyId),
      where('userId', '==', userId),
    ),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<GraduationRecord>(item))
        .sort((left, right) => toMillis(right.promotedAt) - toMillis(left.promotedAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToGraduationRequests(
  params: {
    academyId?: string;
    userId?: string;
  },
  listener: (records: Array<FirestoreEntity<GraduationApprovalRequestRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'graduation_requests');
  const graduationRequestQuery = params.userId
    ? query(baseCollection, where('userId', '==', params.userId))
    : params.academyId
      ? query(baseCollection, where('academyId', '==', params.academyId))
      : baseCollection;

  return onSnapshot(
    graduationRequestQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<GraduationApprovalRequestRecord>(item))
        .sort((left, right) => toMillis(right.updatedAt ?? right.createdAt) - toMillis(left.updatedAt ?? left.createdAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToJoinRequests(
  academyId: string | undefined,
  listener: (records: Array<FirestoreEntity<JoinRequestRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'join_requests');
  const joinRequestQuery = academyId
    ? query(baseCollection, where('academyId', '==', academyId))
    : baseCollection;

  return onSnapshot(
    joinRequestQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<JoinRequestRecord>(item))
        .sort((left, right) => toMillis(right.updatedAt ?? right.createdAt) - toMillis(left.updatedAt ?? left.createdAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToReactivationRequests(
  academyId: string | undefined,
  listener: (records: Array<FirestoreEntity<ReactivationRequestRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'reactivation_requests');
  const reactivationQuery = academyId
    ? query(baseCollection, where('academyId', '==', academyId))
    : baseCollection;

  return onSnapshot(
    reactivationQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<ReactivationRequestRecord>(item))
        .sort((left, right) => toMillis(right.updatedAt ?? right.createdAt) - toMillis(left.updatedAt ?? left.createdAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToCompetitions(
  academyId: string,
  listener: (records: Array<FirestoreEntity<CompetitionRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(firebaseDb, 'competitions'), where('academyId', '==', academyId)),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<CompetitionRecord>(item))
        .sort((left, right) => toMillis(left.startDate) - toMillis(right.startDate));
      listener(records);
    },
    onError,
  );
}

export function subscribeToUserFights(
  academyId: string,
  userId: string,
  listener: (records: Array<FirestoreEntity<FightRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(firebaseDb, 'fights'),
      where('academyId', '==', academyId),
      where('athleteId', '==', userId),
      orderBy('occurredAt', 'desc'),
    ),
    (snapshot) => {
      listener(snapshot.docs.map((item) => mapDoc<FightRecord>(item)));
    },
    onError,
  );
}

export function subscribeToAcademyFights(
  academyId: string,
  listener: (records: Array<FirestoreEntity<FightRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(firebaseDb, 'fights'),
      where('academyId', '==', academyId),
    ),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<FightRecord>(item))
        .sort((left, right) => toMillis(right.occurredAt) - toMillis(left.occurredAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToFightVideoSubmissions(
  params: {
    academyId?: string;
    athleteId?: string;
  },
  listener: (records: Array<FirestoreEntity<FightVideoSubmissionRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'fight_video_submissions');
  const fightVideoQuery = params.athleteId
    ? query(baseCollection, where('athleteId', '==', params.athleteId))
    : params.academyId
      ? query(baseCollection, where('academyId', '==', params.academyId))
      : baseCollection;

  return onSnapshot(
    fightVideoQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<FightVideoSubmissionRecord>(item))
        .sort((left, right) => toMillis(right.updatedAt ?? right.createdAt) - toMillis(left.updatedAt ?? left.createdAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToStoreItems(
  academyId: string,
  listener: (records: Array<FirestoreEntity<StoreItemRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(firebaseDb, 'store_items'), where('academyId', '==', academyId)),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<StoreItemRecord>(item))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToNotifications(
  params: {
    academyId?: string;
    userId: string;
    includeAcademyFeed: boolean;
  },
  listener: (records: Array<FirestoreEntity<NotificationRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'notifications');
  const notificationQuery = params.includeAcademyFeed
    ? params.academyId
      ? query(baseCollection, where('academyId', '==', params.academyId))
      : query(baseCollection, orderBy('createdAt', 'desc'))
    : query(
      baseCollection,
      where('academyId', '==', params.academyId),
      where('recipientUserId', '==', params.userId),
      orderBy('createdAt', 'desc'),
    );

  return onSnapshot(
    notificationQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<NotificationRecord>(item))
        .filter((item) => isNotificationInViewerInbox(item, params.userId, params.includeAcademyFeed))
        .filter((item) => item.kind !== 'join_request' || item.recipientUserId === params.userId)
        .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToLearningTracks(
  params: {
    publishedOnly: boolean;
  },
  listener: (records: Array<FirestoreEntity<LearningTrackRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'learning_tracks');
  const learningTrackQuery = params.publishedOnly
    ? query(baseCollection, where('status', '==', 'published'))
    : baseCollection;

  return onSnapshot(
    learningTrackQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<LearningTrackRecord>(item))
        .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToLearningCourses(
  params: {
    publishedOnly: boolean;
  },
  listener: (records: Array<FirestoreEntity<LearningCourseRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'learning_courses');
  const learningCourseQuery = params.publishedOnly
    ? query(baseCollection, where('status', '==', 'published'))
    : baseCollection;

  return onSnapshot(
    learningCourseQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<LearningCourseRecord>(item))
        .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToLearningLessons(
  params: {
    publishedOnly: boolean;
  },
  listener: (records: Array<FirestoreEntity<LearningLessonRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'learning_lessons');
  const learningLessonQuery = params.publishedOnly
    ? query(baseCollection, where('status', '==', 'published'))
    : baseCollection;

  return onSnapshot(
    learningLessonQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<LearningLessonRecord>(item))
        .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToLearningLessonBlocks(
  listener: (records: Array<FirestoreEntity<LearningLessonBlockRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    collection(firebaseDb, 'learning_lesson_blocks'),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<LearningLessonBlockRecord>(item))
        .sort((left, right) => {
          if (left.lessonId !== right.lessonId) {
            return left.lessonId.localeCompare(right.lessonId, 'pt-BR');
          }

          return left.order - right.order || left.title.localeCompare(right.title, 'pt-BR');
        });
      listener(records);
    },
    onError,
  );
}

export function subscribeToLearningQuizzes(
  listener: (records: Array<FirestoreEntity<LearningQuizRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    collection(firebaseDb, 'learning_quizzes'),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<LearningQuizRecord>(item))
        .sort((left, right) => left.lessonId.localeCompare(right.lessonId, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToClassRsvps(
  classId: string,
  academyId: string,
  listener: (records: Array<FirestoreEntity<ClassRsvpRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(firebaseDb, 'class_rsvps'),
      where('classId', '==', classId),
      where('academyId', '==', academyId),
      orderBy('createdAt', 'asc'),
    ),
    (snapshot) => {
      listener(snapshot.docs.map((item) => mapDoc<ClassRsvpRecord>(item)));
    },
    onError,
  );
}

export async function getMyClassRsvp(classId: string, userId: string): Promise<boolean> {
  const rsvpSnap = await getDoc(doc(firebaseDb, 'class_rsvps', `${classId}_${userId}`));
  return rsvpSnap.exists();
}

export function subscribeToLearningProgress(
  params: {
    academyId?: string;
    userId?: string;
  },
  listener: (records: Array<FirestoreEntity<LearningProgressRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'learning_progress');
  const progressQuery = params.userId
    ? query(baseCollection, where('userId', '==', params.userId))
    : params.academyId
      ? query(baseCollection, where('academyId', '==', params.academyId))
      : baseCollection;

  return onSnapshot(
    progressQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<LearningProgressRecord>(item))
        .sort((left, right) => {
          if (left.userDisplayName !== right.userDisplayName) {
            return left.userDisplayName.localeCompare(right.userDisplayName, 'pt-BR');
          }

          return toMillis(right.updatedAt) - toMillis(left.updatedAt);
        });
      listener(records);
    },
    onError,
  );
}

function buildAcademyScopedQuery(collectionName: string, academyId?: string) {
  const baseCollection = collection(firebaseDb, collectionName);
  return academyId
    ? query(baseCollection, where('academyId', '==', academyId))
    : baseCollection;
}

export function subscribeToFinanceProducts(
  academyId: string | undefined,
  listener: (records: Array<FirestoreEntity<FinanceProductRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    buildAcademyScopedQuery('finance_products', academyId),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<FinanceProductRecord>(item))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToFinanceServices(
  academyId: string | undefined,
  listener: (records: Array<FirestoreEntity<FinanceServiceRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    buildAcademyScopedQuery('finance_services', academyId),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<FinanceServiceRecord>(item))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToFinanceSales(
  academyId: string | undefined,
  listener: (records: Array<FirestoreEntity<FinanceSaleRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    buildAcademyScopedQuery('finance_sales', academyId),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<FinanceSaleRecord>(item))
        .sort((left, right) => toMillis(right.saleDate ?? right.createdAt) - toMillis(left.saleDate ?? left.createdAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToFinanceSaleItems(
  academyId: string | undefined,
  listener: (records: Array<FirestoreEntity<FinanceSaleItemRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    buildAcademyScopedQuery('finance_sale_items', academyId),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<FinanceSaleItemRecord>(item))
        .sort((left, right) => left.saleId.localeCompare(right.saleId, 'pt-BR'));
      listener(records);
    },
    onError,
  );
}

export function subscribeToFinancePayments(
  academyId: string | undefined,
  listener: (records: Array<FirestoreEntity<FinancePaymentRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    buildAcademyScopedQuery('finance_payments', academyId),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<FinancePaymentRecord>(item))
        .sort((left, right) => toMillis(right.paymentDate ?? right.createdAt) - toMillis(left.paymentDate ?? left.createdAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToFinanceRevenues(
  academyId: string | undefined,
  listener: (records: Array<FirestoreEntity<FinanceRevenueRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    buildAcademyScopedQuery('finance_revenues', academyId),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<FinanceRevenueRecord>(item))
        .sort((left, right) => toMillis(right.receivedAt ?? right.createdAt) - toMillis(left.receivedAt ?? left.createdAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToFinanceExpenses(
  academyId: string | undefined,
  listener: (records: Array<FirestoreEntity<FinanceExpenseRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    buildAcademyScopedQuery('finance_expenses', academyId),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<FinanceExpenseRecord>(item))
        .sort((left, right) => toMillis(right.dueDate ?? right.createdAt) - toMillis(left.dueDate ?? left.createdAt));
      listener(records);
    },
    onError,
  );
}

export function subscribeToInventoryMovements(
  academyId: string | undefined,
  listener: (records: Array<FirestoreEntity<InventoryMovementRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    buildAcademyScopedQuery('inventory_movements', academyId),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<InventoryMovementRecord>(item))
        .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
      listener(records);
    },
    onError,
  );
}
