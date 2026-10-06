import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { ProgressionRules } from '../../beltCatalog';
import { nonCountingWarning, type AttendanceNonCountingReason } from '../../classRules';
import type { FirestoreEntity } from '../../services/firebase/data';
import type { ClassRecord } from '../../services/firebase/models';
import type { User } from '../../types';
import { t } from '../../i18n';

export interface CheckInScreenProps {
  /** Aula alvo, quando conhecida (card do Inicio, lista de Aulas ou deep link). */
  lesson: FirestoreEntity<ClassRecord> | null;
  classId: string | null;
  /** Token vindo do deep link `?checkin=<token>&classId=<id>` (camera do celular). */
  initialToken?: string | null;
  user: User;
  progressionRules?: ProgressionRules;
  /** Previa de que a presenca NAO vai contar (aula iniciante / limite diario). */
  nonCountingReason: AttendanceNonCountingReason | null;
  alreadyCheckedIn: boolean;
  hasPendingRequest: boolean;
  /** Registra a presenca. Devolve o motivo quando ela nao conta como aula (null = conta). */
  onRegister: (classId: string, qrToken: string) => Promise<AttendanceNonCountingReason | null>;
  /** "Solicitar presenca" ao professor (sem QR). */
  onRequestAttendance: (classId: string) => Promise<void>;
  onClose: () => void;
  /** Depois do sucesso ("Bora pro tatame"). */
  onFinish: () => void;
}

/**
 * Check-in do aluno por QR. (Versao base; o visual completo e a leitura por camera
 * ficam na tela redesenhada.)
 */
const CheckInScreen: React.FC<CheckInScreenProps> = ({
  classId,
  initialToken,
  nonCountingReason,
  onRegister,
  onClose,
  onFinish,
}) => {
  const [token, setToken] = useState(initialToken ?? '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [error, setError] = useState('');

  return (
    <div className="lv-fullscreen lv-fullscreen--yellow" role="dialog" aria-modal="true">
      <div className="lv-fullscreen__inner">
        <button type="button" className="lv-icon-btn lv-icon-btn--on-yellow" onClick={onClose} aria-label={t('Fechar')}>
          <X size={20} />
        </button>
        {nonCountingReason ? <p className="lv-alert lv-alert--on-yellow">{nonCountingWarning(nonCountingReason)}</p> : null}
        {status === 'success' ? (
          <button type="button" className="lv-btn lv-btn--ink lv-btn--block" onClick={onFinish}>OK</button>
        ) : (
          <>
            <input className="lv-input" value={token} onChange={(event) => setToken(event.target.value)} />
            {error ? <p className="lv-alert lv-alert--danger">{error}</p> : null}
            <button
              type="button"
              className="lv-btn lv-btn--ink lv-btn--block"
              disabled={!classId || !token.trim() || status === 'loading'}
              onClick={() => {
                if (!classId) return;
                setStatus('loading');
                setError('');
                onRegister(classId, token).then(() => setStatus('success')).catch((err: unknown) => {
                  setStatus('idle');
                  setError(err instanceof Error ? err.message : t('Erro ao registrar presença.'));
                });
              }}
            >
              {t('Registrar presença')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CheckInScreen;
