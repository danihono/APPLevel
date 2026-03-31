import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  Home,
  Moon,
  Shield,
  ShoppingBag,
  Sun,
  Target,
  Trophy,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { UserRole } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  userRole?: UserRole;
}

interface NavItem {
  id: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
}

const pageMeta: Record<string, { kicker: string; title: string; description: string }> = {
  home: {
    kicker: 'Dashboard',
    title: 'Visao rapida da operacao da academia.',
    description: 'Acompanhe equipe, alunos, aulas do dia e pendencias sem sair do fluxo principal.',
  },
  calendar: {
    kicker: 'Calendario',
    title: 'Gestao de aulas por data e por semana.',
    description: 'Navegue no tempo, filtre entre minhas aulas e todas, e mantenha a operacao organizada no mobile.',
  },
  competition: {
    kicker: 'Fight mode',
    title: 'Performance, eventos e historico sem cara de planilha.',
    description: 'Competicao ficou mais editorial, com areas claras para calendario, resultados e video.',
  },
  gamification: {
    kicker: 'Momentum',
    title: 'Misses, ranking e recompensa com energia de produto premium.',
    description: 'Tudo agora conversa com a linguagem dourada da navegacao e dos controles interativos.',
  },
  graduation: {
    kicker: 'Graduacao',
    title: 'Faixa atual, requisitos e historico em um so lugar.',
    description: 'Acompanhe progresso, proximos marcos e o historico oficial de graduacoes da academia.',
  },
  students: {
    kicker: 'Roster',
    title: 'Leitura de alunos mais limpa, mais forte e muito menos padrao.',
    description: 'Busca, filtros e perfis seguem a mesma estetica glass com acentos metalicos.',
  },
  management: {
    kicker: 'Minha academia',
    title: 'Estrutura, equipe, alunos e configuracoes em um so lugar.',
    description: 'Veja instrutores, acompanhe alunos e ajuste graduacoes e regras sem mudar a base do app.',
  },
  notifications: {
    kicker: 'Eventos',
    title: 'Notificacoes, solicitacoes e graduacoes em uma central unica.',
    description: 'Acompanhe comunicados, pedidos pendentes e alunos prontos para avaliacao com leitura rapida.',
  },
  learning: {
    kicker: 'Learning hub',
    title: 'Videos, trilhas e quizzes para a equipe.',
    description: 'Uma area de capacitacao pensada para professores assistirem conteudos e validarem aprendizado.',
  },
  store: {
    kicker: 'Merch',
    title: 'Loja com atmosfera premium e vitrines mais desejaveis.',
    description: 'Produtos, busca e chamadas de acao herdaram o mesmo sistema dourado do resto da experiencia.',
  },
  profile: {
    kicker: 'Identity',
    title: 'Perfil com mais presenca, contraste e senso de progresso.',
    description: 'Cartoes, metricas e atalhos seguem a nova base de superficies e transicoes.',
  },
};

const superadminPageMeta: Record<string, { kicker: string; title: string; description: string }> = {
  home: {
    kicker: 'Central da rede',
    title: 'Visao executiva das academias.',
    description: 'Acompanhe crescimento, risco operacional e a academia em foco em uma tela pensada para decisao.',
  },
  notifications: {
    kicker: 'Comunicacao',
    title: 'Avisos da rede por equipe, academia ou faixa.',
    description: 'Dispare comunicados para toda a rede ou segmente por academia, perfil e faixa em um fluxo unico.',
  },
  students: {
    kicker: 'Base ativa',
    title: 'Alunos da academia em foco.',
    description: 'Veja a base, os filtros e os perfis da unidade que esta no contexto atual da rede.',
  },
  management: {
    kicker: 'Governanca',
    title: 'Gestao global de academias e liderancas.',
    description: 'Crie unidades, ajuste limites e organize permissoes sem perder a visao consolidada da operacao.',
  },
  profile: {
    kicker: 'Conta',
    title: 'Sua conta de governanca na plataforma.',
    description: 'Sessao, acesso e identidade do superadmin em um espaco mais direto e coerente com o restante da rede.',
  },
};

function getRoleLabel(userRole?: UserRole) {
  switch (userRole) {
    case UserRole.SUPERADMIN:
      return 'Superadmin';
    case UserRole.ADMIN:
      return 'Admin';
    case UserRole.PROFESSOR:
      return 'Professor';
    case UserRole.ALUNO:
      return 'Aluno';
    default:
      return 'Equipe';
  }
}

const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  isDarkMode,
  toggleTheme,
  userRole,
}) => {
  const navTrackRef = useRef<HTMLDivElement | null>(null);
  const navRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const themeTimerRef = useRef<number | null>(null);
  const [themeAnimating, setThemeAnimating] = useState(false);
  const [indicator, setIndicator] = useState({
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    visible: false,
  });

  const isStaff =
    userRole === UserRole.PROFESSOR ||
    userRole === UserRole.ADMIN ||
    userRole === UserRole.SUPERADMIN;
  const isSuperAdmin = userRole === UserRole.SUPERADMIN;
  const themeLabel = isDarkMode ? 'Dark mode' : 'Light mode';

  const navItems = useMemo<NavItem[]>(() => (
    userRole === UserRole.SUPERADMIN
      ? [
        { id: 'home', icon: Home, label: 'Central' },
        { id: 'notifications', icon: Bell, label: 'Comunicacao' },
        { id: 'students', icon: Users, label: 'Alunos' },
        { id: 'management', icon: Shield, label: 'Gestao' },
        { id: 'profile', icon: UserIcon, label: 'Perfil' },
      ]
      : isStaff
        ? [
          { id: 'home', icon: Home, label: 'Inicio' },
          { id: 'calendar', icon: Calendar, label: 'Calendario' },
          { id: 'management', icon: Building2, label: 'Academia' },
          { id: 'notifications', icon: Bell, label: 'Avisos' },
          { id: 'learning', icon: BookOpen, label: 'Learning' },
          { id: 'profile', icon: UserIcon, label: 'Perfil' },
        ]
        : [
        { id: 'home', icon: Home, label: 'Inicio' },
        { id: 'calendar', icon: Calendar, label: 'Aulas' },
        { id: 'competition', icon: Trophy, label: 'Compete' },
        { id: 'graduation', icon: Award, label: 'Graduacao' },
        { id: 'notifications', icon: Bell, label: 'Avisos' },
        { id: 'profile', icon: UserIcon, label: 'Perfil' },
        ]
  ), [isStaff, userRole]);

  const currentPage = userRole === UserRole.SUPERADMIN
    ? (superadminPageMeta[activeTab] ?? superadminPageMeta.home)
    : (pageMeta[activeTab] ?? pageMeta.home);
  const isWideLayout = isSuperAdmin;

  useEffect(() => {
    const updateIndicator = () => {
      const activeButton = navRefs.current[activeTab];
      const navTrack = navTrackRef.current;

      if (!activeButton || !navTrack) {
        setIndicator((current) => ({ ...current, visible: false }));
        return;
      }

      const trackRect = navTrack.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();

      setIndicator({
        x: buttonRect.left - trackRect.left,
        y: buttonRect.top - trackRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
        visible: true,
      });
    };

    const frame = window.requestAnimationFrame(updateIndicator);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateIndicator) : null;
    const navTrack = navTrackRef.current;

    if (resizeObserver && navTrack) {
      resizeObserver.observe(navTrack);
      navItems.forEach((item) => {
        const button = navRefs.current[item.id];
        if (button) {
          resizeObserver.observe(button);
        }
      });
    }

    window.addEventListener('resize', updateIndicator);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateIndicator);
    };
  }, [activeTab, navItems]);

  useEffect(() => () => {
    if (themeTimerRef.current) {
      window.clearTimeout(themeTimerRef.current);
    }
  }, []);

  const handleThemeToggle = () => {
    if (themeTimerRef.current) {
      window.clearTimeout(themeTimerRef.current);
    }

    setThemeAnimating(false);
    window.requestAnimationFrame(() => {
      setThemeAnimating(true);
    });

    toggleTheme();

    themeTimerRef.current = window.setTimeout(() => {
      setThemeAnimating(false);
    }, 620);
  };

  const renderDesktopSidebar = () => (
    <aside className="app-sidebar app-panel">
      <div className="app-sidebar__brand">
        <div className="app-brand__mark">LVL</div>
        <div className="app-sidebar__brand-copy">
          <p className="app-kicker">Plataforma APPLevel</p>
          <h2 className="app-sidebar__title">Superadmin</h2>
          <p className="app-sidebar__text">Controle da rede pensado para escritorio e responsivo no celular.</p>
        </div>
      </div>

      <div className="app-sidebar__meta">
        <div className="app-orb">
          <span className="app-orb__dot" />
          {currentPage.kicker}
        </div>
        <div className="app-orb">{getRoleLabel(userRole)}</div>
      </div>

      <nav className="app-sidebar__nav" aria-label="Navegacao do superadmin">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`app-sidebar__button ${isActive ? 'is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="app-sidebar__icon">
                <Icon size={19} strokeWidth={1.85} />
              </span>
              <span className="app-sidebar__label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={handleThemeToggle}
        className={`app-sidebar__theme ${themeAnimating ? 'is-popping' : ''}`}
        aria-label="Alternar tema"
        title="Alternar tema"
      >
        <div>
          <p className="app-kicker">Tema</p>
          <strong>{isDarkMode ? 'Dark mode' : 'Light mode'}</strong>
        </div>
        <div className="app-sidebar__theme-icon">
          <Sun size={19} strokeWidth={1.85} className="theme-toggle__icon theme-toggle__icon--sun" />
          <Moon size={19} strokeWidth={1.85} className="theme-toggle__icon theme-toggle__icon--moon" />
        </div>
      </button>
    </aside>
  );

  return (
    <div className={`app-shell ${isSuperAdmin ? 'app-shell--superadmin' : ''}`}>
      <div className={`app-frame ${isWideLayout ? 'app-frame--wide' : ''}`}>
        <div className={isSuperAdmin ? 'app-desktop-shell' : ''}>
          {isSuperAdmin ? renderDesktopSidebar() : null}

          <div className={isSuperAdmin ? 'app-content-shell' : ''}>
            <header className={`app-topbar ${isSuperAdmin ? 'app-topbar--superadmin' : ''}`}>
              <div className={`${isSuperAdmin ? 'app-topbar-panel app-topbar-panel--superadmin' : 'app-panel app-topbar-panel'} w-full`}>
                <div className={`flex flex-wrap items-start justify-between gap-4 ${isSuperAdmin ? 'app-topbar-panel__inner app-topbar-panel__inner--superadmin' : ''}`}>
                  <div className={`app-brand ${isSuperAdmin ? 'app-brand--compact' : ''}`}>
                    <div className={`app-brand__mark ${isSuperAdmin ? 'app-brand__mark--compact' : ''}`}>LVL</div>
                    <div className="app-brand__text">
                      <p className="app-kicker">Plataforma APPLevel</p>
                      <h1 className={`app-headline ${isSuperAdmin ? 'app-headline--compact' : ''}`}>{currentPage.title}</h1>
                      <p className={`app-copy ${isSuperAdmin ? 'app-copy--compact' : ''}`}>{currentPage.description}</p>
                    </div>
                  </div>

                  <div className={`app-topbar__status ${isSuperAdmin ? 'app-topbar__status--compact' : ''}`}>
                    <div className={`app-orb ${isSuperAdmin ? 'app-orb--compact' : ''}`}>
                      <span className="app-orb__dot" />
                      {currentPage.kicker}
                    </div>
                    <div className={`app-orb ${isSuperAdmin ? 'app-orb--compact' : ''}`}>{getRoleLabel(userRole)}</div>
                    <div className={`app-orb ${isSuperAdmin ? 'app-orb--compact' : ''}`}>{themeLabel}</div>
                  </div>
                </div>
              </div>
            </header>

            <main className="app-main">{children}</main>
          </div>
        </div>
      </div>

      <nav className={`app-toolbar safe-area-bottom ${isSuperAdmin ? 'app-toolbar--superadmin' : ''}`} aria-label="Navegacao principal">
        <div className="app-toolbar__surface">
          <div className="app-toolbar__track" ref={navTrackRef}>
            <div
              className="app-nav-indicator"
              style={{
                width: indicator.width,
                height: indicator.height,
                transform: `translate3d(${indicator.x}px, ${indicator.y}px, 0)`,
                opacity: indicator.visible ? 1 : 0,
              }}
              aria-hidden="true"
            >
              <div className="app-nav-indicator__glow" />
              <div className="app-nav-indicator__clip">
                <div className="app-nav-indicator__ring" />
              </div>
              <div className="app-nav-indicator__plate" />
            </div>

            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <Fragment key={item.id}>
                  <button
                    ref={(element) => {
                      navRefs.current[item.id] = element;
                    }}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`app-nav-button ${isActive ? 'is-active' : ''}`}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.label}
                  >
                    <Icon size={24} strokeWidth={1.85} />
                  </button>

                  {index !== navItems.length - 1 ? <span className="app-nav-divider" aria-hidden="true" /> : null}
                </Fragment>
              );
            })}

            <span className="app-nav-divider" aria-hidden="true" />

            <button
              type="button"
              onClick={handleThemeToggle}
              className={`theme-toggle ${themeAnimating ? 'is-popping' : ''}`}
              aria-label="Alternar tema"
              title="Alternar tema"
            >
              <Sun size={21} strokeWidth={1.85} className="theme-toggle__icon theme-toggle__icon--sun" />
              <Moon size={21} strokeWidth={1.85} className="theme-toggle__icon theme-toggle__icon--moon" />
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
