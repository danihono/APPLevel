import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { buildMonthGrid, MONTH_WEEK_HEADER, stripDate, toDateKey } from '../calendarUtils';

const DURATION_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
  { label: '90 min', value: 90 },
  { label: '120 min', value: 120 },
];

const TYPE_OPTIONS = [
  { label: 'Adulto', value: 'Adulto' },
  { label: 'Kids', value: 'Kids' },
  { label: 'Advanced', value: 'Advanced' },
  { label: 'No-Gi', value: 'No-Gi' },
];

const TIPO_DESCRIPTION: Record<string, string | undefined> = {
  Adulto: undefined,
  Kids: 'kids',
  Advanced: 'advanced',
  'No-Gi': 'no-gi',
};

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

function toHHMM(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function nextRound30(date: Date) {
  const next = new Date(date);
  if (next.getMinutes() < 30) {
    next.setMinutes(30, 0, 0);
  } else {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  }
  return next;
}

export interface CreateClassPayload {
  title: string;
  description?: string;
  professorId: string;
  professorName: string;
  tatame: string;
  scheduledStart: string;
  scheduledEnd: string;
  capacity: number;
}

interface CreateClassModalProps {
  professors: Array<{ id: string; displayName: string }>;
  currentUserId: string;
  currentUserName: string;
  selectedDay: Date;
  onClose: () => void;
  onSubmit: (classes: CreateClassPayload[]) => Promise<void>;
}

const CreateClassModal: React.FC<CreateClassModalProps> = ({
  professors,
  currentUserId,
  currentUserName,
  selectedDay,
  onClose,
  onSubmit,
}) => {
  const today = stripDate(new Date());
  const initDay = stripDate(selectedDay);

  const [calYear, setCalYear] = useState(initDay.getFullYear());
  const [calMonth, setCalMonth] = useState(initDay.getMonth());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set([toDateKey(initDay)]));
  const [selectedDates, setSelectedDates] = useState<Map<string, Date>>(new Map([[toDateKey(initDay), initDay]]));

  const [title, setTitle] = useState('Treino');
  const [tipo, setTipo] = useState('Adulto');
  const [time, setTime] = useState(toHHMM(nextRound30(new Date())));
  const [duration, setDuration] = useState(60);
  const [professorId, setProfessorId] = useState(currentUserId);
  const [professorName, setProfessorName] = useState(currentUserName);
  const [tatame, setTatame] = useState('Tatame Principal');
  const [capacity, setCapacity] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const cells = buildMonthGrid(calYear, calMonth);

  function shiftMonth(dir: -1 | 1) {
    const next = new Date(calYear, calMonth + dir, 1);
    setCalYear(next.getFullYear());
    setCalMonth(next.getMonth());
  }

  function toggleDate(date: Date) {
    const key = toDateKey(date);

    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

    setSelectedDates((current) => {
      const next = new Map(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, stripDate(date));
      }
      return next;
    });
  }

  function handleProfessorChange(id: string) {
    const professor = professors.find((entry) => entry.id === id);
    setProfessorId(id);
    setProfessorName(professor?.displayName ?? '');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (selectedKeys.size === 0) {
      setError('Selecione pelo menos um dia no calendario.');
      return;
    }

    if (!title.trim()) {
      setError('Informe o nome da aula.');
      return;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const description = TIPO_DESCRIPTION[tipo];
    const sortedDates = Array.from(selectedDates.values()).sort((left, right) => left.getTime() - right.getTime());
    const payloads: CreateClassPayload[] = sortedDates.map((classDate) => {
      const start = new Date(classDate);
      start.setHours(hours, minutes, 0, 0);
      const end = new Date(start.getTime() + duration * 60 * 1000);

      return {
        title: title.trim(),
        description,
        professorId,
        professorName,
        tatame: tatame.trim() || 'Tatame Principal',
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        capacity,
      };
    });

    setSubmitting(true);
    setError('');
    try {
      await onSubmit(payloads);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao criar aula.');
    } finally {
      setSubmitting(false);
    }
  }

  const count = selectedKeys.size;
  const submitLabel = submitting ? 'Criando...' : count > 1 ? `Criar ${count} aulas` : 'Criar aula';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="app-panel app-panel-pad w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-[1.8rem]"
        style={{ maxHeight: '92vh' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Criar aula</h2>
          <button type="button" onClick={onClose} className="app-button app-button--ghost app-button--icon">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 flex flex-col gap-5">
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
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="app-field__label">
                Dias
                {count > 0 ? <span className="ml-2 text-[color:var(--gold-mid)]">{count} selecionado{count > 1 ? 's' : ''}</span> : null}
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => shiftMonth(-1)} className="app-button app-button--ghost app-button--icon" style={{ width: 28, height: 28 }}>
                  <ChevronLeft size={14} />
                </button>
                <span className="min-w-[110px] text-center text-xs font-semibold capitalize">
                  {monthFormatter.format(new Date(calYear, calMonth))}
                </span>
                <button type="button" onClick={() => shiftMonth(1)} className="app-button app-button--ghost app-button--icon" style={{ width: 28, height: 28 }}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div className="mb-1 grid grid-cols-7">
              {MONTH_WEEK_HEADER.map((day) => (
                <div key={day} className="py-1 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((cell, index) => {
                if (!cell) {
                  return <div key={`pad-${index}`} />;
                }

                const key = toDateKey(cell);
                const isSelected = selectedKeys.has(key);
                const isToday = key === toDateKey(today);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDate(cell)}
                    className={[
                      'mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors',
                      isSelected
                        ? 'bg-[color:var(--gold-mid)] text-white font-bold'
                        : isToday
                          ? 'border border-[color:var(--gold-mid)] text-[color:var(--gold-mid)]'
                          : 'text-[color:var(--text-muted)] hover:bg-white/10',
                    ].join(' ')}
                  >
                    {cell.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="app-form-grid">
            <label className="app-field">
              <span className="app-field__label">Horario</span>
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="app-input" required />
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
              {professors.map((professor) => (
                <option key={professor.id} value={professor.id}>{professor.displayName}</option>
              ))}
            </select>
          </label>

          <div className="app-form-grid">
            <label className="app-field">
              <span className="app-field__label">Tatame</span>
              <input
                type="text"
                value={tatame}
                onChange={(event) => setTatame(event.target.value)}
                className="app-input"
                placeholder="Tatame Principal"
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">Capacidade</span>
              <input
                type="number"
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
                className="app-input"
                min={1}
                max={500}
              />
            </label>
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="app-button app-button--ghost flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={submitting || count === 0} className="app-button app-button--dark flex-1">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateClassModal;
