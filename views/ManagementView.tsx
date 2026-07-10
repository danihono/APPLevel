import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ADULT_BELTS,
  beltLabel,
} from '../beltCatalog';
import { toUiUser } from '../services/firebase/adapters';
import { Building2, Save, Settings2, ShieldCheck, UserPlus, Users } from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, ClassRecord, UserRecord } from '../services/firebase/models';
import InstructorEditModal from '../components/InstructorEditModal';
import StudentRoster from '../components/StudentRoster';
import { useConfirm } from '../components/ConfirmDialog';
import { UserRole, type UserVideo } from '../types';

interface ManagementViewProps {
  userRole?: UserRole;
  academy: FirestoreEntity<AcademyRecord>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  academies?: Array<FirestoreEntity<AcademyRecord>>;
  allUsers?: Array<FirestoreEntity<UserRecord>>;
  studentVideoLibraryById?: Map<string, UserVideo[]>;
  selectedAcademyId?: string;
  onSelectAcademy?: (academyId: string) => void;
  focusSection?: 'master-black' | null;
  onFocusSectionHandled?: () => void;
  onUpdateAcademy: (payload: {
    academyId: string;
    name: string;
    timezone: string;
    status: 'active' | 'inactive' | 'suspended';
    classCheckinWindowMinutes: number;
    masterBlackLimit: number;
  }) => Promise<void>;
  onCreateAcademy: (payload: {
    name: string;
    slug?: string;
    timezone?: string;
    masterBlackLimit?: number;
  }) => Promise<{ academyId: string }>;
  onCreateUser: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: 'professor' | 'superadmin';
    academyId?: string;
    phone?: string;
    belt?: string;
    grade?: number;
    stripes?: number;
    plainPassword?: string;
  }) => Promise<void>;
  onUpdateStudentBeltGrade?: (payload: { userId: string; belt: string; grade: number; stripes?: number; kidsCategory?: string }) => Promise<void>;
  onSetStudentAttendanceBonus?: (payload: { userId: string; attendanceCountBonus: number }) => Promise<void>;
  onAdminUpdateStudentProfile?: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    cpf?: string;
    birthDate?: string;
    isCompetitor?: boolean;
  }) => Promise<void>;
  onAdminUpdateStudentTimeline?: (payload: {
    userId: string;
    trainingStartDate?: string;
    lastGraduationDateOverride?: string;
    lastStripeDateOverride?: string;
  }) => Promise<void>;
  onAdminUpdateStudentPhoto?: (payload: { userId: string; photoFile: File }) => Promise<void>;
  onAdminSetUserMemberships?: (payload: { userId: string; memberships: string[] }) => Promise<void>;
  onUpdateInstructor?: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    newPassword?: string;
    plainPassword?: string;
    phone?: string;
    belt?: string;
    grade?: number;
    lastGraduationDateOverride?: string;
  }) => Promise<void>;
}

const staffBeltPresets = ADULT_BELTS;

function FeedbackBlock({ success, error }: { success?: string; error?: string }) {
  return (
    <>
      {success ? <div className="app-alert app-alert--success">{success}</div> : null}
      {error ? <div className="app-alert app-alert--error">{error}</div> : null}
    </>
  );
}

function roleLabel(role: UserRecord['role']) {
  switch (role) {
    case 'admin':
      return 'Professor';
    case 'professor':
      return 'Instrutor';
    case 'superadmin':
      return 'Superadmin';
    default:
      return 'Aluno';
  }
}

function roleTagLabel(role: UserRecord['role']) {
  switch (role) {
    case 'superadmin':
      return 'Superadmin';
    case 'admin':
    case 'professor':
      return 'Professor';
    default:
      return 'Aluno';
  }
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'A';
}

function staffRankLabel(user: FirestoreEntity<UserRecord>) {
  const gradeValue = Number(user.grade ?? user.stripes ?? 0);
  return `Faixa ${beltLabel(user.belt)} · ${gradeValue}º Grau`;
}

const ManagementView: React.FC<ManagementViewProps> = ({
  userRole,
  academy,
  classes,
  academyUsers,
  academies = [],
  allUsers = [],
  studentVideoLibraryById = new Map(),
  selectedAcademyId,
  onSelectAcademy,
  focusSection,
  onFocusSectionHandled,
  onUpdateAcademy,
  onCreateAcademy,
  onCreateUser,
  onUpdateStudentBeltGrade,
  onSetStudentAttendanceBonus,
  onAdminUpdateStudentProfile,
  onAdminUpdateStudentTimeline,
  onAdminUpdateStudentPhoto,
  onAdminSetUserMemberships,
  onUpdateInstructor,
}) => {
  const canManage = userRole === UserRole.PROFESSOR || userRole === UserRole.SUPERADMIN;
  const isSuperAdmin = userRole === UserRole.SUPERADMIN;
  const focusedAcademy = useMemo(() => {
    if (!isSuperAdmin) {
      return academy;
    }

    return academies.find((entry) => entry.id === selectedAcademyId) ?? null;
  }, [academies, academy, isSuperAdmin, selectedAcademyId]);
  const hasManagedAcademy = !isSuperAdmin || focusedAcademy !== null;
  const managedAcademy = focusedAcademy ?? academy;
  const hasAnyAcademy = academies.length > 0;

  const managedUsers = useMemo(() => {
    if (!isSuperAdmin) {
      return academyUsers;
    }

    if (!focusedAcademy) {
      return [];
    }

    return allUsers.filter((entry) => entry.academyId === managedAcademy.id);
  }, [academyUsers, allUsers, focusedAcademy, isSuperAdmin, managedAcademy.id]);

  const activeStudents = managedUsers.filter((entry) => entry.role === 'student' && entry.status === 'active');
  const inactiveStudents = managedUsers.filter((entry) => entry.role === 'student' && entry.status !== 'active');
  const instructors = managedUsers.filter((entry) => entry.role !== 'student');
  const students = managedUsers.filter((entry) => entry.role === 'student');
  const studentRosterUsers = useMemo(() => (
    students.map((entry) => toUiUser({
      id: entry.id,
      user: entry,
      graduations: [],
      fights: [],
      videoLibrary: studentVideoLibraryById.get(entry.id),
    }))
  ), [studentVideoLibraryById, students]);
  const activeClasses = classes.filter((entry) => entry.status === 'active').length;
  const sortedInstructors = useMemo(() => (
    [...instructors].sort((left, right) => {
      const roleOrder: Record<UserRecord['role'], number> = {
        superadmin: 0,
        admin: 1,
        professor: 2,
        student: 3,
      };

      const orderDiff = roleOrder[left.role] - roleOrder[right.role];
      if (orderDiff !== 0) {
        return orderDiff;
      }

      return left.displayName.localeCompare(right.displayName, 'pt-BR');
    })
  ), [instructors]);
  const masterBlackSectionRef = useRef<HTMLElement | null>(null);

  const confirm = useConfirm();
  const [academyName, setAcademyName] = useState(managedAcademy.name);
  const [academyTimezone, setAcademyTimezone] = useState(managedAcademy.timezone);
  const [academyStatus, setAcademyStatus] = useState<'active' | 'inactive' | 'suspended'>(managedAcademy.status);
  const [checkinWindow, setCheckinWindow] = useState(managedAcademy.classCheckinWindowMinutes);
  const [masterBlackLimit, setMasterBlackLimit] = useState(managedAcademy.masterBlackLimit ?? 1);
  const [academyBusy, setAcademyBusy] = useState(false);
  const [academyFeedback, setAcademyFeedback] = useState('');
  const [academyError, setAcademyError] = useState('');

  const [createAcademyBusy, setCreateAcademyBusy] = useState(false);
  const [academyCreateName, setAcademyCreateName] = useState('');
  const [academyCreateSlug, setAcademyCreateSlug] = useState('');
  const [academyCreateTimezone, setAcademyCreateTimezone] = useState('America/Sao_Paulo');
  const [academyCreateMasterBlackLimit, setAcademyCreateMasterBlackLimit] = useState(1);

  const [userBusy, setUserBusy] = useState(false);
  const [userFeedback, setUserFeedback] = useState('');
  const [userError, setUserError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'professor' | 'superadmin'>('professor');
  const [userAcademyId, setUserAcademyId] = useState(selectedAcademyId || managedAcademy.id || '');
  const [phone, setPhone] = useState('');
  const [belt, setBelt] = useState('white');
  const [grade, setGrade] = useState(0);

  const [peopleSearch, setPeopleSearch] = useState('');
  const [managementSection, setManagementSection] = useState<'overview' | 'students'>('overview');
  const [editingInstructor, setEditingInstructor] = useState<FirestoreEntity<UserRecord> | null>(null);

  useEffect(() => {
    setAcademyName(managedAcademy.name);
    setAcademyTimezone(managedAcademy.timezone);
    setAcademyStatus(managedAcademy.status);
    setCheckinWindow(managedAcademy.classCheckinWindowMinutes);
    setMasterBlackLimit(managedAcademy.masterBlackLimit ?? 1);
  }, [managedAcademy]);

  useEffect(() => {
    setPeopleSearch('');
  }, [managedAcademy.id]);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }

    setUserAcademyId((current) => {
      if (role === 'superadmin') {
        return '';
      }

      if (current && academies.some((entry) => entry.id === current)) {
        return current;
      }

      if (selectedAcademyId && academies.some((entry) => entry.id === selectedAcademyId)) {
        return selectedAcademyId;
      }

      return academies[0]?.id ?? '';
    });
  }, [academies, isSuperAdmin, managedAcademy.id, role, selectedAcademyId]);

  useEffect(() => {
    if (focusSection !== 'master-black') {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      masterBlackSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      onFocusSectionHandled?.();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [focusSection, managedAcademy.id, onFocusSectionHandled]);

  async function handleSaveAcademy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasManagedAcademy) {
      setAcademyError('Selecione uma unidade para editar as configurações.');
      setAcademyFeedback('');
      return;
    }

    if (academyStatus === 'suspended' && managedAcademy.status !== 'suspended') {
      if (!(await confirm({
        title: 'Suspender academia',
        message: 'Tem certeza que deseja SUSPENDER esta academia? Os alunos serão impedidos de acessar o sistema.',
        confirmLabel: 'Suspender',
        tone: 'danger',
      }))) {
        return;
      }
    } else if (academyStatus === 'inactive' && managedAcademy.status === 'active') {
      if (!(await confirm({
        title: 'Inativar academia',
        message: 'Tem certeza que deseja inativar esta academia?',
        confirmLabel: 'Inativar',
        tone: 'danger',
      }))) {
        return;
      }
    }

    setAcademyBusy(true);
    setAcademyFeedback('');
    setAcademyError('');

    try {
      await onUpdateAcademy({
        academyId: managedAcademy.id,
        name: academyName,
        timezone: academyTimezone,
        status: academyStatus,
        classCheckinWindowMinutes: checkinWindow,
        masterBlackLimit,
      });
      setAcademyFeedback('Academia atualizada com sucesso.');
    } catch (submitError) {
      setAcademyError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar a academia.');
    } finally {
      setAcademyBusy(false);
    }
  }

  async function handleCreateAcademy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateAcademyBusy(true);
    setAcademyFeedback('');
    setAcademyError('');

    try {
      const createdAcademy = await onCreateAcademy({
        name: academyCreateName,
        slug: academyCreateSlug || undefined,
        timezone: academyCreateTimezone || undefined,
        masterBlackLimit: academyCreateMasterBlackLimit,
      });
      onSelectAcademy?.(createdAcademy.academyId);
      setAcademyCreateName('');
      setAcademyCreateSlug('');
      setAcademyCreateTimezone('America/Sao_Paulo');
      setAcademyCreateMasterBlackLimit(1);
      setAcademyFeedback('Nova academia criada com sucesso.');
    } catch (submitError) {
      setAcademyError(submitError instanceof Error ? submitError.message : 'Não foi possível criar a academia.');
    } finally {
      setCreateAcademyBusy(false);
    }
  }

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const requiresExistingAcademy = isSuperAdmin && role !== 'superadmin';
    const academyExists = academies.some((entry) => entry.id === userAcademyId);

    if (requiresExistingAcademy && !academyExists) {
      setUserError('Selecione uma unidade existente para este acesso.');
      setUserFeedback('');
      return;
    }

    setUserBusy(true);
    setUserFeedback('');
    setUserError('');

    try {
      await onCreateUser({
        firstName,
        lastName,
        email,
        password,
        role,
        academyId: isSuperAdmin
          ? (role === 'superadmin' ? undefined : userAcademyId)
          : undefined,
        phone: phone || undefined,
        belt,
        grade,
        plainPassword: password || undefined,
      });
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setRole('professor');
      setUserAcademyId(selectedAcademyId && academies.some((entry) => entry.id === selectedAcademyId)
        ? selectedAcademyId
        : (academies[0]?.id ?? ''));
      setPhone('');
      setBelt(staffBeltPresets[0]);
      setGrade(0);
      setUserFeedback('Acesso criado com sucesso.');
    } catch (submitError) {
      setUserError(submitError instanceof Error ? submitError.message : 'Não foi possível criar o acesso.');
    } finally {
      setUserBusy(false);
    }
  }

  const isEmptyNetwork = isSuperAdmin && !hasAnyAcademy;
  const isAwaitingAcademyFocus = isSuperAdmin && hasAnyAcademy && !hasManagedAcademy;
  const networkLeaders = allUsers.filter((entry) => entry.role !== 'student').length;
  const networkStudents = allUsers.filter((entry) => entry.role === 'student').length;
  const focusLabel = isEmptyNetwork
    ? 'Rede LEVEL'
    : isAwaitingAcademyFocus
      ? 'Selecione uma unidade'
      : managedAcademy.name;
  const focusDescription = isEmptyNetwork
    ? 'Crie a primeira unidade da LEVEL para liberar a operação da rede.'
    : isAwaitingAcademyFocus
      ? 'Escolha uma unidade para editar configurações, acompanhar alunos e ajustar regras locais.'
      : 'Ajuste operação, equipe e regras da unidade em foco.';
  const filteredInstructors = useMemo(() => {
    const query = peopleSearch.trim().toLocaleLowerCase('pt-BR');
    if (!query) {
      return sortedInstructors;
    }

    return sortedInstructors.filter((entry) => {
      const searchIndex = [
        entry.displayName,
        roleTagLabel(entry.role),
        beltLabel(entry.belt),
        `${entry.grade ?? entry.stripes ?? 0}`,
      ]
        .join(' ')
        .toLocaleLowerCase('pt-BR');

      return searchIndex.includes(query);
    });
  }, [peopleSearch, sortedInstructors]);

  const sectionTabs = (
    <div className="app-segment app-segment--block" role="tablist" aria-label="Seções da academia">
      <button
        type="button"
        role="tab"
        aria-selected={managementSection === 'overview'}
        onClick={() => setManagementSection('overview')}
        className={`app-segment__button ${managementSection === 'overview' ? 'is-active' : ''}`}
      >
        Visão geral
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={managementSection === 'students'}
        onClick={() => setManagementSection('students')}
        className={`app-segment__button ${managementSection === 'students' ? 'is-active' : ''}`}
      >
        Alunos
      </button>
    </div>
  );

  if (!isSuperAdmin) {
    return (
      <div className="view-shell academy-mobile">
        <section className="app-panel app-panel-pad">
          <div className="flex flex-col gap-4">
            <div>
              <p className="app-section-label">Academia em foco</p>
              <h2 className="mt-2 text-xl font-bold">{focusLabel}</h2>
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">{focusDescription}</p>
            </div>
            {sectionTabs}
          </div>
        </section>

        {managementSection === 'students' ? (
          <StudentRoster
            students={studentRosterUsers}
            progressionRules={managedAcademy.progressionRules}
            academyName={managedAcademy.name}
            kicker="Alunos da academia"
            title="Todos os alunos da sua unidade com filtros e leitura rápida."
            description="Pesquise por nome, filtre por faixa e grau e abra o detalhe completo de cada aluno."
            emptyResultsMessage={students.length === 0 ? 'Nenhum aluno cadastrado nesta academia.' : 'Nenhum aluno encontrado com os filtros atuais.'}
            onUpdateStudentBeltGrade={onUpdateStudentBeltGrade}
            onSetStudentAttendanceBonus={onSetStudentAttendanceBonus}
            onAdminUpdateStudentProfile={onAdminUpdateStudentProfile}
            onAdminUpdateStudentTimeline={onAdminUpdateStudentTimeline}
            onAdminUpdateStudentPhoto={onAdminUpdateStudentPhoto}
            academies={academies.map((entry) => ({ id: entry.id, name: entry.name }))}
            viewerRole={isSuperAdmin ? 'superadmin' : 'professor'}
            onAdminSetUserMemberships={isSuperAdmin ? onAdminSetUserMemberships : undefined}
          />
        ) : hasManagedAcademy ? (
          <>
            <section className="academy-mobile__stats">
              <article className="academy-mobile__stat-card">
                <p className="academy-mobile__stat-value">{sortedInstructors.length}</p>
                <p className="academy-mobile__stat-label">Instrutores</p>
              </article>

              <article className="academy-mobile__stat-card">
                <p className="academy-mobile__stat-value">{activeStudents.length}</p>
                <p className="academy-mobile__stat-label">Alunos ativos</p>
              </article>

              <article className="academy-mobile__stat-card">
                <p className="academy-mobile__stat-value">{inactiveStudents.length}</p>
                <p className="academy-mobile__stat-label">Alunos inativos</p>
              </article>

              <article className="academy-mobile__stat-card">
                <p className="academy-mobile__stat-value">{activeClasses}</p>
                <p className="academy-mobile__stat-label">Aulas ativas</p>
              </article>
            </section>

            <section className="academy-mobile__section">
              <div className="academy-mobile__section-head">
                <p className="academy-mobile__section-label">Equipe de instrutores</p>
                <input
                  type="search"
                  value={peopleSearch}
                  onChange={(event) => setPeopleSearch(event.target.value)}
                  className="app-input academy-mobile__search-input"
                  placeholder="Buscar pessoas"
                  aria-label="Buscar pessoas da academia"
                />
              </div>

              <div className="academy-mobile__list">
                {filteredInstructors.length > 0 ? (
                  filteredInstructors.map((entry) => (
                    <article key={entry.id} className="academy-mobile__instructor-card">
                      <div className="academy-mobile__avatar" aria-hidden="true">{getInitial(entry.displayName)}</div>

                      <div className="academy-mobile__instructor-copy">
                        <p className="academy-mobile__instructor-name">{entry.displayName}</p>
                        <p className="academy-mobile__instructor-rank">{staffRankLabel(entry)}</p>
                      </div>

                      <span className="academy-mobile__role-tag">{roleTagLabel(entry.role)}</span>
                    </article>
                  ))
                ) : sortedInstructors.length > 0 ? (
                  <div className="academy-mobile__empty">Nenhuma pessoa encontrada para essa busca.</div>
                ) : (
                  <div className="academy-mobile__empty">Nenhum instrutor vinculado a esta academia ainda.</div>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="academy-mobile__section">
            <div className="academy-mobile__empty">
              Selecione uma unidade para visualizar equipe e operação local.
            </div>
          </section>
        )}
      </div>
    );
  }

  if (editingInstructor && onUpdateInstructor) {
    return (
      <InstructorEditModal
        instructor={editingInstructor}
        onClose={() => setEditingInstructor(null)}
        onSave={async (payload) => {
          await onUpdateInstructor(payload);
          setEditingInstructor(null);
        }}
      />
    );
  }

  return (
    <div className="view-shell">
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="app-section-label">{isSuperAdmin ? 'Gestão da rede' : 'Academia em foco'}</p>
            <h2 className="mt-2 text-xl font-bold">{focusLabel}</h2>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">{focusDescription}</p>
          </div>

          {isSuperAdmin && onSelectAcademy ? (
            <label className="app-field min-w-[18rem]">
              <span className="app-field__label">Unidade selecionada</span>
              <select
                value={selectedAcademyId ?? ''}
                onChange={(event) => onSelectAcademy(event.target.value)}
                className="app-select"
              >
                <option value="">{hasAnyAcademy ? 'Nenhuma unidade selecionada' : 'Nenhuma unidade criada'}</option>
                {academies.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="mt-6">
          {sectionTabs}
        </div>
      </section>

      {managementSection === 'students' ? (
        hasManagedAcademy ? (
          <StudentRoster
            students={studentRosterUsers}
            progressionRules={managedAcademy.progressionRules}
            academyName={managedAcademy.name}
            kicker="Alunos da academia"
            title="Todos os alunos da unidade em uma leitura pronta para operação."
            description="Use busca, faixa, grau e ordenação para encontrar rapidamente quem você precisa."
            emptyResultsMessage={students.length === 0 ? 'Nenhum aluno cadastrado nesta academia.' : 'Nenhum aluno encontrado com os filtros atuais.'}
            onUpdateStudentBeltGrade={onUpdateStudentBeltGrade}
            onSetStudentAttendanceBonus={onSetStudentAttendanceBonus}
            onAdminUpdateStudentProfile={onAdminUpdateStudentProfile}
            onAdminUpdateStudentTimeline={onAdminUpdateStudentTimeline}
            onAdminUpdateStudentPhoto={onAdminUpdateStudentPhoto}
            academies={academies.map((entry) => ({ id: entry.id, name: entry.name }))}
            viewerRole={isSuperAdmin ? 'superadmin' : 'professor'}
            onAdminSetUserMemberships={isSuperAdmin ? onAdminSetUserMemberships : undefined}
          />
        ) : (
          <section className="app-panel app-panel-pad">
            <div className="app-empty">
              {isEmptyNetwork
                ? 'A rede ainda não tem nenhuma unidade. Use o formulário abaixo para cadastrar a primeira unidade da LEVEL.'
                : 'Selecione uma unidade para abrir os alunos daquela academia.'}
            </div>
          </section>
        )
      ) : (
        <>
      <section className="app-stat-grid management-kpi-grid">
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{hasManagedAcademy ? 'Instrutores' : 'Unidades'}</p>
          <p className="app-stat-card__value">{hasManagedAcademy ? instructors.length : academies.length}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{hasManagedAcademy ? 'Alunos ativos' : 'Alunos na rede'}</p>
          <p className="app-stat-card__value">{hasManagedAcademy ? activeStudents.length : networkStudents}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{hasManagedAcademy ? 'Alunos inativos' : 'Lideranças'}</p>
          <p className="app-stat-card__value">
            {hasManagedAcademy ? inactiveStudents.length : networkLeaders}
          </p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{hasManagedAcademy ? 'Aulas ativas' : 'Status da rede'}</p>
          <p className="app-stat-card__value">{hasManagedAcademy ? activeClasses : (hasAnyAcademy ? 'Pronta' : 'Inicial')}</p>
        </article>
      </section>

      {hasManagedAcademy ? (
        <section ref={masterBlackSectionRef} className="app-grid-2">
        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="app-section-label">Instrutores</p>
              <h2 className="text-xl font-bold">Equipe da academia</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            {instructors.map((entry) => {
              const clickable = isSuperAdmin && Boolean(onUpdateInstructor);
              return (
                <div
                  key={entry.id}
                  className={`app-list-card${clickable ? ' superadmin-detail-row--clickable' : ''}`}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => setEditingInstructor(entry) : undefined}
                  onKeyDown={clickable ? (e) => e.key === 'Enter' && setEditingInstructor(entry) : undefined}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">{entry.displayName}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                        {roleLabel(entry.role)} • {entry.email}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="app-badge app-badge--gold">{beltLabel(entry.belt)}</span>
                      <span className="app-badge app-badge--muted">{entry.status}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {instructors.length === 0 ? (
              <div className="app-empty">Nenhum instrutor vinculado a esta academia ainda.</div>
            ) : null}
          </div>
        </article>

        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Users size={18} />
            </div>
            <div>
              <p className="app-section-label">Alunos</p>
              <h2 className="text-xl font-bold">Base de alunos</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            {students.slice(0, 8).map((entry) => (
              <div key={entry.id} className="app-list-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{entry.displayName}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                      {entry.attendanceCount} presenças • faixa {beltLabel(entry.belt)}
                    </p>
                  </div>
                  <span className="app-badge app-badge--muted">{entry.status}</span>
                </div>
              </div>
            ))}

            {students.length === 0 ? (
              <div className="app-empty">Nenhum aluno cadastrado nesta academia.</div>
            ) : null}
          </div>
        </article>
        </section>
      ) : (
        <section className="app-panel app-panel-pad">
          <div className="app-empty">
            {isEmptyNetwork
              ? 'A rede ainda não tem nenhuma unidade. Use o formulário abaixo para cadastrar a primeira unidade da LEVEL.'
              : 'Selecione uma unidade para abrir equipe, alunos e configurações locais.'}
          </div>
        </section>
      )}

      {!canManage ? (
        <div className="app-empty">
          Este perfil tem apenas visualização. As configurações da academia ficam disponíveis para professores e superadmins.
        </div>
      ) : (
        <>
          {hasManagedAcademy ? (
            <form onSubmit={handleSaveAcademy} className="app-panel app-panel-pad">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell">
                  <Settings2 size={18} />
                </div>
                <div>
                  <p className="app-section-label">Configurações</p>
                  <h2 className="text-xl font-bold">Ajustes da academia</h2>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <FeedbackBlock success={academyFeedback} error={academyError} />
              </div>

              <div className="mt-6 app-grid-2">
                <label className="app-field">
                  <span className="app-field__label">Nome</span>
                  <input value={academyName} onChange={(event) => setAcademyName(event.target.value)} className="app-input" />
                </label>
                <label className="app-field">
                  <span className="app-field__label">Timezone</span>
                  <input value={academyTimezone} onChange={(event) => setAcademyTimezone(event.target.value)} className="app-input" />
                </label>
                <label className="app-field">
                  <span className="app-field__label">Status</span>
                  <select value={academyStatus} onChange={(event) => setAcademyStatus(event.target.value as 'active' | 'inactive' | 'suspended')} className="app-select">
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                    <option value="suspended">Suspensa</option>
                  </select>
                </label>
                <label className="app-field">
                  <span className="app-field__label">Janela de check-in (min)</span>
                  <input type="number" min={1} value={checkinWindow} onChange={(event) => setCheckinWindow(Number(event.target.value))} className="app-input" />
                </label>
                <label className="app-field">
                  <span className="app-field__label">Limite de master black</span>
                  <input type="number" min={0} value={masterBlackLimit} onChange={(event) => setMasterBlackLimit(Number(event.target.value))} className="app-input" />
                </label>
              </div>

              <button type="submit" disabled={academyBusy} className="app-button app-button--gold mt-6">
                <Save size={16} />
                {academyBusy ? 'Salvando...' : 'Salvar academia'}
              </button>
            </form>
          ) : (
            <section className="app-panel app-panel-pad">
              <div className="app-empty">As configurações locais ficam disponíveis assim que você selecionar uma unidade.</div>
            </section>
          )}

          {isSuperAdmin ? (
            <form onSubmit={handleCreateAcademy} className="app-panel app-panel-pad">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell">
                  <Building2 size={18} />
                </div>
                <div>
                  <p className="app-section-label">Nova academia</p>
                  <h2 className="text-xl font-bold">Criar unidade</h2>
                </div>
              </div>

              <div className="mt-6 app-grid-2">
                <label className="app-field">
                  <span className="app-field__label">Nome</span>
                  <input value={academyCreateName} onChange={(event) => setAcademyCreateName(event.target.value)} className="app-input" required />
                </label>
                <label className="app-field">
                  <span className="app-field__label">Slug</span>
                  <input value={academyCreateSlug} onChange={(event) => setAcademyCreateSlug(event.target.value)} className="app-input" placeholder="level-centro" />
                </label>
                <label className="app-field">
                  <span className="app-field__label">Timezone</span>
                  <input value={academyCreateTimezone} onChange={(event) => setAcademyCreateTimezone(event.target.value)} className="app-input" />
                </label>
                <label className="app-field">
                  <span className="app-field__label">Limite master black</span>
                  <input type="number" min={0} value={academyCreateMasterBlackLimit} onChange={(event) => setAcademyCreateMasterBlackLimit(Number(event.target.value))} className="app-input" />
                </label>
              </div>

              <button type="submit" disabled={createAcademyBusy} className="app-button app-button--dark mt-6">
                <ShieldCheck size={16} />
                {createAcademyBusy ? 'Criando...' : 'Criar academia'}
              </button>
            </form>
          ) : null}

          {isSuperAdmin ? (
            <form onSubmit={handleCreateUser} className="app-panel app-panel-pad">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <UserPlus size={18} />
              </div>
              <div>
                <p className="app-section-label">Acessos</p>
                <h2 className="text-xl font-bold">Criar usuário</h2>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <FeedbackBlock success={userFeedback} error={userError} />
            </div>

            <div className="mt-6 app-grid-2">
              <label className="app-field">
                <span className="app-field__label">Nome</span>
                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="app-input" required />
              </label>
              <label className="app-field">
                <span className="app-field__label">Sobrenome</span>
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="app-input" required />
              </label>
              <label className="app-field">
                <span className="app-field__label">E-mail</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="app-input" required />
              </label>
              <label className="app-field">
                <span className="app-field__label">Senha temporária</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="app-input" required />
              </label>
              <label className="app-field">
                <span className="app-field__label">Perfil</span>
                <select value={role} onChange={(event) => setRole(event.target.value as 'professor' | 'superadmin')} className="app-select">
                  <option value="professor">Professor</option>
                  {isSuperAdmin ? <option value="superadmin">Superadmin</option> : null}
                </select>
              </label>
              {isSuperAdmin ? (
                <label className="app-field">
                  <span className="app-field__label">Unidade do acesso</span>
                  <select
                    value={role === 'superadmin' ? '' : userAcademyId}
                    onChange={(event) => setUserAcademyId(event.target.value)}
                    className="app-select"
                    disabled={role === 'superadmin'}
                    required={role !== 'superadmin'}
                  >
                    <option value="">{role === 'superadmin' ? 'Acesso global do superadmin' : 'Selecione uma unidade'}</option>
                    {academies.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </select>
                  <span className="app-field__hint">
                    Professores e alunos ficam vinculados a uma única unidade existente. Para master black, use Professor com faixa preta. Apenas superadmin acessa toda a rede.
                  </span>
                </label>
              ) : null}
              <label className="app-field">
                <span className="app-field__label">Telefone</span>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} className="app-input" />
              </label>
              <label className="app-field">
                <span className="app-field__label">Faixa</span>
	                <select value={belt} onChange={(event) => setBelt(event.target.value)} className="app-select">
	                  {staffBeltPresets.map((entry) => <option key={entry} value={entry}>{beltLabel(entry)}</option>)}
	                </select>
              </label>
              <label className="app-field">
                <span className="app-field__label">Grau</span>
                <input type="number" min={0} value={grade} onChange={(event) => setGrade(Number(event.target.value))} className="app-input" />
              </label>
            </div>

            {!hasAnyAcademy && role !== 'superadmin' ? (
              <div className="app-empty mt-6">Crie a primeira unidade antes de cadastrar acessos vinculados a unidades.</div>
            ) : null}

            <button type="submit" disabled={userBusy || (!hasAnyAcademy && role !== 'superadmin')} className="app-button app-button--gold mt-6">
              <UserPlus size={16} />
              {userBusy ? 'Criando...' : 'Criar acesso'}
            </button>
            </form>
          ) : null}
        </>
      )}
        </>
      )}
    </div>
  );
};

export default ManagementView;
