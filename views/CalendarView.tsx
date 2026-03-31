import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle, ChevronLeft, ChevronRight, Play, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import ClassSessionCard from '../components/ClassSessionCard';
import type { FirestoreEntity } from '../services/firebase/data';
import type { ClassRecord } from '../services/firebase/models';
import { UserRole } from '../types';

interface QrSessionPayload {
  classId: string;
  academyId: string;
  expiresAt: string;
  qrValue: string;
  qrToken: string;
}

interface CalendarViewProps {
  userRole?: UserRole;
  currentUserId: string;
  classes: Array<FirestoreEntity<ClassRecord>>;
  onCreateQuickClass: () => Promise<void>;
  onStartClass: (classId: string) => Promise<QrSessionPayload>;
  onFinishClass: (classId: string) => Promise<void>;
  onRefreshQr: (classId: string) => Promise<QrSessionPayload>;
  onRegisterAttendance: (classId: string, qrToken?: string) => Promise<void>;
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const normalized = stripTime(date);
  const day = normalized.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setDate(normalized.getDate() + diff);
  return normalized;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function isSameDay(left?: Date | null, right?: Date | null) {
  if (!left || !right) {
    return false;
  }

  return left.getDate() === right.getDate()
    && left.getMonth() === right.getMonth()
    && left.getFullYear() === right.getFullYear();
}

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

const CalendarView: React.FC<CalendarViewProps> = ({
  userRole,
  currentUserId,
  classes,
  onCreateQuickClass,
  onStartClass,
  onFinishClass,
  onRefreshQr,
  onRegisterAttendance,
}) => {
  const isStaff =
    userRole === UserRole.PROFESSOR ||
    userRole === UserRole.ADMIN ||
    userRole === UserRole.SUPERADMIN;

  const [view, setView] = useState<'minhas' | 'todas'>(isStaff ? 'minhas' : 'todas');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => stripTime(new Date()));
  const [qrByClass, setQrByClass] = useState<Record<string, QrSessionPayload>>({});
  const [qrInputByClass, setQrInputByClass] = useState<Record<string, string>>({});
  const [messageByClass, setMessageByClass] = useState<Record<string, string>>({});
  const [busyByClass, setBusyByClass] = useState<Record<string, boolean>>({});
  const [creatingQuickClass, setCreatingQuickClass] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const filteredClasses = useMemo(() => (
    classes.filter((lesson) => {
      const classDate = lesson.scheduledStart?.toDate();
      if (!classDate || !isSameDay(classDate, selectedDay)) {
        return false;
      }

      if (view === 'minhas' && isStaff) {
        return lesson.professorId === currentUserId;
      }

      return true;
    })
  ), [classes, currentUserId, isStaff, selectedDay, view]);

  async function runClassAction(classId: string, action: () => Promise<void | QrSessionPayload>) {
    setBusyByClass((previous) => ({ ...previous, [classId]: true }));
    setMessageByClass((previous) => ({ ...previous, [classId]: '' }));

    try {
      const result = await action();
      if (result && 'qrToken' in result) {
        setQrByClass((previous) => ({ ...previous, [classId]: result }));
        setMessageByClass((previous) => ({ ...previous, [classId]: 'QR atualizado com sucesso.' }));
      } else {
        setMessageByClass((previous) => ({ ...previous, [classId]: 'Operacao concluida com sucesso.' }));
      }
    } catch (error) {
      setMessageByClass((previous) => ({
        ...previous,
        [classId]: error instanceof Error ? error.message : 'Nao foi possivel concluir esta operacao.',
      }));
    } finally {
      setBusyByClass((previous) => ({ ...previous, [classId]: false }));
    }
  }

  async function handleQuickClassCreation() {
    setCreatingQuickClass(true);
    try {
      await onCreateQuickClass();
    } finally {
      setCreatingQuickClass(false);
    }
  }

  function shiftWeek(direction: -1 | 1) {
    const nextWeekStart = addDays(weekStart, direction * 7);
    setWeekStart(nextWeekStart);
    setSelectedDay(nextWeekStart);
  }

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="app-section-label">Calendario</p>
            <h1 className="app-section-title">Gestao das aulas por data</h1>
            <p className="app-section-copy">
              Navegue pela semana, filtre o que e seu e acompanhe a agenda da academia com o mesmo card do dashboard.
            </p>
          </div>

          <div className="app-orb">
            <CalendarDays size={16} />
            {monthFormatter.format(selectedDay)}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          {isStaff ? (
            <div className="app-segment app-segment--block">
              <button
                type="button"
                onClick={() => setView('minhas')}
                className={`app-segment__button ${view === 'minhas' ? 'is-active' : ''}`}
              >
                Minhas aulas
              </button>
              <button
                type="button"
                onClick={() => setView('todas')}
                className={`app-segment__button ${view === 'todas' ? 'is-active' : ''}`}
              >
                Todas
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => shiftWeek(-1)} className="app-button app-button--ghost app-button--icon" aria-label="Semana anterior">
              <ChevronLeft size={18} />
            </button>

            <div className="app-chip-row flex-1">
              {weekDays.map((day) => (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`app-chip ${isSameDay(day, selectedDay) ? 'is-active' : ''}`}
                >
                  {weekdayFormatter.format(day).replace('.', '').toUpperCase()} {day.getDate()}
                </button>
              ))}
            </div>

            <button type="button" onClick={() => shiftWeek(1)} className="app-button app-button--ghost app-button--icon" aria-label="Próxima semana">
              <ChevronRight size={18} />
            </button>
          </div>

          {isStaff ? (
            <button
              type="button"
              onClick={() => void handleQuickClassCreation()}
              disabled={creatingQuickClass}
              className="app-button app-button--dark app-button--block"
            >
              {creatingQuickClass ? 'Criando aula...' : 'Criar aula rapida'}
            </button>
          ) : null}
        </div>
      </section>

      <section className="app-list">
        {filteredClasses.map((lesson) => {
          const qrData = qrByClass[lesson.id];
          const busy = !!busyByClass[lesson.id];
          const canManage =
            isStaff &&
            (userRole === UserRole.ADMIN ||
              userRole === UserRole.SUPERADMIN ||
              lesson.professorId === currentUserId);

          return (
            <ClassSessionCard
              key={lesson.id}
              lesson={lesson}
              showDate={false}
              footer={(
                <>
                  {qrData ? (
                    <div className="app-panel app-panel--tint p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-[color:var(--gold-mid)]">
                        <QrCode size={16} />
                        QR da aula
                      </div>
                      <p className="mt-2 break-all text-sm text-[color:var(--text-muted)]">Token: {qrData.qrToken}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                        Expira em {new Date(qrData.expiresAt).toLocaleTimeString('pt-BR')}
                      </p>
                    </div>
                  ) : null}

                  {messageByClass[lesson.id] ? (
                    <div className="app-list-card mt-4 text-sm text-[color:var(--text-muted)]">
                      {messageByClass[lesson.id]}
                    </div>
                  ) : null}

                  {canManage ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {lesson.status === 'scheduled' ? (
                        <button
                          type="button"
                          onClick={() => void runClassAction(lesson.id, () => onStartClass(lesson.id))}
                          disabled={busy}
                          className="app-button app-button--gold app-button--small"
                        >
                          <Play size={16} />
                          {busy ? 'Iniciando...' : 'Iniciar aula'}
                        </button>
                      ) : null}

                      {lesson.status === 'active' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void runClassAction(lesson.id, () => onRefreshQr(lesson.id))}
                            disabled={busy}
                            className="app-button app-button--ghost app-button--small"
                          >
                            <RefreshCw size={16} />
                            Novo QR
                          </button>
                          <button
                            type="button"
                            onClick={() => void runClassAction(lesson.id, () => onFinishClass(lesson.id))}
                            disabled={busy}
                            className="app-button app-button--danger app-button--small"
                          >
                            <CheckCircle size={16} />
                            Finalizar
                          </button>
                        </>
                      ) : null}

                      {lesson.status === 'finished' ? (
                        <div className="app-empty w-full">Aula encerrada.</div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 app-form-grid">
                      <label className="app-field">
                        <span className="app-field__label">Token do QR</span>
                        <input
                          type="text"
                          value={qrInputByClass[lesson.id] || ''}
                          onChange={(event) =>
                            setQrInputByClass((previous) => ({ ...previous, [lesson.id]: event.target.value }))
                          }
                          placeholder={lesson.status === 'active' ? 'Cole aqui o token do QR' : 'A aula precisa estar ativa'}
                          disabled={lesson.status !== 'active' || busy}
                          className="app-input"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          void runClassAction(lesson.id, () => onRegisterAttendance(lesson.id, qrInputByClass[lesson.id]))
                        }
                        disabled={lesson.status !== 'active' || busy}
                        className="app-button app-button--gold app-button--block"
                      >
                        <ShieldCheck size={16} />
                        {busy ? 'Registrando...' : 'Registrar presenca'}
                      </button>
                    </div>
                  )}
                </>
              )}
            />
          );
        })}

        {filteredClasses.length === 0 ? (
          <div className="app-empty">Nenhuma aula encontrada para o dia e filtro selecionados.</div>
        ) : null}
      </section>
    </div>
  );
};

export default CalendarView;
