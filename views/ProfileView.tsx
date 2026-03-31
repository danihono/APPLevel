import React from 'react';
import { LogOut, Mail, Phone, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type { UserRecord } from '../services/firebase/models';
import type { User } from '../types';

interface ProfileViewProps {
  user: User;
  profile: FirestoreEntity<UserRecord>;
  totalClasses: number;
  rankingPosition?: number | null;
  academyName?: string;
  onLogout: () => void | Promise<void>;
}

function roleLabel(role: UserRecord['role']) {
  switch (role) {
    case 'admin':
      return 'Head Coach';
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
  rankingPosition,
  academyName,
  onLogout,
}) => {
  const nextStripeRemaining = Math.max(user.classesToNextStripe - user.currentStripeProgress, 0);
  const nextBeltRemaining = Math.max(user.totalClassesToNextBelt - user.currentBeltProgress, 0);

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad text-center">
        <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2rem] border border-[rgba(232,175,72,0.28)] bg-white/10 shadow-[0_22px_48px_rgba(17,17,24,0.16)]">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl font-bold">{user.name.charAt(0)}</span>
          )}
        </div>

        <div className="mt-5">
          <p className="app-section-label">Perfil pessoal</p>
          <h1 className="text-3xl font-bold">{user.name}</h1>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            {academyName || 'Academia ativa'} • {roleLabel(profile.role)}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="app-badge app-badge--gold">Faixa {user.belt}</span>
            <span className="app-badge app-badge--muted">{user.stripes} graus</span>
            <span className="app-badge app-badge--muted">{user.type}</span>
          </div>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Total de aulas</p>
          <p className="app-stat-card__value">{totalClasses}</p>
          <p className="app-stat-card__note">Presencas registradas</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Proxima listra</p>
          <p className="app-stat-card__value">{nextStripeRemaining}</p>
          <p className="app-stat-card__note">Aulas restantes</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Proxima graduacao</p>
          <p className="app-stat-card__value">{nextBeltRemaining}</p>
          <p className="app-stat-card__note">Aulas para o proximo ciclo</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Ranking</p>
          <p className="app-stat-card__value">{rankingPosition ? `#${rankingPosition}` : '--'}</p>
          <p className="app-stat-card__note">Posicao atual na academia</p>
        </article>
      </section>

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

          <div className="mt-6 app-list">
            <div className="app-list-card">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Funcao</p>
              <p className="mt-1 text-sm font-bold">{roleLabel(profile.role)}</p>
            </div>
            <div className="app-list-card">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Categoria</p>
              <p className="mt-1 text-sm font-bold">{user.type}</p>
            </div>
            <div className="app-list-card">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Genero</p>
              <p className="mt-1 text-sm font-bold">Nao informado</p>
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
        </article>

        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="app-section-label">Atalhos</p>
              <h2 className="text-xl font-bold">Conta e configuracoes</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            <div className="app-list-card">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-[color:var(--gold-mid)]" />
                <div>
                  <p className="text-sm font-bold">Permissoes</p>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">Perfil atual: {roleLabel(profile.role)}</p>
                </div>
              </div>
            </div>
            <div className="app-list-card">
              <p className="text-sm font-bold">Academia</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{academyName || 'Sem academia vinculada'}</p>
            </div>
            <div className="app-list-card">
              <p className="text-sm font-bold">Trocar academia</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">Disponivel conforme as permissoes da sua conta.</p>
            </div>
            <div className="app-list-card">
              <p className="text-sm font-bold">Seguranca</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">Use esta area para futuras acoes de senha e sessao.</p>
            </div>
          </div>
        </article>
      </section>

      <button type="button" onClick={() => void onLogout()} className="app-button app-button--danger app-button--block">
        <LogOut size={16} />
        Sair da conta
      </button>
    </div>
  );
};

export default ProfileView;
