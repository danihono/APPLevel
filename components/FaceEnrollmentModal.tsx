import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ScanFace, ShieldCheck, X } from 'lucide-react';
import { FACE_CONSENT_PARAGRAPHS, FACE_CONSENT_VERSION, FACE_ENGINE_ERROR_TEXT } from '../faceBiometricsRules';
import { t, tKey } from '../i18n';
import {
  extractEnrollmentEmbedding,
  FACE_ENROLLMENT_SAMPLES,
  FACE_MODEL_VERSION,
  FaceEngineError,
  preloadFaceEngine,
} from '../services/faceEngine';
import { backendFunctions } from '../services/firebase/functions';

interface FaceEnrollmentModalProps {
  onClose: () => void;
}

type Step = 'terms' | 'capture' | 'done';

// Uma instrucao por foto: variar o angulo deixa o reconhecimento mais tolerante na foto da turma.
const SAMPLE_INSTRUCTIONS = [
  tKey('Olhando de frente para a câmera'),
  tKey('Rosto levemente virado para a esquerda'),
  tKey('Rosto levemente virado para a direita'),
] as const;

const FaceEnrollmentModal: React.FC<FaceEnrollmentModalProps> = ({ onClose }) => {
  const [step, setStep] = useState<Step>('terms');
  const [accepted, setAccepted] = useState(false);
  // So os vetores ficam em memoria; a foto e descartada assim que e analisada.
  const [samples, setSamples] = useState<number[][]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Baixa os modelos enquanto a pessoa le o termo.
  useEffect(() => {
    preloadFaceEngine();
  }, []);

  const busy = analyzing || saving;
  const complete = samples.length >= FACE_ENROLLMENT_SAMPLES;

  const handlePhoto = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setAnalyzing(true);
    setError('');
    try {
      const embedding = await extractEnrollmentEmbedding(file);
      setSamples((current) => [...current, embedding]);
    } catch (photoError) {
      setError(photoError instanceof FaceEngineError
        ? t(FACE_ENGINE_ERROR_TEXT[photoError.code])
        : t('Não foi possível analisar a foto. Tente de novo.'));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await backendFunctions.enrollFaceBiometrics({
        embeddings: samples,
        consentAccepted: true,
        consentVersion: FACE_CONSENT_VERSION,
        modelVersion: FACE_MODEL_VERSION,
      });
      setStep('done');
    } catch (saveError) {
      // "Fotos nao parecem da mesma pessoa" e similares: recomeca a captura.
      setSamples([]);
      setError(saveError instanceof Error && saveError.message
        ? t(saveError.message)
        : t('Não foi possível salvar a biometria. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="face-modal"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div className="app-panel face-modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="face-modal__header">
          <div className="app-icon-shell" style={{ flexShrink: 0 }}>
            {step === 'terms' ? <ShieldCheck size={18} /> : <ScanFace size={18} />}
          </div>
          <h2 className="face-modal__title">
            {step === 'terms' ? t('Termo de consentimento — biometria facial') : t('Cadastro da biometria facial')}
          </h2>
          <button
            type="button"
            className="app-button app-button--ghost app-button--icon"
            onClick={onClose}
            disabled={busy}
            aria-label={t('Fechar')}
          >
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
              <button type="button" className="app-button app-button--gold" disabled={!accepted} onClick={() => setStep('capture')}>
                {t('Aceitar e continuar')}
              </button>
            </div>
          </>
        ) : null}

        {step === 'capture' ? (
          <>
            <div className="face-modal__body">
              <p className="face-modal__copy">
                {t('Tire {count} fotos do seu rosto, sem boné nem óculos escuros e com boa luz. As fotos não são guardadas.', { count: FACE_ENROLLMENT_SAMPLES })}
              </p>
              <ol className="face-modal__steps">
                {SAMPLE_INSTRUCTIONS.map((instruction, index) => {
                  const done = index < samples.length;
                  const current = index === samples.length;
                  return (
                    <li key={instruction} className={`face-modal__step ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`}>
                      {done ? <CheckCircle2 size={18} /> : <span className="face-modal__step-number">{index + 1}</span>}
                      <span>{t(instruction)}</span>
                    </li>
                  );
                })}
              </ol>
              {error ? <div className="app-alert app-alert--error">{error}</div> : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Limpa para o mesmo arquivo poder ser escolhido de novo apos um erro.
                event.target.value = '';
                void handlePhoto(file);
              }}
            />
            <div className="face-modal__actions">
              {complete ? (
                <>
                  <button type="button" className="app-button app-button--ghost" onClick={() => setSamples([])} disabled={busy}>
                    {t('Refazer fotos')}
                  </button>
                  <button type="button" className="app-button app-button--gold" onClick={() => void handleSave()} disabled={busy}>
                    {saving ? t('Salvando...') : t('Salvar biometria')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="app-button app-button--gold app-button--block"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  <Camera size={16} />
                  {analyzing
                    ? t('Analisando foto...')
                    : t('Tirar foto {current} de {total}', { current: samples.length + 1, total: FACE_ENROLLMENT_SAMPLES })}
                </button>
              )}
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
