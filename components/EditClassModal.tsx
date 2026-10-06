import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import DateField from './DateField';
import TimeField from './TimeField';
import type { FirestoreEntity } from '../services/firebase/data';
import type { UpdateRecurringClassSeriesResult } from '../services/firebase/functions';
import type { ClassRecord } from '../services/firebase/models';
import { t, createDateFormatter } from '../i18n';
import './redesign/class-modals.css';

const TATAME_OPTIONS = [
  { label: 'Tatame 1', value: 'Tatame 1' },
  { label: 'Tatame 2', value: 'Tatame 2' },
  { label: 'Tatame 3', value: 'Tatame 3' },
];

const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
  { label: '75 min', value: 75 },
  { label: '90 min', value: 90 },
  { label: '105 min', value: 105 },
  { label: '120 min', value: 120 },
];

const TYPE_OPTIONS = [
  { group: 'DESENVOLVIMENTO', label: 'LEVEL Iniciante',              value: 'iniciante' },
  { group: 'DESENVOLVIMENTO', label: 'LEVEL para a Vida',            value: 'vida' },
  { group: 'DESENVOLVIMENTO', label: 'LEVEL Sport',                  value: 'sport' },
  { group: 'DESENVOLVIMENTO', label: 'LEVEL Feminino',               value: 'feminino' },
  { group: 'PERFORMANCE',     label: 'LEVEL Competicao',             value: 'competicao' },
  { group: 'PERFORMANCE',     label: 'LEVEL Nogi',                   value: 'nogi' },
  { group: 'KIDS',             label: 'Kids 01',                      value: 'kids-01' },
  { group: 'KIDS',             label: 'Kids 02',                      value: 'kids-02' },
  { group: 'KIDS',             label: 'Kids 03',                      value: 'kids-03' },
];

function toHHMM(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toInputDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const headerDateFormatter = createDateFormatter({ weekday: 'short', day: '2-digit', month: 'short' });

function closestDuration(ms: number): number {
  const minutes = Math.round(ms / 60000);
  // Mesmas opcoes do seletor de Duracao: antes so [30, 45, 60, 90, 120], e uma aula de
  // 15/75/105 min virava outra duracao ao abrir a edicao, sem ninguem ter mexido.
  const allowed = DURATION_OPTIONS.map((option) => option.value);
  return allowed.reduce((prev, curr) => (Math.abs(curr - minutes) < Math.abs(prev - minutes) ? curr : prev));
}

export interface EditClassPayload {
  classId: string;
  academyId: string;
  title: string;
  description?: string;
  professorId: string;
  professorName: string;
  tatame: string;
  scope: 'single' | 'future';
  scheduledStart: string;
  scheduledEnd: string;
}

interface EditClassModalProps {
  lesson: FirestoreEntity<ClassRecord>;
  // `label` e so para exibicao no seletor. O que se grava na aula e sempre `displayName` —
  // ver a montagem em App.tsx (case 'calendar').
  professors: Array<{ id: string; displayName: string; label?: string }>;
  onClose: () => void;
  onSubmit: (payload: EditClassPayload) => Promise<UpdateRecurringClassSeriesResult>;
}

const EditClassModal: React.FC<EditClassModalProps> = ({ lesson, professors, onClose, onSubmit }) => {
  const startDate = lesson.scheduledStart?.toDate() ?? new Date();
  const endDate = lesson.scheduledEnd?.toDate();
  const durationMs = endDate ? endDate.getTime() - startDate.getTime() : 60 * 60000;
  const hasRecurringSeries = !!lesson.recurrenceSeriesId;

  const [title, setTitle] = useState(lesson.title);
  const [tipo, setTipo] = useState(() => {
    const match = TYPE_OPTIONS.find((o) => o.value === lesson.description);
    return match?.value ?? TYPE_OPTIONS[0].value;
  });
  const [scope, setScope] = useState<'single' | 'future'>('single');
  const [date, setDate] = useState(toInputDateValue(startDate));
  const [time, setTime] = useState(toHHMM(startDate));
  const [duration, setDuration] = useState(closestDuration(durationMs));
  const [professorId, setProfessorId] = useState(lesson.professorId ?? '');
  const [tatame, setTatame] = useState(lesson.tatame ?? 'Tatame 1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // O professor gravado na aula pode nao estar na lista da unidade (aula legada ou importada).
  // Sem uma opcao para ele, o select exibiria outro nome sem que ninguem tivesse trocado nada.
  const professorOptions = professors.some((p) => p.id === professorId)
    ? professors
    : [{ id: professorId, displayName: lesson.professorName || t('Professor nao cadastrado') }, ...professors];

  function handleProfessorChange(id: string) {
    setProfessorId(id);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!title.trim()) {
      setError(t('Informe o nome da aula.'));
      return;
    }

    if (!date) {
      setError(t('Informe a data da aula.'));
      return;
    }

    const professor = professorOptions.find((p) => p.id === professorId);
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    const scheduledStart = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const scheduledEnd = new Date(scheduledStart.getTime() + duration * 60000);

    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        classId: lesson.id,
        academyId: lesson.academyId,
        title: title.trim(),
        description: tipo,
        professorId,
        professorName: professor?.displayName ?? lesson.professorName ?? '',
        tatame,
        scope: hasRecurringSeries ? scope : 'single',
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('Erro ao salvar aula.'));
    } finally {
      setSubmitting(false);
    }
  }

  const typeGroups = Array.from(new Map(TYPE_OPTIONS.map((o) => [o.group, o.group])).keys());
  // Tatame gravado fora da lista (aula legada) continua como opcao, para nao trocar em silencio.
  const tatameOptions = TATAME_OPTIONS.some((option) => option.value === tatame)
    ? TATAME_OPTIONS
    : [{ label: tatame || '—', value: tatame }, ...TATAME_OPTIONS];

  return (
    <div className="lv-backdrop" onClick={onClose}>
      <div
        className="lv-sheet rd-cm rd-cm--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rd-cm-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rd-cm__top">
          <div className="lv-sheet__grip" aria-hidden="true" />
          <div className="rd-cm__bar">
            <button type="button" onClick={onClose} className="lv-icon-btn" aria-label={t('Fechar')}>
              <X size={20} strokeWidth={2} />
            </button>
            <span className="lv-eyebrow">{headerDateFormatter.format(startDate)} · {toHHMM(startDate)}</span>
          </div>
          <div className="rd-cm__title-row">
            <h2 id="rd-cm-edit-title" className="rd-cm__title">{t('Editar aula')}</h2>
          </div>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="rd-cm__form">
          <div className="rd-cm__body">
            {hasRecurringSeries ? (
              <div className="rd-cm__scope">
                <span className="rd-cm__field-label">{t('Aplicar alteracao em')}</span>
                <div className="lv-segmented">
                  <button
                    type="button"
                    onClick={() => setScope('single')}
                    className={scope === 'single' ? 'is-active' : ''}
                    aria-pressed={scope === 'single'}
                  >
                    {t('Somente esta aula')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('future')}
                    className={scope === 'future' ? 'is-active' : ''}
                    aria-pressed={scope === 'future'}
                  >
                    {t('Esta e as proximas')}
                  </button>
                </div>
                <p className="rd-cm__hint">
                  {t('A opcao em serie atualiza apenas as aulas agendadas futuras desta recorrencia.')}
                </p>
              </div>
            ) : null}

            <section className="rd-cm__section">
              <h3 className="rd-cm__section-title">{t('Aula')}</h3>

              <label className="lv-field">
                <span>{t('Nome da aula')}</span>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="lv-input"
                  placeholder={t('Ex: Treino, Fundamentos, Sparring')}
                  required
                />
              </label>

              <div className="lv-field" role="radiogroup" aria-label={t('Tipo')}>
                <span>{t('Tipo')}</span>
                <div>
                  {typeGroups.map((group) => (
                    <div key={group} className="rd-cm__group">
                      <span className="rd-cm__group-label">{t(group)}</span>
                      <div className="rd-cm__chips">
                        {TYPE_OPTIONS.filter((o) => o.group === group).map((option) => {
                          const isActive = tipo === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-checked={isActive}
                              onClick={() => setTipo(option.value)}
                              className={`lv-chip-btn rd-cm__chip ${isActive ? 'is-active' : ''}`}
                            >
                              {isActive ? <Check size={16} strokeWidth={2.5} aria-hidden="true" /> : null}
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rd-cm__section">
              <h3 className="rd-cm__section-title">{t('Data e horário')}</h3>

              <label className="lv-field">
                <span>{t('Data')}</span>
                <DateField value={date} onChange={setDate} className="lv-input" required />
              </label>

              <div className="rd-cm__grid2">
                <label className="lv-field">
                  <span>{t('Horario')}</span>
                  <TimeField value={time} onChange={setTime} className="lv-input" required />
                </label>

                <label className="lv-field">
                  <span>{t('Duracao')}</span>
                  <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="lv-select">
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="rd-cm__section">
              <h3 className="rd-cm__section-title">{t('Onde e com quem')}</h3>

              <label className="lv-field">
                <span>{t('Professor')}</span>
                <select value={professorId} onChange={(event) => handleProfessorChange(event.target.value)} className="lv-select">
                  {professorOptions.map((professor) => (
                    <option key={professor.id} value={professor.id}>{professor.label ?? professor.displayName}</option>
                  ))}
                </select>
              </label>

              <div className="lv-field" role="radiogroup" aria-label={t('Tatame')}>
                <span>{t('Tatame')}</span>
                <div className="rd-cm__tatames">
                  {tatameOptions.map((option) => {
                    const isActive = tatame === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => setTatame(option.value)}
                        className={`lv-chip-btn rd-cm__chip ${isActive ? 'is-active' : ''}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          <div className="rd-cm__footer">
            {error ? <p className="lv-alert lv-alert--danger" role="alert">{error}</p> : null}

            <div className="rd-cm__actions">
              <button type="button" onClick={onClose} disabled={submitting} className="lv-btn lv-btn--neutral">
                {t('Cancelar')}
              </button>
              <button type="submit" disabled={submitting} className="lv-btn lv-btn--primary">
                <span>{submitting ? t('Salvando...') : scope === 'future' ? t('Salvar esta e as proximas') : t('Salvar alteracoes')}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditClassModal;
