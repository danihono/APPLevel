import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmOptions {
  /** Título curto no topo do modal. */
  title?: string;
  /** Mensagem principal. Quebras de linha (\n) são respeitadas. */
  message: string;
  /** Texto do botão de confirmação. Padrão: "Confirmar". */
  confirmLabel?: string;
  /** Texto do botão de cancelamento. Padrão: "Cancelar". */
  cancelLabel?: string;
  /** "danger" deixa o botão de confirmação vermelho (ações destrutivas). */
  tone?: 'default' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface DialogState extends ConfirmOptions {
  open: boolean;
}

const DEFAULT_STATE: DialogState = { open: false, message: '' };

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DialogState>(DEFAULT_STATE);
  const resolverRef = useRef<(value: boolean) => void>(() => undefined);

  const confirm = useCallback<ConfirmFn>((options) => {
    setState({ ...options, open: true });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolverRef.current(result);
    resolverRef.current = () => undefined;
    setState((current) => ({ ...current, open: false }));
  }, []);

  useEffect(() => {
    if (!state.open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.open, close]);

  const isDanger = state.tone === 'danger';
  const confirmColor = isDanger ? '#ef4444' : '#22c55e';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => close(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 220,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)', padding: 20,
          }}
        >
          <div
            className="app-panel"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%', maxWidth: 360, borderRadius: '1.8rem', padding: 28,
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: '1rem' }}>
                <AlertTriangle size={18} style={{ color: isDanger ? '#ef4444' : 'var(--gold-mid)' }} />
                {state.title ?? 'Confirmar ação'}
              </span>
              <button
                type="button"
                className="app-button app-button--ghost app-button--icon"
                style={{ width: 32, height: 32 }}
                onClick={() => close(false)}
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>
              {state.message}
            </p>

            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button
                type="button"
                className="app-button app-button--block"
                style={{ background: '#fff', color: '#6b7280', fontWeight: 700, border: '1.5px solid #d1d5db' }}
                onClick={() => close(false)}
              >
                {state.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                className="app-button app-button--block"
                style={{ background: '#fff', color: confirmColor, fontWeight: 700, border: `1.5px solid ${confirmColor}` }}
                onClick={() => close(true)}
              >
                {state.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
};

/**
 * Retorna uma função `confirm(options)` que abre um modal estilizado e resolve
 * com `true`/`false`. Substitui o `window.confirm` nativo do navegador.
 *
 * Uso: `const confirm = useConfirm();` e depois `if (!(await confirm({ message }))) return;`
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Sem provider montado: cai no confirm nativo para não quebrar a ação.
    return async (options) => window.confirm(options.message);
  }
  return ctx;
}

export default ConfirmProvider;
