import React from 'react';
import { Bell, ChevronLeft } from 'lucide-react';
import { t } from '../../i18n';
import { useRedesignShell } from './ShellContext';

interface ScreenHeaderProps {
  /** Linha pequena em caixa alta acima do titulo (data, unidade, mes). */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Botoes extras a direita (filtro, "Hoje", "+"...). Entram antes do sino. */
  actions?: React.ReactNode;
  /** Mostra o botao voltar; `true` usa o goBack do shell. */
  back?: boolean | (() => void);
  /** Sino de avisos. Padrao: so para aluno (professor tem a aba Avisos). */
  showBell?: boolean;
  /** Superficie em que o cabecalho esta: muda as cores dos botoes. */
  tone?: 'light' | 'yellow' | 'dark';
  /** Eyebrow vira botao de troca de unidade quando o shell oferece. */
  eyebrowIsUnit?: boolean;
  className?: string;
}

/**
 * Cabecalho padrao das telas redesenhadas: eyebrow + titulo grande (SF Pro), alinhados a
 * esquerda, com acoes redondas a direita (sino com contador para o aluno).
 */
const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  actions,
  back,
  showBell,
  tone = 'light',
  eyebrowIsUnit = false,
  className = '',
}) => {
  const shell = useRedesignShell();
  const bellVisible = showBell ?? shell.role === 'student';
  const handleBack = typeof back === 'function' ? back : shell.goBack;
  const unitClickable = eyebrowIsUnit && Boolean(shell.onUnitClick);

  return (
    <header className={`lv-header lv-header--${tone} ${className}`.trim()}>
      {back || actions || bellVisible ? (
        <div className="lv-header__bar">
          {back ? (
            <button type="button" className="lv-icon-btn" onClick={handleBack} aria-label={t('Voltar')}>
              <ChevronLeft size={22} strokeWidth={2.2} />
            </button>
          ) : (
            <span className="lv-header__eyebrow-slot">
              {eyebrow ? (
                unitClickable ? (
                  <button type="button" className="lv-eyebrow lv-eyebrow--button" onClick={shell.onUnitClick} aria-label={t('Trocar unidade')}>
                    {eyebrow}
                  </button>
                ) : (
                  <span className="lv-eyebrow">{eyebrow}</span>
                )
              ) : null}
            </span>
          )}
          <div className="lv-header__actions">
            {actions}
            {bellVisible ? (
              <button
                type="button"
                className="lv-icon-btn lv-header__bell"
                onClick={shell.openNotifications}
                aria-label={shell.unreadCount > 0
                  ? `${t('Avisos')} · ${t('{count} não lidas', { count: shell.unreadCount })}`
                  : t('Avisos')}
              >
                <Bell size={20} strokeWidth={2} />
                {shell.unreadCount > 0 ? (
                  <span className="lv-badge-count" aria-hidden="true">{shell.unreadCount > 9 ? '9+' : shell.unreadCount}</span>
                ) : null}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {back && eyebrow ? <span className="lv-eyebrow">{eyebrow}</span> : null}
      {!back && !actions && !bellVisible && eyebrow ? <span className="lv-eyebrow">{eyebrow}</span> : null}

      <h1 className="lv-display lv-header__title">{title}</h1>
      {subtitle ? <p className="lv-header__subtitle">{subtitle}</p> : null}
    </header>
  );
};

export default ScreenHeader;
