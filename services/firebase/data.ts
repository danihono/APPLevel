import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { firebaseDb } from './client';
import type {
  AcademyRecord,
  AttendanceRecord,
  ClassRecord,
  CompetitionRecord,
  FightRecord,
  GraduationRecord,
  NotificationRecord,
  RankingRecord,
  StoreItemRecord,
  UserMissionRecord,
  UserRecord,
} from './models';

export type FirestoreEntity<T> = T & { id: string };

function mapDoc<T>(snapshot: QueryDocumentSnapshot<DocumentData>): FirestoreEntity<T> {
  return {
    id: snapshot.id,
    ...(snapshot.data() as T),
  };
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

      listener({
        id: snapshot.id,
        ...(snapshot.data() as UserRecord),
      });
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

export function subscribeToRankings(
  academyId: string,
  listener: (records: Array<FirestoreEntity<RankingRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(firebaseDb, 'rankings'),
      where('academyId', '==', academyId),
      orderBy('score', 'desc'),
      orderBy('competitionPoints', 'desc'),
    ),
    (snapshot) => {
      listener(snapshot.docs.map((item) => mapDoc<RankingRecord>(item)));
    },
    onError,
  );
}

export function subscribeToUserMissions(
  academyId: string,
  userId: string,
  listener: (records: Array<FirestoreEntity<UserMissionRecord>>) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(firebaseDb, 'user_missions'),
      where('academyId', '==', academyId),
      where('userId', '==', userId),
    ),
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => mapDoc<UserMissionRecord>(item))
        .sort((left, right) => {
          if (left.status !== right.status) {
            return left.status === 'in_progress' ? -1 : 1;
          }

          return right.rewardPoints - left.rewardPoints;
        });
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
    academyId: string;
    userId: string;
    includeAcademyFeed: boolean;
  },
  listener: (records: Array<FirestoreEntity<NotificationRecord>>) => void,
  onError?: (error: Error) => void,
) {
  const baseCollection = collection(firebaseDb, 'notifications');
  const notificationQuery = params.includeAcademyFeed
    ? query(baseCollection, where('academyId', '==', params.academyId))
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
        .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
      listener(records);
    },
    onError,
  );
}
