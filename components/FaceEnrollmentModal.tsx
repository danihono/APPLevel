import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, RotateCcw, ScanFace, ShieldCheck, X } from 'lucide-react';
import { FACE_CONSENT_PARAGRAPHS, FACE_CONSENT_VERSION, FACE_ENGINE_ERROR_TEXT } from '../faceBiometricsRules';
import { t } from '../i18n';
import { FaceEngineError, preloadFaceGuide, prepareEnrollmentPhoto } from '../services/faceEngine';
import { backendFunctions } from '../services/firebase/functions';
import FaceVideoCapture from './FaceVideoCapture';

interface FaceEnrollmentModalProps {
  onClose: () => void;
}

// terms → video (camera ao vivo) ou upload (sem camera) → sending → done (ou retry)
type Step = 'terms' | 'video' | 'upload' | 'sending' | 'retry' | 'done';

const UPLOAD_SAMPLES = 3;

const FaceEnrollmentModal: React.FC<FaceEnrollmentModalProps> = ({ onClose }) => {
  const [step, setStep] = useState<Step>('terms');
  const [accepted, setAccepted] = useState(false);
  // Fotos avulsas (so quando a camera ao vivo nao abre), ja reduzidas, em memoria.
  const [uploads, setUploads] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  // Recomeca o video do zero (nova montagem do componente) apos um erro no envio.
  const [attempt, setAttempt] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Baixa a deteccao facial enquanto a pessoa le o termo.
  useEffect(() => {
    void preloadFaceGuide().catch(() => undefined);
  }, []);

  const busy = step === 'sending' || preparing;

  const send = useCallback(async (images: string[]) => {
    setStep('sending');
    setError('');
    try {
      await backendFunctions.enrollFaceBiometrics({
        images,
        consentAccepted: true,
        consentVersion: FACE_CONSENT_VERSION,
      });
      setStep('done');
    } catch (sendError) {
      setError(sendError instanceof Error && sendError.message
        ? t(sendError.message)
        : t('Não foi possível salvar a biometria. Tente de novo.'));
      setUploads([]);
      setAttempt((current) => current + 1);
      setStep('retry');
    }
  }, []);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    setError('');
    try {
      const image = await prepareEnrollmentPhoto(file);
      const next = [...uploads, image];
      setUploads(next);
      if (next.length >= UPLOAD_SAMPLES) {
        await send(next);
      }
    } catch (uploadError) {
      setError(uploadError instanceof FaceEngineError
        ? t(FACE_ENGINE_ERROR_TEXT[uploadError.code])
        : t('Não foi possível abrir esta imagem. Tente outra foto.'));
    } finally {
      setPreparing(false);
    }
  };

  const onVideoComplete = useCallback((frames: string[]) => { void send(frames); }, [send]);
  const onCameraUnavailable = useCallback(() => {
    setError(t('Não conseguimos abrir a câmera ao vivo. Envie 3 fotos do rosto: uma de frente e uma virada para cada lado.'));
    setStep('upload');
  }, []);

  return (
    <div role="dialog" aria-modal="true" className="face-modal" onClick={() => { if (!busy) onClose(); }}>
      <div className="app-panel face-modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="face-modal__header">
          <div className="app-icon-shell" style={{ flexShrink: 0 }}>
            {step === 'terms' ? <ShieldCheck size={18} /> : <ScanFace size={18} />}
          </div>
          <h2 className="face-modal__title">
            {step === 'terms' ? t('Termo de consentimento — biometria facial') : t('Cadastro da biometria facial')}
          </h2>
          <button type="button" className="app-button app-button--ghost app-button--icon" onClick={onClose} disabled={busy} aria-label={t('Fechar')}>
            <X size={16} />
          </button>
        </div>

        {step === 'terms' ? (
          <>
            <div className="face-modal__body face-modal__terms">
              {FACE_CONSENT_PARAGRAPHS.map((paragraph) => (
                <p key={paragraph}>{t(paragraph)}</p>
              ))}
            </div>
            <label className="face-modal__consent">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>{t('Li e aceito o uso da minha biometria facial para sugestão de presença nas aulas.')}</span>
            </label>
            <div className="face-modal__actions">
              <button type="button" className="app-button app-button--ghost" onClick={onClose}>
                {t('Agora não')}
              </button>
              <button type="button" className="app-button app-button--gold" disabled={!accepted} onClick={() => setStep('video')}>
                {t('Aceitar e continuar')}
              </button>
            </div>
          </>
        ) : null}

        {step === 'video' ? (
          <div className="face-modal__body">
            <FaceVideoCapture key={attempt} onComplete={onVideoComplete} onUnavailable={onCameraUnavailable} />
          </div>
        ) : null}

        {step === 'upload' ? (
          <>
            <div className="face-modal__body">
              {error ? <div className="app-alert app-alert--error">{error}</div> : null}
              <p className="face-modal__copy">
                {t('Foto {current} de {total}. Boa luz, sem boné nem óculos escuros, só você na foto.', { current: uploads.length + 1, total: UPLOAD_SAMPLES })}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void handleUpload(file);
              }}
            />
            <div className="face-modal__actions">
              <button type="button" className="app-button app-button--gold app-button--block" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                <Camera size={16} />
                {preparing ? t('Preparando foto...') : t('Tirar foto {current} de {total}', { current: uploads.length + 1, total: UPLOAD_SAMPLES })}
              </button>
            </div>
          </>
        ) : null}

        {step === 'sending' ? (
          <div className="face-modal__body face-modal__done">
            <span className="face-modal__spinner" />
            <p className="face-modal__copy">{t('Salvando sua biometria com segurança...')}</p>
          </div>
        ) : null}

        {step === 'retry' ? (
          <>
            <div className="face-modal__body">
              <div className="app-alert app-alert--error">{error}</div>
            </div>
            <div className="face-modal__actions">
              <button type="button" className="app-button app-button--ghost" onClick={onClose}>{t('Fechar')}</button>
              <button type="button" className="app-button app-button--gold" onClick={() => { setError(''); setStep('video'); }}>
                <RotateCcw size={16} />
                {t('Tentar de novo')}
              </button>
            </div>
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <div className="face-modal__body face-modal__done">
              <CheckCircle2 size={40} style={{ color: '#29a675' }} />
              <p className="face-modal__title">{t('Biometria cadastrada!')}</p>
              <p className="face-modal__copy">
                {t('A partir de agora o professor pode reconhecer você na foto da turma. Para remover, acesse Perfil → Biometria facial.')}
              </p>
            </div>
            <div className="face-modal__actions">
              <button type="button" className="app-button app-button--gold app-button--block" onClick={onClose}>
                {t('Concluir')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default FaceEnrollmentModal;
