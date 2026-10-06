// Dados ficticios da galeria de preview (?preview=redesign, so em desenvolvimento).
// Nada aqui toca o Firebase: sao objetos no mesmo formato dos documentos do Firestore.
import { Timestamp } from 'firebase/firestore';
import type { FirestoreEntity } from '../services/firebase/data';
import type {
  AcademyRecord,
  AttendanceRecord,
  AttendanceRequestRecord,
  ClassRecord,
  CompetitionRecord,
  FightRecord,
  GraduationApprovalRequestRecord,
  GraduationRecord,
  JoinRequestRecord,
  NotificationBroadcastRecord,
  NotificationRecord,
  UserRecord,
} from '../services/firebase/models';

const ts = (date: Date) => Timestamp.fromDate(date);

const now = new Date();
const dayAt = (offsetDays: number, hour: number, minute = 0) => {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, hour, minute, 0, 0);
  return date;
};
const mondayOffset = -((now.getDay() + 6) % 7);

export const ACADEMY_ID = 'preview-level-cambui';

export const previewAcademy: FirestoreEntity<AcademyRecord> = {
  id: ACADEMY_ID,
  name: 'Level Cambuí Campinas',
  slug: 'level-cambui',
  ownerUserId: 'prof-murilo',
  status: 'active',
  timezone: 'America/Sao_Paulo',
  classCheckinWindowMinutes: 15,
};

type UserSeed = {
  id: string;
  first: string;
  last: string;
  role?: UserRecord['role'];
  belt: string;
  stripes: number;
  count: number;
  status?: UserRecord['status'];
  lastDays?: number;
  competitor?: boolean;
  birth?: string;
};

const seeds: UserSeed[] = [
  { id: 'aluno-daniel', first: 'Daniel', last: 'Honorato', belt: 'white', stripes: 2, count: 60, lastDays: 1, competitor: true, birth: '1995-04-12' },
  { id: 'prof-murilo', first: 'Murilo', last: 'Ale', role: 'professor', belt: 'black', stripes: 2, count: 0, birth: '1988-02-01' },
  { id: 'prof-ricardo', first: 'Ricardo', last: 'Saldanha', role: 'professor', belt: 'black', stripes: 4, count: 0, birth: '1980-06-20' },
  { id: 'aluno-lucas', first: 'Lucas', last: 'Prado', belt: 'white', stripes: 4, count: 150, lastDays: 0, birth: '1999-01-03' },
  { id: 'aluno-marina', first: 'Marina', last: 'Couto', belt: 'blue', stripes: 3, count: 286, lastDays: 0, birth: '1997-07-07' },
  { id: 'aluno-felipe', first: 'Felipe', last: 'Ramos', belt: 'white', stripes: 3, count: 115, lastDays: 1, birth: '2001-11-11' },
  { id: 'aluno-beatriz', first: 'Beatriz', last: 'Lima', belt: 'purple', stripes: 1, count: 420, lastDays: 5, birth: '1993-09-09' },
  { id: 'aluno-joao', first: 'João', last: 'Teixeira', belt: 'brown', stripes: 2, count: 610, lastDays: 4, birth: '1987-03-30' },
  { id: 'aluno-carla', first: 'Carla', last: 'Mendes', belt: 'blue', stripes: 0, count: 160, lastDays: 2, birth: '1998-05-15' },
  { id: 'aluno-ana', first: 'Ana', last: 'Ribeiro', belt: 'white', stripes: 1, count: 34, lastDays: 3, birth: '2002-02-22' },
  { id: 'aluno-pedro', first: 'Pedro', last: 'Alves', belt: 'white', stripes: 0, count: 6, lastDays: 40, birth: '2000-08-08' },
  { id: 'aluno-bia-kids', first: 'Bia', last: 'Souza', belt: 'yellow-white', stripes: 1, count: 40, lastDays: 2, birth: '2016-04-04' },
  { id: 'aluno-sumido', first: 'Caio', last: 'Martins', belt: 'blue', stripes: 1, count: 200, status: 'suspended', lastDays: 90, birth: '1994-10-10' },
];

export const previewUsers: Array<FirestoreEntity<UserRecord>> = seeds.map((seed) => ({
  id: seed.id,
  academyId: ACADEMY_ID,
  firstName: seed.first,
  lastName: seed.last,
  displayName: `${seed.first} ${seed.last}`,
  email: `${seed.first.toLowerCase()}@exemplo.com`,
  cpf: '000.000.000-00',
  phone: '(19) 99999-0000',
  birthDate: seed.birth,
  isCompetitor: seed.competitor ?? false,
  role: seed.role ?? 'student',
  status: seed.status ?? 'active',
  belt: seed.belt,
  stripes: seed.stripes,
  grade: seed.stripes,
  attendanceCount: seed.count,
  qrCheckinsCount: Math.round(seed.count * 0.8),
  currentStreak: 3,
  longestStreak: 9,
  competitionPoints: 0,
  missionPoints: 0,
  rankingPoints: seed.count,
  beltPromotions: 1,
  lastAttendanceAt: seed.lastDays === undefined ? undefined : ts(dayAt(-seed.lastDays, 19)),
  createdAt: ts(dayAt(-400, 10)),
  lastGraduationDateOverride: seed.role === 'professor' ? ts(new Date(2019, 3, 10)) : undefined,
}));

export const previewStudent = previewUsers[0];
export const previewProfessor = previewUsers[1];

type ClassSeed = {
  id: string;
  day: number;
  hour: number;
  minute?: number;
  durationMin?: number;
  type: string;
  prof: 'prof-murilo' | 'prof-ricardo';
  status?: ClassRecord['status'];
  capacity?: number;
  rsvp?: number;
  attendance?: number;
};

const classSeeds: ClassSeed[] = [];
for (let offset = mondayOffset; offset < mondayOffset + 7; offset += 1) {
  const isToday = offset === 0;
  const isPast = offset < 0;
  const isSunday = offset - mondayOffset === 6;
  if (isSunday) continue;
  const dayStatus = (hour: number): ClassRecord['status'] => {
    if (isPast) return 'finished';
    if (!isToday) return 'scheduled';
    return hour < now.getHours() - 1 ? 'finished' : 'scheduled';
  };
  classSeeds.push(
    { id: `c-${offset}-0630-ini`, day: offset, hour: 6, minute: 30, type: 'iniciante', prof: 'prof-ricardo', status: dayStatus(6), capacity: 20, rsvp: 9, attendance: isPast || isToday ? 9 : 0 },
    { id: `c-${offset}-0630-sport`, day: offset, hour: 6, minute: 30, type: 'sport', prof: 'prof-ricardo', status: dayStatus(6), capacity: 20, rsvp: 7, attendance: isPast || isToday ? 7 : 0 },
    { id: `c-${offset}-1200-nogi`, day: offset, hour: 12, type: 'nogi', prof: 'prof-ricardo', status: dayStatus(12), capacity: 16, rsvp: 5, attendance: isPast ? 6 : 0 },
    { id: `c-${offset}-1900-ini`, day: offset, hour: 19, type: 'iniciante', prof: 'prof-murilo', status: isPast ? 'finished' : 'scheduled', capacity: 20, rsvp: 12, attendance: isPast ? 14 : 0 },
  );
}

export const TODAY_EVENING_CLASS_ID = 'c-0-1900-ini';

export const previewClasses: Array<FirestoreEntity<ClassRecord>> = classSeeds.map((seed) => {
  const start = dayAt(seed.day, seed.hour, seed.minute ?? 0);
  const end = new Date(start.getTime() + (seed.durationMin ?? 60) * 60_000);
  const professor = previewUsers.find((user) => user.id === seed.prof)!;
  return {
    id: seed.id,
    academyId: ACADEMY_ID,
    title: seed.type === 'iniciante' ? 'Iniciante' : seed.type === 'sport' ? 'Sport' : 'No-Gi',
    description: seed.type,
    professorId: professor.id,
    professorName: professor.displayName,
    tatame: 'Tatame 1',
    status: seed.status ?? 'scheduled',
    scheduledStart: ts(start),
    scheduledEnd: ts(end),
    capacity: seed.capacity,
    currentAttendanceCount: seed.attendance ?? 0,
    rsvpCount: seed.rsvp ?? 0,
    checkinWindowMinutes: 15,
    activeQrToken: 'preview-token-123',
    activeQrExpiresAt: ts(new Date(end.getTime() + 3_600_000)),
    activeQrVersion: 1,
  };
});

// Presencas do Daniel: varias semanas seguidas, algumas no mes atual, uma que nao conta.
const danielDays = [-1, -3, -5, -8, -10, -12, -15, -17, -22, -24, -29, -31, -36];
export const previewStudentAttendances: Array<FirestoreEntity<AttendanceRecord>> = danielDays.map((offset, index) => {
  const start = dayAt(offset, 19);
  return {
    id: `att-daniel-${index}`,
    academyId: ACADEMY_ID,
    classId: `hist-${offset}`,
    userId: previewStudent.id,
    checkInMethod: index % 3 === 0 ? 'manual' : 'qr',
    checkedInBy: previewStudent.id,
    countsAsAttendance: index !== 2,
    nonCountingReason: index === 2 ? 'daily_limit' : undefined,
    classStartAt: ts(start),
    checkedInAt: ts(new Date(start.getTime() + 5 * 60_000)),
    createdAt: ts(start),
  };
});

export const previewAttendanceRequests: Array<FirestoreEntity<AttendanceRequestRecord>> = ['aluno-felipe', 'aluno-marina', 'aluno-ana'].map((userId, index) => {
  const user = previewUsers.find((entry) => entry.id === userId)!;
  return {
    id: `req-${index}`,
    academyId: ACADEMY_ID,
    classId: 'c-0-0630-ini',
    classTitle: 'Iniciantes',
    userId,
    userDisplayName: user.displayName,
    professorId: 'prof-ricardo',
    professorName: 'Ricardo Saldanha',
    status: 'pending',
    requestedAt: ts(dayAt(0, 7, 40 + index)),
    createdAt: ts(dayAt(0, 7, 40 + index)),
  };
});

export const previewJoinRequests: Array<FirestoreEntity<JoinRequestRecord>> = [{
  id: 'join-rafael',
  academyId: ACADEMY_ID,
  academyName: previewAcademy.name,
  authUid: 'uid-rafael',
  email: 'rafael@exemplo.com',
  cpf: '000.000.000-00',
  firstName: 'Rafael',
  lastName: 'Souza',
  displayName: 'Rafael Souza',
  birthDate: '1996-01-01',
  isCompetitor: false,
  requestedBelt: 'white',
  requestedGrade: 0,
  status: 'pending',
  origin: 'signup',
  createdAt: ts(dayAt(0, 9)),
}];

export const previewGraduationRequests: Array<FirestoreEntity<GraduationApprovalRequestRecord>> = [{
  id: 'grad-req-lucas',
  academyId: ACADEMY_ID,
  userId: 'aluno-lucas',
  userDisplayName: 'Lucas Prado',
  currentBelt: 'white',
  currentStripes: 4,
  targetType: 'belt',
  targetBelt: 'blue',
  targetStripes: 0,
  attendanceCount: 150,
  attendanceTarget: 150,
  remainingClasses: 0,
  ruleVersion: 2,
  status: 'pending',
  createdAt: ts(dayAt(-1, 20)),
}];

export const previewGraduations: Array<FirestoreEntity<GraduationRecord>> = [
  {
    id: 'g2',
    academyId: ACADEMY_ID,
    userId: previewStudent.id,
    previousBelt: 'white',
    previousStripes: 1,
    newBelt: 'white',
    newStripes: 2,
    attendanceCount: 60,
    promotedAt: ts(dayAt(-2, 20)),
    ruleVersion: 2,
    reason: 'automatic_progression',
  },
  {
    id: 'g1',
    academyId: ACADEMY_ID,
    userId: previewStudent.id,
    previousBelt: 'white',
    previousStripes: 0,
    newBelt: 'white',
    newStripes: 1,
    attendanceCount: 30,
    promotedAt: ts(dayAt(-75, 20)),
    ruleVersion: 2,
    reason: 'automatic_progression',
  },
];

export const previewNotifications: Array<FirestoreEntity<NotificationRecord>> = [
  {
    id: 'n1',
    academyId: ACADEMY_ID,
    title: 'Treino especial no sábado',
    body: 'Sábado às 10h teremos treino aberto de raspagens. Traga um amigo!',
    channel: 'academy',
    kind: 'notice',
    status: 'sent',
    recipientUserId: previewStudent.id,
    createdAt: ts(dayAt(-1, 16, 51)),
    broadcastId: 'b1',
  },
  {
    id: 'n2',
    academyId: ACADEMY_ID,
    title: 'Teste para Daniel Honorato',
    body: 'Este é um aviso de teste enviado pela academia.',
    channel: 'academy',
    kind: 'notice',
    status: 'read',
    recipientUserId: previewStudent.id,
    createdAt: ts(dayAt(-8, 16, 51)),
    readAt: ts(dayAt(-8, 18)),
    broadcastId: 'b2',
  },
];

export const previewBroadcasts: Array<FirestoreEntity<NotificationBroadcastRecord>> = [
  {
    id: 'b1',
    academyId: ACADEMY_ID,
    title: 'Treino especial no sábado',
    body: 'Sábado às 10h teremos treino aberto de raspagens. Traga um amigo!',
    channel: 'academy',
    filters: { audience: 'all', onlyActive: true, onlyCompetitors: false },
    status: 'sent',
    sentAt: ts(dayAt(-1, 16, 51)),
    createdBy: 'prof-murilo',
    createdByName: 'Murilo Ale',
    createdAt: ts(dayAt(-1, 16, 50)),
    recipientCount: 86,
    tokenCount: 70,
    pushSent: 68,
    pushFailed: 2,
    readCount: 41,
  },
];

export const previewCompetitions: Array<FirestoreEntity<CompetitionRecord>> = [{
  id: 'comp-1',
  academyId: ACADEMY_ID,
  name: 'Copa Campinas de Jiu-Jitsu',
  location: 'Ginásio do Taquaral',
  organizer: 'FPJJ',
  status: 'published',
  startDate: ts(dayAt(24, 9)),
  endDate: ts(dayAt(24, 18)),
}];

export const previewFights: Array<FirestoreEntity<FightRecord>> = [{
  id: 'fight-1',
  academyId: ACADEMY_ID,
  competitionId: 'comp-0',
  athleteId: previewStudent.id,
  athleteName: previewStudent.displayName,
  opponentName: 'Gustavo Lima',
  result: 'submission',
  occurredAt: ts(dayAt(-60, 11)),
}];
