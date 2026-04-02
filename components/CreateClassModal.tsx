import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const WEEK_HEADER = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

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

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Returns cells for a month grid (Mon-first). Nulls = padding days.
function buildMonthGrid(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Mon=0 … Sun=6
  const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const cells: Array<Date | null> = Array(startPad).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(new Date(year, month, d));
  }
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

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
  const today = stripTime(new Date());
  const initDay = stripTime(selectedDay);

  const [calYear, setCalYear] = useState(initDay.getFullYear());
  const [calMonth, setCalMonth] = useState(initDay.getMonth());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    new Set([toDateKey(initDay)]),
  );
  const [selectedDates, setSelectedDates] = useState<Map<string, Date>>(
    new Map([[toDateKey(initDay), initDay]]),
  );

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
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setSelectedDates((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, stripTime(date));
      }
      return next;
    });
  }

  function handleProfessorChange(id: string) {
    const prof = professors.find((p) => p.id === id);
    setProfessorId(id);
    setProfessorName(prof?.displayName ?? '');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (selectedKeys.size === 0) {
      setError('Selecione pelo menos um dia no calendário.');
      return;
    }

    if (!title.trim()) {
      setError('Informe o nome da aula.');
      return;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const description = TIPO_DESCRIPTION[tipo];

    const sorted = Array.from(selectedDates.values()).sort((a, b) => a.getTime() - b.getTime());

    const payloads: CreateClassPayload[] = sorted.map((classDate) => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar aula.');
    } finally {
      setSubmitting(false);
    }
  }

  const count = selectedKeys.size;
  const submitLabel = submitting ? 'Criando...' : count > 1 ? `Criar ${count} aulas` : 'Criar aula';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="app-panel app-panel-pad w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-[1.8rem]"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Criar aula</h2>
          <button type="button" onClick={onClose} className="app-button app-button--ghost app-button--icon">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 flex flex-col gap-5">
          {/* Nome + Tipo */}
          <div className="app-form-grid">
            <label className="app-field">
              <span className="app-field__label">Nome da aula</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="app-input"
                placeholder="Ex: Treino, Fundamentos, Sparring"
                required
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="app-input">
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Calendário mensal */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="app-field__label">
                Dias
                {count > 0 ? (
                  <span className="ml-2 text-[color:var(--gold-mid)]">{count} selecionado{count > 1 ? 's' : ''}</span>
                ) : null}
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => shiftMonth(-1)} className="app-button app-button--ghost app-button--icon" style={{ width: 28, height: 28 }}>
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-semibold capitalize" style={{ minWidth: 110, textAlign: 'center' }}>
                  {monthFormatter.format(new Date(calYear, calMonth))}
                </span>
                <button type="button" onClick={() => shiftMonth(1)} className="app-button app-button--ghost app-button--icon" style={{ width: 28, height: 28 }}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Header dias */}
            <div className="grid grid-cols-7 mb-1">
              {WEEK_HEADER.map((d) => (
                <div key={d} className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-soft)] py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Células */}
            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((cell, i) => {
                if (!cell) {
                  return <div key={`pad-${i}`} />;
                }
                const key = toDateKey(cell);
                const isSelected = selectedKeys.has(key);
                const isToday = toDateKey(cell) === toDateKey(today);
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
                          : 'hover:bg-white/10 text-[color:var(--text-muted)]',
                    ].join(' ')}
                  >
                    {cell.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horário + Duração */}
          <div className="app-form-grid">
            <label className="app-field">
              <span className="app-field__label">Horário</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="app-input"
                required
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">Duração</span>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="app-input">
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Professor */}
          <label className="app-field">
            <span className="app-field__label">Professor</span>
            <select value={professorId} onChange={(e) => handleProfessorChange(e.target.value)} className="app-input">
              {professors.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
          </label>

          {/* Tatame + Capacidade */}
          <div className="app-form-grid">
            <label className="app-field">
              <span className="app-field__label">Tatame</span>
              <input
                type="text"
                value={tatame}
                onChange={(e) => setTatame(e.target.value)}
                className="app-input"
                placeholder="Tatame Principal"
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">Capacidade</span>
              <input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
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
