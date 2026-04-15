import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ADULT_BELTS,
  DEFAULT_PROGRESSION_RULES,
  KIDS_CATEGORIES,
  beltLabel,
  getBeltOptions,
  inferKidsCategoryFromBirthDate,
  inferTrainingTypeFromBirthDate,
  isKidsOnlyBelt,
  kidsCategoryLabel,
  normalizeProgressionRules,
  type ProgressionRulesV2,
} from '../beltCatalog';
import { Building2, GraduationCap, Save, Settings2, ShieldCheck, UserPlus, Users } from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, ClassRecord, UserRecord } from '../services/firebase/models';
import { UserRole, type KidsCategory } from '../types';

interface ManagementViewProps {
  userRole?: UserRole;
  academy: FirestoreEntity<AcademyRecord>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  academies?: Array<FirestoreEntity<AcademyRecord>>;
  allUsers?: Array<FirestoreEntity<UserRecord>>;
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
  }) => Promise<void>;
  onSaveProgressionRules: (payload: {
    academyId?: string;
    adult: {
      belts: Array<{
        belt: string;
        stripeEvery: number;
        maxStripes: number;
      }>;
    };
    kids: {
      level_kids: {
        belts: Array<{
          belt: string;
          stripeEvery: number;
          maxStripes: number;
        }>;
      };
      level_infanto_juvenil: {
        belts: Array<{
          belt: string;
          stripeEvery: number;
          maxStripes: number;
        }>;
      };
      level_juvenil: {
        belts: Array<{
          belt: string;
          stripeEvery: number;
          maxStripes: number;
        }>;
      };
    };
  }) => Promise<void>;
  onUpdateStudentBeltGrade: (payload: {
    userId: string;
    belt: string;
    grade: number;
    stripes?: number;
    kidsCategory?: string;
  }) => Promise<void>;
}

const staffBeltPresets = ADULT_BELTS;
const kidsRuleNotes: Record<KidsCategory, string> = {
  level_kids: 'Branca e cinza com 12 aulas por grau.',
  level_infanto_juvenil: 'Branca/cinza com 15 aulas. Amarela/laranja com 20 aulas por grau.',
  level_juvenil: 'Branca/cinza com 20 aulas. Amarela/laranja com 22. Verde com 25 aulas por grau.',
};

function isMasterBlack(user: FirestoreEntity<UserRecord>) {
  const belt = user.belt.trim().toLowerCase();
  const isBlack = belt === 'black' || belt === 'preta';
  const isLeader = user.role === 'professor' || user.role === 'superadmin';
  return isBlack && isLeader;
}

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

const ManagementView: React.FC<ManagementViewProps> = ({
  userRole,
  academy,
  classes,
  academyUsers,
  academies = [],
  allUsers = [],
  selectedAcademyId,
  onSelectAcademy,
  focusSection,
  onFocusSectionHandled,
  onUpdateAcademy,
  onCreateAcademy,
  onCreateUser,
  onSaveProgressionRules,
  onUpdateStudentBeltGrade,
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
  const instructors = managedUsers.filter((entry) => entry.role !== 'student');
  const students = managedUsers.filter((entry) => entry.role === 'student');
  const masterBlackUsers = managedUsers.filter(isMasterBlack);
  const activeClasses = classes.filter((entry) => entry.status === 'active').length;
  const masterBlackSectionRef = useRef<HTMLElement | null>(null);

  const [academyName, setAcademyName] = useState(managedAcademy.name);
  const [academyTimezone, setAcademyTimezone] = useState(managedAcademy.timezone);
  const [academyStatus, setAcademyStatus] = useState<'active' | 'inactive' | 'suspended'>(managedAcademy.status);
  const [checkinWindow, setCheckinWindow] = useState(managedAcademy.classCheckinWindowMinutes);
  const [masterBlackLimit, setMasterBlackLimit] = useState(managedAcademy.masterBlackLimit ?? 1);
  const [rules, setRules] = useState<ProgressionRulesV2>(normalizeProgressionRules(managedAcademy.progressionRules));

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
  const [stripes, setStripes] = useState(0);

  const [rulesBusy, setRulesBusy] = useState(false);
  const [rulesFeedback, setRulesFeedback] = useState('');
  const [rulesError, setRulesError] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentBelt, setStudentBelt] = useState('white');
  const [studentGrade, setStudentGrade] = useState(0);
  const [studentKidsCategory, setStudentKidsCategory] = useState<KidsCategory | ''>('');
  const [studentProgressBusy, setStudentProgressBusy] = useState(false);
  const [studentProgressFeedback, setStudentProgressFeedback] = useState('');
  const [studentProgressError, setStudentProgressError] = useState('');

  useEffect(() => {
    setAcademyName(managedAcademy.name);
    setAcademyTimezone(managedAcademy.timezone);
    setAcademyStatus(managedAcademy.status);
    setCheckinWindow(managedAcademy.classCheckinWindowMinutes);
    setMasterBlackLimit(managedAcademy.masterBlackLimit ?? 1);
    setRules(normalizeProgressionRules(managedAcademy.progressionRules ?? DEFAULT_PROGRESSION_RULES));
  }, [managedAcademy]);

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

  useEffect(() => {
    const selectedStudent = students.find((entry) => entry.id === selectedStudentId) ?? students[0];

    if (!selectedStudent) {
      setSelectedStudentId('');
      setStudentBelt('white');
      setStudentGrade(0);
      setStudentKidsCategory('');
      return;
    }

    setSelectedStudentId(selectedStudent.id);
    setStudentBelt(selectedStudent.belt);
    setStudentGrade(selectedStudent.grade ?? selectedStudent.stripes ?? 0);
    setStudentKidsCategory(selectedStudent.kidsCategory ?? inferKidsCategoryFromBirthDate(selectedStudent.birthDate) ?? '');
  }, [selectedStudentId, students]);

  const selectedStudent = students.find((entry) => entry.id === selectedStudentId) ?? students[0] ?? null;
  const studentTrack = useMemo<'Adulto' | 'Kids'>(() => {
    if (isKidsOnlyBelt(studentBelt)) {
      return 'Kids';
    }

    if (studentKidsCategory) {
      return 'Kids';
    }

    return inferTrainingTypeFromBirthDate(selectedStudent?.birthDate);
  }, [selectedStudent?.birthDate, studentBelt, studentKidsCategory]);

  const studentBeltOptions = useMemo(() => {
    const baseOptions = getBeltOptions(studentTrack, studentKidsCategory || undefined);
    if (baseOptions.some((entry) => entry.value === studentBelt)) {
      return baseOptions;
    }

    return [...baseOptions, { value: studentBelt as never, label: beltLabel(studentBelt) }];
  }, [studentBelt, studentKidsCategory, studentTrack]);
  const inferredStudentKidsCategory = selectedStudent
    ? inferKidsCategoryFromBirthDate(selectedStudent.birthDate)
    : undefined;

  useEffect(() => {
    if (!studentBeltOptions.length) {
      return;
    }

    if (!studentBeltOptions.some((entry) => entry.value === studentBelt)) {
      setStudentBelt(studentBeltOptions[0].value);
      setStudentGrade(0);
    }
  }, [studentBelt, studentBeltOptions]);

  function updateAdultRule(index: number, field: 'stripeEvery' | 'maxStripes', value: number) {
    setRules((previous) => ({
      ...previous,
      adult: {
        belts: previous.adult.belts.map((entry, entryIndex) => (
          entryIndex === index
            ? { ...entry, [field]: value }
            : entry
        )),
      },
    }));
  }

  function updateKidsRule(category: KidsCategory, index: number, field: 'stripeEvery' | 'maxStripes', value: number) {
    setRules((previous) => ({
      ...previous,
      kids: {
        ...previous.kids,
        [category]: {
          belts: previous.kids[category].belts.map((entry, entryIndex) => (
            entryIndex === index
              ? { ...entry, [field]: value }
              : entry
          )),
        },
      },
    }));
  }

  async function handleSaveAcademy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasManagedAcademy) {
      setAcademyError('Selecione uma unidade para editar as configuracoes.');
      setAcademyFeedback('');
      return;
    }

    if (academyStatus === 'suspended' && managedAcademy.status !== 'suspended') {
      if (!window.confirm('Tem certeza que deseja SUSPENDER esta academia? Os alunos serao impedidos de acessar o sistema.')) {
        return;
      }
    } else if (academyStatus === 'inactive' && managedAcademy.status === 'active') {
      if (!window.confirm('Tem certeza que deseja inativar esta academia?')) {
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
      setAcademyError(submitError instanceof Error ? submitError.message : 'Nao foi possivel salvar a academia.');
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
      setAcademyError(submitError instanceof Error ? submitError.message : 'Nao foi possivel criar a academia.');
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
        stripes,
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
      setStripes(0);
      setUserFeedback('Acesso criado com sucesso.');
    } catch (submitError) {
      setUserError(submitError instanceof Error ? submitError.message : 'Nao foi possivel criar o acesso.');
    } finally {
      setUserBusy(false);
    }
  }

  async function handleSaveRules() {
    if (!hasManagedAcademy) {
      setRulesError('Selecione uma unidade antes de salvar regras de graduacao.');
      setRulesFeedback('');
      return;
    }

    setRulesBusy(true);
    setRulesFeedback('');
    setRulesError('');

    try {
      await onSaveProgressionRules({
        academyId: isSuperAdmin ? managedAcademy.id : undefined,
        adult: {
          belts: rules.adult.belts.map((entry) => ({
            belt: entry.belt,
            stripeEvery: Number(entry.stripeEvery),
            maxStripes: Number(entry.maxStripes),
          })),
        },
        kids: {
          level_kids: {
            belts: rules.kids.level_kids.belts.map((entry) => ({
              belt: entry.belt,
              stripeEvery: Number(entry.stripeEvery),
              maxStripes: Number(entry.maxStripes),
            })),
          },
          level_infanto_juvenil: {
            belts: rules.kids.level_infanto_juvenil.belts.map((entry) => ({
              belt: entry.belt,
              stripeEvery: Number(entry.stripeEvery),
              maxStripes: Number(entry.maxStripes),
            })),
          },
          level_juvenil: {
            belts: rules.kids.level_juvenil.belts.map((entry) => ({
              belt: entry.belt,
              stripeEvery: Number(entry.stripeEvery),
              maxStripes: Number(entry.maxStripes),
            })),
          },
        },
      });
      setRulesFeedback('Regras de graduacao atualizadas com sucesso.');
    } catch (submitError) {
      setRulesError(submitError instanceof Error ? submitError.message : 'Nao foi possivel salvar as regras.');
    } finally {
      setRulesBusy(false);
    }
  }

  async function handleSaveStudentProgress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasManagedAcademy) {
      setStudentProgressError('Selecione uma unidade antes de alterar a graduacao de alunos.');
      setStudentProgressFeedback('');
      return;
    }

    if (!selectedStudentId) {
      setStudentProgressError('Selecione um aluno para atualizar a graduacao.');
      setStudentProgressFeedback('');
      return;
    }

    setStudentProgressBusy(true);
    setStudentProgressFeedback('');
    setStudentProgressError('');

    try {
      await onUpdateStudentBeltGrade({
        userId: selectedStudentId,
        belt: studentBelt,
        grade: studentGrade,
        stripes: studentGrade,
        kidsCategory: studentTrack === 'Kids' ? studentKidsCategory : '',
      });
      setStudentProgressFeedback('Graduacao do aluno atualizada com sucesso.');
    } catch (submitError) {
      setStudentProgressError(submitError instanceof Error ? submitError.message : 'Nao foi possivel atualizar a graduacao.');
    } finally {
      setStudentProgressBusy(false);
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
    ? 'Crie a primeira unidade da LEVEL para liberar a operacao da rede.'
    : isAwaitingAcademyFocus
      ? 'Escolha uma unidade para editar configuracoes, acompanhar alunos e ajustar regras locais.'
      : 'Ajuste operacao, equipe e regras da unidade em foco.';

  return (
    <div className="view-shell">
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="app-section-label">{isSuperAdmin ? 'Gestao da rede' : 'Academia em foco'}</p>
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
      </section>

      <section className="app-stat-grid">
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{hasManagedAcademy ? 'Instrutores' : 'Unidades'}</p>
          <p className="app-stat-card__value">{hasManagedAcademy ? instructors.length : academies.length}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{hasManagedAcademy ? 'Alunos ativos' : 'Alunos na rede'}</p>
          <p className="app-stat-card__value">{hasManagedAcademy ? activeStudents.length : networkStudents}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{hasManagedAcademy ? 'Master black' : 'Liderancas'}</p>
          <p className={`app-stat-card__value ${hasManagedAcademy && masterBlackUsers.length > masterBlackLimit ? 'text-[color:var(--danger)]' : ''}`}>
            {hasManagedAcademy ? `${masterBlackUsers.length}/${masterBlackLimit}` : networkLeaders}
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
            {instructors.map((entry) => (
              <div key={entry.id} className="app-list-card">
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
            ))}

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
                      {entry.attendanceCount} presencas • faixa {beltLabel(entry.belt)}
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
              ? 'A rede ainda nao tem nenhuma unidade. Use o formulario abaixo para cadastrar a primeira unidade da LEVEL.'
              : 'Selecione uma unidade para abrir equipe, alunos e configuracoes locais.'}
          </div>
        </section>
      )}

      {!canManage ? (
        <div className="app-empty">
          Este perfil tem apenas visualizacao. As configuracoes da academia ficam disponiveis para professores e superadmins.
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
                  <p className="app-section-label">Configuracoes</p>
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
              <div className="app-empty">As configuracoes locais ficam disponiveis assim que voce selecionar uma unidade.</div>
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
                <h2 className="text-xl font-bold">Criar usuario</h2>
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
                <span className="app-field__label">Senha temporaria</span>
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
                    Professores e alunos ficam vinculados a uma unica unidade existente. Para master black, use Professor com faixa preta. Apenas superadmin acessa toda a rede.
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
              <label className="app-field">
                <span className="app-field__label">Listras</span>
                <input type="number" min={0} value={stripes} onChange={(event) => setStripes(Number(event.target.value))} className="app-input" />
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

          {hasManagedAcademy ? (
            <>
              <form onSubmit={handleSaveStudentProgress} className="app-panel app-panel-pad">
                <div className="flex items-center gap-3">
                  <div className="app-icon-shell">
                    <GraduationCap size={18} />
                  </div>
                  <div>
                    <p className="app-section-label">Graduacao manual</p>
                    <h2 className="text-xl font-bold">Faixa e grau do aluno</h2>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <FeedbackBlock success={studentProgressFeedback} error={studentProgressError} />
                </div>

	                <div className="mt-6 app-grid-2">
	                  <label className="app-field md:col-span-2">
	                    <span className="app-field__label">Aluno</span>
	                    <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} className="app-select" required>
	                      {students.map((entry) => (
	                        <option key={entry.id} value={entry.id}>{entry.displayName}</option>
	                      ))}
	                    </select>
	                  </label>

	                  {selectedStudent ? (
	                    <div className="app-panel app-panel--soft p-4 md:col-span-2">
	                      <div className="flex flex-wrap items-center justify-between gap-3">
	                        <div>
	                          <p className="text-sm font-bold">{selectedStudent.displayName}</p>
	                          <p className="mt-1 text-xs text-[color:var(--text-soft)]">
	                            Trilha {studentTrack} • Faixa atual {beltLabel(selectedStudent.belt)}
	                          </p>
	                        </div>
	                        {studentTrack === 'Kids' ? (
	                          <span className="app-badge app-badge--muted">
	                            {studentKidsCategory
	                              ? `Categoria: ${kidsCategoryLabel(studentKidsCategory)}`
	                              : `Categoria sugerida: ${kidsCategoryLabel(inferredStudentKidsCategory)}`}
	                          </span>
	                        ) : null}
	                      </div>
	                    </div>
	                  ) : null}

	                  <label className="app-field">
	                    <span className="app-field__label">Faixa</span>
	                    <select value={studentBelt} onChange={(event) => setStudentBelt(event.target.value)} className="app-select">
	                      {studentBeltOptions.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
	                    </select>
	                  </label>

	                  <label className="app-field">
	                    <span className="app-field__label">Grau</span>
	                    <input type="number" min={0} value={studentGrade} onChange={(event) => setStudentGrade(Number(event.target.value))} className="app-input" />
	                  </label>

	                  {studentTrack === 'Kids' ? (
	                    <label className="app-field md:col-span-2">
	                      <span className="app-field__label">Categoria kids</span>
	                      <select
	                        value={studentKidsCategory}
	                        onChange={(event) => setStudentKidsCategory(event.target.value as KidsCategory | '')}
	                        className="app-select"
	                      >
	                        <option value="">Inferir pela idade</option>
	                        {KIDS_CATEGORIES.map((entry) => (
	                          <option key={entry.value} value={entry.value}>{entry.label}</option>
	                        ))}
	                      </select>
	                      <span className="app-field__hint">
	                        Se ficar em branco, o sistema usa a faixa etaria do aluno para escolher a curva infantil.
	                      </span>
	                    </label>
	                  ) : null}
	                </div>

                <button type="submit" disabled={studentProgressBusy || students.length === 0} className="app-button app-button--gold mt-6">
                  <Save size={16} />
                  {studentProgressBusy ? 'Salvando...' : 'Salvar graduacao do aluno'}
                </button>

                {students.length === 0 ? (
                  <div className="app-empty mt-6">Nenhum aluno ativo na unidade para atualizar graduacao.</div>
                ) : null}
              </form>

              <section className="app-panel app-panel-pad">
                <div className="flex items-center gap-3">
                  <div className="app-icon-shell">
                    <GraduationCap size={18} />
                  </div>
                  <div>
                    <p className="app-section-label">Graduacao</p>
                    <h2 className="text-xl font-bold">Graduacoes e regras por faixa</h2>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <FeedbackBlock success={rulesFeedback} error={rulesError} />
                </div>

	                <div className="mt-6 space-y-6">
	                  <div>
	                    <div className="mb-4">
	                      <p className="app-section-label">Adulto</p>
	                      <p className="text-sm text-[color:var(--text-muted)]">
	                        Regras a partir de 16 anos. A faixa preta permanece com progressao manual.
	                      </p>
	                    </div>
	                    <div className="app-list">
	                      {rules.adult.belts.map((entry, index) => (
	                        <div key={`adult-${entry.belt}-${index}`} className="app-panel app-panel--soft p-4">
	                          <div className="flex flex-wrap items-center justify-between gap-3">
	                            <div>
	                              <p className="text-sm font-bold">{beltLabel(entry.belt)}</p>
	                              <p className="mt-1 text-xs text-[color:var(--text-soft)]">
	                                {entry.stripeEvery > 0
	                                  ? `Proxima faixa em ${entry.stripeEvery * entry.maxStripes} aulas`
	                                  : 'Progressao manual / IBJJF'}
	                              </p>
	                            </div>
	                            <span className="app-badge app-badge--muted">{entry.maxStripes} graus</span>
	                          </div>
	                          <div className="mt-4 grid gap-4 md:grid-cols-2">
	                            <label className="app-field">
	                              <span className="app-field__label">Aulas por grau</span>
	                              <input
	                                type="number"
	                                min={0}
	                                value={entry.stripeEvery}
	                                onChange={(event) => updateAdultRule(index, 'stripeEvery', Number(event.target.value))}
	                                className="app-input"
	                              />
	                            </label>
	                            <label className="app-field">
	                              <span className="app-field__label">Graus por faixa</span>
	                              <input
	                                type="number"
	                                min={0}
	                                value={entry.maxStripes}
	                                onChange={(event) => updateAdultRule(index, 'maxStripes', Number(event.target.value))}
	                                className="app-input"
	                              />
	                            </label>
	                          </div>
	                        </div>
	                      ))}
	                    </div>
	                  </div>

	                  {KIDS_CATEGORIES.map((category) => (
	                    <div key={category.value}>
	                      <div className="mb-4">
	                        <p className="app-section-label">{category.label}</p>
	                        <p className="text-sm text-[color:var(--text-muted)]">{kidsRuleNotes[category.value]}</p>
	                      </div>
	                      <div className="app-list">
	                        {rules.kids[category.value].belts.map((entry, index) => (
	                          <div key={`${category.value}-${entry.belt}-${index}`} className="app-panel app-panel--soft p-4">
	                            <div className="flex flex-wrap items-center justify-between gap-3">
	                              <div>
	                                <p className="text-sm font-bold">{beltLabel(entry.belt)}</p>
	                                <p className="mt-1 text-xs text-[color:var(--text-soft)]">
	                                  Proxima faixa em {entry.stripeEvery * entry.maxStripes} aulas
	                                </p>
	                              </div>
	                              <span className="app-badge app-badge--muted">{entry.maxStripes} graus</span>
	                            </div>
	                            <div className="mt-4 grid gap-4 md:grid-cols-2">
	                              <label className="app-field">
	                                <span className="app-field__label">Aulas por grau</span>
	                                <input
	                                  type="number"
	                                  min={0}
	                                  value={entry.stripeEvery}
	                                  onChange={(event) => updateKidsRule(category.value, index, 'stripeEvery', Number(event.target.value))}
	                                  className="app-input"
	                                />
	                              </label>
	                              <label className="app-field">
	                                <span className="app-field__label">Graus por faixa</span>
	                                <input
	                                  type="number"
	                                  min={0}
	                                  value={entry.maxStripes}
	                                  onChange={(event) => updateKidsRule(category.value, index, 'maxStripes', Number(event.target.value))}
	                                  className="app-input"
	                                />
	                              </label>
	                            </div>
	                          </div>
	                        ))}
	                      </div>
	                    </div>
	                  ))}
	                </div>

                <button type="button" onClick={() => void handleSaveRules()} disabled={rulesBusy} className="app-button app-button--dark mt-6">
                  <Save size={16} />
                  {rulesBusy ? 'Salvando...' : 'Salvar regras'}
                </button>
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  );
};

export default ManagementView;
