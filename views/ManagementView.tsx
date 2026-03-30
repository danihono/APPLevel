import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Save, Settings2, ShieldCheck, UserPlus } from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, ClassRecord, UserRecord } from '../services/firebase/models';
import { UserRole } from '../types';

interface ManagementViewProps {
  userRole?: UserRole;
  academy: FirestoreEntity<AcademyRecord>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  academies?: Array<FirestoreEntity<AcademyRecord>>;
  allUsers?: Array<FirestoreEntity<UserRecord>>;
  selectedAcademyId?: string;
  onSelectAcademy?: (academyId: string) => void;
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
  }) => Promise<void>;
  onCreateUser: (payload: {
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
  }) => Promise<void>;
  onSaveProgressionRules: (payload: {
    academyId?: string;
    milestones: Array<{
      belt: string;
      minAttendances: number;
      stripeEvery: number;
      maxStripes: number;
    }>;
  }) => Promise<void>;
}

const beltPresets = ['white', 'blue', 'purple', 'brown', 'black'];

function isMasterBlack(user: FirestoreEntity<UserRecord>) {
  const belt = user.belt.trim().toLowerCase();
  const isBlack = belt === 'black' || belt === 'preta';
  const isLeader = user.role === 'professor' || user.role === 'admin' || user.role === 'superadmin';
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

const ManagementView: React.FC<ManagementViewProps> = ({
  userRole,
  academy,
  classes,
  academyUsers,
  academies = [],
  allUsers = [],
  selectedAcademyId,
  onSelectAcademy,
  onUpdateAcademy,
  onCreateAcademy,
  onCreateUser,
  onSaveProgressionRules,
}) => {
  const canManage = userRole === UserRole.ADMIN || userRole === UserRole.SUPERADMIN;
  const isSuperAdmin = userRole === UserRole.SUPERADMIN;
  const managedAcademy = useMemo(() => {
    if (!isSuperAdmin) {
      return academy;
    }

    return academies.find((entry) => entry.id === selectedAcademyId) ?? academy;
  }, [academies, academy, isSuperAdmin, selectedAcademyId]);

  const managedUsers = useMemo(() => {
    if (!isSuperAdmin) {
      return academyUsers;
    }

    return allUsers.filter((entry) => entry.academyId === managedAcademy.id);
  }, [academyUsers, allUsers, isSuperAdmin, managedAcademy.id]);

  const activeStudents = managedUsers.filter((entry) => entry.role === 'student' && entry.status === 'active');
  const masterBlackUsers = managedUsers.filter(isMasterBlack);
  const activeClasses = classes.filter((entry) => entry.status === 'active').length;

  const [academyName, setAcademyName] = useState(managedAcademy.name);
  const [academyTimezone, setAcademyTimezone] = useState(managedAcademy.timezone);
  const [academyStatus, setAcademyStatus] = useState<'active' | 'inactive' | 'suspended'>(managedAcademy.status);
  const [checkinWindow, setCheckinWindow] = useState(managedAcademy.classCheckinWindowMinutes);
  const [masterBlackLimit, setMasterBlackLimit] = useState(managedAcademy.masterBlackLimit ?? 1);
  const [rules, setRules] = useState(managedAcademy.progressionRules?.milestones ?? []);

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
  const [role, setRole] = useState<'student' | 'professor' | 'admin' | 'superadmin'>('student');
  const [phone, setPhone] = useState('');
  const [belt, setBelt] = useState('white');
  const [grade, setGrade] = useState(0);
  const [stripes, setStripes] = useState(0);

  const [rulesBusy, setRulesBusy] = useState(false);
  const [rulesFeedback, setRulesFeedback] = useState('');
  const [rulesError, setRulesError] = useState('');

  useEffect(() => {
    setAcademyName(managedAcademy.name);
    setAcademyTimezone(managedAcademy.timezone);
    setAcademyStatus(managedAcademy.status);
    setCheckinWindow(managedAcademy.classCheckinWindowMinutes);
    setMasterBlackLimit(managedAcademy.masterBlackLimit ?? 1);
    setRules(managedAcademy.progressionRules?.milestones ?? beltPresets.map((entry) => ({
      belt: entry,
      minAttendances: 0,
      stripeEvery: 20,
      maxStripes: 4,
    })));
  }, [managedAcademy]);

  async function handleSaveAcademy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      await onCreateAcademy({
        name: academyCreateName,
        slug: academyCreateSlug || undefined,
        timezone: academyCreateTimezone || undefined,
        masterBlackLimit: academyCreateMasterBlackLimit,
      });
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
        academyId: isSuperAdmin ? managedAcademy.id : undefined,
        phone: phone || undefined,
        belt,
        grade,
        stripes,
      });
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setRole('student');
      setPhone('');
      setBelt('white');
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
    setRulesBusy(true);
    setRulesFeedback('');
    setRulesError('');

    try {
      await onSaveProgressionRules({
        academyId: isSuperAdmin ? managedAcademy.id : undefined,
        milestones: rules.map((entry) => ({
          belt: entry.belt,
          minAttendances: Number(entry.minAttendances),
          stripeEvery: Number(entry.stripeEvery),
          maxStripes: Number(entry.maxStripes),
        })),
      });
      setRulesFeedback('Regras de graduacao atualizadas com sucesso.');
    } catch (submitError) {
      setRulesError(submitError instanceof Error ? submitError.message : 'Nao foi possivel salvar as regras.');
    } finally {
      setRulesBusy(false);
    }
  }

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="app-section-label">Control room</p>
            <h1 className="app-section-title">Gestao pesada com interface leve de operar.</h1>
            <p className="app-section-copy">
              {managedAcademy.name} - configure status, limite de master black, acessos e regras sem cair num layout padrao.
            </p>
          </div>

          {isSuperAdmin && onSelectAcademy ? (
            <label className="app-field min-w-[18rem]">
              <span className="app-field__label">Academia selecionada</span>
              <select
                value={managedAcademy.id}
                onChange={(event) => onSelectAcademy(event.target.value)}
                className="app-select"
              >
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
          <p className="app-stat-card__label">Alunos ativos</p>
          <p className="app-stat-card__value">{activeStudents.length}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Aulas ativas</p>
          <p className="app-stat-card__value">{activeClasses}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Master black</p>
          <p className={`app-stat-card__value ${masterBlackUsers.length > masterBlackLimit ? 'text-[color:var(--danger)]' : ''}`}>
            {masterBlackUsers.length}/{masterBlackLimit}
          </p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Status</p>
          <p className="app-stat-card__value capitalize">{managedAcademy.status}</p>
        </article>
      </section>

      {!canManage ? (
        <div className="app-empty">
          Este perfil tem apenas visualizacao. A gestao completa fica disponivel para admins e superadmins.
        </div>
      ) : (
        <>
          <form onSubmit={handleSaveAcademy} className="app-panel app-panel-pad">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <Settings2 size={18} />
              </div>
              <div>
                <p className="app-section-label">Academia</p>
                <h2 className="text-xl font-bold">Configuracoes da unidade</h2>
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

          <section className="app-panel app-panel-pad">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <ShieldCheck size={18} />
              </div>
              <div>
                <p className="app-section-label">Master black</p>
                <h2 className="text-xl font-bold">Liderancas da academia</h2>
              </div>
            </div>

            <div className="mt-6 app-list">
              {masterBlackUsers.map((entry) => (
                <div key={entry.id} className="app-list-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">{entry.displayName}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">{entry.role} - {entry.email}</p>
                    </div>
                    <span className="app-badge app-badge--gold">{entry.belt}</span>
                  </div>
                </div>
              ))}

              {masterBlackUsers.length === 0 ? (
                <div className="app-empty">Nenhum master black cadastrado nesta academia ainda.</div>
              ) : null}
            </div>
          </section>

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
                <select value={role} onChange={(event) => setRole(event.target.value as 'student' | 'professor' | 'admin' | 'superadmin')} className="app-select">
                  <option value="student">Aluno</option>
                  <option value="professor">Professor</option>
                  <option value="admin">Admin</option>
                  {isSuperAdmin ? <option value="superadmin">Superadmin</option> : null}
                </select>
              </label>
              <label className="app-field">
                <span className="app-field__label">Telefone</span>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} className="app-input" />
              </label>
              <label className="app-field">
                <span className="app-field__label">Faixa</span>
                <select value={belt} onChange={(event) => setBelt(event.target.value)} className="app-select">
                  {beltPresets.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
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

            <button type="submit" disabled={userBusy} className="app-button app-button--gold mt-6">
              <UserPlus size={16} />
              {userBusy ? 'Criando...' : 'Criar acesso'}
            </button>
          </form>

          <section className="app-panel app-panel-pad">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <ShieldCheck size={18} />
              </div>
              <div>
                <p className="app-section-label">Graduacao</p>
                <h2 className="text-xl font-bold">Regras por faixa</h2>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <FeedbackBlock success={rulesFeedback} error={rulesError} />
            </div>

            <div className="mt-6 app-list">
              {rules.map((entry, index) => (
                <div key={`${entry.belt}-${index}`} className="app-panel app-panel--soft p-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <label className="app-field">
                      <span className="app-field__label">Faixa</span>
                      <input
                        value={entry.belt}
                        onChange={(event) => setRules((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, belt: event.target.value } : item))}
                        className="app-input"
                      />
                    </label>
                    <label className="app-field">
                      <span className="app-field__label">Min. presencas</span>
                      <input
                        type="number"
                        min={0}
                        value={entry.minAttendances}
                        onChange={(event) => setRules((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, minAttendances: Number(event.target.value) } : item))}
                        className="app-input"
                      />
                    </label>
                    <label className="app-field">
                      <span className="app-field__label">Novo grau a cada</span>
                      <input
                        type="number"
                        min={1}
                        value={entry.stripeEvery}
                        onChange={(event) => setRules((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, stripeEvery: Number(event.target.value) } : item))}
                        className="app-input"
                      />
                    </label>
                    <label className="app-field">
                      <span className="app-field__label">Max. graus</span>
                      <input
                        type="number"
                        min={1}
                        value={entry.maxStripes}
                        onChange={(event) => setRules((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, maxStripes: Number(event.target.value) } : item))}
                        className="app-input"
                      />
                    </label>
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
      )}
    </div>
  );
};

export default ManagementView;
