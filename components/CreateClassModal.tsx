import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { buildMonthGrid, MONTH_WEEK_HEADER, stripDate, toDateKey } from '../calendarUtils';
import DateField from './DateField';
import TimeField from './TimeField';
import type { CreateClassScheduleBatchResult } from '../services/firebase/functions';

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
  { group: 'PERFORMANCE',     label: 'LEVEL Competição',             value: 'competicao' },
  { group: 'PERFORMANCE',     label: 'LEVEL Nogi',                   value: 'nogi' },
  { group: 'KIDS',             label: 'Kids 01',                      value: 'kids-01' },
  { group: 'KIDS',             label: 'Kids 02',                      value: 'kids-02' },
  { group: 'KIDS',             label: 'Kids 03',                      value: 'kids-03' },
];

const WEEKDAY_OPTIONS = [
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sab', value: 6 },
  { label: 'Dom', value: 0 },
] as const;

// description stores the type value directly
function tipoDescription(value: string): string {
  return value;
}

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const summaryDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const summaryDateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

type CreateMode = 'single' | 'recurring';

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

function toInputDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromInputDateValue(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : stripDate(parsed);
}

function listRecurringDates(startDate: Date, endDate: Date, weekdays: Set<number>): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(startDate);

  while (cursor.getTime() <= endDate.getTime()) {
    if (weekdays.has(cursor.getDay())) {
      dates.push(stripDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export interface CreateClassPayload {
  title: string;
  description?: string;
  professorId: string;
  professorName: string;
  tatame: string;
  seriesMode: 'manual' | 'recurring';
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
  onSubmit: (classes: CreateClassPayload[]) => Promise<CreateClassScheduleBatchResult>;
}

function buildPayloads(params: {
  dates: Date[];
  title: string;
  description?: string;
  professorId: string;
  professorName: string;
  tatame: string;
  seriesMode: 'manual' | 'recurring';
  time: string;
  duration: number;
  capacity: number;
}): CreateClassPayload[] {
  const [hours, minutes] = params.time.split(':').map(Number);
  return params.dates.map((classDate) => {
    const start = new Date(classDate);
    start.setHours(hours, minutes, 0, 0);
    const end = new Date(start.getTime() + params.duration * 60 * 1000);

    return {
      title: params.title.trim(),
      description: params.description,
      professorId: params.professorId,
      professorName: params.professorName,
      tatame: params.tatame,
      seriesMode: params.seriesMode,
      scheduledStart: start.toISOString(),
      scheduledEnd: end.toISOString(),
      capacity: params.capacity,
    };
  });
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

  const [mode, setMode] = useState<CreateMode>('single');
  const [calYear, setCalYear] = useState(initDay.getFullYear());
  const [calMonth, setCalMonth] = useState(initDay.getMonth());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set([toDateKey(initDay)]));
  const [selectedDates, setSelectedDates] = useState<Map<string, Date>>(new Map([[toDateKey(initDay), initDay]]));
  const [recurringStart, setRecurringStart] = useState(toInputDateValue(initDay));
  const [recurringEnd, setRecurringEnd] = useState(toInputDateValue(initDay));
  const [recurringWeekdays, setRecurringWeekdays] = useState<Set<number>>(new Set([initDay.getDay()]));

  const [title, setTitle] = useState('Treino');
  const [tipo, setTipo] = useState('iniciante');
  const [time, setTime] = useState(toHHMM(nextRound30(new Date())));
  const [duration, setDuration] = useState(60);
  const initialProfessor = professors.find((p) => p.id === currentUserId) ?? professors[0];
  const [professorId, setProfessorId] = useState(initialProfessor?.id ?? '');
  const [professorName, setProfessorName] = useState(initialProfessor?.displayName ?? currentUserName);
  const [tatame, setTatame] = useState('Tatame 1');
  const [capacity, setCapacity] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitResult, setSubmitResult] = useState<CreateClassScheduleBatchResult | null>(null);

  const cells = buildMonthGrid(calYear, calMonth);
  const recurringStartDate = useMemo(() => fromInputDateValue(recurringStart), [recurringStart]);
  const recurringEndDate = useMemo(() => fromInputDateValue(recurringEnd), [recurringEnd]);
  const manualDates = useMemo(
    () => Array.from(selectedDates.values()).sort((left, right) => left.getTime() - right.getTime()),
    [selectedDates],
  );
  const recurringDates = useMemo(() => {
    if (!recurringStartDate || !recurringEndDate || recurringEndDate.getTime() < recurringStartDate.getTime()) {
      return [];
    }
    return listRecurringDates(recurringStartDate, recurringEndDate, recurringWeekdays);
  }, [recurringEndDate, recurringStartDate, recurringWeekdays]);
  const activeDates = mode === 'single' ? manualDates : recurringDates;
  const payloads = useMemo(
    () => buildPayloads({
      dates: activeDates,
      title,
      description: tipoDescription(tipo),
      professorId,
      professorName,
      tatame,
      seriesMode: mode === 'recurring' ? 'recurring' : 'manual',
      time,
      duration,
      capacity,
    }),
    [activeDates, capacity, duration, mode, professorId, professorName, tatame, time, title, tipo],
  );

  useEffect(() => {
    setSubmitResult(null);
  }, [activeDates, capacity, duration, mode, professorId, recurringEnd, recurringStart, recurringWeekdays, tatame, time, title, tipo]);

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

  function toggleWeekday(weekday: number) {
    setRecurringWeekdays((current) => {
      const next = new Set(current);
      if (next.has(weekday)) {
        next.delete(weekday);
      } else {
        next.add(weekday);
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

    if (!title.trim()) {
      setError('Informe o nome da aula.');
      return;
    }

    if (mode === 'single' && selectedKeys.size === 0) {
      setError('Selecione pelo menos um dia no calendário.');
      return;
    }

    if (mode === 'recurring') {
      if (!recurringStartDate || !recurringEndDate) {
        setError('Informe a data inicial e a data final do período.');
        return;
      }

      if (recurringEndDate.getTime() < recurringStartDate.getTime()) {
        setError('A data final precisa ser igual ou posterior à data inicial.');
        return;
      }

      if (recurringWeekdays.size === 0) {
        setError('Selecione pelo menos um dia da semana para a recorrência.');
        return;
      }
    }

    if (payloads.length === 0) {
      setError(mode === 'recurring'
        ? 'Nenhuma aula caiu no período com os dias da semana escolhidos.'
        : 'Selecione pelo menos um dia no calendário.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSubmitResult(null);
    try {
      const result = await onSubmit(payloads);
      if (result.skippedCount === 0) {
        onClose();
        return;
      }

      setSubmitResult(result);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao criar aula.');
    } finally {
      setSubmitting(false);
    }
  }

  const count = payloads.length;
  const submitLabel = submitting ? 'Criando...' : count > 1 ? `Criar ${count} aulas` : 'Criar aula';
  const firstOccurrence = payloads[0];
  const lastOccurrence = payloads[payloads.length - 1];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="app-panel app-panel-pad app-sheet-modal create-class-modal w-full max-w-2xl rounded-b-none sm:rounded-[1.8rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Criar aula</h2>
          <button type="button" onClick={onClose} className="app-button app-button--ghost app-button--icon">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 flex min-h-0 flex-1 flex-col">
          <div className="create-class-modal__body">
            <div className="app-segment">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`app-segment__button ${mode === 'single' ? 'is-active' : ''}`}
              >
                Dias avulsos
              </button>
              <button
                type="button"
                onClick={() => setMode('recurring')}
                className={`app-segment__button ${mode === 'recurring' ? 'is-active' : ''}`}
              >
                Recorrente
              </button>
            </div>

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

            {mode === 'single' ? (
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
            ) : (
              <div className="flex flex-col gap-5">
                <div className="app-form-grid">
                  <label className="app-field">
                    <span className="app-field__label">Data inicial</span>
                    <DateField value={recurringStart} onChange={setRecurringStart} required />
                  </label>

                  <label className="app-field">
                    <span className="app-field__label">Data final</span>
                    <DateField value={recurringEnd} onChange={setRecurringEnd} required />
                  </label>
                </div>

                <div>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="app-field__label">Dias da semana</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                        Toque nos dias que devem repetir automaticamente dentro do período.
                      </p>
                    </div>
                    <span className={recurringWeekdays.size > 0 ? 'app-badge app-badge--gold' : 'app-badge app-badge--muted'}>
                      {recurringWeekdays.size} selecionado{recurringWeekdays.size === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="create-class-modal__weekday-grid">
                    {WEEKDAY_OPTIONS.map((option) => {
                      const isSelected = recurringWeekdays.has(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleWeekday(option.value)}
                          className={`create-class-modal__weekday ${isSelected ? 'is-selected' : ''}`}
                          aria-pressed={isSelected}
                        >
                          <div className="create-class-modal__weekday-top">
                            <span className="create-class-modal__weekday-label">{option.label}</span>
                            <span className="create-class-modal__weekday-check" aria-hidden="true">
                              {isSelected ? <Check size={12} strokeWidth={3} /> : null}
                            </span>
                          </div>
                          <span className="create-class-modal__weekday-note">
                            {isSelected ? 'Selecionado' : 'Disponível'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="app-form-grid">
              <label className="app-field">
                <span className="app-field__label">Horário</span>
                <TimeField value={time} onChange={setTime} required />
              </label>

              <label className="app-field">
                <span className="app-field__label">Duração</span>
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
                <select value={tatame} onChange={(event) => setTatame(event.target.value)} className="app-input">
                  {TATAME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
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

            <div className="app-list-card">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">Resumo</p>
              {count > 0 && firstOccurrence && lastOccurrence ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-soft)]">Quantidade</p>
                    <p className="mt-1 text-base font-bold">{count} {count === 1 ? 'aula' : 'aulas'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-soft)]">Primeira</p>
                    <p className="mt-1 text-sm font-semibold">{summaryDateTimeFormatter.format(new Date(firstOccurrence.scheduledStart))}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-soft)]">Última</p>
                    <p className="mt-1 text-sm font-semibold">{summaryDateTimeFormatter.format(new Date(lastOccurrence.scheduledStart))}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[color:var(--text-muted)]">
                  {mode === 'recurring'
                    ? 'Defina o período e os dias da semana para visualizar quantas aulas serão geradas.'
                    : 'Selecione pelo menos um dia no calendário para montar o lote.'}
                </p>
              )}
            </div>

            {submitResult ? (
              <div className="app-panel app-panel--tint p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">Resultado do lote</p>
                    <p className="mt-1 text-base font-bold">
                      {submitResult.createdCount} criada{submitResult.createdCount === 1 ? '' : 's'} de {submitResult.requestedCount}
                    </p>
                  </div>
                  <span className="app-badge app-badge--gold">
                    {submitResult.skippedCount} pulada{submitResult.skippedCount === 1 ? '' : 's'}
                  </span>
                </div>

                <p className="mt-3 text-sm text-[color:var(--text-muted)]">
                  As aulas criadas foram gravadas. As ocorrências abaixo ficaram de fora para você ajustar depois.
                </p>

                <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {submitResult.skipped.map((entry) => (
                    <div key={`${entry.scheduledStart}-${entry.reason}`} className="app-list-card">
                      <p className="text-sm font-semibold">{summaryDateTimeFormatter.format(new Date(entry.scheduledStart))}</p>
                      <p className="mt-1 text-sm text-[color:var(--text-muted)]">{entry.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {mode === 'recurring' && recurringStartDate && recurringEndDate && recurringEndDate.getTime() >= recurringStartDate.getTime() ? (
              <p className="text-xs text-[color:var(--text-soft)]">
                Período de {summaryDateFormatter.format(recurringStartDate)} até {summaryDateFormatter.format(recurringEndDate)}.
              </p>
            ) : null}
          </div>

          <div className="create-class-modal__footer">
            {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={submitting} className="app-button app-button--ghost flex-1">
                {submitResult ? 'Fechar' : 'Cancelar'}
              </button>
              <button type="submit" disabled={submitting || count === 0} className="app-button app-button--gold flex-1">
                {submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateClassModal;
