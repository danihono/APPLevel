import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Home,
  Shield,
  Trophy,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { UserRole } from '../types';

type SuperadminViewMode = 'superadmin' | 'professor';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userRole?: UserRole;
  unreadNotificationsCount?: number;
  mobileUnitLabel: string;
  superadminViewMode?: SuperadminViewMode | null;
  onSetSuperadminViewMode?: (mode: SuperadminViewMode) => void;
  superadminAcademies?: Array<{ id: string; name: string }>;
  selectedAcademyId?: string;
  onSelectAcademy?: (academyId: string) => void;
  onUnitClick?: () => void;
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
    title: 'Início',
    description: 'Acompanhe equipe, alunos, aulas do dia e pendências sem sair do fluxo principal.',
  },
  calendar: {
    kicker: 'Calendário',
    title: 'Calendário',
    description: 'Navegue no tempo, filtre entre minhas aulas e todas, e mantenha a operação organizada no mobile.',
  },
  competition: {
    kicker: 'Fight mode',
    title: 'Competição',
    description: 'Competição ficou mais editorial, com áreas claras para calendário, resultados e vídeo.',
  },
  graduation: {
    kicker: 'Graduação',
    title: 'Graduação',
    description: 'Acompanhe progresso, próximos marcos e o histórico oficial de graduações da academia.',
  },
  students: {
    kicker: 'Roster',
    title: 'Alunos',
    description: 'Busca, filtros e perfis seguem a mesma estética glass com acentos metálicos.',
  },
  management: {
    kicker: 'Minha academia',
    title: 'Academia',
    description: 'Veja instrutores, acompanhe alunos e ajuste graduações e regras sem mudar a base do app.',
  },
  'controle-total': {
    kicker: 'Financeiro',
    title: 'Controle Total',
    description: 'Dashboard, catalogo e lista operacional financeira da rede LEVEL JJ.',
  },
  notifications: {
    kicker: 'Eventos',
    title: 'Notificações',
    description: 'Acompanhe comunicados, pedidos pendentes e alunos prontos para avaliação com leitura rápida.',
  },
  learning: {
    kicker: 'Learning hub',
    title: 'Learning Hub',
    description: 'Uma área de capacitação pensada para professores assistirem conteúdos e validarem aprendizado.',
  },
  store: {
    kicker: 'Merch',
    title: 'Loja',
    description: 'Produtos, busca e chamadas de ação herdaram o mesmo sistema dourado do resto da experiência.',
  },
  profile: {
    kicker: 'Identity',
    title: 'Perfil',
    description: 'Cartões, métricas e atalhos seguem a nova base de superfícies e transições.',
  },
};

const superadminPageMeta: Record<string, { kicker: string; title: string; description: string }> = {
  home: {
    kicker: 'Central da rede',
    title: 'Central',
    description: 'Acompanhe crescimento, risco operacional e a academia em foco em uma tela pensada para decisão.',
  },
  notifications: {
    kicker: 'Comunicação',
    title: 'Comunicação',
    description: 'Dispare comunicados para toda a rede ou segmente por academia, perfil e faixa em um fluxo único.',
  },
  students: {
    kicker: 'Base ativa',
    title: 'Alunos',
    description: 'Veja a base, os filtros e os perfis da unidade que está no contexto atual da rede.',
  },
  management: {
    kicker: 'Governança',
    title: 'Gestão',
    description: 'Crie unidades, ajuste limites e organize permissões sem perder a visão consolidada da operação.',
  },
  learning: {
    kicker: 'Learning hub',
    title: 'Learning Hub',
    description: 'Publique o catalogo global e acompanhe o progresso dos professores por academia.',
  },
  profile: {
    kicker: 'Conta',
    title: 'Perfil',
    description: 'Sessão, acesso e identidade do superadmin em um espaço mais direto e coerente com o restante da rede.',
  },
};

superadminPageMeta['controle-total'] = {
  kicker: 'Financeiro',
  title: 'Controle Total',
  description: 'Dashboard, catalogo e lista operacional financeira da rede LEVEL JJ.',
};

const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  userRole,
  unreadNotificationsCount = 0,
  mobileUnitLabel,
  superadminViewMode,
  onSetSuperadminViewMode,
  superadminAcademies = [],
  selectedAcademyId = '',
  onSelectAcademy,
  onUnitClick,
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

  const isSuperAdmin = userRole === UserRole.SUPERADMIN;
  const navigationRole = isSuperAdmin && superadminViewMode === 'professor'
    ? UserRole.PROFESSOR
    : userRole;
  const isProfessorVision = isSuperAdmin && superadminViewMode === 'professor';
  const isStaff =
    navigationRole === UserRole.PROFESSOR ||
    navigationRole === UserRole.SUPERADMIN;
  const sidebarCollapsed = isSuperAdmin && isSidebarCollapsed;

  const navItems = useMemo<NavItem[]>(() => (
    navigationRole === UserRole.SUPERADMIN
      ? [
        { id: 'home', icon: Home, label: 'Central' },
        { id: 'controle-total', icon: DollarSign, label: 'Controle Total' },
        { id: 'notifications', icon: Bell, label: 'Comunicação' },
        { id: 'students', icon: Users, label: 'Alunos' },
        { id: 'management', icon: Shield, label: 'Gestão' },
        { id: 'learning', icon: BookOpen, label: 'Learning' },
        { id: 'profile', icon: UserIcon, label: 'Perfil' },
      ]
      : navigationRole === UserRole.PROFESSOR
        ? [
          { id: 'home', icon: Home, label: 'Início' },
          { id: 'calendar', icon: Calendar, label: 'Calendário' },
          { id: 'management', icon: Building2, label: 'Academia' },
          { id: 'notifications', icon: Bell, label: 'Avisos' },
          { id: 'learning', icon: BookOpen, label: 'Learning' },
          { id: 'profile', icon: UserIcon, label: 'Perfil' },
        ]
        : isStaff
          ? [
            { id: 'home', icon: Home, label: 'Início' },
            { id: 'calendar', icon: Calendar, label: 'Calendário' },
            { id: 'management', icon: Building2, label: 'Academia' },
            { id: 'notifications', icon: Bell, label: 'Avisos' },
            { id: 'learning', icon: BookOpen, label: 'Learning' },
            { id: 'profile', icon: UserIcon, label: 'Perfil' },
          ]
        : [
        { id: 'home', icon: Home, label: 'Início' },
        { id: 'calendar', icon: Calendar, label: 'Aulas' },
        { id: 'graduation', icon: Award, label: 'Graduação' },
        { id: 'competition', icon: Trophy, label: 'Compete' },
        { id: 'notifications', icon: Bell, label: 'Avisos' },
        { id: 'profile', icon: UserIcon, label: 'Perfil' },
        ]
  ), [isStaff, navigationRole]);

  const currentPage = navigationRole === UserRole.SUPERADMIN
    ? (superadminPageMeta[activeTab] ?? superadminPageMeta.home)
    : (pageMeta[activeTab] ?? pageMeta.home);
  const isWideLayout = isSuperAdmin;
  const canToggleVision = isSuperAdmin && Boolean(onSetSuperadminViewMode);
  const showSuperadminAcademyPicker = canToggleVision && !isProfessorVision && Boolean(onSelectAcademy);
  const professorVisionDisabled = superadminAcademies.length === 0;

  const renderVisionSwitch = () => (
    <div className="app-vision-switch" role="group" aria-label="Trocar visão">
      <button
        type="button"
        onClick={() => onSetSuperadminViewMode?.('superadmin')}
        className={`app-vision-switch__button ${!isProfessorVision ? 'is-active' : ''}`}
        aria-pressed={!isProfessorVision}
        title="Visão da rede"
      >
        <Shield size={13} strokeWidth={2} />
        <span>Rede</span>
      </button>
      <button
        type="button"
        onClick={() => onSetSuperadminViewMode?.('professor')}
        disabled={professorVisionDisabled}
        className={`app-vision-switch__button ${isProfessorVision ? 'is-active' : ''}`}
        aria-pressed={isProfessorVision}
        title="Visão professor"
      >
        <Building2 size={13} strokeWidth={2} />
        <span>Professor</span>
      </button>
    </div>
  );

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
          <img src="/logo3.png" alt="APPLevel" className="h-20 w-20 object-contain flex-shrink-0" />
          <div className="app-sidebar__brand-copy" aria-hidden={sidebarCollapsed}>
            <p className="app-kicker">Plataforma APPLevel</p>
            <h2 className="app-sidebar__title">{isProfessorVision ? 'Visão professor' : 'Superadmin'}</h2>
            <p className="mt-1 text-xs text-[color:var(--text-soft)]">
              {isProfessorVision ? 'Operação por unidade' : 'Controle da rede'}
            </p>
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

      <nav className="app-sidebar__nav" aria-label="Navegação do superadmin">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const showNotificationBadge = item.id === 'notifications' && unreadNotificationsCount > 0;

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
                {showNotificationBadge ? <span className="app-notification-dot" aria-hidden="true" /> : null}
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
            <header className={`app-topbar ${isSuperAdmin ? 'app-topbar--superadmin' : ''}`.trim()}>
              <div
                className={`app-mobile-header ${canToggleVision && !showSuperadminAcademyPicker ? 'app-mobile-header--with-vision-switch' : ''}`.trim()}
                title={mobileUnitLabel}
              >
                <div className="app-mobile-header__row">
                  <div className="app-mobile-header__brand">
                    <img src="/logo3.png" alt="LEVEL" className="app-mobile-header__brand-mark" />
                    <span className="app-mobile-header__brand-wordmark">LEVEL</span>
                  </div>

                  {!showSuperadminAcademyPicker ? (
                    onUnitClick ? (
                      <button
                        type="button"
                        onClick={onUnitClick}
                        className="app-mobile-header__unit cursor-pointer hover:opacity-80 transition-opacity"
                        aria-label="Trocar unidade"
                      >
                        <img src="/logo3.png" alt="" aria-hidden="true" className="app-mobile-header__unit-mark" />
                        <span className="app-mobile-header__unit-name">{mobileUnitLabel}</span>
                        <ChevronDown size={14} aria-hidden="true" />
                      </button>
                    ) : (
                      <div className="app-mobile-header__unit">
                        <img src="/logo3.png" alt="" aria-hidden="true" className="app-mobile-header__unit-mark" />
                        <span className="app-mobile-header__unit-name">{mobileUnitLabel}</span>
                      </div>
                    )
                  ) : null}
                </div>

                <div className="app-mobile-header__title-row">
                  <div className="app-mobile-header__title-copy">
                    <span className="app-mobile-header__eyebrow">Visão atual</span>
                    <p className="app-mobile-header__title">{currentPage.title}</p>
                  </div>

                  {showSuperadminAcademyPicker ? (
                    <div className="app-mobile-header__context">
                      <select
                        value={selectedAcademyId}
                        onChange={(event) => onSelectAcademy?.(event.target.value)}
                        className="app-select app-select--compact app-mobile-header__select"
                        aria-label="Selecionar unidade em foco"
                      >
                        <option value="">Escolha uma unidade</option>
                        {superadminAcademies.map((entry) => (
                          <option key={entry.id} value={entry.id}>{entry.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className={`app-pagebar ${isSuperAdmin ? 'app-topbar-panel--superadmin' : ''} ${canToggleVision ? 'app-pagebar--with-vision-switch' : ''}`.trim()}
              >
                <div className="app-pagebar__row">
                  <h1 className="app-pagebar__title">{currentPage.title}</h1>

                  {showSuperadminAcademyPicker ? (
                    <div className="app-pagebar__context">
                      <select
                        value={selectedAcademyId}
                        onChange={(event) => onSelectAcademy?.(event.target.value)}
                        className="app-select app-select--compact app-pagebar__select"
                        aria-label="Selecionar unidade em foco"
                      >
                        <option value="">Escolha uma unidade</option>
                        {superadminAcademies.map((entry) => (
                          <option key={entry.id} value={entry.id}>{entry.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {canToggleVision ? (
                    <div className="app-pagebar__vision">
                      {renderVisionSwitch()}
                    </div>
                  ) : null}
                </div>
              </div>

              {canToggleVision ? (
                <div className="app-vision-corner app-vision-corner--mobile">
                  {renderVisionSwitch()}
                </div>
              ) : null}

            </header>

            <main className="app-main">{children}</main>
          </div>
        </div>
      </div>

      <nav className={`app-toolbar safe-area-bottom ${isSuperAdmin ? 'app-toolbar--superadmin' : ''}`} aria-label="Navegação principal">
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
              const showNotificationBadge = item.id === 'notifications' && unreadNotificationsCount > 0;

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
                    <span className="app-nav-button__icon">
                      <Icon size={24} strokeWidth={1.85} />
                      {showNotificationBadge ? <span className="app-notification-dot" aria-hidden="true" /> : null}
                    </span>
                    <span className="app-nav-button__label">{item.label}</span>
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
