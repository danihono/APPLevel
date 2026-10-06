import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, RefreshCw, X } from 'lucide-react';
import {
  enablePushNotifications,
  ensurePushRegistration,
  getPushStatus,
  type PushStatus,
} from '../services/firebase/messaging';
import { t } from '../i18n';
import '../views/redesign/notifications.css';

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
        <div className="rd-push rd-push--neutral">
          <span className="rd-push__icon" aria-hidden="true">
            <CheckCircle2 size={20} strokeWidth={2} />
          </span>
          <div className="rd-push__copy">
            <p className="rd-push__title">{t('Notificações ativadas neste aparelho')}</p>
            <p className="rd-push__text">
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
            className="lv-icon-btn rd-push__close"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      );
    }

    if (registration === 'failed') {
      return (
        <div className="rd-push">
          <span className="rd-push__icon" aria-hidden="true">
            <BellRing size={20} strokeWidth={2} />
          </span>
          <div className="rd-push__copy">
            <p className="rd-push__title">{t('Não conseguimos ativar as notificações neste aparelho.')}</p>
            <button
              type="button"
              onClick={() => void checkRegistration()}
              className="lv-btn lv-btn--ink lv-btn--sm"
            >
              <RefreshCw size={15} strokeWidth={2} />
              {t('Tentar novamente')}
            </button>
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
    <div className="rd-push">
      <span className="rd-push__icon" aria-hidden="true">
        <BellRing size={20} strokeWidth={2} />
      </span>
      <div className="rd-push__copy">
        <p className="rd-push__title">
          {status === 'denied' ? t('Notificações bloqueadas') : t('Receba os avisos na hora')}
        </p>
        <p className="rd-push__text">
          {status === 'denied'
            ? t('Para receber os avisos da academia no celular, libere as notificações do LEVEL nas configurações do aparelho.')
            : t('Ative as notificações para saber de avisos da academia, solicitações e graduações mesmo com o app fechado.')}
        </p>
        {error ? <p className="rd-push__error">{error}</p> : null}
        {status === 'default' ? (
          <button
            type="button"
            onClick={() => void handleEnable()}
            disabled={busy}
            className="lv-btn lv-btn--ink lv-btn--sm"
          >
            <BellRing size={15} strokeWidth={2} />
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
        className="lv-icon-btn rd-push__close"
      >
        <X size={18} strokeWidth={2} />
      </button>
    </div>
  );
};

export default PushOptInBanner;
