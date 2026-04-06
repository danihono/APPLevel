import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Home,
  Shield,
  Trophy,
  User as UserIcon,
  Users,
  Zap,
} from 'lucide-react';
import { UserRole } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userRole?: UserRole;
  isDarkMode?: boolean;
  onSetThemeMode?: (mode: 'light' | 'dark') => void;
}

interface NavItem {
  id: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
}

const SUPERADMIN_SIDEBAR_STORAGE_KEY = 'applevel:superadmin-sidebar-collapsed';

const pageMeta: Record<string, { kicker: string; title: string; description: string }> = {
  home: {
    kicker: 'Dashboard',
    title: 'Inicio',
    description: 'Acompanhe equipe, alunos, aulas do dia e pendencias sem sair do fluxo principal.',
  },
  calendar: {
    kicker: 'Calendario',
    title: 'Calendario',
    description: 'Navegue no tempo, filtre entre minhas aulas e todas, e mantenha a operacao organizada no mobile.',
  },
  competition: {
    kicker: 'Fight mode',
    title: 'Competicao',
    description: 'Competicao ficou mais editorial, com areas claras para calendario, resultados e video.',
  },
  gamification: {
    kicker: 'Momentum',
    title: 'Gamificacao',
    description: 'Tudo agora conversa com a linguagem dourada da navegacao e dos controles interativos.',
  },
  graduation: {
    kicker: 'Graduacao',
    title: 'Graduacao',
    description: 'Acompanhe progresso, proximos marcos e o historico oficial de graduacoes da academia.',
  },
  students: {
    kicker: 'Roster',
    title: 'Alunos',
    description: 'Busca, filtros e perfis seguem a mesma estetica glass com acentos metalicos.',
  },
  management: {
    kicker: 'Minha academia',
    title: 'Academia',
    description: 'Veja instrutores, acompanhe alunos e ajuste graduacoes e regras sem mudar a base do app.',
  },
  notifications: {
    kicker: 'Eventos',
    title: 'Notificacoes',
    description: 'Acompanhe comunicados, pedidos pendentes e alunos prontos para avaliacao com leitura rapida.',
  },
  learning: {
    kicker: 'Learning hub',
    title: 'Learning Hub',
    description: 'Uma area de capacitacao pensada para professores assistirem conteudos e validarem aprendizado.',
  },
  store: {
    kicker: 'Merch',
    title: 'Loja',
    description: 'Produtos, busca e chamadas de acao herdaram o mesmo sistema dourado do resto da experiencia.',
  },
  profile: {
    kicker: 'Identity',
    title: 'Perfil',
    description: 'Cartoes, metricas e atalhos seguem a nova base de superficies e transicoes.',
  },
};

const superadminPageMeta: Record<string, { kicker: string; title: string; description: string }> = {
  home: {
    kicker: 'Central da rede',
    title: 'Central',
    description: 'Acompanhe crescimento, risco operacional e a academia em foco em uma tela pensada para decisao.',
  },
  notifications: {
    kicker: 'Comunicacao',
    title: 'Comunicacao',
    description: 'Dispare comunicados para toda a rede ou segmente por academia, perfil e faixa em um fluxo unico.',
  },
  students: {
    kicker: 'Base ativa',
    title: 'Alunos',
    description: 'Veja a base, os filtros e os perfis da unidade que esta no contexto atual da rede.',
  },
  management: {
    kicker: 'Governanca',
    title: 'Gestao',
    description: 'Crie unidades, ajuste limites e organize permissoes sem perder a visao consolidada da operacao.',
  },
  learning: {
    kicker: 'Learning hub',
    title: 'Learning Hub',
    description: 'Publique o catalogo global e acompanhe o progresso dos professores por academia.',
  },
  profile: {
    kicker: 'Conta',
    title: 'Perfil',
    description: 'Sessao, acesso e identidade do superadmin em um espaco mais direto e coerente com o restante da rede.',
  },
};

const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  userRole,
  isDarkMode,
  onSetThemeMode,
}) => {
  const navTrackRef = useRef<HTMLDivElement | null>(null);
  const navRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      return window.localStorage.getItem(SUPERADMIN_SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
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
  const showTopbar = !isSuperAdmin;
  const sidebarCollapsed = isSuperAdmin && isSidebarCollapsed;

  const navItems = useMemo<NavItem[]>(() => (
    userRole === UserRole.SUPERADMIN
      ? [
        { id: 'home', icon: Home, label: 'Central' },
        { id: 'notifications', icon: Bell, label: 'Comunicacao' },
        { id: 'students', icon: Users, label: 'Alunos' },
        { id: 'management', icon: Shield, label: 'Gestao' },
        { id: 'learning', icon: BookOpen, label: 'Learning' },
        { id: 'profile', icon: UserIcon, label: 'Perfil' },
      ]
      : userRole === UserRole.PROFESSOR
        ? [
          { id: 'home', icon: Home, label: 'Inicio' },
          { id: 'calendar', icon: Calendar, label: 'Calendario' },
          { id: 'management', icon: Building2, label: 'Academia' },
          { id: 'notifications', icon: Bell, label: 'Avisos' },
          { id: 'learning', icon: BookOpen, label: 'Learning' },
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
        { id: 'graduation', icon: Award, label: 'Graduacao' },
        { id: 'gamification', icon: Zap, label: 'Ranking' },
        { id: 'competition', icon: Trophy, label: 'Compete' },
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

  useEffect(() => {
    if (!isSuperAdmin || typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(SUPERADMIN_SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed));
    } catch {
      // Ignore storage write failures so the layout still works in restricted browsers.
    }
  }, [isSidebarCollapsed, isSuperAdmin]);

  const renderDesktopSidebar = () => (
    <aside className={`app-sidebar app-panel ${sidebarCollapsed ? 'app-sidebar--collapsed' : ''}`}>
      <div className="app-sidebar__header">
        <div className="app-sidebar__brand">
          <div className="app-brand__mark">LVL</div>
          <div className="app-sidebar__brand-copy" aria-hidden={sidebarCollapsed}>
            <p className="app-kicker">Plataforma APPLevel</p>
            <h2 className="app-sidebar__title">Superadmin</h2>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          className="app-sidebar__collapse"
          aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Minimizar barra lateral'}
          aria-pressed={sidebarCollapsed}
          title={sidebarCollapsed ? 'Expandir barra lateral' : 'Minimizar barra lateral'}
        >
          {sidebarCollapsed ? <ChevronRight size={18} strokeWidth={2} /> : <ChevronLeft size={18} strokeWidth={2} />}
        </button>
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
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
            >
              <span className="app-sidebar__icon">
                <Icon size={19} strokeWidth={1.85} />
              </span>
              <span className="app-sidebar__label" aria-hidden={sidebarCollapsed}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );

  return (
    <div
      className={`app-shell ${isSuperAdmin ? 'app-shell--superadmin' : ''} ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`.trim()}
    >
      <div className={`app-frame ${isWideLayout ? 'app-frame--wide' : ''}`}>
        <div className={isSuperAdmin ? 'app-desktop-shell' : ''}>
          {isSuperAdmin ? renderDesktopSidebar() : null}

          <div className={isSuperAdmin ? 'app-content-shell' : ''}>
            {showTopbar ? (
              <header className="app-topbar">
                <div className="app-pagebar">
                  <h1 className="app-pagebar__title">{currentPage.title}</h1>
                </div>
              </header>
            ) : null}

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
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
