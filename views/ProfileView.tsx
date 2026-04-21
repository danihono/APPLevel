import React, { useEffect, useMemo, useState } from 'react';
import { beltLabel } from '../beltCatalog';
import { LogOut, Mail, Moon, Phone, Save, ShieldCheck, Sparkles, Sun, Upload, UserRound } from 'lucide-react';
import AvatarWithBelt from '../components/AvatarWithBelt';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, GraduationRecord, UserRecord } from '../services/firebase/models';
import type { User } from '../types';

interface ProfileViewProps {
  user: User;
  profile: FirestoreEntity<UserRecord>;
  totalClasses: number;
  academyName?: string;
  attendanceRate: number;
  attendances: Array<FirestoreEntity<AttendanceRecord>>;
  classNameById: Map<string, string>;
  graduations: Array<FirestoreEntity<GraduationRecord>>;
  isDarkMode: boolean;
  onSetThemeMode: (mode: 'light' | 'dark') => void;
  onSaveProfile: (payload: {
    firstName?: string;
    lastName?: string;
    cpf?: string;
    phone?: string;
    birthDate?: string;
    isCompetitor?: boolean;
    photoFile?: File | null;
  }) => Promise<void>;
  onChangeEmail: (nextEmail: string, currentPassword: string) => Promise<void>;
  onLogout: () => void | Promise<void>;
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

const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  profile,
  totalClasses,
  academyName,
  attendanceRate,
  attendances,
  classNameById,
  graduations,
  isDarkMode,
  onSetThemeMode,
  onSaveProfile,
  onChangeEmail,
  onLogout,
}) => {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [cpf, setCpf] = useState(profile.cpf);
  const [phone, setPhone] = useState(profile.phone || '');
  const [birthDate, setBirthDate] = useState(profile.birthDate || '');
  const [isCompetitor, setIsCompetitor] = useState(profile.isCompetitor ?? false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState('');
  const [emailError, setEmailError] = useState('');

  const recentAttendances = useMemo(() => attendances.slice(0, 6), [attendances]);
  const nextStripeRemaining = Math.max(user.classesToNextStripe - user.currentStripeProgress, 0);
  const nextBeltRemaining = Math.max(user.totalClassesToNextBelt - user.currentBeltProgress, 0);
  const canEditProfile = profile.role === 'student';
  const currentThemeLabel = isDarkMode ? 'Escuro' : 'Claro';

  useEffect(() => {
    setFirstName(profile.firstName);
    setLastName(profile.lastName);
    setCpf(profile.cpf);
    setPhone(profile.phone || '');
    setBirthDate(profile.birthDate || '');
    setIsCompetitor(profile.isCompetitor ?? false);
    setNewEmail(profile.email);
  }, [profile.birthDate, profile.cpf, profile.email, profile.firstName, profile.isCompetitor, profile.lastName, profile.phone]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    setError('');

    try {
      await onSaveProfile({
        firstName,
        lastName,
        cpf,
        phone,
        birthDate,
        isCompetitor,
        photoFile,
      });
      setPhotoFile(null);
      setFeedback('Perfil atualizado com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nao foi possivel salvar o perfil.');
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailBusy(true);
    setEmailFeedback('');
    setEmailError('');

    try {
      await onChangeEmail(newEmail, currentPassword);
      setCurrentPassword('');
      setEmailFeedback('E-mail atualizado com sucesso.');
    } catch (submitError) {
      setEmailError(submitError instanceof Error ? submitError.message : 'Nao foi possivel atualizar o e-mail.');
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <div className="view-shell">
      {/* Header */}
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-center gap-4">
          <AvatarWithBelt
            avatar={user.avatar}
            name={user.name}
            belt={user.belt}
            stripes={user.stripes}
            size="md"
          />

          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold">{user.name}</h2>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              {academyName || 'Academia ativa'} • {roleLabel(profile.role)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="app-badge app-badge--gold">Faixa {beltLabel(user.belt)}</span>
              <span className="app-badge app-badge--muted">{user.stripes} graus</span>
              <span className="app-badge app-badge--muted">{user.type}</span>
              {profile.isCompetitor ? <span className="app-badge app-badge--muted">Competidor</span> : null}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="app-stat-grid">
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Total de aulas</p>
          <p className="app-stat-card__value">{totalClasses}</p>
          <p className="app-stat-card__note">Presencas registradas</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Frequencia</p>
          <p className="app-stat-card__value">{attendanceRate}%</p>
          <p className="app-stat-card__note">Percentual no mes atual</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Proximo grau</p>
          <p className="app-stat-card__value">{nextStripeRemaining}</p>
          <p className="app-stat-card__note">Aulas restantes</p>
        </article>
      </section>

      {/* Dados pessoais + Conta e e-mail */}
      <section className="app-grid-2">
        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <UserRound size={18} />
            </div>
            <div>
              <p className="app-section-label">Conta</p>
              <h2 className="text-xl font-bold">Dados pessoais</h2>
            </div>
          </div>

          {canEditProfile ? (
            <form onSubmit={handleSubmit} className="mt-6 app-form-grid">
              {feedback ? <div className="app-alert app-alert--success">{feedback}</div> : null}
              {error ? <div className="app-alert app-alert--error">{error}</div> : null}

              <label className="app-field">
                <span className="app-field__label">Nome</span>
                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="app-input" required />
              </label>

              <label className="app-field">
                <span className="app-field__label">Sobrenome</span>
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="app-input" required />
              </label>

              <label className="app-field">
                <span className="app-field__label">CPF</span>
                <input value={cpf} onChange={(event) => setCpf(event.target.value)} className="app-input" required />
              </label>

              <label className="app-field">
                <span className="app-field__label">Telefone</span>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} className="app-input" />
              </label>

              <label className="app-field">
                <span className="app-field__label">Nascimento</span>
                <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="app-input" required />
              </label>

              <label className="app-field">
                <span className="app-field__label">Competidor</span>
                <select value={isCompetitor ? 'yes' : 'no'} onChange={(event) => setIsCompetitor(event.target.value === 'yes')} className="app-select">
                  <option value="no">Nao</option>
                  <option value="yes">Sim</option>
                </select>
              </label>

              <label className="app-field md:col-span-2">
                <span className="app-field__label">Foto</span>
                <input type="file" accept="image/*" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} className="app-input" />
              </label>

              <button type="submit" disabled={busy} className="app-button app-button--gold app-button--block md:col-span-2">
                <Save size={16} />
                {busy ? 'Salvando...' : 'Salvar perfil'}
              </button>
            </form>
          ) : (
            <div className="mt-6 app-list">
              <div className="app-list-card">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Funcao</p>
                <p className="mt-1 text-sm font-bold">{roleLabel(profile.role)}</p>
              </div>
              <div className="app-list-card">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Mail size={16} className="text-[color:var(--gold-mid)]" />
                  {user.email}
                </div>
              </div>
              <div className="app-list-card">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Phone size={16} className="text-[color:var(--gold-mid)]" />
                  {profile.phone || 'Telefone nao informado'}
                </div>
              </div>
            </div>
          )}
        </article>

        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="app-section-label">Acesso</p>
              <h2 className="text-xl font-bold">Conta e e-mail</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            <div className="app-list-card">
              <p className="text-sm font-bold">Permissoes</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">Perfil atual: {roleLabel(profile.role)}</p>
            </div>
            <div className="app-list-card">
              <p className="text-sm font-bold">Academia</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{academyName || 'Sem academia vinculada'}</p>
            </div>
            <div className="app-list-card">
              <p className="text-sm font-bold">Faixa e grau</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">Alteracao feita apenas por professor ou superadmin.</p>
            </div>
          </div>

          {canEditProfile ? (
            <form onSubmit={handleEmailSubmit} className="mt-6 app-form-grid">
              <p className="app-section-label md:col-span-2">Alterar e-mail</p>

              {emailFeedback ? <div className="app-alert app-alert--success md:col-span-2">{emailFeedback}</div> : null}
              {emailError ? <div className="app-alert app-alert--error md:col-span-2">{emailError}</div> : null}

              <label className="app-field">
                <span className="app-field__label">Novo e-mail</span>
                <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="app-input" required />
              </label>

              <label className="app-field">
                <span className="app-field__label">Senha atual</span>
                <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="app-input" required />
              </label>

              <button type="submit" disabled={emailBusy} className="app-button app-button--ghost app-button--block md:col-span-2">
                <Mail size={16} />
                {emailBusy ? 'Atualizando e-mail...' : 'Atualizar e-mail'}
              </button>
            </form>
          ) : null}
        </article>
      </section>

      {/* Aparência — card full-width, isolado */}
      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            {isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
          </div>
          <div>
            <p className="app-section-label">Interface</p>
            <h2 className="text-xl font-bold">Aparencia</h2>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Tema atual: {currentThemeLabel}.
            </p>
          </div>
        </div>

        <div className="profile-theme-picker mt-5">
          <button
            type="button"
            onClick={() => onSetThemeMode('light')}
            className={`app-button app-button--small app-button--block ${!isDarkMode ? 'app-button--gold' : 'app-button--ghost'} profile-theme-choice`}
            aria-pressed={!isDarkMode}
          >
            <Sun size={16} />
            Claro
          </button>
          <button
            type="button"
            onClick={() => onSetThemeMode('dark')}
            className={`app-button app-button--small app-button--block ${isDarkMode ? 'app-button--gold' : 'app-button--ghost'} profile-theme-choice`}
            aria-pressed={isDarkMode}
          >
            <Moon size={16} />
            Escuro
          </button>
        </div>
      </section>

      {/* Histórico */}
      <section className="app-grid-2">
        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Upload size={18} />
            </div>
            <div>
              <p className="app-section-label">Presencas</p>
              <h2 className="text-xl font-bold">Historico recente</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            {recentAttendances.map((attendance) => (
              <div key={attendance.id} className="app-list-card">
                <p className="text-sm font-bold">{classNameById.get(attendance.classId) || 'Aula da academia'}</p>
                <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                  {attendance.checkedInAt?.toDate().toLocaleString('pt-BR')} • metodo {attendance.checkInMethod}
                </p>
              </div>
            ))}

            {recentAttendances.length === 0 ? (
              <div className="app-empty">Ainda nao ha presencas registradas neste perfil.</div>
            ) : null}
          </div>
        </article>

        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="app-section-label">Graduacoes</p>
              <h2 className="text-xl font-bold">Historico resumido</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            {graduations.slice(0, 5).map((graduation) => (
              <div key={graduation.id} className="app-list-card">
                <p className="text-sm font-bold">
                  {beltLabel(graduation.previousBelt)} {graduation.previousStripes} → {beltLabel(graduation.newBelt)} {graduation.newStripes}
                </p>
                <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                  {graduation.promotedAt?.toDate().toLocaleDateString('pt-BR')} • {graduation.reason.replaceAll('_', ' ')}
                </p>
              </div>
            ))}

            {graduations.length === 0 ? (
              <div className="app-empty">Ainda nao ha graduacoes registradas para este perfil.</div>
            ) : null}
          </div>
        </article>
      </section>

      {/* Zona de perigo — separada visualmente */}
      <div style={{ borderTop: '1px solid var(--divider)', paddingTop: '2rem' }}>
        <button type="button" onClick={() => void onLogout()} className="app-button app-button--danger app-button--block">
          <LogOut size={16} />
          Sair da conta
        </button>
      </div>
    </div>
  );
};

export default ProfileView;
