import React, { startTransition, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import Layout from './components/Layout';
import CalendarView from './views/CalendarView';
import CompetitionView from './views/CompetitionView';
import GamificationView from './views/GamificationView';
import HomeView from './views/HomeView';
import LoginView from './views/LoginView';
import ProfileView from './views/ProfileView';
import StoreView from './views/StoreView';
import StudentsView from './views/StudentsView';
import { logout, signInWithEmail, subscribeToAuthState } from './services/firebase/auth';
import { formatDateLabel, toBranch, toProduct, toUiUser } from './services/firebase/adapters';
import {
  type FirestoreEntity,
  subscribeToAcademy,
  subscribeToAcademyClasses,
  subscribeToAcademyUsers,
  subscribeToCompetitions,
  subscribeToRankings,
  subscribeToStoreItems,
  subscribeToUserAttendances,
  subscribeToUserFights,
  subscribeToUserGraduations,
  subscribeToUserMissions,
  subscribeToUserProfile,
} from './services/firebase/data';
import { backendFunctions } from './services/firebase/functions';
import type {
  AcademyRecord,
  AttendanceRecord,
  ClassRecord,
  CompetitionRecord,
  FightRecord,
  GraduationRecord,
  RankingRecord,
  StoreItemRecord,
  UserMissionRecord,
  UserRecord,
} from './services/firebase/models';

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

function buildLoadingView(message: string) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark px-4">
      <div className="max-w-md w-full bg-white dark:bg-dark-card p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 text-center">
        <div className="mx-auto h-14 w-14 rounded-full border-4 border-gold/30 border-t-gold animate-spin" />
        <h2 className="mt-6 text-xl font-bold">Conectando ao APPLevel</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{message}</p>
      </div>
    </div>
  );
}

const App: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [activeTab, setActiveTab] = useState('home');
  const [isDarkMode, setIsDarkMode] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [profile, setProfile] = useState<FirestoreEntity<UserRecord> | null>(null);
  const [academy, setAcademy] = useState<FirestoreEntity<AcademyRecord> | null>(null);
  const [classes, setClasses] = useState<Array<FirestoreEntity<ClassRecord>>>([]);
  const [academyUsers, setAcademyUsers] = useState<Array<FirestoreEntity<UserRecord>>>([]);
  const [attendances, setAttendances] = useState<Array<FirestoreEntity<AttendanceRecord>>>([]);
  const [rankings, setRankings] = useState<Array<FirestoreEntity<RankingRecord>>>([]);
  const [missions, setMissions] = useState<Array<FirestoreEntity<UserMissionRecord>>>([]);
  const [graduations, setGraduations] = useState<Array<FirestoreEntity<GraduationRecord>>>([]);
  const [competitions, setCompetitions] = useState<Array<FirestoreEntity<CompetitionRecord>>>([]);
  const [fights, setFights] = useState<Array<FirestoreEntity<FightRecord>>>([]);
  const [storeItems, setStoreItems] = useState<Array<FirestoreEntity<StoreItemRecord>>>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [academyLoading, setAcademyLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const toggleTheme = () => setIsDarkMode((value) => !value);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

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
      setClasses([]);
      setAcademyUsers([]);
      setAttendances([]);
      setRankings([]);
      setMissions([]);
      setGraduations([]);
      setCompetitions([]);
      setFights([]);
      setStoreItems([]);
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

    setAcademyLoading(true);

    const unsubscribers = [
      subscribeToAcademy(
        profile.academyId,
        (record) => {
          setAcademy(record);
          setAcademyLoading(false);
        },
        (error) => {
          setAcademyLoading(false);
          setSessionError(getErrorMessage(error));
        },
      ),
      subscribeToAcademyClasses(profile.academyId, setClasses, (error) => setSessionError(getErrorMessage(error))),
      subscribeToUserAttendances(profile.academyId, profile.id, setAttendances, (error) => setSessionError(getErrorMessage(error))),
      subscribeToRankings(profile.academyId, setRankings, (error) => setSessionError(getErrorMessage(error))),
      subscribeToUserMissions(profile.academyId, profile.id, setMissions, (error) => setSessionError(getErrorMessage(error))),
      subscribeToUserGraduations(profile.academyId, profile.id, setGraduations, (error) => setSessionError(getErrorMessage(error))),
      subscribeToCompetitions(profile.academyId, setCompetitions, (error) => setSessionError(getErrorMessage(error))),
      subscribeToUserFights(profile.academyId, profile.id, setFights, (error) => setSessionError(getErrorMessage(error))),
      subscribeToStoreItems(profile.academyId, setStoreItems, (error) => setSessionError(getErrorMessage(error))),
    ];

    if (profile.role !== 'student') {
      unsubscribers.push(
        subscribeToAcademyUsers(profile.academyId, setAcademyUsers, (error) => setSessionError(getErrorMessage(error))),
      );
    } else {
      setAcademyUsers([]);
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [profile]);

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
      throw new Error('Informe o token do QR para registrar a presença.');
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
  const rankingEntry = rankings.find((entry) => entry.userId === profile.id);
  const students = academyUsers
    .filter((user) => user.role === 'student')
    .map((user) => toUiUser({ id: user.id, user, graduations: [], fights: [] }));
  const products = storeItems.filter((item) => item.status === 'active').map(toProduct);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
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
      case 'store':
        return <StoreView products={products} branch={branch} />;
      case 'profile':
        return (
          <ProfileView
            user={currentUser}
            totalClasses={profile.attendanceCount}
            rankingPosition={rankingEntry?.position ?? null}
            academyName={academy.name}
            onLogout={handleLogout}
          />
        );
      default:
        return (
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
        <div className="fixed top-20 left-4 right-4 z-[60] max-w-lg mx-auto">
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-2xl text-sm shadow-lg">
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
