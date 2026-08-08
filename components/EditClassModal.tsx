import React, { useState } from 'react';
import { X } from 'lucide-react';
import DateField from './DateField';
import TimeField from './TimeField';
import type { FirestoreEntity } from '../services/firebase/data';
import type { UpdateRecurringClassSeriesResult } from '../services/firebase/functions';
import type { ClassRecord } from '../services/firebase/models';

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

function closestDuration(ms: number): number {
  const minutes = Math.round(ms / 60000);
  const allowed = [30, 45, 60, 90, 120];
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
  professors: Array<{ id: string; displayName: string }>;
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
    : [{ id: professorId, displayName: lesson.professorName || 'Professor nao cadastrado' }, ...professors];

  function handleProfessorChange(id: string) {
    setProfessorId(id);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!title.trim()) {
      setError('Informe o nome da aula.');
      return;
    }

    if (!date) {
      setError('Informe a data da aula.');
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
      setError(submitError instanceof Error ? submitError.message : 'Erro ao salvar aula.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="app-panel app-panel-pad app-sheet-modal w-full max-w-2xl rounded-b-none sm:rounded-[1.8rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Editar aula</h2>
          <button type="button" onClick={onClose} className="app-button app-button--ghost app-button--icon">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 flex flex-col gap-5">
          {hasRecurringSeries ? (
            <div className="app-list-card">
              <p className="app-field__label">Aplicar alteracao em</p>
              <div className="mt-3 app-segment">
                <button
                  type="button"
                  onClick={() => setScope('single')}
                  className={`app-segment__button ${scope === 'single' ? 'is-active' : ''}`}
                >
                  Somente esta aula
                </button>
                <button
                  type="button"
                  onClick={() => setScope('future')}
                  className={`app-segment__button ${scope === 'future' ? 'is-active' : ''}`}
                >
                  Esta e as proximas
                </button>
              </div>
              <p className="mt-3 text-xs text-[color:var(--text-soft)]">
                A opcao em serie atualiza apenas as aulas agendadas futuras desta recorrencia.
              </p>
            </div>
          ) : null}

          <div className="app-form-grid">
            <label className="app-field">
              <span className="app-field__label">Nome da aula</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="app-input"
                placeholder="Ex: Treino, Fundamentos, Sparring"
                required
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">Tipo</span>
              <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="app-input">
                {Array.from(new Map(TYPE_OPTIONS.map((o) => [o.group, o.group])).keys()).map((group) => (
                  <optgroup key={group} label={group}>
                    {TYPE_OPTIONS.filter((o) => o.group === group).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>

          <label className="app-field">
            <span className="app-field__label">Data</span>
            <DateField value={date} onChange={setDate} required />
          </label>

          <div className="app-form-grid">
            <label className="app-field">
              <span className="app-field__label">Horario</span>
              <TimeField value={time} onChange={setTime} required />
            </label>

            <label className="app-field">
              <span className="app-field__label">Duracao</span>
              <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="app-input">
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="app-field">
            <span className="app-field__label">Professor</span>
            <select value={professorId} onChange={(event) => handleProfessorChange(event.target.value)} className="app-input">
              {professorOptions.map((professor) => (
                <option key={professor.id} value={professor.id}>{professor.displayName}</option>
              ))}
            </select>
          </label>

          <label className="app-field">
            <span className="app-field__label">Tatame</span>
            <select value={tatame} onChange={(event) => setTatame(event.target.value)} className="app-input">
              {TATAME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="app-button app-button--ghost flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="app-button app-button--gold flex-1">
              {submitting ? 'Salvando...' : scope === 'future' ? 'Salvar esta e as proximas' : 'Salvar alteracoes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditClassModal;
