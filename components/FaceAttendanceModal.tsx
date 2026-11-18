import React, { useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, ImagePlus, ScanFace, UserX, X } from 'lucide-react';
import { FACE_ATTENDANCE_SOURCE, FACE_ENGINE_ERROR_TEXT } from '../faceBiometricsRules';
import { t } from '../i18n';
import { cropThumbnail, FaceEngineError, prepareGroupPhoto } from '../services/faceEngine';
import type { FirestoreEntity } from '../services/firebase/data';
import { backendFunctions, type FaceAttendanceCandidate } from '../services/firebase/functions';
import type { UserRecord } from '../services/firebase/models';
import type { BeltColor } from '../types';
import AvatarWithBelt from './AvatarWithBelt';

interface FaceAttendanceModalProps {
  classId: string;
  className: string;
  students: Array<FirestoreEntity<UserRecord>>;
  onClose: () => void;
}

type Step = 'pick' | 'analyzing' | 'review' | 'saving' | 'summary';

interface ReviewFace {
  thumbnail: string;
  // Melhor sugestao primeiro, depois as alternativas. Vazio = rosto nao reconhecido.
  candidates: FaceAttendanceCandidate[];
  confidence: 'high' | 'medium' | null;
  // Aluno escolhido pelo professor para este rosto ('' = ninguem).
  selectedUserId: string;
  checked: boolean;
}

interface SaveOutcome {
  userId: string;
  ok: boolean;
  message?: string;
}

const photoToAvatar = (path?: string) => (path && path.startsWith('http') ? path : undefined);

// Chamada por foto: o app analisa a foto NO APARELHO, o servidor sugere quem e cada rosto e o
// professor confirma. Nada e registrado sem o toque em "Confirmar presencas".
const FaceAttendanceModal: React.FC<FaceAttendanceModalProps> = ({ classId, className, students, onClose }) => {
  const [step, setStep] = useState<Step>('pick');
  const [faces, setFaces] = useState<ReviewFace[]>([]);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [outcomes, setOutcomes] = useState<SaveOutcome[]>([]);
  const [error, setError] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const nameOf = (userId: string) => studentById.get(userId)?.displayName ?? t('Aluno');
  const busy = step === 'analyzing' || step === 'saving';

  const handlePhoto = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setStep('analyzing');
    setError('');
    try {
      const photo = await prepareGroupPhoto(file);
      const result = await backendFunctions.suggestClassAttendanceFromFaces({ classId, image: photo.base64 });
      if (result.faces.length === 0) {
        setError(t('Não encontramos rostos nesta foto. Tente de novo mais perto e com boa luz.'));
        setStep('pick');
        return;
      }

      setEnrolledCount(result.enrolledCount);
      setFaces(result.faces.map((suggestion) => {
        const best = suggestion.best;
        return {
          thumbnail: cropThumbnail(photo.canvas, suggestion.box),
          candidates: best ? [best, ...suggestion.alternatives] : suggestion.alternatives,
          confidence: best?.confidence ?? null,
          selectedUserId: best?.userId ?? '',
          // So a confianca alta ja vem marcada; o resto o professor decide.
          checked: best?.confidence === 'high' && !best.alreadyPresent,
        };
      }));
      setStep('review');
    } catch (photoError) {
      setError(photoError instanceof FaceEngineError
        ? t(FACE_ENGINE_ERROR_TEXT[photoError.code])
        : photoError instanceof Error && photoError.message
          ? t(photoError.message)
          : t('Não foi possível analisar a foto. Tente de novo.'));
      setStep('pick');
    }
  };

  const updateFace = (index: number, patch: Partial<ReviewFace>) => {
    setFaces((current) => current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  };

  // Reconhecidos primeiro; a ordem original (esquerda → direita na foto) desempata.
  const orderedFaces = useMemo(
    () => faces
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => Number(right.entry.candidates.length > 0) - Number(left.entry.candidates.length > 0)),
    [faces],
  );
  const unrecognizedCount = faces.filter((entry) => entry.candidates.length === 0).length;
  // Um aluno marcado em dois rostos conta uma vez so.
  const selectedUserIds = useMemo(
    () => [...new Set(faces
      .filter((entry) => entry.checked && entry.selectedUserId)
      .map((entry) => entry.selectedUserId))],
    [faces],
  );

  const handleConfirm = async () => {
    setStep('saving');
    const results: SaveOutcome[] = [];
    // Em sequencia: cada presenca roda uma transacao propria no servidor.
    for (const userId of selectedUserIds) {
      try {
        await backendFunctions.registerAttendance({ classId, targetUserId: userId, sourceDevice: FACE_ATTENDANCE_SOURCE });
        results.push({ userId, ok: true });
      } catch (saveError) {
        results.push({
          userId,
          ok: false,
          message: saveError instanceof Error && saveError.message ? t(saveError.message) : t('Erro ao marcar presença.'),
        });
      }
    }
    setOutcomes(results);
    setStep('summary');
  };

  const savedCount = outcomes.filter((outcome) => outcome.ok).length;
  const failed = outcomes.filter((outcome) => !outcome.ok);

  return (
    <div role="dialog" aria-modal="true" className="face-modal" onClick={() => { if (!busy) onClose(); }}>
      <div className="app-panel face-modal__panel face-modal__panel--wide" onClick={(event) => event.stopPropagation()}>
        <div className="face-modal__header">
          <div className="app-icon-shell" style={{ flexShrink: 0 }}><ScanFace size={18} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 className="face-modal__title">{t('Chamada por foto')}</h2>
            <p className="face-modal__subtitle">{className}</p>
          </div>
          <button type="button" className="app-button app-button--ghost app-button--icon" onClick={onClose} disabled={busy} aria-label={t('Fechar')}>
            <X size={16} />
          </button>
        </div>

        {step === 'pick' || step === 'analyzing' ? (
          <>
            <div className="face-modal__body">
              <p className="face-modal__copy">
                {t('Tire uma foto da turma com todos olhando para a câmera. O app sugere quem está presente e você confirma antes de registrar.')}
              </p>
              <p className="face-modal__copy">
                {t('Só são reconhecidos alunos que cadastraram a biometria facial. A foto é enviada para análise e não fica guardada.')}
              </p>
              {step === 'analyzing' ? (
                <div className="face-modal__progress">
                  <span className="face-modal__spinner" />
                  {t('Analisando a foto... isso pode levar alguns segundos.')}
                </div>
              ) : null}
              {error ? <div className="app-alert app-alert--error">{error}</div> : null}
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void handlePhoto(file);
              }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void handlePhoto(file);
              }}
            />
            <div className="face-modal__actions">
              <button type="button" className="app-button app-button--ghost" onClick={() => galleryInputRef.current?.click()} disabled={busy}>
                <ImagePlus size={16} />
                {t('Escolher da galeria')}
              </button>
              <button type="button" className="app-button app-button--gold" onClick={() => cameraInputRef.current?.click()} disabled={busy}>
                <Camera size={16} />
                {t('Tirar foto da turma')}
              </button>
            </div>
          </>
        ) : null}

        {step === 'review' || step === 'saving' ? (
          <>
            <div className="face-modal__body">
              <p className="face-modal__copy">
                {t('{faces} rostos encontrados · {recognized} com sugestão · {unknown} não reconhecidos', {
                  faces: faces.length,
                  recognized: faces.length - unrecognizedCount,
                  unknown: unrecognizedCount,
                })}
              </p>
              {enrolledCount === 0 ? (
                <div className="app-alert app-alert--error">
                  {t('Nenhum aluno desta unidade cadastrou a biometria facial ainda. Peça para cadastrarem em Perfil → Biometria facial.')}
                </div>
              ) : null}

              <div className="face-review">
                {orderedFaces.map(({ entry, index }) => {
                  const selected = entry.candidates.find((candidate) => candidate.userId === entry.selectedUserId);
                  const student = selected ? studentById.get(selected.userId) : undefined;
                  const recognized = entry.candidates.length > 0;
                  return (
                    <div key={index} className={`app-list-card face-review__row ${recognized ? '' : 'is-unknown'}`}>
                      <img src={entry.thumbnail} alt={t('Rosto na foto')} className="face-review__thumb" />
                      {recognized && selected ? (
                        <>
                          <AvatarWithBelt
                            avatar={photoToAvatar(student?.photoPath)}
                            name={nameOf(selected.userId)}
                            belt={(student?.belt ?? 'white') as BeltColor}
                            stripes={student?.stripes ?? 0}
                            size="sm"
                          />
                          <div className="face-review__info">
                            {entry.candidates.length > 1 ? (
                              <select
                                className="app-input face-review__select"
                                value={entry.selectedUserId}
                                disabled={step === 'saving'}
                                aria-label={t('Aluno sugerido')}
                                onChange={(event) => {
                                  const next = entry.candidates.find((candidate) => candidate.userId === event.target.value);
                                  updateFace(index, { selectedUserId: event.target.value, checked: !!next && !next.alreadyPresent });
                                }}
                              >
                                {entry.candidates.map((candidate) => (
                                  <option key={candidate.userId} value={candidate.userId}>{nameOf(candidate.userId)}</option>
                                ))}
                              </select>
                            ) : (
                              <p className="face-review__name">{nameOf(selected.userId)}</p>
                            )}
                            <p className="face-review__meta">
                              {selected.alreadyPresent
                                ? t('Presença já registrada')
                                : entry.confidence === 'high' && selected.userId === entry.candidates[0].userId
                                  ? t('Confiança alta · {percent}%', { percent: Math.floor(selected.similarity) })
                                  : t('Confira com atenção · {percent}%', { percent: Math.floor(selected.similarity) })}
                            </p>
                          </div>
                          {selected.alreadyPresent ? (
                            <CheckCircle2 size={20} style={{ color: '#29a675', flexShrink: 0 }} />
                          ) : (
                            <input
                              type="checkbox"
                              className="face-review__check"
                              checked={entry.checked}
                              disabled={step === 'saving'}
                              aria-label={t('Confirmar presença de {name}', { name: nameOf(selected.userId) })}
                              onChange={(event) => updateFace(index, { checked: event.target.checked })}
                            />
                          )}
                        </>
                      ) : (
                        <div className="face-review__info">
                          <p className="face-review__name"><UserX size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />{t('Não reconhecido')}</p>
                          <p className="face-review__meta">{t('Sem biometria cadastrada ou rosto pouco visível. Marque na chamada manual.')}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="face-modal__actions">
              <button type="button" className="app-button app-button--ghost" onClick={() => { setFaces([]); setStep('pick'); }} disabled={busy}>
                {t('Outra foto')}
              </button>
              <button
                type="button"
                className="app-button app-button--gold"
                onClick={() => void handleConfirm()}
                disabled={busy || selectedUserIds.length === 0}
              >
                {step === 'saving'
                  ? t('Registrando...')
                  : t('Confirmar {count} presenças', { count: selectedUserIds.length })}
              </button>
            </div>
          </>
        ) : null}

        {step === 'summary' ? (
          <>
            <div className="face-modal__body face-modal__done">
              <CheckCircle2 size={40} style={{ color: '#29a675' }} />
              <p className="face-modal__title">{t('{count} presenças registradas', { count: savedCount })}</p>
              {failed.length > 0 ? (
                <div className="app-alert app-alert--error" style={{ textAlign: 'left', width: '100%' }}>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>{t('Não foi possível registrar:')}</p>
                  {failed.map((outcome) => (
                    <p key={outcome.userId}>{nameOf(outcome.userId)} — {outcome.message}</p>
                  ))}
                </div>
              ) : null}
              {unrecognizedCount > 0 ? (
                <p className="face-modal__copy">
                  {t('{count} rostos não foram reconhecidos: confira a lista e complete pela chamada manual.', { count: unrecognizedCount })}
                </p>
              ) : null}
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

export default FaceAttendanceModal;
