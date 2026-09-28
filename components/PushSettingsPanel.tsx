import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, RefreshCw, Send } from 'lucide-react';
import { t } from '../i18n';
import { backendFunctions } from '../services/firebase/functions';
import {
  enablePushNotifications,
  ensurePushRegistration,
  getPushDiagnostics,
  type PushDiagnostics,
  type PushUnsupportedReason,
} from '../services/firebase/messaging';
import { resetPushBannerDismissals } from './PushOptInBanner';

const UNSUPPORTED_REASON_TEXT: Record<PushUnsupportedReason, string> = {
  'native-plugin': 'O app deste celular ainda não tem notificações. Atualize o LEVEL pela loja.',
  'no-notification-api': 'Este app ou navegador não permite notificações. No Android, confira se o app LEVEL está atualizado; no iPhone, use o app da App Store.',
  'no-service-worker': 'Este navegador não permite notificações em segundo plano.',
  'messaging-unsupported': 'Este navegador não é compatível com as notificações do LEVEL.',
};

type TestState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; message: string; ok: boolean };

// Estado das notificacoes deste aparelho, sempre visivel no Perfil, com envio
// de teste. Serve para descobrir, sem ferramenta nenhuma, por que o push nao chega.
const PushSettingsPanel: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics | null>(null);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [bannerReset, setBannerReset] = useState(false);

  const refresh = useCallback(async () => {
    setDiagnostics(await getPushDiagnostics());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = async () => {
    setBusy(true);
    setRegistrationFailed(false);
    try {
      await ensurePushRegistration();
    } catch (error) {
      console.error('[push:settings]', error);
      setRegistrationFailed(true);
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const enable = async () => {
    setBusy(true);
    setRegistrationFailed(false);
    try {
      await enablePushNotifications();
    } catch (error) {
      console.error('[push:settings]', error);
      setRegistrationFailed(true);
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const sendTest = async () => {
    setTest({ kind: 'busy' });
    try {
      await ensurePushRegistration();
      const result = await backendFunctions.sendTestNotification();
      if (result.tokens === 0) {
        setTest({ kind: 'done', ok: false, message: t('Nenhum aparelho cadastrado nesta conta.') });
      } else if (result.sent === 0) {
        setTest({ kind: 'done', ok: false, message: t('O envio falhou em todos os aparelhos desta conta. Tente de novo em instantes.') });
      } else {
        setTest({
          kind: 'done',
          ok: true,
          message: result.sent === 1
            ? t('Enviada para 1 aparelho. Deve chegar em alguns segundos.')
            : t('Enviada para {count} aparelhos. Deve chegar em alguns segundos.', { count: result.sent }),
        });
      }
    } catch (error) {
      setTest({
        kind: 'done',
        ok: false,
        message: error instanceof Error ? error.message : t('Não foi possível enviar o teste.'),
      });
    } finally {
      await refresh();
    }
  };

  if (!diagnostics) {
    return <p className="push-settings__copy">{t('Verificando notificações...')}</p>;
  }

  const { status, reason } = diagnostics;
  const canTest = status === 'granted';

  return (
    <div className="push-settings">
      <div className="push-settings__status">
        <span className={`push-settings__dot ${status === 'granted' && !registrationFailed ? 'is-on' : ''}`} aria-hidden="true" />
        <div>
          <p className="push-settings__title">
            {status === 'granted' && !registrationFailed ? t('Ativadas neste aparelho') : null}
            {status === 'granted' && registrationFailed ? t('Ativadas, mas o cadastro deste aparelho falhou') : null}
            {status === 'default' ? t('Ainda não ativadas neste aparelho') : null}
            {status === 'denied' ? t('Bloqueadas nas configurações do aparelho') : null}
            {status === 'unsupported' ? t('Notificações indisponíveis aqui') : null}
          </p>
          <p className="push-settings__copy">
            {status === 'denied'
              ? t('Libere as notificações do LEVEL nas configurações do celular (Apps → LEVEL → Notificações) e volte aqui.')
              : null}
            {status === 'unsupported' && reason ? t(UNSUPPORTED_REASON_TEXT[reason]) : null}
            {status === 'default' ? t('Ative para receber avisos da academia mesmo com o app fechado.') : null}
            {status === 'granted' ? t('Use o teste para confirmar que a notificação chega neste aparelho.') : null}
          </p>
        </div>
      </div>

      <div className="push-settings__actions">
        {status === 'default' ? (
          <button type="button" className="app-button app-button--gold app-button--small" onClick={() => void enable()} disabled={busy}>
            <BellRing size={14} />
            {busy ? t('Ativando...') : t('Ativar notificações')}
          </button>
        ) : null}
        {status === 'granted' && registrationFailed ? (
          <button type="button" className="app-button app-button--gold app-button--small" onClick={() => void register()} disabled={busy}>
            <RefreshCw size={14} />
            {t('Tentar novamente')}
          </button>
        ) : null}
        {canTest ? (
          <button
            type="button"
            className="app-button app-button--ghost app-button--small"
            onClick={() => void sendTest()}
            disabled={test.kind === 'busy'}
          >
            <Send size={14} />
            {test.kind === 'busy' ? t('Enviando...') : t('Enviar notificação de teste')}
          </button>
        ) : null}
      </div>

      {test.kind === 'done' ? (
        <div className={`app-alert ${test.ok ? 'app-alert--success' : 'app-alert--error'}`}>
          {test.ok ? <CheckCircle2 size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} /> : null}
          {test.message}
        </div>
      ) : null}

      <button
        type="button"
        className="push-settings__link"
        onClick={() => {
          resetPushBannerDismissals();
          setBannerReset(true);
        }}
      >
        {bannerReset ? t('Pronto: o aviso volta a aparecer na tela de Avisos.') : t('Mostrar de novo o aviso na tela de Avisos')}
      </button>
    </div>
  );
};

export default PushSettingsPanel;
