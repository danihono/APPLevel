import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { hapticTap } from '../services/haptics';
import {
  Bell,
  BookOpen,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileDown,
  Home,
  Moon,
  Plus,
  Repeat,
  Search,
  Send,
  Shield,
  Sun,
  TrendingUp,
  User as UserIcon,
  Users,
} from 'lucide-react';
import SuperadminPalette, { type PaletteItem } from './redesign/SuperadminPalette';
import { useRedesignShell } from './redesign/ShellContext';
import { UserRole } from '../types';
import { getLocale, t } from '../i18n';
import { publicAsset } from '../publicAsset';
import './redesign/superadmin-shell.css';

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
  /** A tela atual desenha o proprio cabecalho (redesign): esconde o header do Layout. */
  screenOwnsHeader?: boolean;
  /** Pessoas da rede para a busca (Ctrl K) do superadmin. */
  paletteUsers?: Array<{ id: string; name: string; role: string; academyId: string; academyName: string }>;
  onOpenPerson?: (person: { id: string; academyId: string }) => void;
}

interface NavItem {
  id: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
}

const SUPERADMIN_SIDEBAR_STORAGE_KEY = 'applevel:superadmin-sidebar-collapsed';
const DESKTOP_VIEWPORT_QUERY = '(min-width: 980px)';

const useIsDesktopViewport = () => {
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_VIEWPORT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsDesktopViewport(event.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isDesktopViewport;
};

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
  evolution: {
    kicker: 'Evolução',
    title: 'Evolução',
    description: 'Graduação e competição: quanto falta para o próximo grau, o mês de treinos e o histórico.',
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
    description: 'Videoaulas liberadas para o seu perfil, com progresso salvo e quiz ao final de cada módulo.',
  },
  profile: {
    kicker: 'Identity',
    title: 'Perfil',
    description: 'Cartões, métricas e atalhos seguem a nova base de superfícies e transições.',
  },
};

const studentLearningPageMeta = {
  kicker: 'Learning hub',
  title: 'Learning Hub',
  description: 'Videoaulas selecionadas para a sua faixa. Assista, conclua os blocos e libere o próximo módulo.',
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
  screenOwnsHeader = false,
  paletteUsers = [],
  onOpenPerson,
}) => {
  const shell = useRedesignShell();
  const [paletteOpen, setPaletteOpen] = useState(false);
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
    navigationRole === UserRole.ADMIN ||
    navigationRole === UserRole.SUPERADMIN;
  const isDesktopShell = isSuperAdmin || navigationRole === UserRole.PROFESSOR || navigationRole === UserRole.ADMIN;
  const isDesktopViewport = useIsDesktopViewport();
  const isFlatShell = isSuperAdmin || (isDesktopShell && isDesktopViewport);
  const sidebarCollapsed = isDesktopShell && isSidebarCollapsed;

  const navItems = useMemo<NavItem[]>(() => (
    navigationRole === UserRole.SUPERADMIN
      ? [
        { id: 'home', icon: Home, label: t('Central') },
        { id: 'controle-total', icon: DollarSign, label: t('Controle Total') },
        { id: 'notifications', icon: Bell, label: t('Comunicação') },
        { id: 'students', icon: Users, label: t('Alunos') },
        { id: 'management', icon: Shield, label: t('Gestão') },
        { id: 'learning', icon: BookOpen, label: t('Learning') },
        { id: 'profile', icon: UserIcon, label: t('Perfil') },
      ]
      : navigationRole === UserRole.PROFESSOR
        ? [
          { id: 'home', icon: Home, label: t('Início') },
          { id: 'calendar', icon: Calendar, label: t('Calendário') },
          { id: 'management', icon: Building2, label: t('Academia') },
          { id: 'notifications', icon: Bell, label: t('Avisos') },
          { id: 'learning', icon: BookOpen, label: t('Learning') },
          { id: 'profile', icon: UserIcon, label: t('Perfil') },
        ]
        : isStaff
          ? [
            { id: 'home', icon: Home, label: t('Início') },
            { id: 'calendar', icon: Calendar, label: t('Calendário') },
            { id: 'management', icon: Building2, label: t('Academia') },
            { id: 'notifications', icon: Bell, label: t('Avisos') },
            { id: 'learning', icon: BookOpen, label: t('Learning') },
            { id: 'profile', icon: UserIcon, label: t('Perfil') },
          ]
        : [
        // Aluno (redesign): 5 abas. Graduação + Competição viram "Evolução" e os avisos
        // saem da barra para o sino do cabeçalho.
        { id: 'home', icon: Home, label: t('Início') },
        { id: 'calendar', icon: Calendar, label: t('Aulas') },
        { id: 'evolution', icon: TrendingUp, label: t('Evolução') },
        { id: 'learning', icon: BookOpen, label: t('Learning') },
        { id: 'profile', icon: UserIcon, label: t('Perfil') },
        ]
  ), [isStaff, navigationRole]);

  const isStudentNav = !isStaff;
  // 'graduation' e 'competition' continuam existindo como rotas (alias da Evolução).
  const activeNavId = isStudentNav && (activeTab === 'graduation' || activeTab === 'competition')
    ? 'evolution'
    : activeTab;

  const currentPage = navigationRole === UserRole.SUPERADMIN
    ? (superadminPageMeta[activeTab] ?? superadminPageMeta.home)
    : (activeTab === 'learning' && !isStaff
      ? studentLearningPageMeta
      : (pageMeta[activeTab] ?? pageMeta.home));
  const isWideLayout = isDesktopShell;
  const canToggleVision = isSuperAdmin && Boolean(onSetSuperadminViewMode);
  const showSuperadminAcademyPicker = canToggleVision && !isProfessorVision && Boolean(onSelectAcademy);
  const professorVisionDisabled = superadminAcademies.length === 0;

  const greeting = (() => {
    const hour = new Date().getHours();
    return hour < 12 ? t('Bom dia') : hour < 18 ? t('Boa tarde') : t('Boa noite');
  })();
  const superadminPageTitle = activeTab === 'home' && shell.firstName
    ? `${greeting}, ${shell.firstName}`
    : t(currentPage.title);
  const todayLabel = new Date().toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const superadminEyebrow = activeTab === 'home'
    ? todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)
    : t(currentPage.kicker);
  const paletteEnabled = isSuperAdmin && !isProfessorVision;

  const paletteItems = useMemo<PaletteItem[]>(() => {
    if (!paletteEnabled) return [];
    const actions = t('Ações');
    const goTo = t('Ir para');
    const items: PaletteItem[] = [
      { id: 'act-academy', group: actions, label: t('Nova academia'), hint: t('Criar uma unidade na rede'), icon: <Plus size={17} />, run: () => setActiveTab('management') },
      { id: 'act-notice', group: actions, label: t('Novo aviso'), hint: t('Comunicar a rede inteira ou segmentar'), icon: <Send size={17} />, run: () => setActiveTab('notifications') },
      { id: 'act-report', group: actions, label: t('Gerar relatório'), hint: t('Excel ou PDF do Controle Total'), icon: <FileDown size={17} />, run: () => setActiveTab('controle-total') },
      { id: 'act-vision', group: actions, label: t('Trocar para a visão Professor'), hint: t('Ver o app como um professor'), icon: <Repeat size={17} />, run: () => onSetSuperadminViewMode?.('professor') },
    ];
    if (onSetThemeMode) {
      items.push({ id: 'act-theme', group: actions, label: isDarkMode ? t('Tema claro') : t('Tema escuro'), hint: t('Alternar o tema'), icon: isDarkMode ? <Sun size={17} /> : <Moon size={17} />, run: () => onSetThemeMode(isDarkMode ? 'light' : 'dark') });
    }
    navItems.forEach((item) => {
      const Icon = item.icon;
      items.push({ id: `nav-${item.id}`, group: goTo, label: item.label, icon: <Icon size={17} />, run: () => setActiveTab(item.id) });
    });
    superadminAcademies.forEach((entry) => {
      items.push({ id: `academy-${entry.id}`, group: t('Academias'), label: entry.name, hint: t('Colocar em foco na Central'), icon: <Building2 size={17} />, run: () => { onSelectAcademy?.(entry.id); setActiveTab('home'); } });
    });
    paletteUsers.forEach((person) => {
      items.push({ id: `person-${person.id}`, group: t('Pessoas'), onlyOnSearch: true, label: person.name, hint: `${person.role} · ${person.academyName}`, icon: <UserIcon size={17} />, run: () => onOpenPerson?.(person) });
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteEnabled, navItems, superadminAcademies, paletteUsers, isDarkMode, onSetThemeMode, onSetSuperadminViewMode, onSelectAcademy, onOpenPerson, setActiveTab]);

  useEffect(() => {
    if (!paletteEnabled) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteEnabled]);

  const renderVisionSwitch = () => (
    <div className="app-vision-switch" role="group" aria-label={t('Trocar visão')}>
      <button
        type="button"
        onClick={() => onSetSuperadminViewMode?.('superadmin')}
        className={`app-vision-switch__button ${!isProfessorVision ? 'is-active' : ''}`}
        aria-pressed={!isProfessorVision}
        title={t('Visão da rede')}
      >
        <Shield size={13} strokeWidth={2} />
        <span>{t('Rede')}</span>
      </button>
      <button
        type="button"
        onClick={() => onSetSuperadminViewMode?.('professor')}
        disabled={professorVisionDisabled}
        className={`app-vision-switch__button ${isProfessorVision ? 'is-active' : ''}`}
        aria-pressed={isProfessorVision}
        title={t('Visão professor')}
      >
        <Building2 size={13} strokeWidth={2} />
        <span>{t('Professor')}</span>
      </button>
    </div>
  );

  const renderBellButton = () => (
    <button
      type="button"
      onClick={() => setActiveTab('notifications')}
      className="lv-icon-btn"
      aria-label={unreadNotificationsCount > 0
        ? `${t('Avisos')} · ${t('{count} não lidas', { count: unreadNotificationsCount })}`
        : t('Avisos')}
    >
      <Bell size={20} strokeWidth={2} />
      {unreadNotificationsCount > 0 ? (
        <span className="lv-badge-count" aria-hidden="true">
          {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
        </span>
      ) : null}
    </button>
  );

  const renderUnitChip = () => (
    onUnitClick ? (
      <button
        type="button"
        onClick={onUnitClick}
        className="app-mobile-header__unit cursor-pointer hover:opacity-80 transition-opacity"
        aria-label={t('Trocar unidade')}
      >
        <img src={publicAsset('logo3.png')} alt="" aria-hidden="true" className="app-mobile-header__unit-mark" />
        <span className="app-mobile-header__unit-name">{mobileUnitLabel}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
    ) : (
      <div className="app-mobile-header__unit">
        <img src={publicAsset('logo3.png')} alt="" aria-hidden="true" className="app-mobile-header__unit-mark" />
        <span className="app-mobile-header__unit-name">{mobileUnitLabel}</span>
      </div>
    )
  );

  useEffect(() => {
    const updateIndicator = () => {
      const activeButton = navRefs.current[activeNavId];
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
  }, [activeNavId, navItems]);

  useEffect(() => {
    if (!isDesktopShell || typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(SUPERADMIN_SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed));
    } catch {
      // Ignore storage write failures so the layout still works in restricted browsers.
    }
  }, [isSidebarCollapsed, isDesktopShell]);

  const sidebarIdentity = isSuperAdmin
    ? {
      title: isProfessorVision ? t('Visão professor') : t('Superadmin'),
      subtitle: isProfessorVision ? t('Operação por unidade') : t('Controle da rede'),
    }
    : navigationRole === UserRole.ADMIN
      ? { title: t('Administração'), subtitle: t('Gestão da academia') }
      : { title: t('Professor'), subtitle: mobileUnitLabel || t('Operação da academia') };

  const renderDesktopSidebar = () => (
    <aside className={`app-sidebar app-panel ${sidebarCollapsed ? 'app-sidebar--collapsed' : ''}`}>
      <div className="app-sidebar__header">
        <div className="app-sidebar__brand">
          {isSuperAdmin ? (
            <span className="app-sidebar__mark" aria-hidden="true">L</span>
          ) : (
            <img src={publicAsset('logo3.png')} alt="APPLevel" className="h-20 w-20 object-contain flex-shrink-0" />
          )}
          <div className="app-sidebar__brand-copy" aria-hidden={sidebarCollapsed}>
            <p className="app-kicker">{t('Plataforma APPLevel')}</p>
            <h2 className="app-sidebar__title">{sidebarIdentity.title}</h2>
            <p className="mt-1 text-xs text-[color:var(--text-soft)]">
              {sidebarIdentity.subtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          className="app-sidebar__collapse"
          aria-label={sidebarCollapsed ? t('Expandir barra lateral') : t('Minimizar barra lateral')}
          aria-pressed={sidebarCollapsed}
          title={sidebarCollapsed ? t('Expandir barra lateral') : t('Minimizar barra lateral')}
        >
          {sidebarCollapsed ? <ChevronRight size={18} strokeWidth={2} /> : <ChevronLeft size={18} strokeWidth={2} />}
        </button>
      </div>

      <nav className="app-sidebar__nav" aria-label={t('Navegação principal')}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeNavId === item.id;
          const showNotificationBadge = item.id === 'notifications' && unreadNotificationsCount > 0;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => { if (item.id !== activeTab) hapticTap(); setActiveTab(item.id); }}
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
      className={[
        'app-shell',
        isSuperAdmin ? 'app-shell--superadmin' : '',
        isDesktopShell ? 'app-shell--desk' : '',
        isFlatShell ? 'app-shell--flat' : '',
        screenOwnsHeader ? 'app-shell--own-header' : '',
        sidebarCollapsed ? 'is-sidebar-collapsed' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className={`app-frame ${isWideLayout ? 'app-frame--wide' : ''}`}>
        <div className={isDesktopShell ? 'app-desktop-shell' : ''}>
          {isDesktopShell ? renderDesktopSidebar() : null}

          <div className={isDesktopShell ? 'app-content-shell' : ''}>
            <header className={`app-topbar ${isSuperAdmin ? 'app-topbar--superadmin' : ''} ${isDesktopShell ? 'app-topbar--desk' : ''}`.trim()}>
              <div
                className="app-mobile-header"
                title={mobileUnitLabel}
              >
                <div className="app-mobile-header__bar">
                  <div className="app-mobile-header__title-copy">
                    {onUnitClick ? (
                      <button
                        type="button"
                        onClick={onUnitClick}
                        className="app-mobile-header__eyebrow app-mobile-header__eyebrow--button"
                        aria-label={t('Trocar unidade')}
                      >
                        <span>{mobileUnitLabel}</span>
                        <ChevronDown size={12} aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="app-mobile-header__eyebrow">{mobileUnitLabel}</span>
                    )}
                    <p className="app-mobile-header__title">{t(currentPage.title)}</p>
                  </div>

                  <div className="app-mobile-header__actions">
                    {showSuperadminAcademyPicker ? (
                      <div className="app-mobile-header__context">
                        <select
                          value={selectedAcademyId}
                          onChange={(event) => onSelectAcademy?.(event.target.value)}
                          className="app-select app-select--compact app-mobile-header__select"
                          aria-label={t('Selecionar unidade em foco')}
                        >
                          <option value="">{t('Escolha uma unidade')}</option>
                          {superadminAcademies.map((entry) => (
                            <option key={entry.id} value={entry.id}>{entry.name}</option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    {isStudentNav ? renderBellButton() : null}
                  </div>
                </div>
              </div>

              <div
                className={`app-pagebar ${isSuperAdmin ? 'app-topbar-panel--superadmin' : ''} ${canToggleVision ? 'app-pagebar--with-vision-switch' : ''}`.trim()}
              >
                <div className="app-pagebar__row">
                  {isSuperAdmin ? (
                    <div className="app-pagebar__title app-pagebar__title--sa">
                      <span className="app-pagebar__eyebrow">{superadminEyebrow}</span>
                      <h1>{superadminPageTitle}</h1>
                    </div>
                  ) : (
                    <h1 className="app-pagebar__title">{t(currentPage.title)}</h1>
                  )}

                  {paletteEnabled ? (
                    <button type="button" className="sa-search" onClick={() => setPaletteOpen(true)} aria-label={t('Buscar academia, aluno ou ação')}>
                      <Search size={17} aria-hidden="true" />
                      <span>{t('Buscar academia, aluno, ação…')}</span>
                      <kbd>{/Mac|iPhone|iPad/.test(typeof navigator === 'undefined' ? '' : navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
                    </button>
                  ) : null}

                  {showSuperadminAcademyPicker ? (
                    <div className="app-pagebar__context">
                      <select
                        value={selectedAcademyId}
                        onChange={(event) => onSelectAcademy?.(event.target.value)}
                        className="app-select app-select--compact app-pagebar__select"
                        aria-label={t('Selecionar unidade em foco')}
                      >
                        <option value="">{t('Escolha uma unidade')}</option>
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

                  {isSuperAdmin && onSetThemeMode ? (
                    <button
                      type="button"
                      className="sa-theme-btn"
                      onClick={() => onSetThemeMode(isDarkMode ? 'light' : 'dark')}
                      aria-label={isDarkMode ? t('Tema claro') : t('Tema escuro')}
                      title={isDarkMode ? t('Tema claro') : t('Tema escuro')}
                    >
                      {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                  ) : null}

                  {!isSuperAdmin && isDesktopShell ? (
                    <div className="app-pagebar__context app-pagebar__context--unit">
                      {renderUnitChip()}
                    </div>
                  ) : null}

                  {/* Telas com cabecalho proprio ja tem o sino: aqui ele sairia duplicado. */}
                  {isStudentNav && (!screenOwnsHeader || onUnitClick) ? (
                    <div className="app-pagebar__context app-pagebar__bell">
                      {onUnitClick ? renderUnitChip() : null}
                      {!screenOwnsHeader ? renderBellButton() : null}
                    </div>
                  ) : null}
                </div>
              </div>

            </header>

            <main className="app-main">{children}</main>
          </div>
        </div>
      </div>

      <nav className={`app-toolbar safe-area-bottom ${isSuperAdmin ? 'app-toolbar--superadmin' : ''} ${isDesktopShell ? 'app-toolbar--desk' : ''}`.trim()} aria-label={t('Navegação principal')}>
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
              const isActive = activeNavId === item.id;
              const showNotificationBadge = item.id === 'notifications' && unreadNotificationsCount > 0;

              return (
                <Fragment key={item.id}>
                  <button
                    ref={(element) => {
                      navRefs.current[item.id] = element;
                    }}
                    type="button"
                    onClick={() => { if (item.id !== activeTab) hapticTap(); setActiveTab(item.id); }}
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
      {paletteEnabled ? <SuperadminPalette open={paletteOpen} items={paletteItems} onClose={() => setPaletteOpen(false)} /> : null}
    </div>
  );
};

export default Layout;
