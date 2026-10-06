import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { buildMonthGrid, MONTH_WEEK_HEADER, stripDate, toDateKey } from '../calendarUtils';
import DateField from './DateField';
import TimeField from './TimeField';
import type { CreateClassScheduleBatchResult } from '../services/firebase/functions';
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

const monthFormatter = createDateFormatter({ month: 'long', year: 'numeric' });
const summaryDateFormatter = createDateFormatter({ day: '2-digit', month: '2-digit', year: 'numeric' });
const summaryDateTimeFormatter = createDateFormatter({
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

type CreateMode = 'single' | 'recurring';

// Limites do campo Capacidade (mesmos min/max do input numerico).
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 500;

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
  // `label` e so para exibicao no seletor. O que se grava na aula e sempre `displayName` —
  // ver a montagem em App.tsx (case 'calendar').
  professors: Array<{ id: string; displayName: string; label?: string }>;
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

  const [title, setTitle] = useState(() => t('Treino'));
  const [tipo, setTipo] = useState('iniciante');
  const [time, setTime] = useState(toHHMM(nextRound30(new Date())));
  const [duration, setDuration] = useState(60);
  // Nunca cair em `professors[0]`: "pegar o primeiro" quando o usuario logado nao esta na lista
  // gravava a aula no id de um estranho com o nome de quem criou. Foi assim que nasceram as aulas
  // que aparecem com o nome certo e nunca entram em "Minhas".
  //
  // So oferecemos o proprio usuario quando NAO HA nenhum professor na unidade — senao o admin da
  // rede apareceria no seletor de quem vai dar a aula, e ele nao da aula. Com a lista cheia e o
  // usuario fora dela, ninguem vem pre-selecionado: a escolha passa a ser obrigatoria, que e o
  // unico jeito honesto de nao atribuir a aula a alguem em silencio.
  const professorOptions = professors.length > 0
    ? professors
    : [{ id: currentUserId, displayName: currentUserName || t('Voce') }];
  const initialProfessor = professorOptions.find((p) => p.id === currentUserId);
  const [professorId, setProfessorId] = useState(initialProfessor?.id ?? '');
  const [professorName, setProfessorName] = useState(initialProfessor?.displayName ?? '');
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
    // Busca em `professorOptions`, nunca em `professors`: escolher a opcao sintetica do proprio
    // usuario zeraria o `professorName` e reintroduziria a divergencia nome/id que este arquivo
    // acabou de deixar de produzir. Mesmo padrao do EditClassModal.
    const professor = professorOptions.find((entry) => entry.id === id);
    setProfessorId(id);
    setProfessorName(professor?.displayName ?? '');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!title.trim()) {
      setError(t('Informe o nome da aula.'));
      return;
    }

    if (mode === 'single' && selectedKeys.size === 0) {
      setError(t('Selecione pelo menos um dia no calendário.'));
      return;
    }

    if (mode === 'recurring') {
      if (!recurringStartDate || !recurringEndDate) {
        setError(t('Informe a data inicial e a data final do período.'));
        return;
      }

      if (recurringEndDate.getTime() < recurringStartDate.getTime()) {
        setError(t('A data final precisa ser igual ou posterior à data inicial.'));
        return;
      }

      if (recurringWeekdays.size === 0) {
        setError(t('Selecione pelo menos um dia da semana para a recorrência.'));
        return;
      }
    }

    // Sem professor escolhido o backend cairia para o `actor.uid` (resolveClassProfessor), ou seja,
    // a aula ficaria no admin da rede sem ninguem ter pedido isso. Melhor exigir a escolha.
    if (!professorId) {
      setError(t('Escolha o professor da aula.'));
      return;
    }

    if (payloads.length === 0) {
      setError(mode === 'recurring'
        ? t('Nenhuma aula caiu no período com os dias da semana escolhidos.')
        : t('Selecione pelo menos um dia no calendário.'));
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
      setError(submitError instanceof Error ? submitError.message : t('Erro ao criar aula.'));
    } finally {
      setSubmitting(false);
    }
  }

  const count = payloads.length;
  const submitLabel = submitting ? t('Criando...') : count > 1 ? t('Criar {count} aulas', { count }) : t('Criar aula');
  const firstOccurrence = payloads[0];
  const lastOccurrence = payloads[payloads.length - 1];

  const typeGroups = Array.from(new Map(TYPE_OPTIONS.map((o) => [o.group, o.group])).keys());
  const todayKey = toDateKey(today);
  const capacityValue = Number.isFinite(capacity) ? capacity : 0;

  function stepCapacity(delta: -1 | 1) {
    setCapacity((current) => {
      const base = Number.isFinite(current) ? current : 0;
      return Math.min(CAPACITY_MAX, Math.max(CAPACITY_MIN, base + delta));
    });
  }

  return (
    <div className="lv-backdrop" onClick={onClose}>
      <div
        className="lv-sheet rd-cm rd-cm--wide rd-cm--tall"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rd-cm-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rd-cm__top">
          <div className="lv-sheet__grip" aria-hidden="true" />
          <div className="rd-cm__bar">
            <button type="button" onClick={onClose} className="lv-icon-btn" aria-label={t('Fechar')}>
              <X size={20} strokeWidth={2} />
            </button>
            <span className="lv-eyebrow">{t('Calendário')}</span>
          </div>
          <div className="rd-cm__title-row">
            <h2 id="rd-cm-create-title" className="rd-cm__title">{t('Criar aula')}</h2>
          </div>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="rd-cm__form">
          <div className="rd-cm__body">
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
              <h3 className="rd-cm__section-title">{t('Datas e horário')}</h3>

              <div className="lv-segmented">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={mode === 'single' ? 'is-active' : ''}
                  aria-pressed={mode === 'single'}
                >
                  {t('Dias avulsos')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('recurring')}
                  className={mode === 'recurring' ? 'is-active' : ''}
                  aria-pressed={mode === 'recurring'}
                >
                  {t('Recorrente')}
                </button>
              </div>

              {mode === 'single' ? (
                <div className="lv-field">
                  <div className="rd-cm__field-head">
                    <span className="rd-cm__field-label">{t('Dias')}</span>
                    {count > 0 ? (
                      <span className="lv-chip lv-chip--gold">
                        {count === 1 ? t('1 selecionado') : t('{count} selecionados', { count })}
                      </span>
                    ) : null}
                  </div>

                  <div className="rd-cm__cal">
                    <div className="rd-cm__cal-nav">
                      <button type="button" onClick={() => shiftMonth(-1)} className="lv-icon-btn" aria-label={t('Mês anterior')}>
                        <ChevronLeft size={18} strokeWidth={2} />
                      </button>
                      <span className="rd-cm__cal-month" aria-live="polite">
                        {monthFormatter.format(new Date(calYear, calMonth))}
                      </span>
                      <button type="button" onClick={() => shiftMonth(1)} className="lv-icon-btn" aria-label={t('Próximo mês')}>
                        <ChevronRight size={18} strokeWidth={2} />
                      </button>
                    </div>

                    <div className="rd-cm__cal-grid">
                      {MONTH_WEEK_HEADER.map((day) => (
                        <div key={day} className="rd-cm__cal-weekday">
                          {t(day)}
                        </div>
                      ))}

                      {cells.map((cell, index) => {
                        if (!cell) {
                          return <div key={`pad-${index}`} />;
                        }

                        const key = toDateKey(cell);
                        const isSelected = selectedKeys.has(key);
                        const isToday = key === todayKey;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleDate(cell)}
                            aria-pressed={isSelected}
                            className={[
                              'rd-cm__cal-day',
                              isSelected ? 'is-selected' : '',
                              isToday ? 'is-today' : '',
                            ].join(' ')}
                          >
                            {cell.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rd-cm__grid2">
                    <label className="lv-field">
                      <span>{t('Data inicial')}</span>
                      <DateField value={recurringStart} onChange={setRecurringStart} className="lv-input" required />
                    </label>

                    <label className="lv-field">
                      <span>{t('Data final')}</span>
                      <DateField value={recurringEnd} onChange={setRecurringEnd} className="lv-input" required />
                    </label>
                  </div>

                  <div className="lv-field">
                    <div className="rd-cm__field-head">
                      <span className="rd-cm__field-label">{t('Dias da semana')}</span>
                      <span className={recurringWeekdays.size > 0 ? 'lv-chip lv-chip--gold' : 'lv-chip'}>
                        {recurringWeekdays.size === 1 ? t('1 selecionado') : t('{count} selecionados', { count: recurringWeekdays.size })}
                      </span>
                    </div>
                    <p className="rd-cm__hint">
                      {t('Toque nos dias que devem repetir automaticamente dentro do período.')}
                    </p>

                    <div className="rd-cm__weekdays">
                      {WEEKDAY_OPTIONS.map((option) => {
                        const isSelected = recurringWeekdays.has(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => toggleWeekday(option.value)}
                            className={`rd-cm__weekday ${isSelected ? 'is-selected' : ''}`}
                            aria-pressed={isSelected}
                          >
                            <span className="rd-cm__weekday-label">{t(option.label)}</span>
                            <span className="rd-cm__weekday-check" aria-hidden="true">
                              {isSelected ? <Check size={12} strokeWidth={3} /> : null}
                            </span>
                            <span className="rd-cm__weekday-note">
                              {isSelected ? t('Selecionado') : t('Disponível')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {recurringStartDate && recurringEndDate && recurringEndDate.getTime() >= recurringStartDate.getTime() ? (
                    <p className="rd-cm__hint">
                      {t('Período de {start} até {end}.', { start: summaryDateFormatter.format(recurringStartDate), end: summaryDateFormatter.format(recurringEndDate) })}
                    </p>
                  ) : null}
                </>
              )}

              <div className="rd-cm__grid2">
                <label className="lv-field">
                  <span>{t('Horário')}</span>
                  <TimeField value={time} onChange={setTime} className="lv-input" required />
                </label>

                <label className="lv-field">
                  <span>{t('Duração')}</span>
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
                  {professorId ? null : <option value="">{t('Selecione o professor')}</option>}
                  {professorOptions.map((professor) => (
                    <option key={professor.id} value={professor.id}>{professor.label ?? professor.displayName}</option>
                  ))}
                </select>
              </label>

              <div className="lv-field" role="radiogroup" aria-label={t('Tatame')}>
                <span>{t('Tatame')}</span>
                <div className="rd-cm__tatames">
                  {TATAME_OPTIONS.map((option) => {
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

              <div className="lv-field">
                <span>{t('Capacidade')}</span>
                <div className="rd-cm__stepper">
                  <button
                    type="button"
                    className="lv-icon-btn"
                    onClick={() => stepCapacity(-1)}
                    disabled={capacityValue <= CAPACITY_MIN}
                    aria-label={t('Diminuir capacidade')}
                  >
                    <Minus size={18} strokeWidth={2} />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={capacity}
                    onChange={(event) => setCapacity(Number(event.target.value))}
                    className="lv-input"
                    min={CAPACITY_MIN}
                    max={CAPACITY_MAX}
                    aria-label={t('Capacidade')}
                  />
                  <button
                    type="button"
                    className="lv-icon-btn"
                    onClick={() => stepCapacity(1)}
                    disabled={capacityValue >= CAPACITY_MAX}
                    aria-label={t('Aumentar capacidade')}
                  >
                    <Plus size={18} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </section>

            <div className="rd-cm__summary">
              <span className="lv-label">{t('Resumo')}</span>
              {count > 0 && firstOccurrence && lastOccurrence ? (
                <div className="rd-cm__summary-grid">
                  <div className="rd-cm__summary-item rd-cm__summary-count">
                    <span className="lv-label">{t('Quantidade')}</span>
                    <span className="rd-cm__summary-numeral">{count === 1 ? t('1 aula') : t('{count} aulas', { count })}</span>
                  </div>
                  <div className="rd-cm__summary-item">
                    <span className="lv-label">{t('Primeira')}</span>
                    <span className="rd-cm__summary-value">{summaryDateTimeFormatter.format(new Date(firstOccurrence.scheduledStart))}</span>
                  </div>
                  <div className="rd-cm__summary-item">
                    <span className="lv-label">{t('Última')}</span>
                    <span className="rd-cm__summary-value">{summaryDateTimeFormatter.format(new Date(lastOccurrence.scheduledStart))}</span>
                  </div>
                </div>
              ) : (
                <p className="rd-cm__hint">
                  {mode === 'recurring'
                    ? t('Defina o período e os dias da semana para visualizar quantas aulas serão geradas.')
                    : t('Selecione pelo menos um dia no calendário para montar o lote.')}
                </p>
              )}
            </div>

            {submitResult ? (
              <div className="rd-cm__result" role="status">
                <div className="rd-cm__result-head">
                  <div className="rd-cm__summary-item">
                    <span className="lv-label">{t('Resultado do lote')}</span>
                    <span className="rd-cm__summary-numeral">
                      {t('{created} de {requested} criada(s)', { created: submitResult.createdCount, requested: submitResult.requestedCount })}
                    </span>
                  </div>
                  <span className="lv-chip lv-chip--warning">
                    {t('{count} pulada(s)', { count: submitResult.skippedCount })}
                  </span>
                </div>

                <p className="rd-cm__lesson-text">
                  {t('As aulas criadas foram gravadas. As ocorrências abaixo ficaram de fora para você ajustar depois.')}
                </p>

                <div className="lv-list rd-cm__result-list">
                  {submitResult.skipped.map((entry) => (
                    <div key={`${entry.scheduledStart}-${entry.reason}`} className="lv-row">
                      <div className="lv-row__main">
                        <span className="lv-row__title">{summaryDateTimeFormatter.format(new Date(entry.scheduledStart))}</span>
                        <span className="lv-row__meta">{t(entry.reason)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rd-cm__footer">
            {error ? <p className="lv-alert lv-alert--danger" role="alert">{error}</p> : null}

            <div className="rd-cm__actions">
              <button type="button" onClick={onClose} disabled={submitting} className="lv-btn lv-btn--neutral">
                {submitResult ? t('Fechar') : t('Cancelar')}
              </button>
              <button type="submit" disabled={submitting || count === 0} className="lv-btn lv-btn--primary">
                <span>{submitLabel}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateClassModal;
