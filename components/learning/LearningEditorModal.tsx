import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface LearningEditorModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Ícone opcional exibido no cabeçalho. */
  icon?: React.ReactNode;
  /** Faixa de abas renderizada abaixo do cabeçalho. */
  tabs?: React.ReactNode;
  /** Mensagem de erro global do formulário (falhas do backend). */
  error?: string;
  busy?: boolean;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: () => void;
  /** Ações extras no rodapé, à esquerda (ex.: excluir). */
  footerStart?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Casca comum dos editores do Learning Hub. Vira folha de tela cheia no mobile
 * (ver `.learning-modal` em index.css) e mantém o formulário como `<form>` para
 * que Enter e validação nativa do browser continuem funcionando.
 */
const LearningEditorModal: React.FC<LearningEditorModalProps> = ({
  open,
  title,
  subtitle,
  icon,
  tabs,
  error,
  busy = false,
  submitLabel = 'Salvar',
  onClose,
  onSubmit,
  footerStart,
  children,
}) => {
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Erro do backend chega depois do submit: rola o corpo pro topo para o usuário ver.
  useEffect(() => {
    if (error && bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [error]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="learning-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (!busy) {
          onClose();
        }
      }}
    >
      <form
        className="learning-modal__panel app-panel"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <header className="learning-modal__head">
          <div className="learning-modal__head-main">
            {icon ? <span className="learning-modal__icon">{icon}</span> : null}
            <div>
              <h2 className="learning-modal__title">{title}</h2>
              {subtitle ? <p className="learning-modal__subtitle">{subtitle}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="learning-icon-button"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </header>

        {tabs ? <div className="learning-modal__tabs">{tabs}</div> : null}

        <div className="learning-modal__body" ref={bodyRef}>
          {error ? (
            <div className="app-panel app-panel--danger learning-modal__error" role="alert">
              <p className="text-sm">{error}</p>
            </div>
          ) : null}
          {children}
        </div>

        <footer className="learning-modal__footer">
          <div className="learning-modal__footer-start">{footerStart}</div>
          <div className="learning-modal__footer-actions">
            <button type="button" onClick={onClose} disabled={busy} className="app-button app-button--dark">
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="app-button app-button--gold">
              {busy ? 'Salvando...' : submitLabel}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
};

export default LearningEditorModal;
