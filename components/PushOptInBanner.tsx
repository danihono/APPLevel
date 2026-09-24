import React, { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { enablePushNotifications, getPushStatus, type PushStatus } from '../services/firebase/messaging';

const DISMISS_KEY = 'applevel:push-optin-dismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Sem armazenamento: o aviso so volta a aparecer na proxima abertura.
  }
}

// Convite para ativar as notificacoes do celular. Some sozinho quando o
// aparelho nao suporta (ex.: app do iPhone) ou quando ja esta ativado.
const PushOptInBanner: React.FC = () => {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getPushStatus().then((nextStatus) => {
      if (active) {
        setStatus(nextStatus);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === null || status === 'unsupported' || status === 'granted' || dismissed) {
    return null;
  }

  const handleEnable = async () => {
    setBusy(true);
    setError('');
    try {
      setStatus(await enablePushNotifications());
    } catch (enableError) {
      console.error('[push:enable]', enableError);
      setError('Não foi possível ativar agora. Tente de novo em instantes.');
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  return (
    <div className="app-list-card">
      <div className="flex items-start gap-3">
        <div className="app-icon-shell" style={{ flexShrink: 0 }}>
          <BellRing size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {status === 'denied' ? 'Notificações bloqueadas' : 'Receba os avisos na hora'}
          </p>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {status === 'denied'
              ? 'Para receber os avisos da academia no celular, libere as notificações do LEVEL nas configurações do aparelho.'
              : 'Ative as notificações para saber de avisos da academia, solicitações e graduações mesmo com o app fechado.'}
          </p>
          {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
          {status === 'default' ? (
            <button
              type="button"
              onClick={() => void handleEnable()}
              disabled={busy}
              className="app-button app-button--gold app-button--small mt-3"
            >
              <BellRing size={14} />
              {busy ? 'Ativando...' : 'Ativar notificações'}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dispensar"
          className="app-button app-button--ghost app-button--icon shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default PushOptInBanner;
