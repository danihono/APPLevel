import { WifiOff } from 'lucide-react';
import { t } from '../i18n';

interface OfflineBannerProps {
  /** `false` quando o aparelho esta sem internet. */
  online: boolean;
  /** Sessao aberta pelo cache do aparelho (servidor ainda nao confirmou). */
  offlineSession: boolean;
}

// Faixa fixa no topo, unica para desktop e mobile: avisa que os dados exibidos
// sao os ultimos salvos no aparelho e que acoes que dependem do servidor
// voltam quando a conexao voltar.
export function OfflineBanner({ online, offlineSession }: OfflineBannerProps) {
  if (online && !offlineSession) {
    return null;
  }

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <WifiOff size={15} strokeWidth={2.2} aria-hidden="true" />
      <span>
        {online
          ? t('Sem conexão com o servidor. Mostrando os últimos dados salvos.')
          : t('Você está offline. Mostrando os últimos dados salvos.')}
      </span>
    </div>
  );
}
