import React, { Suspense, lazy, startTransition, useEffect, useRef, useState } from 'react';
import { CheckCircle, X } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { CreateClassPayload } from './components/CreateClassModal';
import Layout from './components/Layout';
import HomeView from './views/HomeView';
import LoginView from './views/LoginView';
import StaffDashboardView from './views/StaffDashboardView';
import { logout, signInWithEmail, subscribeToAuthState, updateSignedInEmail } from './services/firebase/auth';
import { toBranch, toUiUser } from './services/firebase/adapters';
import {
  type FirestoreEntity,
  subscribeToAcademies,
  subscribeToAcademy,
  subscribeToAcademyClasses,
  subscribeToAcademyUsers,
  subscribeToAllUsers,
  subscribeToAttendanceRequests,
  subscribeToCompetitions,
  subscribeToGraduationRequests,
  subscribeToJoinRequests,
  subscribeToLearningCourses,
  subscribeToLearningLessons,
  subscribeToLearningProgress,
  subscribeToLearningQuizzes,
  subscribeToLearningTracks,
  subscribeToNotifications,
  subscribeToUserAttendances,
  subscribeToUserFights,
  subscribeToUserGraduations,
  subscribeToUserProfile,
} from './services/firebase/data';
import { backendFunctions, type CreateClassScheduleBatchResult } from './services/firebase/functions';
import { updateAcademySettings, uploadUserPhoto } from './services/firebase/mutations';
import type {
  AppRole,
  AcademyRecord,
  AttendanceRecord,
  AttendanceRequestRecord,
  ClassRecord,
  CompetitionRecord,
  FightRecord,
  GraduationApprovalRequestRecord,
  GraduationRecord,
  JoinRequestRecord,
  LearningCourseRecord,
  LearningLessonRecord,
  LearningProgressRecord,
  LearningQuizRecord,
  LearningTrackRecord,
  NotificationChannel,
  NotificationRecord,
  UserRecord,
} from './services/firebase/models';
import { UserRole } from './types';
import { MOCK_PRODUCTS } from './constants';

const CalendarView = lazy(() => import('./views/CalendarView'));
const CompetitionView = lazy(() => import('./views/CompetitionView'));
const GraduationView = lazy(() => import('./views/GraduationView'));
const LearningHubView = lazy(() => import('./views/LearningHubView'));
const ManagementView = lazy(() => import('./views/ManagementView'));
const NotificationsView = lazy(() => import('./views/NotificationsView'));
const ProfileView = lazy(() => import('./views/ProfileView'));
const StoreView = lazy(() => import('./views/StoreView'));
const SuperadminDashboardView = lazy(() => import('./views/SuperadminDashboardView'));
const StudentsView = lazy(() => import('./views/StudentsView'));

const THEME_STORAGE_PREFIX = 'applevel-theme';
const NETWORK_NAME = 'LEVEL';
type SuperadminViewMode = 'superadmin' | 'professor';
type AcademyContextStatus = 'idle' | 'ready' | 'missing' | 'error';
type ValidatedSessionSnapshot = {
  uid: string;
  academyId: string;
  role: AppRole;
};

const SUPERADMIN_NETWORK_TABS = new Set(['home', 'notifications', 'students', 'management', 'learning', 'profile']);
const SUPERADMIN_PROFESSOR_TABS = new Set(['home', 'calendar', 'management', 'notifications', 'learning', 'profile']);

function getErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha invalidos.';
    case 'auth/user-disabled':
      return 'Seu cadastro ainda esta aguardando aprovacao do professor da unidade.';
    case 'auth/invalid-email':
      return 'Informe um e-mail valido.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.';
    case 'functions/permission-denied':
    case 'permission-denied':
      return 'Sua sessao nao tem permissao para acessar este recurso.';
    case 'functions/unauthenticated':
    case 'unauthenticated':
      return 'Sua sessao expirou. Entre novamente.';
    case 'functions/internal':
    case 'internal':
      return 'Nao foi possivel concluir a operacao no servidor agora. Atualize a pagina e tente novamente.';
    case 'functions/unavailable':
    case 'unavailable':
      return 'O servidor nao respondeu agora. Tente novamente em alguns instantes.';
    default:
      if (error instanceof Error && error.message) {
        return error.message;
      }

      return 'Nao foi possivel concluir esta operacao agora.';
  }
}

function shouldResetSession(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

  if ([
    'functions/not-found',
    'not-found',
    'functions/permission-denied',
    'permission-denied',
    'functions/unauthenticated',
    'unauthenticated',
  ].includes(code)) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('usuario nao encontrado')
    || message.includes('usuário não encontrado')
    || message.includes('cadastro nao foi encontrado')
    || message.includes('cadastro não foi encontrado');
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
          <div className="mx-auto flex items-center justify-center">
            <img src="/logo3.png" alt="APPLevel" className="h-40 w-40 object-contain animate-pulse" />
          </div>
          <h2 className="mt-6 text-2xl font-bold">Conectando ao APPLevel</h2>
          <p className="mt-3 app-note">{message}</p>
        </section>
      </div>
    </div>
  );
}

function buildInlineLoadingView(message: string) {
  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <p className="app-section-label">Sincronizando ambiente</p>
        <h2 className="app-section-title">Quase pronto.</h2>
        <p className="app-section-copy">
          {message}
        </p>
      </section>
    </div>
  );
}

function buildFallbackAcademy(ownerUserId: string): FirestoreEntity<AcademyRecord> {
  return {
    id: '',
    name: NETWORK_NAME,
    slug: 'level',
    ownerUserId,
    status: 'active',
    timezone: 'America/Sao_Paulo',
    classCheckinWindowMinutes: 15,
    masterBlackLimit: 1,
  };
}

function buildAcademyAccessIssueView(params: {
  eyebrow: string;
  title: string;
  description: string;
  note: string;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <section className="app-panel app-panel--hero app-auth-side">
          <div>
            <p className="app-section-label">{params.eyebrow}</p>
            <h1 className="app-section-title">{params.title}</h1>
            <p className="app-section-copy">
              {params.description}
            </p>
          </div>
        </section>

        <section className="app-panel app-auth-card app-panel-pad text-center">
          <div className="mx-auto flex items-center justify-center">
            <img src="/logo3.png" alt="APPLevel" className="h-32 w-32 object-contain" />
          </div>
          <h2 className="mt-6 text-2xl font-bold">Revise o acesso desta conta</h2>
          <p className="mt-3 app-note">
            {params.note}
          </p>
          <button type="button" onClick={() => void params.onLogout()} className="app-button app-button--gold mt-6 app-button--block">
            Voltar ao login
          </button>
        </section>
      </div>
    </div>
  );
}

function buildMissingAcademyView(onLogout: () => Promise<void>) {
  return buildAcademyAccessIssueView({
    eyebrow: 'Acesso bloqueado',
    title: 'Sua unidade nao esta mais disponivel.',
    description: 'Esta conta ainda existe, mas a unidade vinculada foi removida ou perdeu o contexto necessario para abrir o painel.',
    note: 'Saia e entre novamente depois que um superadmin da LEVEL corrigir a unidade vinculada ao seu cadastro.',
    onLogout,
  });
}

function buildAcademyLoadErrorView(message: string, onLogout: () => Promise<void>) {
  return buildAcademyAccessIssueView({
    eyebrow: 'Falha ao validar unidade',
    title: 'Nao foi possivel confirmar a sua unidade.',
    description: message,
    note: 'Saia e entre novamente. Se continuar igual, um superadmin precisa revisar o academyId e as permissoes desta conta.',
    onLogout,
  });
}

function buildSuperadminVisionChoiceView(params: {
  academyCount: number;
  onChooseNetwork: () => void;
  onChooseProfessor: () => void;
}) {
  const canUseProfessorVision = params.academyCount > 0;

  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <section className="app-panel app-panel--hero app-auth-side">
          <div>
            <p className="app-section-label">Superadmin LEVEL</p>
            <h1 className="app-section-title">Escolha como voce quer entrar agora.</h1>
            <p className="app-section-copy">
              A conta continua sendo superadmin, mas voce pode operar no modo rede ou assumir a rotina de uma unidade como professor.
            </p>
          </div>

          <div className="app-auth-bullets">
            <div className="app-auth-bullet">
              <div className="app-icon-shell">
                <span className="app-orb__dot" />
              </div>
              <div>
                <strong>Visao superadmin</strong>
                <p className="app-note">Central consolidada, gestao da rede, comunicacao global e learning em nivel LEVEL.</p>
              </div>
            </div>
            <div className="app-auth-bullet">
              <div className="app-icon-shell">
                <span className="app-orb__dot" />
              </div>
              <div>
                <strong>Visao professor</strong>
                <p className="app-note">Escolha uma unidade e opere o dia a dia dela com agenda, aulas, avisos e learning local.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="app-panel app-auth-card app-panel-pad">
          <div className="space-y-4">
            <button type="button" onClick={params.onChooseNetwork} className="app-button app-button--gold app-button--block">
              Entrar na visao superadmin
            </button>

            <button
              type="button"
              onClick={params.onChooseProfessor}
              disabled={!canUseProfessorVision}
              className="app-button app-button--dark app-button--block"
            >
              Entrar na visao professor
            </button>

            <div className="app-note text-center">
              {canUseProfessorVision
                ? `${params.academyCount} unidade${params.academyCount === 1 ? '' : 's'} disponivel${params.academyCount === 1 ? '' : 'eis'} para operar.`
                : 'Crie a primeira unidade na visao superadmin para liberar a visao professor.'}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function buildSuperadminUnitFocusView(params: {
  academies: Array<FirestoreEntity<AcademyRecord>>;
  onSelectAcademy: (academyId: string) => void;
  onBackToNetwork: () => void;
}) {
  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <section className="app-panel app-panel--hero app-panel-pad">
          <p className="app-section-label">Visao professor</p>
          <h2 className="app-section-title">Escolha uma unidade para entrar.</h2>
          <p className="app-section-copy">
            O superadmin continua com acesso global, mas neste modo a operacao fica focada em uma unidade especifica.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={params.onBackToNetwork} className="app-button app-button--ghost">
              Voltar para a visao superadmin
            </button>
          </div>
        </section>

        <section className="app-grid-2">
          {params.academies.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => params.onSelectAcademy(entry.id)}
              className="app-panel app-panel-pad text-left transition hover:-translate-y-0.5"
            >
              <p className="app-section-label">Unidade LEVEL</p>
              <h3 className="mt-2 text-xl font-bold">{entry.name}</h3>
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                Abrir agenda, equipe, comunicacao e learning desta unidade.
              </p>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}

function isSameMonth(value?: { toDate(): Date } | null) {
  if (!value) {
    return false;
  }

  const date = value.toDate();
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function applyValidatedSessionToProfile(
  profile: FirestoreEntity<UserRecord> | null,
  session: ValidatedSessionSnapshot | null,
): FirestoreEntity<UserRecord> | null {
  if (!profile || !session || session.uid !== profile.id) {
    return profile;
  }

  if (profile.role === session.role && profile.academyId === session.academyId) {
    return profile;
  }

  return {
    ...profile,
    role: session.role,
    academyId: session.academyId,
  };
}

const App: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [activeTab, setActiveTab] = useState('home');
  const [managementFocusSection, setManagementFocusSection] = useState<'master-black' | null>(null);
  const [pendingCheckin, setPendingCheckin] = useState<{ token: string; classId: string } | null>(null);
  const [checkinStatus, setCheckinStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [checkinStep, setCheckinStep] = useState<'initial' | 'confirm'>('initial');
  const [checkinError, setCheckinError] = useState('');
  const [themeScope, setThemeScope] = useState('guest');
  const [isDarkMode, setIsDarkMode] = useState(() => readThemePreference('guest') ?? false);
  const [profile, setProfile] = useState<FirestoreEntity<UserRecord> | null>(null);
  const [academy, setAcademy] = useState<FirestoreEntity<AcademyRecord> | null>(null);
  const [allAcademies, setAllAcademies] = useState<Array<FirestoreEntity<AcademyRecord>>>([]);
  const [allUsers, setAllUsers] = useState<Array<FirestoreEntity<UserRecord>>>([]);
  const [selectedAcademyId, setSelectedAcademyId] = useState('');
  const [superadminViewMode, setSuperadminViewMode] = useState<SuperadminViewMode | null>(null);
  const [classes, setClasses] = useState<Array<FirestoreEntity<ClassRecord>>>([]);
  const [academyUsers, setAcademyUsers] = useState<Array<FirestoreEntity<UserRecord>>>([]);
  const [attendances, setAttendances] = useState<Array<FirestoreEntity<AttendanceRecord>>>([]);
  const [attendanceRequests, setAttendanceRequests] = useState<Array<FirestoreEntity<AttendanceRequestRecord>>>([]);
  const [joinRequests, setJoinRequests] = useState<Array<FirestoreEntity<JoinRequestRecord>>>([]);
  const [graduationRequests, setGraduationRequests] = useState<Array<FirestoreEntity<GraduationApprovalRequestRecord>>>([]);
  const [graduations, setGraduations] = useState<Array<FirestoreEntity<GraduationRecord>>>([]);
  const [competitions, setCompetitions] = useState<Array<FirestoreEntity<CompetitionRecord>>>([]);
  const [fights, setFights] = useState<Array<FirestoreEntity<FightRecord>>>([]);
  const [notifications, setNotifications] = useState<Array<FirestoreEntity<NotificationRecord>>>([]);
  const unreadNotificationsCount = notifications.filter((entry) => entry.status !== 'read').length;
  const [learningTracks, setLearningTracks] = useState<Array<FirestoreEntity<LearningTrackRecord>>>([]);
  const [learningCourses, setLearningCourses] = useState<Array<FirestoreEntity<LearningCourseRecord>>>([]);
  const [learningLessons, setLearningLessons] = useState<Array<FirestoreEntity<LearningLessonRecord>>>([]);
  const [learningQuizzes, setLearningQuizzes] = useState<Array<FirestoreEntity<LearningQuizRecord>>>([]);
  const [learningProgress, setLearningProgress] = useState<Array<FirestoreEntity<LearningProgressRecord>>>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [academyLoading, setAcademyLoading] = useState(false);
  const [academyStatus, setAcademyStatus] = useState<AcademyContextStatus>('idle');
  const [superadminDirectoryLoading, setSuperadminDirectoryLoading] = useState(false);
  const [sessionValidated, setSessionValidated] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionErrorSource, setSessionErrorSource] = useState('');
  const [loginScreenError, setLoginScreenError] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const invalidSessionResetRef = useRef(false);
  const academyAccessRetryRef = useRef(false);
  const validatedSessionRef = useRef<ValidatedSessionSnapshot | null>(null);
  const [academyAccessRetryNonce, setAcademyAccessRetryNonce] = useState(0);

  const setThemeMode = (mode: 'light' | 'dark') => {
    setIsDarkMode(mode === 'dark');
  };

  const clearSessionError = () => {
    setSessionError('');
    setSessionErrorSource('');
  };

  const reportSessionError = (source: string, error: unknown) => {
    console.error(`[session:${source}]`, error);
    setSessionError(getErrorMessage(error));
    setSessionErrorSource(source);
  };

  const recoverInvalidSession = (source: string, error: unknown) => {
    reportSessionError(source, error);
    setLoginScreenError(getErrorMessage(error));

    if (invalidSessionResetRef.current) {
      return;
    }

    invalidSessionResetRef.current = true;
    void logout().catch((logoutError) => {
      console.error('[session:forcedLogout]', logoutError);
      startTransition(() => {
        setAuthUser(null);
        setAuthReady(true);
      });
    });
  };

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
    setIsDarkMode(storedPreference ?? false);
  }, [authUser?.uid, themeScope]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(`${THEME_STORAGE_PREFIX}:${themeScope}`, isDarkMode ? 'dark' : 'light');
  }, [isDarkMode, themeScope]);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((nextUser) => {
      startTransition(() => {
        setAuthUser(nextUser);
        setAuthReady(true);
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) {
      invalidSessionResetRef.current = false;
      academyAccessRetryRef.current = false;
      validatedSessionRef.current = null;
      setProfile(null);
      setAcademy(null);
      setAcademyLoading(false);
      setAcademyStatus('idle');
      setAcademyAccessRetryNonce(0);
      setAllAcademies([]);
      setAllUsers([]);
      setSelectedAcademyId('');
      setSuperadminViewMode(null);
      setClasses([]);
      setAcademyUsers([]);
      setAttendances([]);
      setAttendanceRequests([]);
      setJoinRequests([]);
      setGraduations([]);
      setCompetitions([]);
      setFights([]);
      setNotifications([]);
      setLearningTracks([]);
      setLearningCourses([]);
      setLearningLessons([]);
      setLearningQuizzes([]);
      setLearningProgress([]);
      setSessionValidated(false);
      clearSessionError();
      return;
    }

    setLoginScreenError('');
    let active = true;
    setProfileLoading(true);
    clearSessionError();

    const unsubscribe = subscribeToUserProfile(
      authUser.uid,
      (record) => {
        if (!active) {
          return;
        }

        setProfile(applyValidatedSessionToProfile(record, validatedSessionRef.current));
        setProfileLoading(false);

        if (!record) {
          recoverInvalidSession('profile:missing', new Error('Seu cadastro nao foi encontrado. Entre com outra conta.'));
        }
      },
      (error) => {
        if (!active) {
          return;
        }

        setProfileLoading(false);

        if (shouldResetSession(error)) {
          recoverInvalidSession('profile:subscribeToUserProfile', error);
          return;
        }

        reportSessionError('profile:subscribeToUserProfile', error);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      setSessionValidated(false);
      return;
    }

    let cancelled = false;
    setSessionValidated(false);
    validatedSessionRef.current = null;

    void backendFunctions
      .validateSessionAccess()
      .then(async (session) => {
        if (session.claimsUpdated) {
          await authUser.getIdToken(true);
        }

        if (!cancelled) {
          const nextValidatedSession = {
            uid: session.uid,
            academyId: session.academyId,
            role: session.role,
          };

          validatedSessionRef.current = nextValidatedSession;
          setProfile((current) => (
            current
              ? applyValidatedSessionToProfile(current, nextValidatedSession)
              : current
          ));
          setSessionValidated(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          if (shouldResetSession(error)) {
            recoverInvalidSession('session:validateSessionAccess', error);
            return;
          }

          reportSessionError('session:validateSessionAccess', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser?.uid || !profile || !sessionValidated || !academy?.id || profile.role === 'superadmin') {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void backendFunctions.rebuildUserDerivedState({}).catch((error) => {
        if (!cancelled) {
          reportSessionError('session:rebuildUserDerivedState', error);
        }
      });
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [academy?.id, authUser?.uid, profile?.role, sessionValidated]);

  useEffect(() => {
    if (!profile || !sessionValidated) {
      setAllAcademies([]);
      setAllUsers([]);
      setSuperadminDirectoryLoading(false);
      return;
    }

    if (profile.role !== 'superadmin') {
      setSelectedAcademyId(profile.academyId);
      setAllAcademies([]);
      setAllUsers([]);
      setSuperadminDirectoryLoading(false);
      return;
    }

    setSuperadminDirectoryLoading(true);
    const unsubscribers = [
      subscribeToAcademies(
        (records) => {
          setAllAcademies(records);
          setSuperadminDirectoryLoading(false);
        },
        (error) => {
          setSuperadminDirectoryLoading(false);
          reportSessionError('data:subscribeToAcademies', error);
        },
      ),
      subscribeToAllUsers(setAllUsers, (error) => reportSessionError('data:subscribeToAllUsers', error)),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [profile, sessionValidated]);

  useEffect(() => {
    if (!profile || profile.role !== 'superadmin' || superadminDirectoryLoading) {
      return;
    }

    if (selectedAcademyId && allAcademies.some((entry) => entry.id === selectedAcademyId)) {
      return;
    }

    if (selectedAcademyId && !allAcademies.some((entry) => entry.id === selectedAcademyId)) {
      setSelectedAcademyId('');
    }
  }, [allAcademies, profile, selectedAcademyId, superadminDirectoryLoading]);

  useEffect(() => {
    if (!profile || profile.role !== 'superadmin' || superadminDirectoryLoading) {
      return;
    }

    if (allAcademies.length === 0) {
      setActiveTab('management');
    }
  }, [allAcademies.length, profile, superadminDirectoryLoading]);

  useEffect(() => {
    if (!profile || profile.role !== 'superadmin') {
      setSuperadminViewMode(null);
    }
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.role !== 'superadmin' || !superadminViewMode) {
      return;
    }

    if (superadminViewMode === 'superadmin' && !SUPERADMIN_NETWORK_TABS.has(activeTab)) {
      setActiveTab('home');
      return;
    }

    if (superadminViewMode === 'professor' && !SUPERADMIN_PROFESSOR_TABS.has(activeTab)) {
      setActiveTab('home');
    }
  }, [activeTab, profile, superadminViewMode]);

  useEffect(() => {
    if (!profile || profile.role !== 'superadmin' || superadminDirectoryLoading || superadminViewMode !== 'professor') {
      return;
    }

    if (allAcademies.length === 0) {
      setSuperadminViewMode('superadmin');
      setSelectedAcademyId('');
      setActiveTab('management');
    }
  }, [allAcademies.length, profile, superadminDirectoryLoading, superadminViewMode]);

  useEffect(() => {
    if (!profile || !sessionValidated) {
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
      (error) => reportSessionError('data:subscribeToNotifications', error),
    );
  }, [profile, selectedAcademyId, sessionValidated]);

  useEffect(() => {
    if (!profile || !sessionValidated) {
      setGraduationRequests([]);
      setJoinRequests([]);
      setAttendanceRequests([]);
      return;
    }

    if (profile.role === 'student') {
      setGraduationRequests([]);
      const unsubscribe = subscribeToAttendanceRequests(
        { userId: profile.id },
        setAttendanceRequests,
        (error) => reportSessionError('data:subscribeToAttendanceRequests:self', error),
      );

      setJoinRequests([]);
      return unsubscribe;
    }

    const scopedAcademyId = profile.role === 'superadmin'
      ? (selectedAcademyId || undefined)
      : profile.academyId;

    const unsubscribers = [
      scopedAcademyId
        ? subscribeToGraduationRequests(
          { academyId: scopedAcademyId },
          setGraduationRequests,
          (error) => reportSessionError('data:subscribeToGraduationRequests:academy', error),
        )
        : () => {},
      subscribeToAttendanceRequests(
        { academyId: scopedAcademyId },
        setAttendanceRequests,
        (error) => reportSessionError('data:subscribeToAttendanceRequests:academy', error),
      ),
    ];

    const isProfessorContext = profile.role === 'professor' || (profile.role === 'superadmin' && superadminViewMode === 'professor');
    if (isProfessorContext && scopedAcademyId) {
      unsubscribers.unshift(
        subscribeToJoinRequests(scopedAcademyId, setJoinRequests, (error) => reportSessionError('data:subscribeToJoinRequests', error)),
      );
    } else {
      setGraduationRequests([]);
      setJoinRequests([]);
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [profile, selectedAcademyId, sessionValidated, superadminViewMode]);

  useEffect(() => {
    if (!selectedStudentId) {
      return;
    }

    if (!academyUsers.some((entry) => entry.id === selectedStudentId && entry.role === 'student')) {
      setSelectedStudentId('');
    }
  }, [academyUsers, selectedStudentId]);

  useEffect(() => {
    if (!profile || !sessionValidated) {
      academyAccessRetryRef.current = false;
      setAcademy(null);
      setAcademyLoading(false);
      setAcademyStatus('idle');
      setClasses([]);
      setAcademyUsers([]);
      setAttendances([]);
      setGraduations([]);
      setCompetitions([]);
      setFights([]);
      return;
    }

    if (profile.role === 'superadmin') {
      if (!selectedAcademyId) {
        academyAccessRetryRef.current = false;
        setAcademy(null);
        setAcademyLoading(false);
        setAcademyStatus('idle');
        setClasses([]);
        setAcademyUsers([]);
        setAttendances([]);
        setGraduations([]);
        setCompetitions([]);
        setFights([]);
        return;
      }

      if (!allAcademies.some((entry) => entry.id === selectedAcademyId)) {
        academyAccessRetryRef.current = false;
        setAcademy(null);
        setAcademyLoading(false);
        setAcademyStatus('idle');
        setClasses([]);
        setAcademyUsers([]);
        setAttendances([]);
        setGraduations([]);
        setCompetitions([]);
        setFights([]);
        return;
      }

      setAcademyLoading(true);
      setAcademyStatus('idle');

      const unsubscribers = [
        subscribeToAcademy(
          selectedAcademyId,
          (record) => {
            if (!record) {
              setAcademy(null);
              setAcademyStatus('missing');
              setAcademyLoading(false);
              return;
            }

            academyAccessRetryRef.current = false;
            setAcademy(record);
            setAcademyStatus('ready');
            setAcademyLoading(false);
          },
          (error) => {
            setAcademy(null);
            setAcademyStatus('error');
            setAcademyLoading(false);
            reportSessionError('data:subscribeToAcademy', error);
          },
        ),
        subscribeToAcademyClasses(selectedAcademyId, setClasses, (error) => reportSessionError('data:subscribeToAcademyClasses', error)),
        subscribeToCompetitions(selectedAcademyId, setCompetitions, (error) => reportSessionError('data:subscribeToCompetitions', error)),
        subscribeToAcademyUsers(selectedAcademyId, setAcademyUsers, (error) => reportSessionError('data:subscribeToAcademyUsers', error)),
      ];

      setAttendances([]);
      setGraduations([]);
      setFights([]);

      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    }

    if (!profile.academyId) {
      academyAccessRetryRef.current = false;
      setAcademy(null);
      setAcademyLoading(false);
      setAcademyStatus('missing');
      setClasses([]);
      setAcademyUsers([]);
      setAttendances([]);
      setGraduations([]);
      setCompetitions([]);
      setFights([]);
      return;
    }

    setAcademyLoading(true);
    setAcademyStatus('idle');

    const retryAcademyAccess = (source: string, error: unknown) => {
      if (!authUser || academyAccessRetryRef.current || !shouldResetSession(error)) {
        setAcademy(null);
        setAcademyStatus('error');
        setAcademyLoading(false);
        reportSessionError(source, error);
        return;
      }

      academyAccessRetryRef.current = true;
      clearSessionError();
      setAcademy(null);
      setAcademyStatus('idle');
      setAcademyLoading(true);

      void backendFunctions
        .validateSessionAccess()
        .then(async () => {
          await authUser.getIdToken(true);
          setAcademyAccessRetryNonce((current) => current + 1);
        })
        .catch((retryError) => {
          setAcademy(null);
          setAcademyStatus('error');
          setAcademyLoading(false);
          reportSessionError(`${source}:retry`, retryError);
        });
    };

    const unsubscribers = [
      subscribeToAcademy(
        profile.academyId,
        (record) => {
          if (!record) {
            setAcademy(null);
            setAcademyStatus('missing');
            setAcademyLoading(false);
            return;
          }

          academyAccessRetryRef.current = false;
          setAcademy(record);
          setAcademyStatus('ready');
          setAcademyLoading(false);
        },
        (error) => {
          retryAcademyAccess('data:subscribeToAcademy', error);
        },
      ),
      subscribeToAcademyClasses(profile.academyId, setClasses, (error) => reportSessionError('data:subscribeToAcademyClasses', error)),
      subscribeToUserAttendances(profile.academyId, profile.id, setAttendances, (error) => reportSessionError('data:subscribeToUserAttendances', error)),
      subscribeToUserGraduations(profile.academyId, profile.id, setGraduations, (error) => reportSessionError('data:subscribeToUserGraduations', error)),
      subscribeToCompetitions(profile.academyId, setCompetitions, (error) => reportSessionError('data:subscribeToCompetitions', error)),
      subscribeToUserFights(profile.academyId, profile.id, setFights, (error) => reportSessionError('data:subscribeToUserFights', error)),
    ];

    if (profile.role !== 'student') {
      unsubscribers.push(
        subscribeToAcademyUsers(profile.academyId, setAcademyUsers, (error) => reportSessionError('data:subscribeToAcademyUsers', error)),
      );
    } else {
      setAcademyUsers([]);
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [allAcademies, authUser, profile, selectedAcademyId, sessionValidated, superadminDirectoryLoading, academyAccessRetryNonce]);

  useEffect(() => {
    if (!profile || !sessionValidated || activeTab !== 'learning') {
      setLearningTracks([]);
      setLearningCourses([]);
      setLearningLessons([]);
      setLearningQuizzes([]);
      setLearningProgress([]);
      return;
    }

    if (profile.role !== 'professor' && profile.role !== 'superadmin') {
      setLearningTracks([]);
      setLearningCourses([]);
      setLearningLessons([]);
      setLearningQuizzes([]);
      setLearningProgress([]);
      return;
    }

    const publishedOnly = profile.role === 'professor';
    const unsubscribers = [
      subscribeToLearningTracks(
        { publishedOnly },
        setLearningTracks,
        (error) => reportSessionError('data:subscribeToLearningTracks', error),
      ),
      subscribeToLearningCourses(
        { publishedOnly },
        setLearningCourses,
        (error) => reportSessionError('data:subscribeToLearningCourses', error),
      ),
      subscribeToLearningLessons(
        { publishedOnly },
        setLearningLessons,
        (error) => reportSessionError('data:subscribeToLearningLessons', error),
      ),
      subscribeToLearningProgress(
        profile.role === 'superadmin'
          ? { academyId: selectedAcademyId || undefined }
          : { userId: profile.id },
        setLearningProgress,
        (error) => reportSessionError('data:subscribeToLearningProgress', error),
      ),
    ];

    if (profile.role === 'superadmin') {
      unsubscribers.push(
        subscribeToLearningQuizzes(
          setLearningQuizzes,
          (error) => reportSessionError('data:subscribeToLearningQuizzes', error),
        ),
      );
    } else {
      setLearningQuizzes([]);
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [activeTab, profile, selectedAcademyId, sessionValidated]);

  // Show checkin modal when app is opened via QR code link
  useEffect(() => {
    if (!profile || !sessionValidated) return;
    const params = new URLSearchParams(window.location.search);
    const checkinToken = params.get('checkin');
    const checkinClassId = params.get('classId');
    if (!checkinToken || !checkinClassId) return;
    window.history.replaceState({}, '', window.location.pathname);
    setCheckinStatus('idle');
    setCheckinStep('initial');
    setCheckinError('');
    setPendingCheckin({ token: checkinToken, classId: checkinClassId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, sessionValidated]);

  async function handleLogin(email: string, password: string) {
    try {
      setLoginScreenError('');
      await signInWithEmail(email.trim(), password);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleLogout() {
    try {
      setLoginScreenError('');
      await logout();
      setActiveTab('home');
    } catch (error) {
      reportSessionError('auth:logout', error);
    }
  }

  async function handleCreateClass(classPayloads: CreateClassPayload[]): Promise<CreateClassScheduleBatchResult> {
    if (classPayloads.length === 0) {
      return {
        requestedCount: 0,
        createdCount: 0,
        skippedCount: 0,
        skipped: [],
      };
    }

    const [firstPayload] = classPayloads;

    return backendFunctions.createClassScheduleBatch({
      academyId: profile?.role === 'superadmin' ? (selectedAcademyId || undefined) : undefined,
      title: firstPayload.title,
      description: firstPayload.description,
      professorId: firstPayload.professorId,
      professorName: firstPayload.professorName,
      tatame: firstPayload.tatame,
      capacity: firstPayload.capacity,
      checkinWindowMinutes: academy?.classCheckinWindowMinutes ?? 15,
      occurrences: classPayloads.map((payload) => ({
        scheduledStart: payload.scheduledStart,
        scheduledEnd: payload.scheduledEnd,
      })),
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

  async function handleSubmitAttendanceRequest(classId: string) {
    try {
      await backendFunctions.submitAttendanceRequest({ classId });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleApproveAttendanceRequest(requestId: string) {
    try {
      await backendFunctions.approveAttendanceRequest({ requestId });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleRejectAttendanceRequest(requestId: string) {
    try {
      await backendFunctions.rejectAttendanceRequest({ requestId });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleApproveJoinRequest(payload: { requestId: string; belt?: string; grade?: number }) {
    try {
      await backendFunctions.approveJoinRequest(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleRejectJoinRequest(requestId: string) {
    try {
      await backendFunctions.rejectJoinRequest({ requestId });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleApproveGraduationRequest(requestId: string) {
    try {
      await backendFunctions.approveGraduationRequest({ requestId });
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
      const createdAcademy = await backendFunctions.createAcademy(payload);
      setSelectedAcademyId(createdAcademy.academyId);
      return createdAcademy;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleCreateUser(payload: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: 'professor' | 'superadmin';
    academyId?: string;
    cpf?: string;
    phone?: string;
    birthDate?: string;
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
    adult: {
      belts: Array<{
        belt: string;
        stripeEvery: number;
        maxStripes: number;
        beltPromotionOffset?: number;
      }>;
    };
    kids: {
      level_kids: {
        belts: Array<{
          belt: string;
          stripeEvery: number;
          maxStripes: number;
          beltPromotionOffset?: number;
        }>;
      };
      level_infanto_juvenil: {
        belts: Array<{
          belt: string;
          stripeEvery: number;
          maxStripes: number;
          beltPromotionOffset?: number;
        }>;
      };
      level_juvenil: {
        belts: Array<{
          belt: string;
          stripeEvery: number;
          maxStripes: number;
          beltPromotionOffset?: number;
        }>;
      };
    };
  }) {
    try {
      await backendFunctions.upsertAcademyProgressionRules(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleUpdateStudentBeltGrade(payload: { userId: string; belt: string; grade: number; stripes?: number; kidsCategory?: string }) {
    try {
      await backendFunctions.updateStudentBeltGrade(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleSendNotification(payload: {
    title: string;
    body: string;
    academyId?: string;
    channel?: NotificationChannel;
    targetRole?: 'student' | 'professor' | 'superadmin';
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

  async function handleUpsertLearningTrack(payload: {
    trackId?: string;
    title: string;
    description?: string;
    order: number;
    status: 'draft' | 'published';
  }) {
    try {
      return await backendFunctions.upsertLearningTrack(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleUpsertLearningCourse(payload: {
    courseId?: string;
    trackId: string;
    title: string;
    description?: string;
    order: number;
    status: 'draft' | 'published';
  }) {
    try {
      return await backendFunctions.upsertLearningCourse(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleUpsertLearningLesson(payload: {
    lessonId?: string;
    trackId: string;
    courseId: string;
    title: string;
    description?: string;
    videoUrl: string;
    order: number;
    status: 'draft' | 'published';
    passingScore: number;
  }) {
    try {
      return await backendFunctions.upsertLearningLesson(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleUpsertLessonQuiz(payload: {
    lessonId: string;
    questions: Array<{
      prompt: string;
      options: string[];
      correctOptionIndex: number;
    }>;
  }) {
    try {
      return await backendFunctions.upsertLessonQuiz(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleRecordLessonPlayback(payload: {
    lessonId: string;
    currentSeconds: number;
    durationSeconds: number;
  }) {
    try {
      return await backendFunctions.recordLessonPlayback(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleStartLessonQuiz(lessonId: string) {
    try {
      return await backendFunctions.startLessonQuiz({ lessonId });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleSubmitLessonQuiz(payload: {
    lessonId: string;
    answers: number[];
  }) {
    try {
      return await backendFunctions.submitLessonQuiz(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleSaveOwnProfile(payload: {
    firstName?: string;
    lastName?: string;
    cpf?: string;
    phone?: string;
    birthDate?: string;
    isCompetitor?: boolean;
    photoFile?: File | null;
  }) {
    if (!authUser) {
      throw new Error('Sessao invalida.');
    }

    let photoPath: string | undefined;
    if (payload.photoFile) {
      photoPath = await uploadUserPhoto(authUser.uid, payload.photoFile);
    }

    try {
      await backendFunctions.updateOwnStudentProfile({
        firstName: payload.firstName,
        lastName: payload.lastName,
        cpf: payload.cpf,
        phone: payload.phone,
        birthDate: payload.birthDate,
        isCompetitor: payload.isCompetitor,
        photoPath,
      });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function handleChangeOwnEmail(nextEmail: string, currentPassword: string) {
    try {
      await updateSignedInEmail(currentPassword, nextEmail);
      await backendFunctions.syncOwnUserEmail({ email: nextEmail });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  if (!authReady) {
    return buildLoadingView('Validando a sua sessao com o Firebase.');
  }

  if (!authUser) {
    return <LoginView onLogin={handleLogin} initialError={loginScreenError} />;
  }

  if (profileLoading || !profile) {
    return buildLoadingView('Carregando perfil, academia e permissoes.');
  }

  const currentUser = toUiUser({
    id: profile.id,
    user: profile,
    graduations,
    fights,
  });
  const isSuperAdmin = profile.role === 'superadmin';
  const isSuperadminProfessorView = isSuperAdmin && superadminViewMode === 'professor';
  const isSuperadminNetworkView = isSuperAdmin && superadminViewMode !== 'professor';
  const viewUserRole = isSuperadminProfessorView ? UserRole.PROFESSOR : currentUser.role;
  const actingUser = isSuperadminProfessorView
    ? { ...currentUser, role: UserRole.PROFESSOR }
    : currentUser;
  const isStaff =
    viewUserRole === UserRole.PROFESSOR ||
    viewUserRole === UserRole.SUPERADMIN;
  const isFirstAcademySetup = isSuperAdmin && !superadminDirectoryLoading && allAcademies.length === 0;
  const hasFocusedAcademy = Boolean(selectedAcademyId) && allAcademies.some((entry) => entry.id === selectedAcademyId);
  const needsProfessorVisionUnit = isSuperadminProfessorView && !hasFocusedAcademy;
  const bootstrapMessage = !sessionValidated
    ? 'Sincronizando permissoes da sua sessao.'
    : 'Carregando perfil, academia e permissoes.';
  const isBootstrapPending = !sessionValidated || superadminDirectoryLoading || (!isSuperAdmin && (academyLoading || academyStatus === 'idle'));
  const mobileUnitLabel = isSuperAdmin
    ? (
      isSuperadminProfessorView
        ? (
          selectedAcademyId
            ? (allAcademies.find((entry) => entry.id === selectedAcademyId)?.name ?? academy?.name ?? 'Unidade em foco')
            : 'Escolha uma unidade'
        )
        : (
          selectedAcademyId
            ? (allAcademies.find((entry) => entry.id === selectedAcademyId)?.name ?? academy?.name ?? 'Academia em foco')
            : (isFirstAcademySetup ? 'Sem academias' : 'Toda a rede')
        )
    )
    : (academy?.name ?? 'Sincronizando unidade');
  const isMissingRequiredAcademy = !isSuperAdmin && sessionValidated && !academyLoading && academyStatus === 'missing';
  const hasAcademyAccessError = !isSuperAdmin && sessionValidated && !academyLoading && academyStatus === 'error';

  if (isBootstrapPending) {
    return (
      <>
        {sessionError ? (
          <div className="fixed top-24 left-4 right-4 z-[70] mx-auto max-w-lg">
            <div className="app-toast text-sm">
              <div>{sessionError}</div>
              {import.meta.env.DEV && sessionErrorSource ? (
                <div className="mt-1 text-xs opacity-80">{sessionErrorSource}</div>
              ) : null}
            </div>
          </div>
        ) : null}

        <Layout
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          userRole={currentUser.role}
          unreadNotificationsCount={unreadNotificationsCount}
          mobileUnitLabel={mobileUnitLabel}
          isDarkMode={isDarkMode}
          onSetThemeMode={setThemeMode}
        >
          {buildInlineLoadingView(bootstrapMessage)}
        </Layout>
      </>
    );
  }

  if (isMissingRequiredAcademy) {
    return buildMissingAcademyView(handleLogout);
  }

  if (hasAcademyAccessError) {
    return buildAcademyLoadErrorView(
      sessionError || 'Sua sessao nao conseguiu confirmar a unidade vinculada a esta conta.',
      handleLogout,
    );
  }

  if (isSuperAdmin && superadminViewMode === null) {
    return buildSuperadminVisionChoiceView({
      academyCount: allAcademies.length,
      onChooseNetwork: () => {
        setSuperadminViewMode('superadmin');
        setActiveTab(allAcademies.length === 0 ? 'management' : 'home');
      },
      onChooseProfessor: () => {
        if (allAcademies.length === 0) {
          return;
        }

        setSelectedAcademyId('');
        setSuperadminViewMode('professor');
        setActiveTab('home');
      },
    });
  }

  if (needsProfessorVisionUnit) {
    return buildSuperadminUnitFocusView({
      academies: allAcademies,
      onSelectAcademy: (academyId) => {
        setSelectedAcademyId(academyId);
        setActiveTab('home');
      },
      onBackToNetwork: () => {
        setSuperadminViewMode('superadmin');
        setActiveTab(allAcademies.length === 0 ? 'management' : 'home');
      },
    });
  }

  const resolvedAcademy = academy ?? buildFallbackAcademy(profile.id);
  const branch = toBranch(resolvedAcademy);
  const attendanceThisMonth = attendances.filter((attendance) => isSameMonth(attendance.checkedInAt));
  const attendanceDays = [...new Set(attendanceThisMonth.map((attendance) => attendance.checkedInAt?.toDate().getDate()).filter(Boolean))] as number[];
  const students = academyUsers
    .filter((user) => user.role === 'student')
    .map((user) => toUiUser({ id: user.id, user, graduations: [], fights: [] }));
  const classNameById = new Map(classes.map((lesson) => [lesson.id, lesson.title]));
  const finishedClassesThisMonth = classes.filter((lesson) => lesson.status === 'finished' && isSameMonth(lesson.scheduledStart));
  const attendedFinishedClassIds = new Set(
    attendanceThisMonth
      .map((attendance) => attendance.classId)
      .filter((classId) => finishedClassesThisMonth.some((lesson) => lesson.id === classId)),
  );
  const attendanceRate = finishedClassesThisMonth.length === 0
    ? 0
    : Math.round((attendedFinishedClassIds.size / finishedClassesThisMonth.length) * 100);
  const studentAttendanceRequests = attendanceRequests.filter((entry) => entry.userId === profile.id);
  const canActionRequests =
    viewUserRole === UserRole.PROFESSOR ||
    viewUserRole === UserRole.SUPERADMIN;
  const focusedLearningAcademy = selectedAcademyId
    ? (allAcademies.find((entry) => entry.id === selectedAcademyId) ?? null)
    : null;
  const renderContent = () => {
    if (isFirstAcademySetup) {
      return (
        <ManagementView
          userRole={viewUserRole}
          academy={resolvedAcademy}
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
    }

    switch (activeTab) {
      case 'home':
        return isSuperadminNetworkView
          ? (
            <SuperadminDashboardView
              academies={allAcademies}
              allUsers={allUsers}
              academy={academy}
              academyUsers={academyUsers}
              classes={classes}
              competitions={competitions}
              selectedAcademyId={selectedAcademyId}
              onEnterAcademy={setSelectedAcademyId}
              onClearFocus={() => setSelectedAcademyId('')}
            />
          )
          : isStaff ? (
            <StaffDashboardView
              user={actingUser}
              academy={resolvedAcademy}
              academyUsers={academyUsers}
              classes={classes}
              notifications={notifications}
              joinRequests={joinRequests}
              attendanceRequests={attendanceRequests}
              canReviewAllAttendanceRequests={profile.role === 'superadmin'}
            />
          ) : (
            <HomeView
              user={currentUser}
              branch={branch}
              monthlyAttendanceCount={attendanceThisMonth.length}
              attendanceDays={attendanceDays}
            />
          );
      case 'calendar': {
        const professors = academyUsers
          .filter((u) => u.role === 'professor' || u.role === 'superadmin')
          .map((u) => ({ id: u.id, displayName: u.displayName }));

        return (
          <CalendarView
            userRole={viewUserRole}
            currentUserId={currentUser.id}
            currentUserName={profile.displayName}
            professors={professors}
            classes={classes}
            attendanceRequests={studentAttendanceRequests}
            attendances={attendances}
            attendanceRate={attendanceRate}
            classNameById={classNameById}
            onCreateClass={handleCreateClass}
            onStartClass={handleStartClass}
            onFinishClass={handleFinishClass}
            onRefreshQr={handleRefreshQr}
            onRegisterAttendance={handleRegisterAttendance}
            onSubmitAttendanceRequest={handleSubmitAttendanceRequest}
          />
        );
      }
      case 'competition':
        return <CompetitionView competitions={competitions} fights={fights} />;
      case 'graduation':
        return (
          <GraduationView
            user={currentUser}
            profile={profile}
            academy={resolvedAcademy}
            graduations={graduations}
          />
        );
      case 'students':
        return (
          <StudentsView
            students={students}
            graduationRequests={graduationRequests}
            academyName={hasFocusedAcademy ? (allAcademies.find((entry) => entry.id === selectedAcademyId)?.name ?? resolvedAcademy.name) : undefined}
            academies={allAcademies.map((entry) => ({ id: entry.id, name: entry.name }))}
            selectedAcademyId={selectedAcademyId}
            onSelectAcademy={setSelectedAcademyId}
            requireAcademySelection={isSuperAdmin}
            selectedStudentId={selectedStudentId}
            onSelectStudent={setSelectedStudentId}
            onApproveGraduationRequest={handleApproveGraduationRequest}
            onUpdateStudentBeltGrade={handleUpdateStudentBeltGrade}
          />
        );
      case 'management':
        return (
          <ManagementView
            userRole={viewUserRole}
            academy={resolvedAcademy}
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
            academy={resolvedAcademy}
            userRole={viewUserRole}
            currentUserId={currentUser.id}
            academyUsers={academyUsers}
            classes={classes}
            notifications={notifications}
            joinRequests={joinRequests}
            attendanceRequests={attendanceRequests}
            graduationRequests={graduationRequests}
            academies={allAcademies}
            selectedAcademyId={selectedAcademyId}
            canActionRequests={canActionRequests}
            onSelectAcademy={setSelectedAcademyId}
            onSendNotification={handleSendNotification}
            onMarkRead={handleMarkNotificationRead}
            onApproveJoinRequest={handleApproveJoinRequest}
            onRejectJoinRequest={handleRejectJoinRequest}
            onApproveAttendanceRequest={handleApproveAttendanceRequest}
            onRejectAttendanceRequest={handleRejectAttendanceRequest}
            onApproveGraduationRequest={handleApproveGraduationRequest}
            onOpenStudent={(studentId) => {
              setSelectedStudentId(studentId);
              setActiveTab('students');
            }}
          />
        );
      case 'learning':
        return (
          <LearningHubView
            academyName={resolvedAcademy.name}
            userName={actingUser.name}
            userRole={viewUserRole}
            selectedAcademyId={selectedAcademyId}
            selectedAcademy={focusedLearningAcademy}
            academies={allAcademies}
            allUsers={allUsers}
            academyUsers={academyUsers}
            tracks={learningTracks}
            courses={learningCourses}
            lessons={learningLessons}
            quizzes={learningQuizzes}
            progressRecords={learningProgress}
            onSelectAcademy={setSelectedAcademyId}
            onUpsertTrack={handleUpsertLearningTrack}
            onUpsertCourse={handleUpsertLearningCourse}
            onUpsertLesson={handleUpsertLearningLesson}
            onUpsertQuiz={handleUpsertLessonQuiz}
            onRecordPlayback={handleRecordLessonPlayback}
            onStartQuiz={handleStartLessonQuiz}
            onSubmitQuiz={handleSubmitLessonQuiz}
          />
        );
      case 'store':
        return (
          <StoreView
            products={MOCK_PRODUCTS}
            branch={branch}
          />
        );
      case 'profile':
        return (
          <ProfileView
            user={currentUser}
            profile={profile}
            totalClasses={profile.attendanceCount}
            academyName={isSuperAdmin ? NETWORK_NAME : resolvedAcademy.name}
            attendanceRate={attendanceRate}
            attendances={attendances}
            classNameById={classNameById}
            graduations={graduations}
            isDarkMode={isDarkMode}
            onSetThemeMode={setThemeMode}
            onSaveProfile={handleSaveOwnProfile}
            onChangeEmail={handleChangeOwnEmail}
            onOpenNotifications={() => setActiveTab('notifications')}
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
        <div className="fixed top-24 left-4 right-4 z-[70] mx-auto max-w-lg">
          <div className="app-toast text-sm">
            <div>{sessionError}</div>
            {import.meta.env.DEV && sessionErrorSource ? (
              <div className="mt-1 text-xs opacity-80">{sessionErrorSource}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {pendingCheckin ? (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.75)', padding: 20,
        }}>
          <div className="app-panel" style={{
            width: '100%', maxWidth: 340, borderRadius: '1.8rem', padding: 28,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'stretch', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Confirmar presença</span>
              <button
                type="button"
                className="app-button app-button--ghost app-button--icon"
                style={{ width: 32, height: 32 }}
                onClick={() => { setPendingCheckin(null); setCheckinStatus('idle'); setCheckinStep('initial'); setCheckinError(''); }}
                disabled={checkinStatus === 'loading'}
              >
                <X size={16} />
              </button>
            </div>

            {/* Success */}
            {checkinStatus === 'success' ? (
              <>
                <CheckCircle size={48} style={{ color: '#22c55e' }} />
                <p style={{ fontWeight: 600, fontSize: '1rem', color: '#22c55e' }}>Presença confirmada!</p>
                <button
                  type="button"
                  className="app-button app-button--block"
                  style={{ background: '#fff', color: '#22c55e', fontWeight: 700, border: '1.5px solid #22c55e' }}
                  onClick={() => { setPendingCheckin(null); setCheckinStatus('idle'); setCheckinStep('initial'); setActiveTab('calendar'); }}
                >
                  Ver calendário
                </button>
              </>
            ) : checkinStep === 'initial' ? (
              /* Etapa 1 — pergunta */
              <>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                  Deseja registrar sua presença nesta aula?
                </p>
                {checkinError ? (
                  <p style={{ fontSize: '0.8rem', color: '#f87171', textAlign: 'center' }}>{checkinError}</p>
                ) : null}
                <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                  <button
                    type="button"
                    className="app-button app-button--block"
                    style={{ background: '#fff', color: '#f87171', fontWeight: 700, border: '1.5px solid #f87171' }}
                    onClick={() => { setPendingCheckin(null); setCheckinStatus('idle'); setCheckinStep('initial'); setCheckinError(''); }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="app-button app-button--block"
                    style={{ background: '#fff', color: '#22c55e', fontWeight: 700, border: '1.5px solid #22c55e' }}
                    onClick={() => { setCheckinStep('confirm'); setCheckinError(''); }}
                  >
                    Confirmar
                  </button>
                </div>
              </>
            ) : (
              /* Etapa 2 — confirmação final */
              <>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, textAlign: 'center' }}>
                  Tem certeza?
                </p>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                  Sua presença será registrada permanentemente.
                </p>
                {checkinError ? (
                  <p style={{ fontSize: '0.8rem', color: '#f87171', textAlign: 'center' }}>{checkinError}</p>
                ) : null}
                <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                  <button
                    type="button"
                    className="app-button app-button--block"
                    style={{ background: '#fff', color: '#f87171', fontWeight: 700, border: '1.5px solid #f87171' }}
                    onClick={() => { setCheckinStep('initial'); setCheckinError(''); }}
                    disabled={checkinStatus === 'loading'}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="app-button app-button--block"
                    style={{ background: '#fff', color: '#22c55e', fontWeight: 700, border: '1.5px solid #22c55e' }}
                    disabled={checkinStatus === 'loading'}
                    onClick={() => {
                      setCheckinStatus('loading');
                      setCheckinError('');
                      void backendFunctions.registerAttendance({
                        classId: pendingCheckin.classId,
                        qrToken: pendingCheckin.token,
                      }).then(() => {
                        setCheckinStatus('success');
                      }).catch((err: unknown) => {
                        setCheckinStatus('error');
                        setCheckinStep('initial');
                        setCheckinError(err instanceof Error ? err.message : 'Erro ao registrar presença.');
                      });
                    }}
                  >
                    {checkinStatus === 'loading' ? 'Registrando...' : 'Sim, confirmar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <Layout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userRole={currentUser.role}
        unreadNotificationsCount={unreadNotificationsCount}
        mobileUnitLabel={mobileUnitLabel}
        superadminViewMode={superadminViewMode}
        onSetSuperadminViewMode={(nextMode) => {
          if (nextMode === 'professor' && allAcademies.length === 0) {
            return;
          }

          if (nextMode === 'professor') {
            setSelectedAcademyId('');
          }

          setSuperadminViewMode(nextMode);
          setActiveTab(nextMode === 'professor' ? 'home' : (allAcademies.length === 0 ? 'management' : 'home'));
        }}
        superadminAcademies={allAcademies.map((entry) => ({ id: entry.id, name: entry.name }))}
        selectedAcademyId={selectedAcademyId}
        onSelectAcademy={setSelectedAcademyId}
        isDarkMode={isDarkMode}
        onSetThemeMode={setThemeMode}
      >
        <Suspense fallback={buildInlineLoadingView('Carregando esta area do APPLevel.')}>
          {renderContent()}
        </Suspense>
      </Layout>
    </>
  );
};

export default App;
