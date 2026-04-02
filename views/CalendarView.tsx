import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, ChevronLeft, ChevronRight, Play, Plus, QrCode, RefreshCw, ShieldCheck, X } from 'lucide-react';
import ClassSessionCard from '../components/ClassSessionCard';
import CreateClassModal, { type CreateClassPayload } from '../components/CreateClassModal';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRequestRecord, ClassRecord } from '../services/firebase/models';
import { formatTimeLabel } from '../services/firebase/adapters';
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
  currentUserName: string;
  professors: Array<{ id: string; displayName: string }>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  attendanceRequests?: Array<FirestoreEntity<AttendanceRequestRecord>>;
  onCreateClass: (classes: CreateClassPayload[]) => Promise<void>;
  onStartClass: (classId: string) => Promise<QrSessionPayload>;
  onFinishClass: (classId: string) => Promise<void>;
  onRefreshQr: (classId: string) => Promise<QrSessionPayload>;
  onRegisterAttendance: (classId: string, qrToken?: string) => Promise<void>;
  onSubmitAttendanceRequest: (classId: string) => Promise<void>;
}

// ─── Grid constants ──────────────────────────────────────────────────────────
const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_H = 64; // px per hour
const GUTTER_W = 44; // px for time label column
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

// Mon-first day labels (JS getDay: 0=Sun)
const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

// ─── Date helpers ─────────────────────────────────────────────────────────────
function strip(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d: Date) {
  const n = strip(d);
  const diff = n.getDay() === 0 ? -6 : 1 - n.getDay();
  n.setDate(n.getDate() + diff);
  return n;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function sameDay(a?: Date | null, b?: Date | null) {
  if (!a || !b) return false;
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

// ─── Class block helpers ──────────────────────────────────────────────────────
function classTop(cls: FirestoreEntity<ClassRecord>): number | null {
  const s = cls.scheduledStart?.toDate();
  if (!s) return null;
  const mins = s.getHours() * 60 + s.getMinutes() - START_HOUR * 60;
  return (mins / 60) * HOUR_H;
}
function classHeight(cls: FirestoreEntity<ClassRecord>): number {
  const s = cls.scheduledStart?.toDate();
  const e = cls.scheduledEnd?.toDate();
  if (!s || !e) return HOUR_H;
  const mins = (e.getTime() - s.getTime()) / 60000;
  return Math.max((mins / 60) * HOUR_H, 28);
}
function statusColors(status: ClassRecord['status']) {
  switch (status) {
    case 'active':    return { bg: 'rgba(74,222,128,0.13)',  border: 'rgba(74,222,128,0.5)',  accent: '#4ade80' };
    case 'finished':  return { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', accent: 'var(--text-soft)' };
    case 'cancelled': return { bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.35)',   accent: '#ef4444' };
    default:          return { bg: 'rgba(232,175,72,0.13)',  border: 'rgba(232,175,72,0.45)',  accent: 'var(--gold-mid)' };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
const CalendarView: React.FC<CalendarViewProps> = ({
  userRole,
  currentUserId,
  currentUserName,
  professors,
  classes,
  attendanceRequests = [],
  onCreateClass,
  onStartClass,
  onFinishClass,
  onRefreshQr,
  onRegisterAttendance,
  onSubmitAttendanceRequest,
}) => {
  const isStaff =
    userRole === UserRole.PROFESSOR ||
    userRole === UserRole.ADMIN ||
    userRole === UserRole.SUPERADMIN;

  const today = useMemo(() => strip(new Date()), []);
  const now = new Date();
  const nowTop = (now.getHours() * 60 + now.getMinutes() - START_HOUR * 60) / 60 * HOUR_H;
  const showNowLine = now.getHours() >= START_HOUR && now.getHours() < END_HOUR;

  const [view, setView] = useState<'minhas' | 'todas'>(isStaff ? 'minhas' : 'todas');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => strip(new Date()));
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [qrByClass, setQrByClass] = useState<Record<string, QrSessionPayload>>({});
  const [qrInputByClass, setQrInputByClass] = useState<Record<string, string>>({});
  const [messageByClass, setMessageByClass] = useState<Record<string, string>>({});
  const [busyByClass, setBusyByClass] = useState<Record<string, boolean>>({});

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const offset = Math.max(0, (now.getHours() - START_HOUR - 1) * HOUR_H);
      scrollRef.current.scrollTop = offset;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const filteredClasses = useMemo(() =>
    classes.filter((cls) => {
      if (view === 'minhas' && isStaff) return cls.professorId === currentUserId;
      return true;
    }),
    [classes, currentUserId, isStaff, view],
  );

  function classesForDay(day: Date) {
    return filteredClasses.filter((cls) => {
      const d = cls.scheduledStart?.toDate();
      return d && sameDay(d, day);
    });
  }

  function shiftWeek(dir: -1 | 1) {
    const next = addDays(weekStart, dir * 7);
    setWeekStart(next);
    setSelectedDay(next);
  }

  function goToToday() {
    setWeekStart(startOfWeek(today));
    setSelectedDay(today);
  }

  async function runClassAction(classId: string, action: () => Promise<void | QrSessionPayload>) {
    setBusyByClass((p) => ({ ...p, [classId]: true }));
    setMessageByClass((p) => ({ ...p, [classId]: '' }));
    try {
      const result = await action();
      if (result && 'qrToken' in result) {
        setQrByClass((p) => ({ ...p, [classId]: result }));
        setMessageByClass((p) => ({ ...p, [classId]: 'QR atualizado com sucesso.' }));
      } else {
        setMessageByClass((p) => ({ ...p, [classId]: 'Operacao concluida.' }));
      }
    } catch (error) {
      setMessageByClass((p) => ({
        ...p,
        [classId]: error instanceof Error ? error.message : 'Nao foi possivel concluir.',
      }));
    } finally {
      setBusyByClass((p) => ({ ...p, [classId]: false }));
    }
  }

  const selectedClass = selectedClassId ? classes.find((c) => c.id === selectedClassId) ?? null : null;
  const canManageSelected =
    isStaff &&
    selectedClass &&
    (userRole === UserRole.ADMIN || userRole === UserRole.SUPERADMIN || selectedClass.professorId === currentUserId);
  const pendingRequest = selectedClass
    ? attendanceRequests.find((r) => r.classId === selectedClass.id && r.status === 'pending')
    : null;
  const qrData = selectedClassId ? qrByClass[selectedClassId] : null;
  const busy = selectedClassId ? !!busyByClass[selectedClassId] : false;
  const message = selectedClassId ? messageByClass[selectedClassId] : '';

  return (
    <div className="view-shell">
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="app-panel app-panel--hero" style={{ padding: '14px 18px', marginBottom: 0 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Month + week navigation */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              className="app-button app-button--ghost app-button--icon"
              style={{ width: 32, height: 32 }}
            >
              <ChevronLeft size={15} />
            </button>
            <span
              className="font-bold capitalize"
              style={{ fontSize: '0.9rem', minWidth: 148, textAlign: 'center' }}
            >
              {monthFmt.format(weekStart)}
            </span>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              className="app-button app-button--ghost app-button--icon"
              style={{ width: 32, height: 32 }}
            >
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="app-button app-button--ghost"
              style={{ fontSize: '0.72rem', padding: '3px 10px', height: 28 }}
            >
              Hoje
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isStaff ? (
              <div className="app-segment">
                <button
                  type="button"
                  onClick={() => setView('minhas')}
                  className={`app-segment__button ${view === 'minhas' ? 'is-active' : ''}`}
                >
                  Minhas
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

            {isStaff ? (
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="app-button app-button--dark"
                style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              >
                <Plus size={13} />
                Criar aula
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Week grid ─────────────────────────────────────────────────────────── */}
      <div
        className="app-panel"
        style={{
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '0 0 1.5rem 1.5rem',
        }}
      >
        {/* Day headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${GUTTER_W}px repeat(7, 1fr)`,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
          }}
        >
          <div /> {/* empty corner */}
          {weekDays.map((day) => {
            const isToday = sameDay(day, today);
            const isSel = sameDay(day, selectedDay);
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelectedDay(day)}
                style={{
                  padding: '10px 4px',
                  background: 'none',
                  border: 'none',
                  borderLeft: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-soft)',
                }}>
                  {DAY_SHORT[day.getDay()]}
                </span>
                <span style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.78rem',
                  fontWeight: isToday || isSel ? 700 : 500,
                  background: isToday
                    ? 'var(--gold-mid)'
                    : isSel
                      ? 'rgba(232,175,72,0.18)'
                      : 'transparent',
                  color: isToday
                    ? '#000'
                    : isSel
                      ? 'var(--gold-mid)'
                      : 'var(--text-muted)',
                }}>
                  {day.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        {/* Scrollable time body */}
        <div
          ref={scrollRef}
          style={{
            overflowY: 'auto',
            overflowX: 'auto',
            maxHeight: 'calc(100svh - 280px)',
            minHeight: 320,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `${GUTTER_W}px repeat(7, 1fr)`,
              minWidth: 420,
              position: 'relative',
            }}
          >
            {/* Time label column */}
            <div>
              {HOURS.map((h) => (
                <div
                  key={h}
                  style={{
                    height: HOUR_H,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    paddingRight: 8,
                    paddingTop: 3,
                    fontSize: '0.6rem',
                    color: 'var(--text-soft)',
                    fontVariantNumeric: 'tabular-nums',
                    userSelect: 'none',
                  }}
                >
                  {h}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day) => {
              const dayClasses = classesForDay(day);
              const isToday = sameDay(day, today);
              return (
                <div
                  key={day.toISOString()}
                  style={{
                    position: 'relative',
                    height: HOURS.length * HOUR_H,
                    borderLeft: '1px solid rgba(255,255,255,0.05)',
                    background: isToday ? 'rgba(232,175,72,0.02)' : 'transparent',
                  }}
                >
                  {/* Hour grid lines */}
                  {HOURS.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        top: i * HOUR_H,
                        left: 0,
                        right: 0,
                        borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                        pointerEvents: 'none',
                      }}
                    />
                  ))}

                  {/* Current time line */}
                  {isToday && showNowLine ? (
                    <div
                      style={{
                        position: 'absolute',
                        top: nowTop,
                        left: -1,
                        right: 0,
                        height: 2,
                        background: '#ef4444',
                        zIndex: 10,
                        pointerEvents: 'none',
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        left: -3,
                        top: -3,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#ef4444',
                      }} />
                    </div>
                  ) : null}

                  {/* Class blocks */}
                  {dayClasses.map((cls) => {
                    const top = classTop(cls);
                    if (top === null) return null;
                    const height = classHeight(cls);
                    const colors = statusColors(cls.status);
                    const isSelected = cls.id === selectedClassId;

                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => setSelectedClassId(isSelected ? null : cls.id)}
                        style={{
                          position: 'absolute',
                          top: top + 1,
                          left: 3,
                          right: 3,
                          height: height - 2,
                          background: isSelected
                            ? colors.bg.replace(/[\d.]+\)$/, '0.26)')
                            : colors.bg,
                          border: `1.5px solid ${isSelected ? colors.accent : colors.border}`,
                          borderRadius: 8,
                          padding: '3px 6px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          zIndex: isSelected ? 5 : 2,
                          transition: 'border-color 0.12s, background 0.12s',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                        }}
                      >
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          color: colors.accent,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.3,
                        }}>
                          {cls.title}
                        </span>
                        {height > 32 ? (
                          <span style={{
                            fontSize: '0.57rem',
                            color: 'var(--text-soft)',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.2,
                          }}>
                            {formatTimeLabel(cls.scheduledStart)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Selected class bottom sheet ──────────────────────────────────────── */}
      {selectedClass ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
          }}
          onClick={() => setSelectedClassId(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 600,
              maxHeight: '82vh',
              overflowY: 'auto',
              borderRadius: '1.5rem 1.5rem 0 0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ClassSessionCard
              lesson={selectedClass}
              showDate
              footer={(
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {qrData ? (
                    <div className="app-panel app-panel--tint p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-[color:var(--gold-mid)]">
                        <QrCode size={16} />
                        QR da aula
                      </div>
                      <p className="mt-2 break-all text-sm text-[color:var(--text-muted)]">
                        Token: {qrData.qrToken}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                        Expira em {new Date(qrData.expiresAt).toLocaleTimeString('pt-BR')}
                      </p>
                    </div>
                  ) : null}

                  {message ? (
                    <div className="app-list-card text-sm text-[color:var(--text-muted)]">{message}</div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedClassId(null)}
                      className="app-button app-button--ghost app-button--small"
                    >
                      <X size={14} />
                      Fechar
                    </button>

                    {canManageSelected ? (
                      <>
                        {selectedClass.status === 'scheduled' ? (
                          <button
                            type="button"
                            onClick={() => void runClassAction(selectedClass.id, () => onStartClass(selectedClass.id))}
                            disabled={busy}
                            className="app-button app-button--gold app-button--small"
                          >
                            <Play size={14} />
                            {busy ? 'Iniciando...' : 'Iniciar aula'}
                          </button>
                        ) : null}

                        {selectedClass.status === 'active' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void runClassAction(selectedClass.id, () => onRefreshQr(selectedClass.id))}
                              disabled={busy}
                              className="app-button app-button--ghost app-button--small"
                            >
                              <RefreshCw size={14} />
                              Novo QR
                            </button>
                            <button
                              type="button"
                              onClick={() => void runClassAction(selectedClass.id, () => onFinishClass(selectedClass.id))}
                              disabled={busy}
                              className="app-button app-button--danger app-button--small"
                            >
                              <CheckCircle size={14} />
                              Finalizar
                            </button>
                          </>
                        ) : null}

                        {selectedClass.status === 'finished' ? (
                          <span className="text-sm text-[color:var(--text-soft)]">Aula encerrada.</span>
                        ) : null}
                      </>
                    ) : (
                      <div className="app-form-grid flex-1">
                        <label className="app-field">
                          <span className="app-field__label">Token do QR</span>
                          <input
                            type="text"
                            value={qrInputByClass[selectedClass.id] || ''}
                            onChange={(e) =>
                              setQrInputByClass((p) => ({ ...p, [selectedClass.id]: e.target.value }))
                            }
                            placeholder={
                              selectedClass.status === 'active'
                                ? 'Cole aqui o token do QR'
                                : 'A aula precisa estar ativa'
                            }
                            disabled={selectedClass.status !== 'active' || busy}
                            className="app-input"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            void runClassAction(selectedClass.id, () =>
                              onRegisterAttendance(selectedClass.id, qrInputByClass[selectedClass.id]),
                            )
                          }
                          disabled={selectedClass.status !== 'active' || busy}
                          className="app-button app-button--gold app-button--block"
                        >
                          <ShieldCheck size={14} />
                          {busy ? 'Registrando...' : 'Registrar presenca'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void runClassAction(selectedClass.id, () =>
                              onSubmitAttendanceRequest(selectedClass.id),
                            )
                          }
                          disabled={selectedClass.status !== 'active' || busy || !!pendingRequest}
                          className="app-button app-button--ghost app-button--block"
                        >
                          <CheckCircle size={14} />
                          {pendingRequest ? 'Solicitacao pendente' : 'Solicitar presenca'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      ) : null}

      {/* ── Create class modal ───────────────────────────────────────────────── */}
      {createModalOpen ? (
        <CreateClassModal
          professors={professors}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          selectedDay={selectedDay}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={onCreateClass}
        />
      ) : null}
    </div>
  );
};

export default CalendarView;
