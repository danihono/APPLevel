import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle, ChevronLeft, ChevronRight, Play, Plus, QrCode, RefreshCw, ShieldCheck, X } from 'lucide-react';
import QRCodeSVG from 'react-qr-code';
import ClassSessionCard from '../components/ClassSessionCard';
import CreateClassModal, { type CreateClassPayload } from '../components/CreateClassModal';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, AttendanceRequestRecord, ClassRecord } from '../services/firebase/models';
import { formatDateLabel, formatTimeLabel } from '../services/firebase/adapters';
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
  attendances?: Array<FirestoreEntity<AttendanceRecord>>;
  attendanceRate?: number;
  classNameById?: Map<string, string>;
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

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

function methodLabel(method: AttendanceRecord['checkInMethod']) {
  switch (method) {
    case 'qr':      return 'QR';
    case 'request': return 'Solicitado';
    case 'manual':  return 'Manual';
    default:        return method;
  }
}
function methodBadgeClass(method: AttendanceRecord['checkInMethod']) {
  switch (method) {
    case 'qr':      return 'app-badge app-badge--success';
    case 'request': return 'app-badge app-badge--gold';
    default:        return 'app-badge app-badge--muted';
  }
}
function methodColor(method: AttendanceRecord['checkInMethod']) {
  switch (method) {
    case 'qr':      return '#4ade80';
    case 'request': return 'var(--gold-mid)';
    default:        return 'var(--text-soft)';
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
  attendances = [],
  attendanceRate,
  classNameById,
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
  const [sheetTab, setSheetTab] = useState<'detalhes' | 'historico'>('detalhes');
  const [qrByClass, setQrByClass] = useState<Record<string, QrSessionPayload>>({});
  const [qrCountdowns, setQrCountdowns] = useState<Record<string, string>>({});
  const [qrInputByClass, setQrInputByClass] = useState<Record<string, string>>({});
  const [messageByClass, setMessageByClass] = useState<Record<string, string>>({});
  const [busyByClass, setBusyByClass] = useState<Record<string, boolean>>({});

  // Finish flow
  const [finishConfirmClassId, setFinishConfirmClassId] = useState<string | null>(null);
  const [finishQrData, setFinishQrData] = useState<QrSessionPayload | null>(null);
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishCountdown, setFinishCountdown] = useState('');

  // Camera scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerClassId, setScannerClassId] = useState<string | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset sheet tab when different class selected
  useEffect(() => { setSheetTab('detalhes'); }, [selectedClassId]);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const offset = Math.max(0, (now.getHours() - START_HOUR - 1) * HOUR_H);
      scrollRef.current.scrollTop = offset;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // QR countdown tickers (active class QRs)
  useEffect(() => {
    const id = setInterval(() => {
      const next: Record<string, string> = {};
      for (const [classId, qr] of Object.entries(qrByClass)) {
        next[classId] = fmtCountdown(new Date(qr.expiresAt).getTime() - Date.now());
      }
      setQrCountdowns(next);
    }, 1000);
    return () => clearInterval(id);
  }, [qrByClass]);

  // Finish-flow QR countdown ticker
  useEffect(() => {
    if (!finishQrData) { setFinishCountdown(''); return; }
    const id = setInterval(() => {
      const remaining = new Date(finishQrData.expiresAt).getTime() - Date.now();
      if (remaining <= 0 && finishConfirmClassId) {
        // Auto-refresh QR when it expires during finish flow
        void onRefreshQr(finishConfirmClassId).then(fresh => setFinishQrData(fresh)).catch(() => {});
      }
      setFinishCountdown(fmtCountdown(remaining));
    }, 1000);
    return () => clearInterval(id);
  }, [finishQrData, finishConfirmClassId, onRefreshQr]);

  // Camera scanner lifecycle
  useEffect(() => {
    if (!scannerOpen || !scannerClassId) return;
    let stopped = false;
    let scanner: { stop: () => Promise<void> } | null = null;

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (stopped) return;
      const s = new Html5Qrcode('qr-reader');
      scanner = s;

      s.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          let token: string = decoded.trim();
          try {
            const url = new URL(decoded);
            const urlToken = url.searchParams.get('checkin');
            if (urlToken) { token = urlToken; }
            else {
              const parsed = JSON.parse(decoded) as { token?: string };
              if (parsed.token) token = parsed.token;
            }
          } catch {
            try {
              const parsed = JSON.parse(decoded) as { token?: string };
              if (parsed.token) token = parsed.token;
            } catch { /* raw token */ }
          }
          setScannerOpen(false);
          void runClassAction(scannerClassId, () => onRegisterAttendance(scannerClassId, token));
        },
        () => {},
      ).catch((err: unknown) => {
        setMessageByClass(p => ({
          ...p,
          [scannerClassId]: `Câmera: ${err instanceof Error ? err.message : 'Acesso negado'}`,
        }));
        setScannerOpen(false);
      });
    }).catch(() => {
      setScannerOpen(false);
    });

    return () => {
      stopped = true;
      scanner?.stop().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerOpen, scannerClassId]);

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
        setMessageByClass((p) => ({ ...p, [classId]: 'QR atualizado.' }));
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

  async function handleStartFinishFlow(classId: string) {
    setFinishBusy(true);
    setMessageByClass(p => ({ ...p, [classId]: '' }));
    try {
      const freshQr = await onRefreshQr(classId);
      setFinishQrData(freshQr);
      setFinishConfirmClassId(classId);
    } catch (e) {
      setMessageByClass(p => ({ ...p, [classId]: e instanceof Error ? e.message : 'Erro ao gerar QR' }));
    } finally {
      setFinishBusy(false);
    }
  }

  async function handleConfirmFinish() {
    if (!finishConfirmClassId) return;
    setFinishBusy(true);
    try {
      await onFinishClass(finishConfirmClassId);
      setQrByClass(p => { const n = { ...p }; delete n[finishConfirmClassId]; return n; });
    } finally {
      setFinishBusy(false);
      setFinishConfirmClassId(null);
      setFinishQrData(null);
      setSelectedClassId(null);
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
  const qrCountdown = selectedClassId ? (qrCountdowns[selectedClassId] ?? '') : '';
  const busy = selectedClassId ? !!busyByClass[selectedClassId] : false;
  const message = selectedClassId ? messageByClass[selectedClassId] : '';

  // Attendance history data
  const myAttendances = useMemo(() =>
    [...attendances]
      .filter(a => a.userId === currentUserId)
      .sort((a, b) => (b.checkedInAt?.toDate().getTime() ?? 0) - (a.checkedInAt?.toDate().getTime() ?? 0)),
    [attendances, currentUserId],
  );

  return (
    <div className="view-shell">
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="app-panel" style={{ padding: '14px 18px', marginBottom: 0 }}>
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
            zIndex: 65,
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
              maxHeight: '90vh',
              borderRadius: '1.5rem 1.5rem 0 0',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: 'var(--surface)',
              backdropFilter: 'blur(20px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Scrollable area: class info + tab content ──────────────── */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <ClassSessionCard lesson={selectedClass} showDate />

              {/* Tab switcher */}
              <div style={{ padding: '4px 20px 12px' }}>
                <div className="app-segment">
                  <button
                    type="button"
                    onClick={() => setSheetTab('detalhes')}
                    className={`app-segment__button ${sheetTab === 'detalhes' ? 'is-active' : ''}`}
                  >
                    Detalhes
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheetTab('historico')}
                    className={`app-segment__button ${sheetTab === 'historico' ? 'is-active' : ''}`}
                  >
                    Histórico ({myAttendances.length})
                  </button>
                </div>
              </div>

              {sheetTab === 'detalhes' ? (
                <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* QR panel (professor, active class) */}
                  {qrData && canManageSelected ? (
                    <div className="app-panel app-panel--tint p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold text-[color:var(--gold-mid)]">
                          <QrCode size={16} />
                          QR da aula
                        </div>
                        <button
                          type="button"
                          onClick={() => void runClassAction(selectedClass.id, () => onRefreshQr(selectedClass.id))}
                          disabled={busy}
                          className="app-button app-button--ghost app-button--icon"
                          title="Gerar novo QR"
                          style={{ width: 30, height: 30 }}
                        >
                          <RefreshCw size={13} />
                        </button>
                      </div>
                      <div style={{
                        background: '#fff',
                        padding: 12,
                        borderRadius: 14,
                        marginTop: 12,
                        display: 'flex',
                        justifyContent: 'center',
                      }}>
                        <QRCodeSVG value={`${window.location.origin}?checkin=${encodeURIComponent(qrData.qrToken)}&classId=${encodeURIComponent(qrData.classId)}`} size={200} level="M" />
                      </div>
                      <p className="mt-2 text-xs text-[color:var(--text-soft)] text-center">
                        {qrCountdown && qrCountdown !== '00:00'
                          ? `Expira em ${qrCountdown}`
                          : 'QR expirado — gere um novo'}
                      </p>
                    </div>
                  ) : null}

                  {/* Attendance % badge (student) */}
                  {!isStaff && attendanceRate !== undefined ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="app-badge app-badge--gold">{attendanceRate}% frequência</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>no mês atual</span>
                    </div>
                  ) : null}

                  {/* Student check-in form */}
                  {!canManageSelected ? (
                    <div className="app-form-grid">
                      <label className="app-field">
                        <span className="app-field__label">Token do QR</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            ref={tokenInputRef}
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
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setScannerClassId(selectedClass.id);
                              setScannerOpen(true);
                            }}
                            disabled={selectedClass.status !== 'active' || busy}
                            className="app-button app-button--ghost app-button--icon"
                            title="Escanear QR com câmera"
                            style={{ width: 42, height: 42, flexShrink: 0 }}
                          >
                            <Camera size={16} />
                          </button>
                        </div>
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : (
                /* ── Histórico tab ────────────────────────────────────────── */
                <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!isStaff ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div className="app-stat-card" style={{ padding: '12px 14px' }}>
                        <p className="app-stat-card__label">Frequência</p>
                        <p className="app-stat-card__value" style={{ fontSize: '1.4rem' }}>{attendanceRate ?? 0}%</p>
                        <p className="app-stat-card__note">no mês atual</p>
                      </div>
                      <div className="app-stat-card" style={{ padding: '12px 14px' }}>
                        <p className="app-stat-card__label">Presenças</p>
                        <p className="app-stat-card__value" style={{ fontSize: '1.4rem' }}>{myAttendances.length}</p>
                        <p className="app-stat-card__note">confirmadas</p>
                      </div>
                    </div>
                  ) : null}

                  <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
                    Últimas presenças
                  </p>

                  {myAttendances.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                      Nenhuma presença registrada ainda
                    </div>
                  ) : (
                    myAttendances.slice(0, 30).map((att) => (
                      <div key={att.id} className="app-list-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <CheckCircle size={16} style={{ color: methodColor(att.checkInMethod), flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {classNameById?.get(att.classId) ?? 'Aula'}
                          </p>
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-soft)', marginTop: 2 }}>
                            {att.checkedInAt ? `${formatDateLabel(att.checkedInAt)} • ${formatTimeLabel(att.checkedInAt)}` : '—'}
                          </p>
                        </div>
                        <span className={methodBadgeClass(att.checkInMethod)} style={{ flexShrink: 0, fontSize: '0.65rem' }}>
                          {methodLabel(att.checkInMethod)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* ── Sticky action footer (always visible) ──────────────────── */}
            <div style={{
              flexShrink: 0,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              padding: '12px 20px',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 8px) + 12px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {message ? (
                <div className="app-list-card text-sm text-[color:var(--text-muted)]">{message}</div>
              ) : null}

              {canManageSelected ? (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedClassId(null)}
                    className="app-button app-button--ghost app-button--small"
                  >
                    <X size={14} />
                    Fechar
                  </button>

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
                    <button
                      type="button"
                      onClick={() => void handleStartFinishFlow(selectedClass.id)}
                      disabled={busy || finishBusy}
                      className="app-button app-button--danger app-button--small"
                    >
                      <CheckCircle size={14} />
                      {busy || finishBusy ? 'Aguarde...' : 'Finalizar aula'}
                    </button>
                  ) : null}

                  {selectedClass.status === 'finished' ? (
                    <span className="text-sm text-[color:var(--text-soft)]">Aula encerrada.</span>
                  ) : null}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                    {busy ? 'Registrando...' : 'Registrar presença'}
                  </button>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        void runClassAction(selectedClass.id, () =>
                          onSubmitAttendanceRequest(selectedClass.id),
                        )
                      }
                      disabled={selectedClass.status !== 'active' || busy || !!pendingRequest}
                      className="app-button app-button--ghost"
                      style={{ flex: 1 }}
                    >
                      <CheckCircle size={14} />
                      {pendingRequest ? 'Solicitação pendente' : 'Solicitar presença'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedClassId(null)}
                      className="app-button app-button--ghost app-button--small"
                    >
                      <X size={14} />
                      Fechar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Finalizar — QR confirmation modal ───────────────────────────────── */}
      {finishConfirmClassId && finishQrData ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)',
            padding: 20,
          }}
        >
          <div
            className="app-panel"
            style={{
              width: '100%',
              maxWidth: 360,
              borderRadius: '1.8rem',
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle size={20} style={{ color: 'var(--gold-mid)' }} />
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Encerrar aula?</span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              Mostre este QR para quem ainda não confirmou presença
            </p>
            <div style={{ background: '#fff', padding: 14, borderRadius: 16 }}>
              <QRCodeSVG value={`${window.location.origin}?checkin=${encodeURIComponent(finishQrData.qrToken)}&classId=${encodeURIComponent(finishQrData.classId)}`} size={220} level="M" />
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-soft)' }}>
              {finishCountdown && finishCountdown !== '00:00'
                ? `Expira em ${finishCountdown}`
                : 'Renovando QR...'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <button
                type="button"
                onClick={() => void handleConfirmFinish()}
                disabled={finishBusy}
                className="app-button app-button--gold app-button--block"
              >
                <CheckCircle size={14} />
                {finishBusy ? 'Encerrando...' : 'Confirmar encerramento'}
              </button>
              <button
                type="button"
                onClick={() => { setFinishConfirmClassId(null); setFinishQrData(null); }}
                disabled={finishBusy}
                className="app-button app-button--ghost app-button--block"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Camera scanner overlay ───────────────────────────────────────────── */}
      {scannerOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: '#000',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setScannerOpen(false)}
              className="app-button app-button--ghost app-button--icon"
              style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <X size={18} />
            </button>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>
              Aponte para o QR da aula
            </span>
          </div>

          {/* Camera area */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div id="qr-reader" style={{ width: '100%', height: '100%' }} />

            {/* Scanning frame overlay */}
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{ position: 'relative', width: 240, height: 240 }}>
                {/* Corner brackets */}
                {[
                  { top: 0, left: 0, borderTop: '3px solid var(--gold-mid)', borderLeft: '3px solid var(--gold-mid)', borderRadius: '6px 0 0 0' },
                  { top: 0, right: 0, borderTop: '3px solid var(--gold-mid)', borderRight: '3px solid var(--gold-mid)', borderRadius: '0 6px 0 0' },
                  { bottom: 0, left: 0, borderBottom: '3px solid var(--gold-mid)', borderLeft: '3px solid var(--gold-mid)', borderRadius: '0 0 0 6px' },
                  { bottom: 0, right: 0, borderBottom: '3px solid var(--gold-mid)', borderRight: '3px solid var(--gold-mid)', borderRadius: '0 0 6px 0' },
                ].map((style, i) => (
                  <div key={i} style={{ position: 'absolute', width: 28, height: 28, ...style }} />
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 20px', flexShrink: 0, textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: 12 }}>
              Posicione o QR code dentro do quadro
            </p>
            <button
              type="button"
              onClick={() => {
                setScannerOpen(false);
                setTimeout(() => tokenInputRef.current?.focus(), 100);
              }}
              className="app-button app-button--ghost"
              style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.8rem' }}
            >
              Inserir token manualmente
            </button>
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
