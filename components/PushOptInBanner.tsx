import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, RefreshCw, X } from 'lucide-react';
import {
  enablePushNotifications,
  ensurePushRegistration,
  getPushStatus,
  type PushStatus,
} from '../services/firebase/messaging';
import { t } from '../i18n';

const DISMISS_KEY = 'applevel:push-optin-dismissed';
const ENABLED_ACK_KEY = 'applevel:push-enabled-ack';

type RegistrationState = 'idle' | 'checking' | 'ok' | 'failed';

// Volta a mostrar o convite/confirmacao na tela de Avisos (usado no Perfil).
export function resetPushBannerDismissals() {
  try {
    window.localStorage.removeItem(DISMISS_KEY);
    window.localStorage.removeItem(ENABLED_ACK_KEY);
  } catch {
    // Sem armazenamento: nada a limpar.
  }
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Sem armazenamento: o aviso so volta a aparecer na proxima abertura.
  }
}

// Mostra o estado real das notificacoes deste aparelho: convite para ativar,
// bloqueadas, ativadas (confirmacao) ou falha no cadastro (tentar de novo).
// Some quando o aparelho nao suporta notificacoes.
const PushOptInBanner: React.FC = () => {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [registration, setRegistration] = useState<RegistrationState>('idle');
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISS_KEY));
  const [acknowledged, setAcknowledged] = useState(() => readFlag(ENABLED_ACK_KEY));
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

  const checkRegistration = async () => {
    setRegistration('checking');
    try {
      await ensurePushRegistration();
      setRegistration('ok');
    } catch (registrationError) {
      console.error('[push:register]', registrationError);
      setRegistration('failed');
    }
  };

  // Permissao ja concedida (inclusive de uma tentativa anterior que falhou):
  // confere se este aparelho esta mesmo cadastrado.
  useEffect(() => {
    if (status === 'granted' && registration === 'idle') {
      void checkRegistration();
    }
  }, [status, registration]);

  if (status === null || status === 'unsupported') {
    return null;
  }

  const handleEnable = async () => {
    setBusy(true);
    setError('');
    try {
      const nextStatus = await enablePushNotifications();
      if (nextStatus === 'granted') {
        setRegistration('ok');
      }
      setStatus(nextStatus);
    } catch (enableError) {
      console.error('[push:enable]', enableError);
      setError(t('Não foi possível ativar agora. Tente de novo em instantes.'));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'granted') {
    if (registration === 'ok' && !acknowledged) {
      return (
        <div className="app-list-card">
          <div className="flex items-start gap-3">
            <div className="app-icon-shell" style={{ flexShrink: 0 }}>
              <CheckCircle2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[color:var(--text-strong)]">{t('Notificações ativadas neste aparelho')}</p>
              <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                {t('Você vai receber os avisos da academia mesmo com o app fechado.')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                writeFlag(ENABLED_ACK_KEY);
                setAcknowledged(true);
              }}
              aria-label={t('Dispensar')}
              className="app-button app-button--ghost app-button--icon"
              style={{ flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      );
    }

    if (registration === 'failed') {
      return (
        <div className="app-list-card">
          <div className="flex items-start gap-3">
            <div className="app-icon-shell" style={{ flexShrink: 0 }}>
              <BellRing size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[color:var(--text-strong)]">{t('Não conseguimos ativar as notificações neste aparelho.')}</p>
              <button
                type="button"
                onClick={() => void checkRegistration()}
                className="app-button app-button--gold app-button--small mt-3"
              >
                <RefreshCw size={14} />
                {t('Tentar novamente')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  // Bloqueado aparece mesmo se o convite foi dispensado: e algo que a pessoa
  // precisa resolver nas configuracoes do aparelho.
  if (dismissed && status !== 'denied') {
    return null;
  }

  return (
    <div className="app-list-card">
      <div className="flex items-start gap-3">
        <div className="app-icon-shell" style={{ flexShrink: 0 }}>
          <BellRing size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[color:var(--text-strong)]">
            {status === 'denied' ? t('Notificações bloqueadas') : t('Receba os avisos na hora')}
          </p>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {status === 'denied'
              ? t('Para receber os avisos da academia no celular, libere as notificações do LEVEL nas configurações do aparelho.')
              : t('Ative as notificações para saber de avisos da academia, solicitações e graduações mesmo com o app fechado.')}
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
              {busy ? t('Ativando...') : t('Ativar notificações')}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            writeFlag(DISMISS_KEY);
            setDismissed(true);
          }}
          aria-label={t('Dispensar')}
          className="app-button app-button--ghost app-button--icon"
          style={{ flexShrink: 0 }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default PushOptInBanner;
