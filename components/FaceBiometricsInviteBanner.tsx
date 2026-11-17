import React, { useState } from 'react';
import { ScanFace, X } from 'lucide-react';
import { t } from '../i18n';
import { openFaceEnrollment } from './FaceEnrollmentHost';

const DISMISS_KEY = 'applevel:face-biometrics-invite-dismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

interface FaceBiometricsInviteBannerProps {
  // Aluno maior de idade que ainda nao cadastrou a biometria.
  eligible: boolean;
}

// Convite (dispensavel) para o aluno cadastrar a biometria facial.
const FaceBiometricsInviteBanner: React.FC<FaceBiometricsInviteBannerProps> = ({ eligible }) => {
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!eligible || dismissed) {
    return null;
  }

  return (
    <div className="app-list-card">
      <div className="flex items-start gap-3">
        <div className="app-icon-shell" style={{ flexShrink: 0 }}>
          <ScanFace size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[color:var(--text-strong)]">{t('Presença por foto da turma')}</p>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {t('Cadastre sua biometria facial e o professor registra sua presença com uma foto da turma. É opcional e você pode remover quando quiser.')}
          </p>
          <button type="button" onClick={openFaceEnrollment} className="app-button app-button--gold app-button--small mt-3">
            <ScanFace size={14} />
            {t('Cadastrar biometria facial')}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, '1');
            } catch {
              // Sem armazenamento: o convite so volta na proxima abertura.
            }
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

export default FaceBiometricsInviteBanner;
