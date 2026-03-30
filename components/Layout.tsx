import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
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
    kicker: 'Dojo pulse',
    title: 'Um painel vivo para a rotina da academia.',
    description: 'Cada aba agora entra na mesma linguagem: vidro, metal, luz ambiente e foco real em acoes.',
  },
  calendar: {
    kicker: 'Class control',
    title: 'Agenda e operacao de treino em uma cabine fluida.',
    description: 'Aulas, QR, presenca e sessoes ativas com leitura rapida e botoes mais dramatizados.',
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
  students: {
    kicker: 'Roster',
    title: 'Leitura de alunos mais limpa, mais forte e muito menos padrao.',
    description: 'Busca, filtros e perfis seguem a mesma estetica glass com acentos metalicos.',
  },
  management: {
    kicker: 'Control room',
    title: 'Gestao pesada com interface leve de operar.',
    description: 'Formularios, indicadores e blocos de configuracao ganharam profundidade e hierarquia visual.',
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

  const navItems = useMemo<NavItem[]>(() => (
    userRole === UserRole.SUPERADMIN
      ? [
        { id: 'home', icon: Home, label: 'Dashboard' },
        { id: 'calendar', icon: Calendar, label: 'Aulas' },
        { id: 'students', icon: Users, label: 'Academias' },
        { id: 'management', icon: Shield, label: 'Gestao' },
        { id: 'profile', icon: UserIcon, label: 'Perfil' },
      ]
      : [
        { id: 'home', icon: Home, label: 'Inicio' },
        { id: 'calendar', icon: Calendar, label: 'Agenda' },
        { id: 'competition', icon: Trophy, label: 'Compete' },
        { id: 'gamification', icon: Target, label: 'Missoes' },
        ...(isStaff ? [{ id: 'students', icon: Users, label: 'Alunos' }] : []),
        { id: 'store', icon: ShoppingBag, label: 'Store' },
        { id: 'profile', icon: UserIcon, label: 'Perfil' },
      ]
  ), [isStaff, userRole]);

  const currentPage = pageMeta[activeTab] ?? pageMeta.home;

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

  return (
    <div className="app-shell">
      <div className="app-frame">
        <header className="app-topbar">
          <div className="app-panel app-topbar-panel w-full">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="app-brand">
                <div className="app-brand__mark">LVL</div>
                <div className="app-brand__text">
                  <p className="app-kicker">Floating dojo UI</p>
                  <h1 className="app-headline">{currentPage.title}</h1>
                  <p className="app-copy">{currentPage.description}</p>
                </div>
              </div>

              <div className="app-topbar__status">
                <div className="app-orb">
                  <span className="app-orb__dot" />
                  {currentPage.kicker}
                </div>
                <div className="app-orb">{getRoleLabel(userRole)}</div>
                <div className="app-orb">{isDarkMode ? 'Dark mode' : 'Light mode'}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="app-main">{children}</main>
      </div>

      <nav className="app-toolbar safe-area-bottom" aria-label="Navegacao principal">
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
