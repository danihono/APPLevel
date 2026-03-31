import React, { startTransition, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import Layout from './components/Layout';
import CalendarView from './views/CalendarView';
import CompetitionView from './views/CompetitionView';
import GamificationView from './views/GamificationView';
import HomeView from './views/HomeView';
import LearningHubView from './views/LearningHubView';
import LoginView from './views/LoginView';
import ManagementView from './views/ManagementView';
import NotificationsView from './views/NotificationsView';
import ProfileView from './views/ProfileView';
import StaffDashboardView from './views/StaffDashboardView';
import StoreView from './views/StoreView';
import SuperadminDashboardView from './views/SuperadminDashboardView';
import StudentsView from './views/StudentsView';
import { logout, signInWithEmail, subscribeToAuthState } from './services/firebase/auth';
import { formatDateLabel, toBranch, toProduct, toUiUser } from './services/firebase/adapters';
import {
  type FirestoreEntity,
  subscribeToAcademy,
  subscribeToAcademies,
  subscribeToAcademyClasses,
  subscribeToAcademyUsers,
  subscribeToAllUsers,
  subscribeToCompetitions,
  subscribeToNotifications,
  subscribeToRankings,
  subscribeToStoreItems,
  subscribeToUserAttendances,
  subscribeToUserFights,
  subscribeToUserGraduations,
  subscribeToUserMissions,
  subscribeToUserProfile,
} from './services/firebase/data';
import { backendFunctions } from './services/firebase/functions';
import { updateAcademySettings } from './services/firebase/mutations';
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
} from './services/firebase/models';
import { UserRole } from './types';

const THEME_STORAGE_PREFIX = 'applevel-theme';

function getErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha inválidos.';
    case 'auth/invalid-email':
      return 'Informe um e-mail válido.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.';
    case 'functions/permission-denied':
    case 'permission-denied':
      return 'Sua sessão não tem permissão para acessar este recurso.';
    case 'functions/unauthenticated':
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre novamente.';
    default:
      if (error instanceof Error && error.message) {
        return error.message;
      }

      return 'Não foi possível concluir esta operação agora.';
  }
}

function readThemePreference(scope: string): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedTheme = window.localStorage.getItem(`${THEME_STORAGE_PREFIX}:${scope}`);
  if (storedTheme === 'dark') {
    return true;
  }

  if (storedTheme === 'light') {
    return false;
  }

  return null;
}

function prefersDarkTheme() {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function buildLoadingView(message: string) {
  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <section className="app-panel app-panel--hero app-auth-side">
          <div>
            <p className="app-section-label">Applevel</p>
            <h1 className="app-section-title">Seu dojo agora tem uma cabine premium.</h1>
            <p className="app-section-copy">
              Estamos preparando a sessao, o tema e os dados da academia para abrir a experiencia completa.
            </p>
          </div>

          <div className="app-auth-bullets">
            <div className="app-auth-bullet">
              <div className="app-icon-shell">
                <span className="app-orb__dot" />
              </div>
              <div>
                <strong>Ambiente sincronizado</strong>
                <p className="app-note">{message}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="app-panel app-auth-card app-panel-pad text-center">
          <div
            className="mx-auto h-16 w-16 rounded-[1.35rem] border"
            style={{
              borderColor: 'rgba(232, 175, 72, 0.28)',
              background: 'linear-gradient(160deg, rgba(254, 234, 165, 0.96), rgba(232, 175, 72, 0.84) 42%, rgba(110, 74, 28, 0.98) 100%)',
              boxShadow: '0 24px 48px rgba(145, 97, 29, 0.24)',
            }}
          >
            <div className="h-full w-full animate-spin rounded-[1.25rem] border-4 border-black/10 border-t-black/70" />
          </div>
          <h2 className="mt-6 text-2xl font-bold">Conectando ao APPLevel</h2>
          <p className="mt-3 app-note">{message}</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.24em]" style={{ borderColor: 'rgba(232, 175, 72, 0.2)', color: 'var(--gold-mid)' }}>
            <span className="app-orb__dot" />
            Session boot
          </div>
        </section>
      </div>
    </div>
  );
}

const App: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [activeTab, setActiveTab] = useState('home');
  const [managementFocusSection, setManagementFocusSection] = useState<'master-black' | null>(null);
  const [themeScope, setThemeScope] = useState('guest');
  const [isDarkMode, setIsDarkMode] = useState(() => readThemePreference('guest') ?? prefersDarkTheme());
  const [profile, setProfile] = useState<FirestoreEntity<UserRecord> | null>(null);
  const [academy, setAcademy] = useState<FirestoreEntity<AcademyRecord> | null>(null);
  const [allAcademies, setAllAcademies] = useState<Array<FirestoreEntity<AcademyRecord>>>([]);
  const [allUsers, setAllUsers] = useState<Array<FirestoreEntity<UserRecord>>>([]);
  const [selectedAcademyId, setSelectedAcademyId] = useState('');
  const [classes, setClasses] = useState<Array<FirestoreEntity<ClassRecord>>>([]);
  const [academyUsers, setAcademyUsers] = useState<Array<FirestoreEntity<UserRecord>>>([]);
  const [attendances, setAttendances] = useState<Array<FirestoreEntity<AttendanceRecord>>>([]);
  const [rankings, setRankings] = useState<Array<FirestoreEntity<RankingRecord>>>([]);
  const [missions, setMissions] = useState<Array<FirestoreEntity<UserMissionRecord>>>([]);
  const [graduations, setGraduations] = useState<Array<FirestoreEntity<GraduationRecord>>>([]);
  const [competitions, setCompetitions] = useState<Array<FirestoreEntity<CompetitionRecord>>>([]);
  const [fights, setFights] = useState<Array<FirestoreEntity<FightRecord>>>([]);
  const [storeItems, setStoreItems] = useState<Array<FirestoreEntity<StoreItemRecord>>>([]);
  const [notifications, setNotifications] = useState<Array<FirestoreEntity<NotificationRecord>>>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [academyLoading, setAcademyLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const toggleTheme = () => setIsDarkMode((value) => !value);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);

  useEffect(() => {
    const nextScope = authUser?.uid ?? 'guest';
    if (themeScope === nextScope) {
      return;
    }

    const storedPreference = readThemePreference(nextScope);
    setThemeScope(nextScope);

    if (storedPreference !== null) {
      setIsDarkMode(storedPreference);
    }
  }, [authUser?.uid, themeScope]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(`${THEME_STORAGE_PREFIX}:${themeScope}`, isDarkMode ? 'dark' : 'light');
  }, [isDarkMode, themeScope]);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((nextUser) => {
      const syncSession = async () => {
        if (nextUser) {
          try {
            await nextUser.getIdToken(true);
          } catch (error) {
            setSessionError(getErrorMessage(error));
          }
        }

        startTransition(() => {
          setAuthUser(nextUser);
          setAuthReady(true);
        });
      };

      void syncSession();
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) {
      setProfile(null);
      setAcademy(null);
      setAllAcademies([]);
      setAllUsers([]);
      setSelectedAcademyId('');
      setClasses([]);
      setAcademyUsers([]);
      setAttendances([]);
      setRankings([]);
      setMissions([]);
      setGraduations([]);
      setCompetitions([]);
      setFights([]);
      setStoreItems([]);
      setNotifications([]);
      setSessionError('');
      return;
    }

    let active = true;
    setProfileLoading(true);
    setSessionError('');

    const unsubscribe = subscribeToUserProfile(
      authUser.uid,
      (record) => {
        if (!active) {
          return;
        }

        setProfile(record);
        setProfileLoading(false);
      },
      (error) => {
        if (!active) {
          return;
        }

        setProfileLoading(false);
        setSessionError(getErrorMessage(error));
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    let cancelled = false;

    const validateSession = async () => {
      try {
        await backendFunctions.validateSessionAccess();
        await backendFunctions.rebuildUserDerivedState({});
      } catch (error) {
        if (!cancelled) {
          setSessionError(getErrorMessage(error));
        }
      }
    };

    void validateSession();

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    if (profile.role !== 'superadmin') {
      setSelectedAcademyId(profile.academyId);
      setAllAcademies([]);
      setAllUsers([]);
      return;
    }

    const unsubscribers = [
      subscribeToAcademies(setAllAcademies, (error) => setSessionError(getErrorMessage(error))),
      subscribeToAllUsers(setAllUsers, (error) => setSessionError(getErrorMessage(error))),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.role !== 'superadmin') {
      return;
    }

    if (allAcademies.length === 0) {
      return;
    }

    if (!selectedAcademyId) {
      return;
    }

    if (allAcademies.some((entry) => entry.id === selectedAcademyId)) {
      return;
    }

    setSelectedAcademyId('');
  }, [allAcademies, profile, selectedAcademyId]);

  useEffect(() => {
    if (!profile) {
      setNotifications([]);
      return;
    }

    const scopedAcademyId = profile.role === 'superadmin'
      ? (selectedAcademyId || undefined)
      : profile.academyId;

    return subscribeToNotifications(
      {
        academyId: scopedAcademyId,
        userId: profile.id,
        includeAcademyFeed: profile.role !== 'student',
      },
      setNotifications,
      (error) => setSessionError(getErrorMessage(error)),
    );
  }, [profile, selectedAcademyId]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    const scopedAcademyId = profile.role === 'superadmin'
      ? (selectedAcademyId || profile.academyId)
      : profile.academyId;

    setAcademyLoading(true);

    const unsubscribers = [
      subscribeToAcademy(
        scopedAcademyId,
        (record) => {
          setAcademy(record);
          setAcademyLoading(false);
        },
        (error) => {
          setAcademyLoading(false);
          setSessionError(getErrorMessage(error));
        },
      ),
      subscribeToAcademyClasses(scopedAcademyId, setClasses, (error) => setSessionError(getErrorMessage(error))),
      subscribeToUserAttendances(profile.academyId, profile.id, setAttendances, (error) => setSessionError(getErrorMessage(error))),
      subscribeToRankings(scopedAcademyId, setRankings, (error) => setSessionError(getErrorMessage(error))),
      subscribeToUserMissions(profile.academyId, profile.id, setMissions, (error) => setSessionError(getErrorMessage(error))),
      subscribeToUserGraduations(profile.academyId, profile.id, setGraduations, (error) => setSessionError(getErrorMessage(error))),
      subscribeToCompetitions(scopedAcademyId, setCompetitions, (error) => setSessionError(getErrorMessage(error))),
      subscribeToUserFights(profile.academyId, profile.id, setFights, (error) => setSessionError(getErrorMessage(error))),
      subscribeToStoreItems(scopedAcademyId, setStoreItems, (error) => setSessionError(getErrorMessage(error))),
    ];

    if (profile.role !== 'student') {
      unsubscribers.push(
        subscribeToAcademyUsers(scopedAcademyId, setAcademyUsers, (error) => setSessionError(getErrorMessage(error))),
      );
    } else {
      setAcademyUsers([]);
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [profile, selectedAcademyId]);

  async function handleLogin(email: string, password: string) {
    try {
      await signInWithEmail(email.trim(), password);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleLogout() {
    try {
      await logout();
      setActiveTab('home');
    } catch (error) {
      setSessionError(getErrorMessage(error));
    }
  }

  function handleEnterAcademy(academyId: string) {
    setSelectedAcademyId(academyId);
  }

  function handleClearFocusedAcademy() {
    setSelectedAcademyId('');
  }

  async function handleCreateQuickClass() {
    if (!profile) {
      throw new Error('Seu perfil ainda não foi carregado.');
    }

    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    await backendFunctions.upsertClassSchedule({
      title: `Treino ${formatDateLabel(now)}`,
      tatame: 'Tatame Principal',
      professorId: profile.id,
      professorName: profile.displayName,
      scheduledStart: now.toISOString(),
      scheduledEnd: end.toISOString(),
      capacity: 30,
      checkinWindowMinutes: academy?.classCheckinWindowMinutes ?? 15,
    });
  }

  async function handleStartClass(classId: string) {
    try {
      return await backendFunctions.startClassSession({ classId });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleFinishClass(classId: string) {
    try {
      await backendFunctions.finishClassSession({ classId });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleRefreshQr(classId: string) {
    try {
      return await backendFunctions.generateClassQrCode({ classId });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleRegisterAttendance(classId: string, qrToken?: string) {
    const trimmedToken = qrToken?.trim();
    if (profile?.role === 'student' && !trimmedToken) {
      throw new Error('Informe o token do QR para registrar a presenca.');
    }

    try {
      await backendFunctions.registerAttendance({
        classId,
        qrToken: trimmedToken || undefined,
      });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleUpdateAcademy(payload: {
    academyId: string;
    name: string;
    timezone: string;
    status: 'active' | 'inactive' | 'suspended';
    classCheckinWindowMinutes: number;
    masterBlackLimit: number;
  }) {
    try {
      await updateAcademySettings(payload.academyId, payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleCreateAcademy(payload: {
    name: string;
    slug?: string;
    timezone?: string;
    masterBlackLimit?: number;
  }) {
    try {
      await backendFunctions.createAcademy(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleCreateUser(payload: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: 'student' | 'professor' | 'admin' | 'superadmin';
    academyId?: string;
    phone?: string;
    belt?: string;
    grade?: number;
    stripes?: number;
  }) {
    try {
      await backendFunctions.createUserWithRole(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleSaveProgressionRules(payload: {
    academyId?: string;
    milestones: Array<{
      belt: string;
      minAttendances: number;
      stripeEvery: number;
      maxStripes: number;
    }>;
  }) {
    try {
      await backendFunctions.upsertAcademyProgressionRules(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleSendNotification(payload: {
    title: string;
    body: string;
    academyId?: string;
    targetRole?: 'student' | 'professor' | 'admin' | 'superadmin';
    targetBelt?: string;
  }) {
    try {
      await backendFunctions.sendSegmentedNotification(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    try {
      await backendFunctions.markNotificationRead({ notificationId });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  if (!authReady) {
    return buildLoadingView('Validando a sua sessão com o Firebase.');
  }

  if (!authUser) {
    return <LoginView onLogin={handleLogin} />;
  }

  if (profileLoading || academyLoading || !profile || !academy) {
    return buildLoadingView('Carregando perfil, academia e permissões.');
  }

  const currentUser = toUiUser({
    id: profile.id,
    user: profile,
    graduations,
    fights,
  });
  const isSuperAdmin = profile.role === 'superadmin';
  const isStaff =
    currentUser.role === UserRole.PROFESSOR ||
    currentUser.role === UserRole.ADMIN ||
    currentUser.role === UserRole.SUPERADMIN;
  const branch = toBranch(academy);
  const attendanceThisMonth = attendances.filter((attendance) => {
    if (!attendance.checkedInAt) {
      return false;
    }

    const checkedInDate = attendance.checkedInAt.toDate();
    const now = new Date();

    return checkedInDate.getMonth() === now.getMonth() && checkedInDate.getFullYear() === now.getFullYear();
  });
  const attendanceDays = [...new Set(attendanceThisMonth.map((attendance) => attendance.checkedInAt?.toDate().getDate()).filter(Boolean))] as number[];
  const rankingEntry = isSuperAdmin && academy.id !== profile.academyId
    ? null
    : rankings.find((entry) => entry.userId === profile.id);
  const students = academyUsers
    .filter((user) => user.role === 'student')
    .map((user) => toUiUser({ id: user.id, user, graduations: [], fights: [] }));
  const products = storeItems.filter((item) => item.status === 'active').map(toProduct);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return isSuperAdmin
          ? (
            <SuperadminDashboardView
              academies={allAcademies}
              allUsers={allUsers}
              academy={academy}
              academyUsers={academyUsers}
              classes={classes}
              rankings={rankings}
              competitions={competitions}
              selectedAcademyId={selectedAcademyId}
              onEnterAcademy={handleEnterAcademy}
              onClearFocus={handleClearFocusedAcademy}
            />
          )
          : isStaff ? (
            <StaffDashboardView
              user={currentUser}
              academy={academy}
              academyUsers={academyUsers}
              classes={classes}
              notifications={notifications}
            />
          ) : (
            <HomeView
              user={currentUser}
              branch={branch}
              monthlyAttendanceCount={attendanceThisMonth.length}
              attendanceDays={attendanceDays}
            />
          );
      case 'calendar':
        return (
          <CalendarView
            userRole={currentUser.role}
            currentUserId={currentUser.id}
            classes={classes}
            onCreateQuickClass={handleCreateQuickClass}
            onStartClass={handleStartClass}
            onFinishClass={handleFinishClass}
            onRefreshQr={handleRefreshQr}
            onRegisterAttendance={handleRegisterAttendance}
          />
        );
      case 'competition':
        return <CompetitionView competitions={competitions} fights={fights} />;
      case 'gamification':
        return (
          <GamificationView
            missions={missions}
            rankings={rankings}
            currentUserId={currentUser.id}
            currentPoints={profile.missionPoints}
          />
        );
      case 'students':
        return <StudentsView students={students} academyName={academy.name} />;
      case 'management':
        return (
          <ManagementView
            userRole={currentUser.role}
            academy={academy}
            classes={classes}
            academyUsers={academyUsers}
            academies={allAcademies}
            allUsers={allUsers}
            selectedAcademyId={selectedAcademyId}
            onSelectAcademy={setSelectedAcademyId}
            focusSection={managementFocusSection}
            onFocusSectionHandled={() => setManagementFocusSection(null)}
            onUpdateAcademy={handleUpdateAcademy}
            onCreateAcademy={handleCreateAcademy}
            onCreateUser={handleCreateUser}
            onSaveProgressionRules={handleSaveProgressionRules}
          />
        );
      case 'notifications':
        return (
          <NotificationsView
            academy={academy}
            userRole={currentUser.role}
            academyUsers={academyUsers}
            classes={classes}
            notifications={notifications}
            academies={allAcademies}
            selectedAcademyId={selectedAcademyId}
            onSelectAcademy={setSelectedAcademyId}
            onSendNotification={handleSendNotification}
            onMarkRead={handleMarkNotificationRead}
          />
        );
      case 'learning':
        return (
          <LearningHubView
            academyName={academy.name}
            userName={currentUser.name}
            userRole={currentUser.role}
          />
        );
      case 'store':
        return <StoreView products={products} branch={branch} />;
      case 'profile':
        return (
          <ProfileView
            user={currentUser}
            profile={profile}
            totalClasses={profile.attendanceCount}
            rankingPosition={rankingEntry?.position ?? null}
            academyName={academy.name}
            onLogout={handleLogout}
          />
        );
      default:
        return isSuperAdmin
          ? (
            <SuperadminDashboardView
              academies={allAcademies}
              allUsers={allUsers}
              academy={academy}
              academyUsers={academyUsers}
              classes={classes}
              rankings={rankings}
              competitions={competitions}
              selectedAcademyId={selectedAcademyId}
              onEnterAcademy={handleEnterAcademy}
              onClearFocus={handleClearFocusedAcademy}
            />
          )
          : isStaff ? (
            <StaffDashboardView
              user={currentUser}
              academy={academy}
              academyUsers={academyUsers}
              classes={classes}
              notifications={notifications}
            />
          ) : (
            <HomeView
              user={currentUser}
              branch={branch}
              monthlyAttendanceCount={attendanceThisMonth.length}
              attendanceDays={attendanceDays}
            />
          );
    }
  };

  return (
    <>
      {sessionError ? (
        <div className="fixed top-24 left-4 right-4 z-[70] mx-auto max-w-lg">
          <div className="app-toast text-sm">
            {sessionError}
          </div>
        </div>
      ) : null}

      <Layout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        userRole={currentUser.role}
      >
        {renderContent()}
      </Layout>
    </>
  );
};

export default App;
