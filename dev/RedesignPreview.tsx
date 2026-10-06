// Galeria do redesign: http://localhost:3000/?preview=redesign
// So existe em desenvolvimento (index.tsx so carrega este arquivo quando import.meta.env.DEV).
// Mostra as telas novas com dados ficticios, sem login e sem gravar nada no Firebase.
import React, { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import Layout from '../components/Layout';
import CheckInScreen from '../components/redesign/CheckInScreen';
import { RedesignShellProvider, type RedesignShellValue } from '../components/redesign/ShellContext';
import GraduationCelebrationModal from '../components/GraduationCelebrationModal';
import CalendarView from '../views/CalendarView';
import EvolutionView from '../views/EvolutionView';
import HomeView from '../views/HomeView';
import NotificationsView from '../views/NotificationsView';
import StaffDashboardView from '../views/StaffDashboardView';
import { getUserProgressionSummary } from '../beltCatalog';
import { resolveMonthlyCommitment } from '../commitmentScale';
import { previewNonCountingReason } from '../classRules';
import { toUiUser } from '../services/firebase/adapters';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, ClassRsvpRecord, UserRecord } from '../services/firebase/models';
import { UserRole } from '../types';
import { SUPPORTED_LANGUAGES, useI18n } from '../i18n';
import {
  ACADEMY_ID,
  TODAY_EVENING_CLASS_ID,
  previewAcademy,
  previewAttendanceRequests,
  previewBroadcasts,
  previewClasses,
  previewCompetitions,
  previewFights,
  previewGraduationRequests,
  previewGraduations,
  previewJoinRequests,
  previewNotifications,
  previewProfessor,
  previewStudent,
  previewStudentAttendances,
  previewUsers,
} from './previewData';

// ─── Leituras do Firestore trocadas por dados ficticios ─────────────────────
const studentIds = previewUsers.filter((user) => user.role === 'student' && user.status === 'active').map((user) => user.id);
const ts = (date: Date) => Timestamp.fromDate(date);

function mockRsvps(classId: string): Array<FirestoreEntity<ClassRsvpRecord>> {
  const lesson = previewClasses.find((entry) => entry.id === classId);
  const count = Math.min(lesson?.rsvpCount ?? 0, studentIds.length);
  return studentIds.slice(0, count).map((userId) => {
    const user = previewUsers.find((entry) => entry.id === userId)!;
    return {
      id: `${classId}_${userId}`,
      academyId: ACADEMY_ID,
      classId,
      userId,
      userDisplayName: user.displayName,
      scheduledStart: lesson?.scheduledStart,
    };
  });
}

function mockClassAttendances(classId: string): Array<FirestoreEntity<AttendanceRecord>> {
  const lesson = previewClasses.find((entry) => entry.id === classId);
  const start = lesson?.scheduledStart?.toDate() ?? new Date();
  const count = classId === TODAY_EVENING_CLASS_ID ? 8 : Math.min(lesson?.currentAttendanceCount ?? 0, studentIds.length);
  return studentIds.slice(0, count).map((userId, index) => ({
    id: `att-${classId}-${userId}`,
    academyId: ACADEMY_ID,
    classId,
    userId,
    checkInMethod: index % 4 === 3 ? 'manual' : 'qr',
    checkedInBy: userId,
    countsAsAttendance: index !== 5,
    nonCountingReason: index === 5 ? 'beginner_class_belt' : undefined,
    classStartAt: lesson?.scheduledStart,
    checkedInAt: ts(new Date(start.getTime() + (index + 1) * 60_000)),
  }));
}

const pastClassIds = previewClasses
  .filter((lesson) => lesson.status === 'finished' && lesson.description === 'iniciante')
  .map((lesson) => lesson.id);

(globalThis as { __LEVEL_PREVIEW_DATA__?: Record<string, unknown> }).__LEVEL_PREVIEW_DATA__ = {
  subscribeToClassAttendances: (classId: string, _academyId: string, listener: (records: unknown[]) => void) => {
    listener(mockClassAttendances(classId));
    return () => undefined;
  },
  subscribeToClassRsvps: (classId: string, _academyId: string, listener: (records: unknown[]) => void) => {
    listener(mockRsvps(classId));
    return () => undefined;
  },
  subscribeToUserClassRsvps: (_academyId: string, userId: string, listener: (records: unknown[]) => void) => {
    listener(pastClassIds.slice(0, 2).map((classId) => {
      const lesson = previewClasses.find((entry) => entry.id === classId)!;
      return { id: `${classId}_${userId}`, academyId: ACADEMY_ID, classId, userId, userDisplayName: previewStudent.displayName, scheduledStart: lesson.scheduledStart };
    }));
    return () => undefined;
  },
  getMyClassRsvp: (classId: string) => Promise.resolve(classId === TODAY_EVENING_CLASS_ID),
};

// ─── Telas ──────────────────────────────────────────────────────────────────
type PreviewRole = 'student' | 'staff';

interface ScreenDef {
  id: string;
  role: PreviewRole;
  tab: string;
  label: string;
  overlay?: 'checkin' | 'checkin-link' | 'celebration';
  variant?: 'black' | 'empty';
}

const SCREENS: ScreenDef[] = [
  { id: 'aluno-inicio', role: 'student', tab: 'home', label: 'Aluno · Início' },
  { id: 'aluno-aulas', role: 'student', tab: 'calendar', label: 'Aluno · Aulas' },
  { id: 'aluno-evolucao', role: 'student', tab: 'evolution', label: 'Aluno · Evolução' },
  { id: 'aluno-evolucao-preta', role: 'student', tab: 'evolution', label: 'Aluno · Evolução (faixa preta)', variant: 'black' },
  { id: 'aluno-competicao', role: 'student', tab: 'competition', label: 'Aluno · Competição' },
  { id: 'aluno-avisos', role: 'student', tab: 'notifications', label: 'Aluno · Avisos' },
  { id: 'aluno-avisos-vazio', role: 'student', tab: 'notifications', label: 'Aluno · Avisos (vazio)', variant: 'empty' },
  { id: 'aluno-checkin', role: 'student', tab: 'home', label: 'Aluno · Check-in (câmera)', overlay: 'checkin' },
  { id: 'aluno-checkin-link', role: 'student', tab: 'home', label: 'Aluno · Check-in (pelo link do QR)', overlay: 'checkin-link' },
  { id: 'aluno-celebracao', role: 'student', tab: 'home', label: 'Aluno · Celebração de graduação', overlay: 'celebration' },
  { id: 'prof-inicio', role: 'staff', tab: 'home', label: 'Professor · Início' },
  { id: 'prof-calendario', role: 'staff', tab: 'calendar', label: 'Professor · Calendário (toque numa aula)' },
  { id: 'prof-avisos', role: 'staff', tab: 'notifications', label: 'Professor · Avisos' },
];

const noopAsync = async () => undefined;
const delay = <T,>(value: T, ms = 700) => new Promise<T>((resolve) => { window.setTimeout(() => resolve(value), ms); });

function readParam(name: string) {
  return new URLSearchParams(window.location.search).get(name);
}

function writeParams(screenId: string, dark: boolean) {
  const params = new URLSearchParams(window.location.search);
  params.set('preview', 'redesign');
  params.set('screen', screenId);
  if (dark) params.set('theme', 'dark'); else params.delete('theme');
  window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
}

const RedesignPreview: React.FC = () => {
  const { language, setLanguage } = useI18n();
  const [screenId, setScreenId] = useState(() => {
    const fromUrl = readParam('screen');
    return SCREENS.some((screen) => screen.id === fromUrl) ? fromUrl! : SCREENS[0].id;
  });
  const [dark, setDark] = useState(() => readParam('theme') === 'dark');
  const [menuOpen, setMenuOpen] = useState(() => readParam('menu') !== '0' && !readParam('screen'));
  const [overlayClosed, setOverlayClosed] = useState(false);
  const screen = SCREENS.find((entry) => entry.id === screenId) ?? SCREENS[0];

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    writeParams(screenId, dark);
  }, [dark, screenId]);

  useEffect(() => {
    setOverlayClosed(false);
    window.scrollTo(0, 0);
  }, [screenId]);

  const studentRecord: FirestoreEntity<UserRecord> = useMemo(() => (
    screen.variant === 'black'
      ? { ...previewStudent, belt: 'black', stripes: 3, grade: 3, attendanceCount: 900, lastGraduationDateOverride: ts(new Date(2015, 2, 1)) }
      : previewStudent
  ), [screen.variant]);
  const student = useMemo(() => toUiUser({ id: studentRecord.id, user: studentRecord, graduations: previewGraduations, fights: previewFights }), [studentRecord]);
  const professor = useMemo(() => toUiUser({ id: previewProfessor.id, user: previewProfessor, graduations: [], fights: [] }), []);

  const now = new Date();
  const classStartById = new Map(previewClasses.map((lesson) => [lesson.id, lesson.scheduledStart!.toDate()]));
  const monthAttendances = previewStudentAttendances.filter((entry) => {
    const date = entry.classStartAt?.toDate();
    return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const attendanceDays = [...new Set(monthAttendances.map((entry) => entry.classStartAt!.toDate().getDate()))];
  const commitment = resolveMonthlyCommitment({
    attendances: previewStudentAttendances,
    track: getUserProgressionSummary(student, previewAcademy.progressionRules).track,
    classStartById,
    timeZone: previewAcademy.timezone,
    now,
  });

  const goTab = (tab: string) => {
    const target = SCREENS.find((entry) => entry.role === screen.role && entry.tab === tab && !entry.overlay && !entry.variant)
      ?? (tab === 'graduation' ? SCREENS.find((entry) => entry.id === 'aluno-evolucao') : undefined);
    if (target) setScreenId(target.id);
  };

  const shell: RedesignShellValue = {
    role: screen.role,
    unitLabel: previewAcademy.name,
    unreadCount: screen.role === 'student' && screen.variant !== 'empty' ? 1 : 0,
    openNotifications: () => goTab('notifications'),
    goBack: () => goTab('home'),
    navigate: goTab,
    timeZone: previewAcademy.timezone,
    firstName: screen.role === 'staff' ? previewProfessor.firstName : previewStudent.firstName,
  };

  const professors = previewUsers.filter((user) => user.role === 'professor').map((user) => ({ id: user.id, displayName: user.displayName }));
  const lessonTonight = previewClasses.find((lesson) => lesson.id === TODAY_EVENING_CLASS_ID) ?? null;

  const renderScreen = () => {
    if (screen.role === 'student') {
      switch (screen.tab) {
        case 'calendar':
          return (
            <CalendarView
              userRole={UserRole.ALUNO}
              currentUserId={student.id}
              currentUserName={student.name}
              currentUserBelt={student.belt}
              currentUserStripes={student.stripes}
              professors={professors}
              classes={previewClasses}
              attendances={previewStudentAttendances}
              attendanceRequests={[]}
              attendanceRate={72}
              onCreateClass={async () => ({ requestedCount: 0, createdCount: 0, skippedCount: 0, skipped: [] }) as never}
              onEditClass={async () => ({}) as never}
              onDeleteClass={async () => ({}) as never}
              onStartClass={async () => ({}) as never}
              onFinishClass={noopAsync}
              onRefreshQr={async () => ({}) as never}
              onRegisterAttendance={async () => delay(null)}
              onSubmitAttendanceRequest={noopAsync}
              onStartCheckin={() => setScreenId('aluno-checkin')}
            />
          );
        case 'evolution':
        case 'competition':
          return (
            <EvolutionView
              key={screen.id}
              initialSegment={screen.tab === 'competition' ? 'competition' : 'graduation'}
              graduation={{ user: student, profile: studentRecord, academy: previewAcademy, graduations: previewGraduations }}
              competition={{ userRole: UserRole.ALUNO, competitions: previewCompetitions, fights: previewFights, videoLibrary: [], submissions: [] }}
              attendances={previewStudentAttendances}
              attendanceRequests={[]}
              classes={previewClasses}
              academyTimeZone={previewAcademy.timezone}
            />
          );
        case 'notifications':
          return renderNotifications(UserRole.ALUNO, student.id, screen.variant === 'empty' ? [] : previewNotifications);
        default:
          return (
            <HomeView
              user={student}
              monthlyAttendanceCount={monthAttendances.filter((entry) => entry.countsAsAttendance !== false).length}
              commitment={commitment}
              attendanceDays={attendanceDays}
              progressionRules={previewAcademy.progressionRules}
              classes={previewClasses}
              attendances={previewStudentAttendances}
              attendanceRequests={[]}
              academyTimeZone={previewAcademy.timezone}
              onStartCheckin={() => setScreenId('aluno-checkin')}
              onOpenEvolution={() => goTab('evolution')}
              onOpenClasses={() => goTab('calendar')}
            />
          );
      }
    }

    switch (screen.tab) {
      case 'calendar':
        return (
          <CalendarView
            userRole={UserRole.PROFESSOR}
            currentUserId={professor.id}
            currentUserName={professor.name}
            professors={professors}
            classes={previewClasses}
            attendances={[]}
            attendanceRequests={previewAttendanceRequests}
            academyStudents={previewUsers.filter((user) => user.role === 'student')}
            progressionRules={previewAcademy.progressionRules}
            onCreateClass={async () => delay({ requestedCount: 1, createdCount: 1, skippedCount: 0, skipped: [] }) as never}
            onEditClass={async () => delay({ requestedCount: 1, updatedCount: 1, skippedCount: 0, skipped: [] }) as never}
            onDeleteClass={async () => delay({ requestedCount: 1, deletedCount: 1, skippedCount: 0, skipped: [] }) as never}
            onStartClass={async (classId) => delay({
              classId,
              academyId: ACADEMY_ID,
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              qrValue: 'preview',
              qrToken: 'preview-token-123',
            })}
            onFinishClass={async () => { await delay(undefined); }}
            onRefreshQr={async (classId) => delay({
              classId,
              academyId: ACADEMY_ID,
              expiresAt: new Date(Date.now() + 120_000).toISOString(),
              qrValue: 'preview',
              qrToken: `preview-token-${Date.now()}`,
            })}
            onRegisterAttendance={async () => delay(null)}
            onSubmitAttendanceRequest={noopAsync}
            onMarkStudentPresent={async () => { await delay(undefined); }}
            onRemoveStudentPresent={async () => { await delay(undefined); }}
            onOpenStudent={() => undefined}
          />
        );
      case 'notifications':
        return renderNotifications(UserRole.PROFESSOR, professor.id, previewNotifications);
      default:
        return (
          <StaffDashboardView
            user={professor}
            academy={previewAcademy}
            academyUsers={previewUsers}
            classes={previewClasses}
            notifications={previewNotifications}
            joinRequests={previewJoinRequests}
            attendanceRequests={previewAttendanceRequests}
            graduationRequests={previewGraduationRequests}
            fightVideoSubmissions={[]}
            onNavigateToPending={() => goTab('notifications')}
            onNavigateToClasses={() => goTab('calendar')}
            onStartClass={async () => { await delay(undefined); goTab('calendar'); }}
          />
        );
    }
  };

  function renderNotifications(role: UserRole, userId: string, notifications: typeof previewNotifications) {
    return (
      <NotificationsView
        academy={previewAcademy}
        userRole={role}
        currentUserId={userId}
        academyUsers={previewUsers}
        classes={previewClasses}
        notifications={notifications}
        broadcasts={role === UserRole.ALUNO ? [] : previewBroadcasts}
        joinRequests={role === UserRole.ALUNO ? [] : previewJoinRequests}
        attendanceRequests={role === UserRole.ALUNO ? [] : previewAttendanceRequests}
        graduationRequests={role === UserRole.ALUNO ? [] : previewGraduationRequests}
        fightVideoSubmissions={[]}
        canActionRequests={role !== UserRole.ALUNO}
        onSendNotification={async () => delay({ recipientCount: 86, tokenCount: 70, pushSent: 68, pushFailed: 2 }) as never}
        onMarkRead={noopAsync}
        onClearNotifications={async () => ({ deleted: 0 })}
        onApproveJoinRequest={noopAsync}
        onRejectJoinRequest={noopAsync}
        onApproveAttendanceRequest={noopAsync}
        onRejectAttendanceRequest={noopAsync}
        onApproveGraduationRequest={noopAsync}
        onApproveFightVideoSubmission={noopAsync}
        onRejectFightVideoSubmission={noopAsync}
      />
    );
  }

  const ownsHeader = ['home', 'calendar', 'evolution', 'competition', 'notifications'].includes(screen.tab);
  const showOverlay = screen.overlay && !overlayClosed;

  return (
    <RedesignShellProvider value={shell}>
      <Layout
        activeTab={screen.tab}
        setActiveTab={goTab}
        userRole={screen.role === 'staff' ? UserRole.PROFESSOR : UserRole.ALUNO}
        unreadNotificationsCount={shell.unreadCount}
        mobileUnitLabel={previewAcademy.name}
        isDarkMode={dark}
        screenOwnsHeader={ownsHeader}
      >
        {renderScreen()}
      </Layout>

      {showOverlay && (screen.overlay === 'checkin' || screen.overlay === 'checkin-link') ? (
        <CheckInScreen
          lesson={lessonTonight}
          classId={lessonTonight?.id ?? null}
          initialToken={screen.overlay === 'checkin-link' ? 'preview-token-123' : null}
          user={student}
          progressionRules={previewAcademy.progressionRules}
          nonCountingReason={previewNonCountingReason({
            classDescription: lessonTonight?.description,
            classStart: lessonTonight?.scheduledStart?.toDate() ?? null,
            belt: studentRecord.belt,
            stripes: studentRecord.stripes,
            attendances: previewStudentAttendances,
          })}
          alreadyCheckedIn={false}
          hasPendingRequest={false}
          onRegister={async () => delay(null)}
          onRequestAttendance={noopAsync}
          onClose={() => setOverlayClosed(true)}
          onOpenCalendar={() => goTab('calendar')}
          onFinish={() => setOverlayClosed(true)}
          timeZone={previewAcademy.timezone}
        />
      ) : null}

      {showOverlay && screen.overlay === 'celebration' ? (
        <GraduationCelebrationModal
          graduation={{ ...previewGraduations[0], id: 'celebration', newBelt: 'blue', newStripes: 0, previousBelt: 'white', previousStripes: 4 }}
          studentName={student.name}
          onClose={() => setOverlayClosed(true)}
          onOpenGraduation={() => setScreenId('aluno-evolucao')}
        />
      ) : null}

      {/* Seletor da galeria */}
      <div className="rd-preview" data-open={menuOpen ? 'true' : 'false'}>
        <button type="button" className="rd-preview__toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
          {menuOpen ? '×' : 'Telas'}
        </button>
        {menuOpen ? (
          <div className="rd-preview__panel">
            <p className="rd-preview__title">Galeria do redesign</p>
            <p className="rd-preview__note">Dados de exemplo. Nada é gravado no Firebase.</p>
            {(['student', 'staff'] as PreviewRole[]).map((role) => (
              <div key={role} className="rd-preview__group">
                <p className="rd-preview__group-title">{role === 'student' ? 'Aluno' : 'Professor'}</p>
                {SCREENS.filter((entry) => entry.role === role).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`rd-preview__item ${entry.id === screen.id ? 'is-active' : ''}`.trim()}
                    onClick={() => { setScreenId(entry.id); setMenuOpen(false); }}
                  >
                    {entry.label.replace(/^(Aluno|Professor) · /, '')}
                  </button>
                ))}
              </div>
            ))}
            <div className="rd-preview__row">
              <button type="button" className="rd-preview__item" onClick={() => setDark((value) => !value)}>
                {dark ? 'Tema claro' : 'Tema escuro'}
              </button>
              <select className="rd-preview__select" value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
                {SUPPORTED_LANGUAGES.map((entry) => <option key={entry.code} value={entry.code}>{entry.short}</option>)}
              </select>
            </div>
          </div>
        ) : null}
      </div>

      <style>{`
        .rd-preview { position: fixed; right: 4px; top: 50%; transform: translateY(-50%); z-index: 400; font-family: var(--font-body); }
        .rd-preview__toggle { writing-mode: vertical-rl; padding: 12px 6px; border: 0; border-radius: 12px; background: #16161e; color: #f0b429; font-weight: 800; font-size: 12px; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
        .rd-preview[data-open='true'] .rd-preview__toggle { writing-mode: horizontal-tb; position: absolute; top: -40px; right: 0; width: 32px; height: 32px; padding: 0; font-size: 20px; }
        .rd-preview__panel { width: 260px; max-height: 80vh; overflow-y: auto; padding: 14px; border-radius: 18px; background: #ffffff; color: #10131a; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
        .rd-preview__title { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: 16px; }
        .rd-preview__note { margin: 2px 0 10px; font-size: 12px; color: #606a7f; }
        .rd-preview__group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
        .rd-preview__group-title { margin: 0 0 2px; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #533517; }
        .rd-preview__item { padding: 8px 10px; border: 1px solid #e2e5ec; border-radius: 10px; background: #fff; color: #10131a; font-size: 13px; font-weight: 700; text-align: left; cursor: pointer; }
        .rd-preview__item.is-active { background: #f0b429; border-color: #f0b429; color: #1a1300; }
        .rd-preview__row { display: flex; gap: 6px; }
        .rd-preview__row .rd-preview__item { flex: 1; text-align: center; }
        .rd-preview__select { border: 1px solid #e2e5ec; border-radius: 10px; padding: 0 6px; font-weight: 700; }
      `}</style>
    </RedesignShellProvider>
  );
};

export default RedesignPreview;
