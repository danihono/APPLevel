import React from 'react';
import { Award, BookOpen, ChevronRight, History, LogOut, Settings } from 'lucide-react';
import type { User } from '../types';

interface ProfileViewProps {
  user: User;
  totalClasses: number;
  rankingPosition?: number | null;
  academyName?: string;
  onLogout: () => void | Promise<void>;
}

const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  totalClasses,
  rankingPosition,
  academyName,
  onLogout,
}) => {
  const menuItems = [
    { label: 'Dados pessoais', icon: Award },
    { label: 'Historico de graduacoes', icon: History },
    { label: 'Minhas aulas', icon: BookOpen },
    { label: 'Configuracoes', icon: Settings },
  ];

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
          <p className="app-section-label">Perfil</p>
          <h1 className="text-3xl font-bold">{user.name}</h1>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">Faixa {user.belt} - {user.stripes} graus</p>
          {academyName ? <p className="mt-1 text-xs text-[color:var(--text-soft)]">{academyName}</p> : null}
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Total de aulas</p>
          <p className="app-stat-card__value">{totalClasses}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Ranking da academia</p>
          <p className="app-stat-card__value">{rankingPosition ? `#${rankingPosition}` : '--'}</p>
        </article>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="app-list">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <button key={item.label} type="button" className="app-list-card flex w-full items-center justify-between text-left">
                <div className="flex items-center gap-3">
                  <div className="app-icon-shell">
                    <Icon size={16} />
                  </div>
                  <span className="text-sm font-bold">{item.label}</span>
                </div>
                <ChevronRight size={18} className="text-[color:var(--text-soft)]" />
              </button>
            );
          })}
        </div>
      </section>

      <button type="button" onClick={() => void onLogout()} className="app-button app-button--danger app-button--block">
        <LogOut size={16} />
        Sair da conta
      </button>
    </div>
  );
};

export default ProfileView;
