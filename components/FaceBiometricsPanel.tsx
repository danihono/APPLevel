import React, { useState } from 'react';
import { ScanFace, Trash2 } from 'lucide-react';
import { isAdultByBirthDate } from '../faceBiometricsRules';
import { t } from '../i18n';
import { backendFunctions } from '../services/firebase/functions';
import { useConfirm } from './ConfirmDialog';
import { openFaceEnrollment } from './FaceEnrollmentHost';

interface FaceBiometricsPanelProps {
  enrolled: boolean;
  birthDate?: string;
}

// Menor de 18 nao ve nada sobre biometria (nem convite, nem painel).
export function canOfferFaceBiometrics(birthDate?: string): boolean {
  return !birthDate || isAdultByBirthDate(birthDate);
}

// Bloco do Perfil: mostra o estado da biometria facial e permite cadastrar, refazer ou remover.
const FaceBiometricsPanel: React.FC<FaceBiometricsPanelProps> = ({ enrolled, birthDate }) => {
  const confirm = useConfirm();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  // O status vem do perfil (Firestore) e a tela se atualiza sozinha apos cadastrar/remover.
  const isEnrolled = enrolled;
  const missingBirthDate = !birthDate;

  const handleRemove = async () => {
    const confirmed = await confirm({
      title: t('Remover biometria facial'),
      message: t('Sua biometria será apagada agora e você deixa de ser reconhecido nas fotos da turma. Você pode cadastrar de novo quando quiser.'),
      confirmLabel: t('Remover'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    setRemoving(true);
    setError('');
    try {
      await backendFunctions.revokeFaceBiometrics();
    } catch (removeError) {
      console.error('[face:revoke]', removeError);
      setError(t('Não foi possível remover agora. Tente de novo em instantes.'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="push-settings">
      <div className="push-settings__status">
        <span className={`push-settings__dot ${isEnrolled ? 'is-on' : ''}`} style={isEnrolled ? undefined : { background: 'var(--text-soft)' }} />
        <div>
          <p className="push-settings__title">
            {isEnrolled ? t('Biometria facial cadastrada') : t('Biometria facial não cadastrada')}
          </p>
          <p className="push-settings__copy">
            {isEnrolled
              ? t('O professor pode reconhecer você na foto da turma para agilizar a chamada. Nenhuma foto sua fica guardada.')
              : missingBirthDate
                ? t('Preencha sua data de nascimento no perfil para cadastrar a biometria facial (disponível para maiores de 18 anos).')
                : t('Opcional: cadastre seu rosto e o professor registra sua presença a partir de uma foto da turma.')}
          </p>
        </div>
      </div>

      <div className="push-settings__actions">
        {!missingBirthDate ? (
          <button type="button" className="app-button app-button--gold app-button--small" onClick={openFaceEnrollment} disabled={removing}>
            <ScanFace size={14} />
            {isEnrolled ? t('Refazer cadastro') : t('Cadastrar biometria facial')}
          </button>
        ) : null}
        {isEnrolled ? (
          <button type="button" className="app-button app-button--ghost app-button--small" onClick={() => void handleRemove()} disabled={removing}>
            <Trash2 size={14} />
            {removing ? t('Removendo...') : t('Remover minha biometria')}
          </button>
        ) : null}
      </div>

      {error ? <div className="app-alert app-alert--error">{error}</div> : null}
    </div>
  );
};

export default FaceBiometricsPanel;
