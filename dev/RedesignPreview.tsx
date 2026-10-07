// Galeria do redesign: http://localhost:3000/?preview=redesign (desenvolvimento) e o build de
// demonstracao para o cliente (`npm run build:demo`). index.tsx so carrega este arquivo nesses dois
// casos. Simula a visao do aluno e a do professor com dados ficticios, sem login e sem gravar nada.
import React, { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import Layout from '../components/Layout';
import CheckInScreen from '../components/redesign/CheckInScreen';
import SignupWizard from '../components/redesign/SignupWizard';
import { RedesignShellProvider, type RedesignShellValue } from '../components/redesign/ShellContext';
import GraduationCelebrationModal from '../components/GraduationCelebrationModal';
import CalendarView from '../views/CalendarView';
import EvolutionView from '../views/EvolutionView';
import HomeView from '../views/HomeView';
import LearningHubView from '../views/LearningHubView';
import ManagementView from '../views/ManagementView';
import NotificationsView from '../views/NotificationsView';
import ProfileView from '../views/ProfileView';
import StaffDashboardView from '../views/StaffDashboardView';
import StudentsView from '../views/StudentsView';
import { getBeltOptions, getUserProgressionSummary, inferKidsCategoryFromBirthDate, inferTrainingTypeFromBirthDate, kidsCategoryLabel } from '../beltCatalog';
import { resolveMonthlyCommitment } from '../commitmentScale';
import { previewNonCountingReason } from '../classRules';
import { toUiUser } from '../services/firebase/adapters';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, ClassRsvpRecord, UserRecord } from '../services/firebase/models';
import { UserRole } from '../types';
import { SUPPORTED_LANGUAGES, t, useI18n } from '../i18n';
import { publicAsset } from '../publicAsset';
import {
  ACADEMY_ID,
  TODAY_EVENING_CLASS_ID,
  previewAcademy,
  previewAcademyAttendances,
  previewAttendanceRequests,
  previewBroadcasts,
  previewClasses,
  previewCompetitions,
  previewFights,
  previewGraduationRequests,
  previewGraduations,
  previewHistoryClasses,
  previewJoinRequests,
  previewLearningBlocks,
  previewLearningCourses,
  previewLearningLessons,
  previewLearningProgress,
  previewLearningQuizzes,
  previewLearningTracks,
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
  // Detalhe do aluno (Academia): historico de presencas e graduacoes do aluno aberto.
  subscribeToUserAttendances: (_academyId: string, userId: string, listener: (records: unknown[]) => void) => {
    listener(userId === previewStudent.id
      ? previewStudentAttendances
      : previewAcademyAttendances.filter((entry) => entry.userId === userId));
    return () => undefined;
  },
  subscribeToUserGraduations: (_academyId: string, userId: string, listener: (records: unknown[]) => void) => {
    listener(userId === previewStudent.id ? previewGraduations : []);
    return () => undefined;
  },
};

const isDemoBuild = import.meta.env.VITE_DEMO_PREVIEW === 'true';

// ─── Telas ──────────────────────────────────────────────────────────────────
type PreviewRole = 'student' | 'staff';

interface ScreenDef {
  id: string;
  role: PreviewRole;
  tab: string;
  label: string;
  overlay?: 'checkin' | 'checkin-link' | 'celebration';
  variant?: 'black' | 'empty' | 'ranking';
}

const SCREENS: ScreenDef[] = [
  { id: 'aluno-cadastro', role: 'student', tab: 'signup', label: 'Aluno · Cadastro' },
  { id: 'aluno-inicio', role: 'student', tab: 'home', label: 'Aluno · Início' },
  { id: 'aluno-aulas', role: 'student', tab: 'calendar', label: 'Aluno · Aulas' },
  { id: 'aluno-evolucao', role: 'student', tab: 'evolution', label: 'Aluno · Evolução' },
  { id: 'aluno-evolucao-preta', role: 'student', tab: 'evolution', label: 'Aluno · Evolução (faixa preta)', variant: 'black' },
  { id: 'aluno-competicao', role: 'student', tab: 'competition', label: 'Aluno · Competição' },
  { id: 'aluno-learning', role: 'student', tab: 'learning', label: 'Aluno · Learning' },
  { id: 'aluno-perfil', role: 'student', tab: 'profile', label: 'Aluno · Perfil' },
  { id: 'aluno-avisos', role: 'student', tab: 'notifications', label: 'Aluno · Avisos' },
  { id: 'aluno-avisos-vazio', role: 'student', tab: 'notifications', label: 'Aluno · Avisos (vazio)', variant: 'empty' },
  { id: 'aluno-checkin', role: 'student', tab: 'home', label: 'Aluno · Check-in (câmera)', overlay: 'checkin' },
  { id: 'aluno-checkin-link', role: 'student', tab: 'home', label: 'Aluno · Check-in (pelo link do QR)', overlay: 'checkin-link' },
  { id: 'aluno-celebracao', role: 'student', tab: 'home', label: 'Aluno · Celebração de graduação', overlay: 'celebration' },
  { id: 'prof-inicio', role: 'staff', tab: 'home', label: 'Professor · Início' },
  { id: 'prof-calendario', role: 'staff', tab: 'calendar', label: 'Professor · Calendário (toque numa aula)' },
  { id: 'prof-academia', role: 'staff', tab: 'management', label: 'Professor · Academia' },
  { id: 'prof-ranking', role: 'staff', tab: 'students', label: 'Professor · Ranking', variant: 'ranking' },
  { id: 'prof-aluno', role: 'staff', tab: 'students', label: 'Professor · Detalhe do aluno' },
  { id: 'prof-avisos', role: 'staff', tab: 'notifications', label: 'Professor · Avisos' },
  { id: 'prof-learning', role: 'staff', tab: 'learning', label: 'Professor · Learning' },
  { id: 'prof-perfil', role: 'staff', tab: 'profile', label: 'Professor · Perfil' },
];

// Tela inicial: escolher a visao (aluno ou professor).
const CHOOSER_ID = 'escolha';

const noopAsync = async () => undefined;
const delay = <T,>(value: T, ms = 700) => new Promise<T>((resolve) => { window.setTimeout(() => resolve(value), ms); });

function readParam(name: string) {
  return new URLSearchParams(window.location.search).get(name);
}

function writeParams(screenId: string, dark: boolean) {
  // No link de demonstracao a pagina roda num iframe isolado, onde trocar a URL lanca erro.
  if (isDemoBuild) return;
  const params = new URLSearchParams(window.location.search);
  params.set('preview', 'redesign');
  params.set('screen', screenId);
  if (dark) params.set('theme', 'dark'); else params.delete('theme');
  try {
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  } catch {
    // Sem permissao para reescrever a URL: a galeria segue funcionando.
  }
}

// Cadastro do aluno com estado local: unidades ficticias e envio simulado (nada vai ao Firebase).
const PreviewSignup: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [cpf, setCpf] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [belt, setBelt] = useState('white');
  const [grade, setGrade] = useState(0);
  const [isCompetitor, setIsCompetitor] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const trainingType = inferTrainingTypeFromBirthDate(birthDate);
  const kidsCategory = inferKidsCategoryFromBirthDate(birthDate);
  const beltOptions = getBeltOptions(trainingType, kidsCategory);
  useEffect(() => {
    if (!beltOptions.some((option) => option.value === belt)) {
      setBelt(beltOptions[0]?.value ?? 'white');
      setGrade(0);
    }
  }, [belt, beltOptions]);
  const academies = [
    { academyId: ACADEMY_ID, name: previewAcademy.name },
    { academyId: 'preview-level-taquaral', name: 'Level Taquaral Campinas' },
    { academyId: 'preview-level-valinhos', name: 'Level Valinhos' },
  ];

  if (sent) {
    return (
      <div className="rd-signup">
        <div className="rd-signup__frame">
          <div className="rd-signup__success">
            <div className="rd-signup__done-mark" aria-hidden="true">✓</div>
            <h1 className="rd-signup__title rd-signup__title--center">{t('Cadastro enviado')}</h1>
            <p className="rd-signup__lead rd-signup__lead--center">
              {t('Cadastro enviado com sucesso. Cada unidade selecionada vai analisar sua solicitação separadamente — você receberá uma notificação assim que algum professor aprovar.')}
            </p>
          </div>
          <div className="rd-signup__footer">
            <button type="button" className="rd-signup__continue" onClick={onExit}>{t('Voltar para o login')}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SignupWizard
      firstName={firstName}
      onFirstNameChange={setFirstName}
      lastName={lastName}
      onLastNameChange={setLastName}
      birthDate={birthDate}
      onBirthDateChange={setBirthDate}
      cpf={cpf}
      onCpfChange={setCpf}
      trackLabel={trainingType === 'Kids' ? `${t('Kids')} · ${kidsCategoryLabel(kidsCategory)}` : t(trainingType)}
      academyOptions={academies}
      academyLoading={false}
      selectedAcademyIds={selected}
      onToggleAcademy={(id) => setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))}
      manualAcademyId=""
      onManualAcademyIdChange={() => undefined}
      onRetryAcademies={() => undefined}
      academyIdsForSubmit={selected}
      beltOptions={beltOptions}
      belt={belt}
      onBeltChange={setBelt}
      grade={grade}
      onGradeChange={setGrade}
      isCompetitor={isCompetitor}
      onCompetitorChange={setIsCompetitor}
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
      passwordError={(value) => (value.length < 8
        ? t('A senha deve ter no mínimo 8 caracteres.')
        : !/[0-9]/.test(value) ? t('A senha deve conter pelo menos um número.') : '')}
      busy={busy}
      error=""
      onSubmit={async () => {
        setBusy(true);
        await delay(undefined, 900);
        setBusy(false);
        setSent(true);
      }}
      onBackToLogin={onExit}
    />
  );
};

const RedesignPreview: React.FC = () => {
  const { language, setLanguage } = useI18n();
  const [screenId, setScreenId] = useState(() => {
    const fromUrl = readParam('screen');
    return fromUrl === CHOOSER_ID || SCREENS.some((screen) => screen.id === fromUrl) ? fromUrl! : CHOOSER_ID;
  });
  const [dark, setDark] = useState(() => readParam('theme') === 'dark');
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlayClosed, setOverlayClosed] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('aluno-marina');
  const isChooser = screenId === CHOOSER_ID;
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

  const professorAttendances = previewStudentAttendances.slice(0, 9).map((entry) => ({ ...entry, id: `prof-${entry.id}`, userId: previewProfessor.id }));
  const professorCommitment = resolveMonthlyCommitment({
    attendances: professorAttendances,
    track: getUserProgressionSummary(toUiUser({ id: previewProfessor.id, user: previewProfessor, graduations: [], fights: [] }), previewAcademy.progressionRules).track,
    classStartById,
    timeZone: previewAcademy.timezone,
    now,
  });

  const goTab = (tab: string) => {
    const target = SCREENS.find((entry) => entry.role === screen.role && entry.tab === tab && !entry.overlay && !entry.variant)
      ?? (tab === 'graduation' ? SCREENS.find((entry) => entry.id === 'aluno-evolucao') : undefined);
    if (target) setScreenId(target.id);
  };
  const openStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    setScreenId('prof-aluno');
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

  const rosterClasses = [...previewClasses, ...previewHistoryClasses];
  const professors = previewUsers.filter((user) => user.role === 'professor').map((user) => ({ id: user.id, displayName: user.displayName }));
  const toUi = (record: FirestoreEntity<UserRecord>) => toUiUser({ id: record.id, user: record, graduations: [], fights: [] });
  const activeStudents = previewUsers.filter((user) => user.role === 'student' && user.status !== 'suspended').map(toUi);
  const suspendedStudents = previewUsers.filter((user) => user.role === 'student' && user.status === 'suspended').map(toUi);
  const studentClassNames = new Map<string, string>([
    ...previewClasses.map((lesson) => [lesson.id, lesson.title] as [string, string]),
    ...previewStudentAttendances.map((entry) => [entry.classId, 'Iniciante'] as [string, string]),
  ]);
  const studentClassStarts = new Map<string, Date>([
    ...classStartById,
    ...previewStudentAttendances.map((entry) => [entry.classId, entry.classStartAt!.toDate()] as [string, Date]),
  ]);
  const saveDelay = async () => { await delay(undefined); };
  const learningHandlers = {
    onUpsertTrack: async () => delay({ trackId: 'track-fundamentos' }),
    onUpsertCourse: async () => delay({ courseId: 'course-base', trackId: 'track-fundamentos' }),
    onUpsertLesson: async () => delay({ lessonId: 'lesson-queda', courseId: 'course-base', trackId: 'track-fundamentos' }),
    onDeleteTrack: async (trackId: string) => delay({ trackId }),
    onDeleteCourse: async (courseId: string) => delay({ courseId }),
    onDeleteLesson: async (lessonId: string) => delay({ lessonId }),
    onBackfillAudience: async () => delay({ trackCount: 1 }),
    onReplaceLessonBlocks: async () => delay({}) as never,
    onUpsertQuiz: async () => delay({}) as never,
    onUploadLearningAsset: async () => delay({}) as never,
    onRecordPlayback: async () => ({ contentCompletionPercent: 100, contentCompleted: true, quizReady: true }),
    onMarkBlockComplete: async () => delay({ contentCompletionPercent: 100, contentCompleted: true, lessonCompleted: false, quizReady: true }),
    onStartQuiz: async (lessonId: string) => {
      const quiz = previewLearningQuizzes.find((entry) => entry.lessonId === lessonId);
      return delay({
        questions: (quiz?.questions ?? []).map((question, index) => ({ id: `q${index}`, prompt: question.prompt, options: question.options })),
        passingScore: quiz?.passingScore ?? 70,
        attemptCount: 0,
      });
    },
    onSubmitQuiz: async ({ lessonId, answers }: { lessonId: string; answers: number[] }) => {
      const quiz = previewLearningQuizzes.find((entry) => entry.lessonId === lessonId);
      const questions = quiz?.questions ?? [];
      const correct = questions.filter((question, index) => question.correctOptionIndex === answers[index]).length;
      const scorePercent = questions.length ? Math.round((correct / questions.length) * 100) : 100;
      return delay({ scorePercent, passed: scorePercent >= (quiz?.passingScore ?? 70) });
    },
  };
  const renderLearning = (role: UserRole, viewer: FirestoreEntity<UserRecord>) => (
    <LearningHubView
      academyName={previewAcademy.name}
      userName={viewer.displayName}
      userRole={role}
      viewerRole={viewer.role}
      viewerBelt={viewer.belt}
      selectedAcademyId={ACADEMY_ID}
      selectedAcademy={previewAcademy}
      academies={[previewAcademy]}
      allUsers={previewUsers}
      academyUsers={previewUsers}
      tracks={previewLearningTracks}
      courses={previewLearningCourses}
      lessons={previewLearningLessons}
      lessonBlocks={previewLearningBlocks}
      quizzes={previewLearningQuizzes}
      progressRecords={viewer.id === previewStudent.id ? previewLearningProgress : []}
      {...learningHandlers}
    />
  );
  const renderProfile = (viewer: typeof student, record: FirestoreEntity<UserRecord>, isStudentViewer: boolean) => (
    <ProfileView
      user={viewer}
      progressionRules={previewAcademy.progressionRules}
      profile={record}
      totalClasses={record.attendanceCount}
      commitment={isStudentViewer ? commitment : professorCommitment}
      academyName={previewAcademy.name}
      attendanceRate={isStudentViewer ? 72 : 58}
      attendances={isStudentViewer ? previewStudentAttendances : professorAttendances}
      classNameById={studentClassNames}
      classStartById={studentClassStarts}
      graduations={isStudentViewer ? previewGraduations : []}
      isDarkMode={dark}
      onSetThemeMode={(mode) => setDark(mode === 'dark')}
      onSaveProfile={saveDelay}
      onChangeEmail={saveDelay}
      onDeleteAccount={isStudentViewer ? saveDelay : undefined}
      onOpenNotifications={() => goTab('notifications')}
      onLogout={() => setScreenId(CHOOSER_ID)}
      studentMemberships={isStudentViewer ? [ACADEMY_ID] : undefined}
      availableAcademiesForRequest={isStudentViewer ? [] : undefined}
      onRequestAdditionalAcademy={isStudentViewer ? saveDelay : undefined}
    />
  );
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
        case 'learning':
          return renderLearning(UserRole.ALUNO, studentRecord);
        case 'profile':
          return renderProfile(student, studentRecord, true);
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
            onOpenStudent={openStudent}
          />
        );
      case 'notifications':
        return renderNotifications(UserRole.PROFESSOR, professor.id, previewNotifications);
      case 'learning':
        return renderLearning(UserRole.PROFESSOR, previewProfessor);
      case 'profile':
        return renderProfile(professor, previewProfessor, false);
      case 'management':
        return (
          <ManagementView
            userRole={UserRole.PROFESSOR}
            academy={previewAcademy}
            classes={rosterClasses}
            academyUsers={previewUsers}
            academies={[previewAcademy]}
            allUsers={previewUsers}
            rankingAttendances={previewAcademyAttendances}
            studentVideoLibraryById={new Map()}
            selectedAcademyId={ACADEMY_ID}
            onUpdateAcademy={saveDelay}
            onCreateAcademy={async () => delay({ academyId: ACADEMY_ID })}
            onCreateUser={saveDelay}
            onUpdateStudentBeltGrade={saveDelay}
            onSetStudentAttendanceBonus={saveDelay}
            onAdminUpdateStudentProfile={saveDelay}
            onAdminUpdateStudentTimeline={saveDelay}
            onAdminUpdateStudentPhoto={saveDelay}
            onUpdateInstructor={saveDelay}
          />
        );
      case 'students':
        return (
          <StudentsView
            key={screen.id}
            focusSection={screen.variant === 'ranking' ? 'ranking' : null}
            students={activeStudents}
            deactivatedStudents={suspendedStudents}
            progressionRules={previewAcademy.progressionRules}
            graduationRequests={previewGraduationRequests}
            rankingAttendances={previewAcademyAttendances}
            classes={rosterClasses}
            academyName={previewAcademy.name}
            academies={[{ id: ACADEMY_ID, name: previewAcademy.name }]}
            selectedAcademyId={ACADEMY_ID}
            requireAcademySelection={false}
            selectedStudentId={screen.variant === 'ranking' ? '' : selectedStudentId}
            onSelectStudent={(studentId) => {
              setSelectedStudentId(studentId);
              if (studentId && screen.variant === 'ranking') setScreenId('prof-aluno');
            }}
            onApproveGraduationRequest={saveDelay}
            onUpdateStudentBeltGrade={saveDelay}
            onSetStudentAttendanceBonus={saveDelay}
            onAdminUpdateStudentProfile={saveDelay}
            onAdminUpdateStudentTimeline={saveDelay}
            onAdminUpdateStudentPhoto={saveDelay}
            onDeactivateStudent={saveDelay}
            onActivateStudent={saveDelay}
            viewerRole="professor"
          />
        );
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
            onOpenStudent={openStudent}
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

  const ownsHeader = ['home', 'calendar', 'evolution', 'competition', 'notifications', 'profile'].includes(screen.tab);
  const showOverlay = screen.overlay && !overlayClosed;

  const galleryMenu = (
    <div className="rd-preview" data-open={menuOpen ? 'true' : 'false'}>
      <button type="button" className="rd-preview__toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
        {menuOpen ? '×' : t('Telas')}
      </button>
      {menuOpen ? (
        <div className="rd-preview__panel">
          <p className="rd-preview__title">{t('Demonstração do redesign')}</p>
          <p className="rd-preview__note">{t('Dados fictícios. Nada é salvo.')}</p>
          <button
            type="button"
            className="rd-preview__item rd-preview__item--switch"
            onClick={() => { setScreenId(CHOOSER_ID); setMenuOpen(false); }}
          >
            {t('Trocar visão (aluno / professor)')}
          </button>
          {(['student', 'staff'] as PreviewRole[]).map((role) => (
            <div key={role} className="rd-preview__group">
              <p className="rd-preview__group-title">{role === 'student' ? t('Aluno') : t('Professor')}</p>
              {SCREENS.filter((entry) => entry.role === role).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`rd-preview__item ${!isChooser && entry.id === screen.id ? 'is-active' : ''}`.trim()}
                  onClick={() => { setScreenId(entry.id); setMenuOpen(false); }}
                >
                  {t(entry.label.replace(/^(Aluno|Professor) · /, ''))}
                </button>
              ))}
            </div>
          ))}
          <div className="rd-preview__row">
            <button type="button" className="rd-preview__item" onClick={() => setDark((value) => !value)}>
              {dark ? t('Tema claro') : t('Tema escuro')}
            </button>
            <select className="rd-preview__select" value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
              {SUPPORTED_LANGUAGES.map((entry) => <option key={entry.code} value={entry.code}>{entry.short}</option>)}
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (!isChooser && screen.tab === 'signup') {
    return (
      <>
        <PreviewSignup key={screenId} onExit={() => setScreenId(CHOOSER_ID)} />
        {galleryMenu}
        {previewStyles}
      </>
    );
  }

  if (isChooser) {
    return (
      <>
        <main className="rd-demo">
          <div className="rd-demo__inner">
            <img src={publicAsset('logo3.png')} alt="LEVEL Jiu-Jitsu" className="rd-demo__logo" />
            <p className="rd-demo__eyebrow">{t('Novo design · demonstração')}</p>
            <h1 className="rd-demo__title">{t('Escolha uma visão.')}</h1>
            <p className="rd-demo__lead">
              {t('Navegue pelo app como aluno ou como professor. Toque nas abas, abra aulas, faça check-in — tudo funciona com dados fictícios e nada é salvo.')}
            </p>
            <div className="rd-demo__choices">
              <button type="button" className="rd-demo__choice" onClick={() => setScreenId('aluno-inicio')}>
                <span className="rd-demo__choice-kicker">{t('Aluno')}</span>
                <strong>{t('Ver como aluno')}</strong>
                <span>{t('Início, aulas, check-in, evolução, learning, perfil e avisos.')}</span>
              </button>
              <button type="button" className="rd-demo__choice rd-demo__choice--ink" onClick={() => setScreenId('prof-inicio')}>
                <span className="rd-demo__choice-kicker">{t('Professor')}</span>
                <strong>{t('Ver como professor')}</strong>
                <span>{t('Início, calendário com QR e presença, academia, avisos, learning e perfil.')}</span>
              </button>
            </div>
            <button type="button" className="rd-demo__signup" onClick={() => setScreenId('aluno-cadastro')}>
              {t('Ver o cadastro do aluno (novo)')} →
            </button>
            <p className="rd-demo__hint">{t('Dica: o botão “Telas” na lateral leva direto a qualquer tela e troca a visão a qualquer momento.')}</p>
            <div className="rd-demo__prefs">
              <button type="button" className="rd-demo__pref" onClick={() => setDark((value) => !value)}>
                {dark ? t('Tema claro') : t('Tema escuro')}
              </button>
              {SUPPORTED_LANGUAGES.map((entry) => (
                <button
                  key={entry.code}
                  type="button"
                  className={`rd-demo__pref ${entry.code === language ? 'is-active' : ''}`.trim()}
                  onClick={() => setLanguage(entry.code)}
                >
                  {entry.short}
                </button>
              ))}
            </div>
          </div>
        </main>
        {previewStyles}
      </>
    );
  }

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

      {galleryMenu}
      {previewStyles}
    </RedesignShellProvider>
  );
};

const previewStyles = (
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
    .rd-preview__item--switch { width: 100%; margin-bottom: 12px; background: #16161e; border-color: #16161e; color: #ffffff; text-align: center; }
    .rd-preview__row { display: flex; gap: 6px; }
    .rd-preview__row .rd-preview__item { flex: 1; text-align: center; }
    .rd-preview__select { border: 1px solid #e2e5ec; border-radius: 10px; padding: 0 6px; font-weight: 700; }

    .rd-demo { min-height: 100dvh; display: flex; justify-content: center; padding: calc(env(safe-area-inset-top, 0px) + 32px) 16px calc(env(safe-area-inset-bottom, 0px) + 32px); background: #f0b429; color: #1a1300; font-family: var(--font-body); }
    .rd-demo__inner { width: 100%; max-width: 460px; display: flex; flex-direction: column; gap: 14px; }
    .rd-demo__logo { width: 72px; height: 72px; object-fit: contain; border-radius: 20px; background: #16161e; padding: 8px; }
    .rd-demo__eyebrow { margin: 8px 0 0; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: rgba(26,19,0,.72); }
    .rd-demo__title { margin: 0; font-family: var(--font-display); font-size: 40px; font-weight: 800; line-height: 1.02; letter-spacing: -.03em; }
    .rd-demo__lead { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.45; }
    .rd-demo__choices { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
    .rd-demo__choice { display: flex; flex-direction: column; gap: 4px; padding: 20px; border: 0; border-radius: 24px; background: #ffffff; color: #10131a; text-align: left; font-family: var(--font-body); cursor: pointer; box-shadow: 0 14px 30px rgba(26,19,0,.16); }
    .rd-demo__choice strong { font-family: var(--font-display); font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
    .rd-demo__choice span { font-size: 14px; font-weight: 600; line-height: 1.4; color: #4a5266; }
    .rd-demo__choice .rd-demo__choice-kicker { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #8a5a00; }
    .rd-demo__choice--ink { background: #16161e; color: #ffffff; }
    .rd-demo__choice--ink span { color: rgba(255,255,255,.72); }
    .rd-demo__choice--ink .rd-demo__choice-kicker { color: #f0b429; }
    .rd-demo__choice:focus-visible, .rd-demo__pref:focus-visible { outline: 3px solid #16161e; outline-offset: 3px; }
    .rd-demo__signup { align-self: flex-start; padding: 10px 0; border: 0; background: transparent; color: #1a1300; font-family: var(--font-body); font-size: 15px; font-weight: 800; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .rd-demo__hint { margin: 4px 0 0; font-size: 13px; font-weight: 700; color: rgba(26,19,0,.72); }
    .rd-demo__prefs { display: flex; flex-wrap: wrap; gap: 8px; }
    .rd-demo__pref { padding: 8px 14px; border: 1.5px solid #1a1300; border-radius: 999px; background: transparent; color: #1a1300; font-weight: 800; font-size: 13px; cursor: pointer; }
    .rd-demo__pref.is-active { background: #1a1300; color: #f0b429; }
  `}</style>
);

export default RedesignPreview;
