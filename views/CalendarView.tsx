import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle, ChevronLeft, ChevronRight, MapPin, Pencil, Play, Plus, QrCode, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import QRCodeSVG from 'react-qr-code';
import { buildMonthGrid, MONTH_WEEK_HEADER, sameCalendarDay, sameCalendarMonth, stripDate, toDateKey } from '../calendarUtils';
import ClassSessionCard from '../components/ClassSessionCard';
import CreateClassModal, { type CreateClassPayload } from '../components/CreateClassModal';
import DeleteClassModal, { type DeleteClassPayload } from '../components/DeleteClassModal';
import EditClassModal, { type EditClassPayload } from '../components/EditClassModal';
import { getMyClassRsvp, subscribeToClassAttendances, type FirestoreEntity } from '../services/firebase/data';
import {
  backendFunctions,
  type ClassScheduleMutationSkippedItem,
  type CreateClassScheduleBatchResult,
  type DeleteClassScheduleResult,
  type UpdateRecurringClassSeriesResult,
} from '../services/firebase/functions';
import type { AttendanceRecord, AttendanceRequestRecord, ClassRecord, UserRecord } from '../services/firebase/models';
import { formatDateLabel, formatTimeLabel } from '../services/firebase/adapters';
import { UserRole, type KidsCategory } from '../types';

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
  currentUserBelt?: string;
  currentUserStripes?: number;
  currentUserKidsCategory?: KidsCategory;
  professors: Array<{ id: string; displayName: string }>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  attendanceRequests?: Array<FirestoreEntity<AttendanceRequestRecord>>;
  attendances?: Array<FirestoreEntity<AttendanceRecord>>;
  attendanceRate?: number;
  classNameById?: Map<string, string>;
  onCreateClass: (classes: CreateClassPayload[]) => Promise<CreateClassScheduleBatchResult>;
  onEditClass: (payload: EditClassPayload) => Promise<UpdateRecurringClassSeriesResult>;
  onDeleteClass: (payload: DeleteClassPayload) => Promise<DeleteClassScheduleResult>;
  onStartClass: (classId: string) => Promise<QrSessionPayload>;
  onFinishClass: (classId: string) => Promise<void>;
  onRefreshQr: (classId: string) => Promise<QrSessionPayload>;
  academyStudents?: Array<FirestoreEntity<UserRecord>>;
  onRegisterAttendance: (classId: string, qrToken?: string) => Promise<void>;
  onSubmitAttendanceRequest: (classId: string) => Promise<void>;
  onMarkStudentPresent?: (classId: string, targetUserId: string) => Promise<void>;
}

type CalendarSurface = 'calendar' | 'today';
type StaffFilter = 'minhas' | 'todas';
type FeedbackToast = {
  title: string;
  note?: string;
};

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const longDayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) {
    return '00:00';
  }

  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildSkippedNote(skipped: ClassScheduleMutationSkippedItem[]): string | undefined {
  if (skipped.length === 0) {
    return undefined;
  }

  const [firstItem] = skipped;
  const extra = skipped.length > 1 ? ` Mais ${skipped.length - 1} ocorrencia${skipped.length - 1 === 1 ? '' : 's'}.` : '';
  return `${firstItem.reason}${extra}`;
}

function buildEditToast(result: UpdateRecurringClassSeriesResult): FeedbackToast {
  if (result.updatedCount === 1 && result.requestedCount === 1 && result.skippedCount === 0) {
    return { title: 'Aula atualizada.' };
  }

  if (result.updatedCount === 0) {
    return {
      title: 'Nenhuma aula foi atualizada.',
      note: buildSkippedNote(result.skipped),
    };
  }

  return {
    title: `${result.updatedCount} ${result.updatedCount === 1 ? 'aula atualizada' : 'aulas atualizadas'}.`,
    note: result.skippedCount > 0
      ? `${result.skippedCount} mantida${result.skippedCount === 1 ? '' : 's'}. ${buildSkippedNote(result.skipped) ?? ''}`.trim()
      : undefined,
  };
}

function buildDeleteToast(result: DeleteClassScheduleResult): FeedbackToast {
  if (result.deletedCount === 1 && result.requestedCount === 1 && result.skippedCount === 0) {
    return { title: 'Aula excluida.' };
  }

  if (result.deletedCount === 0) {
    return {
      title: 'Nenhuma aula foi excluida.',
      note: buildSkippedNote(result.skipped),
    };
  }

  return {
    title: `${result.deletedCount} ${result.deletedCount === 1 ? 'aula excluida' : 'aulas excluidas'}.`,
    note: result.skippedCount > 0
      ? `${result.skippedCount} mantida${result.skippedCount === 1 ? '' : 's'}. ${buildSkippedNote(result.skipped) ?? ''}`.trim()
      : undefined,
  };
}

function sortClasses(left: FirestoreEntity<ClassRecord>, right: FirestoreEntity<ClassRecord>) {
  const leftStart = left.scheduledStart?.toDate().getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightStart = right.scheduledStart?.toDate().getTime() ?? Number.MAX_SAFE_INTEGER;
  if (leftStart !== rightStart) {
    return leftStart - rightStart;
  }
  return left.title.localeCompare(right.title, 'pt-BR');
}

function statusColors(status: ClassRecord['status']) {
  switch (status) {
    case 'active':
      return { bg: 'rgba(74,222,128,0.13)', border: 'rgba(74,222,128,0.5)', accent: '#4ade80' };
    case 'finished':
      return { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', accent: 'var(--text-soft)' };
    case 'cancelled':
      return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.35)', accent: '#ef4444' };
    default:
      return { bg: 'rgba(232,175,72,0.13)', border: 'rgba(232,175,72,0.45)', accent: 'var(--gold-mid)' };
  }
}

function statusLabel(status: ClassRecord['status']) {
  switch (status) {
    case 'active':
      return 'Ativa';
    case 'finished':
      return 'Concluida';
    case 'cancelled':
      return 'Cancelada';
    default:
      return 'Agendada';
  }
}

function statusBadgeClass(status: ClassRecord['status']) {
  switch (status) {
    case 'active':
      return 'app-badge app-badge--success';
    case 'finished':
      return 'app-badge app-badge--muted';
    case 'cancelled':
      return 'app-badge app-badge--danger';
    default:
      return 'app-badge app-badge--gold';
  }
}

function classTimeRange(lesson: FirestoreEntity<ClassRecord>) {
  const end = lesson.scheduledEnd?.toDate();
  return end
    ? `${formatTimeLabel(lesson.scheduledStart)} - ${formatTimeLabel(lesson.scheduledEnd)}`
    : formatTimeLabel(lesson.scheduledStart);
}

function methodLabel(method: AttendanceRecord['checkInMethod']) {
  switch (method) {
    case 'qr':
      return 'QR';
    case 'request':
      return 'Solicitado';
    case 'manual':
      return 'Manual';
    default:
      return method;
  }
}

function methodBadgeClass(method: AttendanceRecord['checkInMethod']) {
  switch (method) {
    case 'qr':
      return 'app-badge app-badge--success';
    case 'request':
      return 'app-badge app-badge--gold';
    default:
      return 'app-badge app-badge--muted';
  }
}

function methodColor(method: AttendanceRecord['checkInMethod']) {
  switch (method) {
    case 'qr':
      return '#4ade80';
    case 'request':
      return 'var(--gold-mid)';
    default:
      return 'var(--text-soft)';
  }
}

interface ClassListItemProps {
  lesson: FirestoreEntity<ClassRecord>;
  onOpen: (classId: string) => void;
  compact?: boolean;
  isConfirmed?: boolean;
}

const ClassListItem: React.FC<ClassListItemProps> = ({ lesson, onOpen, compact = false, isConfirmed = false }) => {
  const colors = statusColors(lesson.status);

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onOpen(lesson.id)}
        className="calendar-mobile__class-card"
      >
        <span
          className="calendar-mobile__class-accent"
          style={{ backgroundColor: lesson.status === 'scheduled' ? 'var(--gold-mid)' : colors.accent }}
          aria-hidden="true"
        />

        <div className="calendar-mobile__class-copy">
          <p className="calendar-mobile__class-title">{lesson.title}</p>
          <p className="calendar-mobile__class-time">{formatTimeLabel(lesson.scheduledStart)}</p>
        </div>

        {isConfirmed ? (
          <span className="app-badge app-badge--success" style={{ flexShrink: 0, fontSize: '0.65rem' }}>Confirmado</span>
        ) : null}

        <ChevronRight size={18} className="calendar-mobile__class-arrow" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(lesson.id)}
      className="app-list-card"
      style={{
        width: '100%',
        padding: '1rem 1.05rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
          <div
            style={{
              minWidth: 96,
              padding: '0.7rem 0.8rem',
              borderRadius: 16,
              border: '1px solid rgba(232,175,72,0.2)',
              background: 'rgba(232,175,72,0.1)',
            }}
          >
            <p style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
              Horario
            </p>
            <p style={{ marginTop: 6, fontSize: '0.92rem', fontWeight: 800 }}>{classTimeRange(lesson)}</p>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <p style={{ fontSize: '1rem', fontWeight: 700 }}>{lesson.title}</p>
              <span className={statusBadgeClass(lesson.status)}>{statusLabel(lesson.status)}</span>
              {isConfirmed ? (
                <span className="app-badge app-badge--success" style={{ fontSize: '0.65rem' }}>Confirmado</span>
              ) : null}
            </div>

            {lesson.description ? (
              <p style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {lesson.description}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="app-meta-row">
        <span>{lesson.professorName || 'Equipe tecnica'}</span>
        <span className="inline-flex items-center gap-2"><MapPin size={14} />{lesson.tatame || 'Tatame principal'}</span>
      </div>
    </button>
  );
};

interface MonthGridProps {
  monthCells: Array<Date | null>;
  classesByDay: Map<string, Array<FirestoreEntity<ClassRecord>>>;
  selectedDay: Date;
  today: Date;
  onSelectDay: (day: Date) => void;
  onOpenClass: (classId: string, day: Date) => void;
}

const DesktopMonthGrid: React.FC<MonthGridProps> = React.memo(function DesktopMonthGrid({
  monthCells,
  classesByDay,
  selectedDay,
  today,
  onSelectDay,
  onOpenClass,
}) {
  return (
  <div className="app-calendar-month-grid">
    {MONTH_WEEK_HEADER.map((day) => (
      <div key={day} className="app-calendar-month-header">
        {day}
      </div>
    ))}

    {monthCells.map((cell, index) => {
      if (!cell) {
        return <div key={`pad-${index}`} className="app-calendar-month-pad" aria-hidden="true" />;
      }

      const key = toDateKey(cell);
      const dayClasses = classesByDay.get(key) ?? [];
      const previewClasses = dayClasses.slice(0, 2);
      const remainingCount = dayClasses.length - previewClasses.length;
      const isToday = sameCalendarDay(cell, today);
      const isSelected = sameCalendarDay(cell, selectedDay);

      return (
        <div
          key={key}
          className={`app-calendar-month-day ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`.trim()}
        >
          <button
            type="button"
            onClick={() => onSelectDay(stripDate(cell))}
            aria-label={`Selecionar ${formatDateLabel(cell)}`}
            aria-pressed={isSelected}
            className="app-calendar-month-day__select"
          />

          <div className="app-calendar-month-day__top">
            <span className="app-calendar-month-day__number">
              {cell.getDate()}
            </span>

            {dayClasses.length > 0 ? (
              <span className="app-calendar-month-day__count">
                {dayClasses.length} {dayClasses.length === 1 ? 'aula' : 'aulas'}
              </span>
            ) : null}
          </div>

          <div className="app-calendar-month-day__content">
            {previewClasses.map((lesson) => {
              const colors = statusColors(lesson.status);
              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenClass(lesson.id, cell);
                  }}
                  className="app-calendar-month-day__preview"
                  style={{
                    borderColor: colors.border,
                    background: colors.bg,
                  }}
                >
                  <p className="app-calendar-month-day__preview-time" style={{ color: colors.accent }}>
                    {formatTimeLabel(lesson.scheduledStart)}
                  </p>
                  <p className="app-calendar-month-day__preview-title">
                    {lesson.title}
                  </p>
                </button>
              );
            })}

            {dayClasses.length === 0 ? (
              <span className="app-calendar-month-day__empty">
                Sem aulas
              </span>
            ) : null}

            {remainingCount > 0 ? (
              <span className="app-calendar-month-day__more">
                +{remainingCount} {remainingCount === 1 ? 'aula' : 'aulas'}
              </span>
            ) : null}
          </div>
        </div>
      );
    })}
  </div>
  );
});

const CompactMonthGrid: React.FC<Omit<MonthGridProps, 'onOpenClass'>> = React.memo(function CompactMonthGrid({
  monthCells,
  classesByDay,
  selectedDay,
  today,
  onSelectDay,
}) {
  return (
  <div className="app-calendar-month-grid app-calendar-month-grid--compact">
    {MONTH_WEEK_HEADER.map((day) => (
      <div key={day} className="app-calendar-month-header app-calendar-month-header--compact">
        {day}
      </div>
    ))}

    {monthCells.map((cell, index) => {
      if (!cell) {
        return <div key={`pad-${index}`} className="app-calendar-month-pad app-calendar-month-pad--compact" aria-hidden="true" />;
      }

      const key = toDateKey(cell);
      const dayClasses = classesByDay.get(key) ?? [];
      const hasClasses = dayClasses.length > 0;
      const isToday = sameCalendarDay(cell, today);
      const isSelected = sameCalendarDay(cell, selectedDay);

      return (
        <div
          key={key}
          className={`app-calendar-month-day app-calendar-month-day--compact ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`.trim()}
        >
          <button
            type="button"
            onClick={() => onSelectDay(stripDate(cell))}
            aria-label={`Selecionar ${formatDateLabel(cell)}`}
            aria-pressed={isSelected}
            className="app-calendar-month-day__select"
          />

          <div className="app-calendar-month-day__top app-calendar-month-day__top--compact">
            <span className="app-calendar-month-day__number app-calendar-month-day__number--compact">
              {cell.getDate()}
            </span>
          </div>

          <div className="app-calendar-month-day__dots" aria-hidden="true">
            {hasClasses ? <span className="app-calendar-month-day__dot app-calendar-month-day__dot--gold" /> : null}
          </div>
        </div>
      );
    })}
  </div>
  );
});

const ADULT_CLASS_TYPES = new Set(['iniciante', 'vida', 'sport', 'feminino', 'competicao', 'nogi']);
const INFANTIL_CLASS_TYPES = new Set(['kids-5-7', 'infanto-8-10', 'juvenil-11-14']);

function isClassVisibleForStudent(
  desc: string | undefined,
  belt: string,
  stripes: number,
  kidsCategory?: KidsCategory,
): boolean {
  const d = desc ?? '';

  if (kidsCategory) {
    if (kidsCategory === 'level_kids') return d === 'kids-5-7';
    if (kidsCategory === 'level_infanto_juvenil') return d === 'infanto-8-10';
    if (kidsCategory === 'level_juvenil') return d === 'juvenil-11-14';
    return false;
  }

  if (INFANTIL_CLASS_TYPES.has(d)) return false;

  if (belt === 'white' && stripes <= 1) {
    return d === 'iniciante' || !ADULT_CLASS_TYPES.has(d);
  }

  return true;
}

const CalendarView: React.FC<CalendarViewProps> = ({
  userRole,
  currentUserId,
  currentUserName,
  currentUserBelt,
  currentUserStripes,
  currentUserKidsCategory,
  professors,
  classes,
  attendanceRequests = [],
  attendances = [],
  attendanceRate,
  classNameById,
  onCreateClass,
  onEditClass,
  onDeleteClass,
  onStartClass,
  onFinishClass,
  onRefreshQr,
  academyStudents = [],
  onRegisterAttendance,
  onSubmitAttendanceRequest,
  onMarkStudentPresent,
}) => {
  const isStaff = userRole === UserRole.PROFESSOR || userRole === UserRole.SUPERADMIN;
  const today = useMemo(() => stripDate(new Date()), []);
  const [isCompactMonthGrid, setIsCompactMonthGrid] = useState(
    () => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 719px)').matches : false),
  );

  const [surfaceTab, setSurfaceTab] = useState<CalendarSurface>('calendar');
  const [view, setView] = useState<StaffFilter>('todas');
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => today);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [sheetTab, setSheetTab] = useState<'detalhes' | 'historico' | 'presencas'>('detalhes');
  const [qrByClass, setQrByClass] = useState<Record<string, QrSessionPayload>>({});
  const [qrCountdowns, setQrCountdowns] = useState<Record<string, string>>({});
  const [qrInputByClass, setQrInputByClass] = useState<Record<string, string>>({});
  const [messageByClass, setMessageByClass] = useState<Record<string, string>>({});
  const [busyByClass, setBusyByClass] = useState<Record<string, boolean>>({});
  const [finishConfirmClassId, setFinishConfirmClassId] = useState<string | null>(null);
  const [finishQrData, setFinishQrData] = useState<QrSessionPayload | null>(null);
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishCountdown, setFinishCountdown] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerClassId, setScannerClassId] = useState<string | null>(null);
  const [myRsvpByClass, setMyRsvpByClass] = useState<Record<string, boolean>>({});
  const [rsvpBusyByClass, setRsvpBusyByClass] = useState<Record<string, boolean>>({});
  const [feedbackToast, setFeedbackToast] = useState<FeedbackToast | null>(null);
  const [classAttendances, setClassAttendances] = useState<Array<FirestoreEntity<AttendanceRecord>>>([]);

  const tokenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSheetTab('detalhes');
  }, [selectedClassId]);

  useEffect(() => {
    const selectedClass = classes.find((c) => c.id === selectedClassId);
    if (!selectedClassId || !isStaff || !selectedClass) {
      setClassAttendances([]);
      return undefined;
    }
    return subscribeToClassAttendances(selectedClassId, selectedClass.academyId, setClassAttendances);
  }, [selectedClassId, isStaff, classes]);

  useEffect(() => {
    if (!selectedClassId) {
      setEditModalOpen(false);
      setDeleteModalOpen(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (!feedbackToast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setFeedbackToast(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [feedbackToast]);

  useEffect(() => {
    if (!selectedClassId || isStaff) {
      return;
    }

    const classEntry = classes.find((entry) => entry.id === selectedClassId);
    if (!classEntry || classEntry.status !== 'scheduled') {
      return;
    }

    void getMyClassRsvp(selectedClassId, currentUserId).then((rsvped) => {
      setMyRsvpByClass((current) => ({ ...current, [selectedClassId]: rsvped }));
    });
  }, [selectedClassId, classes, isStaff, currentUserId]);

  useEffect(() => {
    if (isStaff) {
      return;
    }

    classes.filter((entry) => entry.status === 'scheduled').forEach((cls) => {
      void getMyClassRsvp(cls.id, currentUserId).then((rsvped) => {
        setMyRsvpByClass((current) => ({ ...current, [cls.id]: rsvped }));
      });
    });
  }, [classes, currentUserId, isStaff]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(max-width: 719px)');
    const syncCompactLayout = () => setIsCompactMonthGrid(mediaQuery.matches);
    syncCompactLayout();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncCompactLayout);
      return () => mediaQuery.removeEventListener('change', syncCompactLayout);
    }

    mediaQuery.addListener(syncCompactLayout);
    return () => mediaQuery.removeListener(syncCompactLayout);
  }, []);

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

  useEffect(() => {
    if (!finishQrData) {
      setFinishCountdown('');
      return;
    }

    const id = setInterval(() => {
      const remaining = new Date(finishQrData.expiresAt).getTime() - Date.now();
      if (remaining <= 0 && finishConfirmClassId) {
        void onRefreshQr(finishConfirmClassId).then((fresh) => setFinishQrData(fresh)).catch(() => {});
      }
      setFinishCountdown(fmtCountdown(remaining));
    }, 1000);

    return () => clearInterval(id);
  }, [finishQrData, finishConfirmClassId, onRefreshQr]);

  useEffect(() => {
    if (!scannerOpen || !scannerClassId) {
      return;
    }

    let stopped = false;
    let scanner: { stop: () => Promise<void> } | null = null;

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (stopped) {
        return;
      }

      const nextScanner = new Html5Qrcode('qr-reader');
      scanner = nextScanner;

      nextScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          let token = decoded.trim();
          try {
            const url = new URL(decoded);
            const urlToken = url.searchParams.get('checkin');
            if (urlToken) {
              token = urlToken;
            } else {
              const parsed = JSON.parse(decoded) as { token?: string };
              if (parsed.token) {
                token = parsed.token;
              }
            }
          } catch {
            try {
              const parsed = JSON.parse(decoded) as { token?: string };
              if (parsed.token) {
                token = parsed.token;
              }
            } catch {
              // raw token
            }
          }

          setScannerOpen(false);
          void runClassAction(scannerClassId, () => onRegisterAttendance(scannerClassId, token));
        },
        () => {},
      ).catch((error: unknown) => {
        setMessageByClass((current) => ({
          ...current,
          [scannerClassId]: `Camera: ${error instanceof Error ? error.message : 'Acesso negado'}`,
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
  }, [scannerOpen, scannerClassId, onRegisterAttendance]);

  const filteredClasses = useMemo(
    () =>
      [...classes]
        .filter((entry) => {
          if (view === 'minhas' && isStaff) {
            return entry.professorId === currentUserId;
          }
          if (userRole === UserRole.ALUNO) {
            return isClassVisibleForStudent(
              entry.description,
              currentUserBelt ?? 'white',
              currentUserStripes ?? 0,
              currentUserKidsCategory,
            );
          }
          return true;
        })
        .sort(sortClasses),
    [classes, currentUserId, currentUserBelt, currentUserKidsCategory, currentUserStripes, isStaff, userRole, view],
  );

  const classesByDay = useMemo(() => {
    const grouped = new Map<string, Array<FirestoreEntity<ClassRecord>>>();

    filteredClasses.forEach((entry) => {
      const start = entry.scheduledStart?.toDate();
      if (!start) {
        return;
      }

      const key = toDateKey(start);
      const existing = grouped.get(key) ?? [];
      existing.push(entry);
      grouped.set(key, existing);
    });

    return grouped;
  }, [filteredClasses]);

  useEffect(() => {
    if (!selectedClassId) {
      return;
    }

    if (!filteredClasses.some((entry) => entry.id === selectedClassId)) {
      setSelectedClassId(null);
    }
  }, [filteredClasses, selectedClassId]);

  const monthCells = useMemo(
    () => buildMonthGrid(visibleMonth.getFullYear(), visibleMonth.getMonth()),
    [visibleMonth],
  );

  const selectedDayClasses = useMemo(
    () => classesByDay.get(toDateKey(selectedDay)) ?? [],
    [classesByDay, selectedDay],
  );

  const todayClasses = useMemo(
    () => classesByDay.get(toDateKey(today)) ?? [],
    [classesByDay, today],
  );

  const visibleMonthClassCount = useMemo(
    () => filteredClasses.filter((entry) => {
      const start = entry.scheduledStart?.toDate();
      return !!start && sameCalendarMonth(start, visibleMonth);
    }).length,
    [filteredClasses, visibleMonth],
  );

  const selectedDayLabel = useMemo(() => capitalize(longDayFormatter.format(selectedDay)), [selectedDay]);
  const todayLabel = useMemo(() => capitalize(longDayFormatter.format(today)), [today]);
  const selectedDaySummaryLabel = useMemo(
    () => `${selectedDayClasses.length} ${selectedDayClasses.length === 1 ? 'aula' : 'aulas'} em ${formatDateLabel(selectedDay)}`,
    [selectedDay, selectedDayClasses.length],
  );

  const selectedClass = selectedClassId ? classes.find((entry) => entry.id === selectedClassId) ?? null : null;
  const canManageSelected = isStaff
    && selectedClass
    && (userRole === UserRole.PROFESSOR || userRole === UserRole.SUPERADMIN || selectedClass.professorId === currentUserId);
  const canDeleteSelected = !!selectedClass && (selectedClass.status === 'scheduled' || !!selectedClass.recurrenceSeriesId);
  const pendingRequest = selectedClass
    ? attendanceRequests.find((entry) => entry.classId === selectedClass.id && entry.status === 'pending')
    : null;
  const qrData = selectedClassId ? qrByClass[selectedClassId] : null;
  const qrCountdown = selectedClassId ? qrCountdowns[selectedClassId] ?? '' : '';
  const busy = selectedClassId ? !!busyByClass[selectedClassId] : false;
  const message = selectedClassId ? messageByClass[selectedClassId] : '';
  const myAttendances = useMemo(
    () =>
      [...attendances]
        .filter((entry) => entry.userId === currentUserId)
        .sort((left, right) => (right.checkedInAt?.toDate().getTime() ?? 0) - (left.checkedInAt?.toDate().getTime() ?? 0)),
    [attendances, currentUserId],
  );

  const isMineView = isStaff && view === 'minhas';
  const selectedDayEmptyMessage = isMineView
    ? 'Voce nao tem aulas programadas nesta data.'
    : 'Nenhuma aula programada para esta data.';
  const todayEmptyMessage = isMineView
    ? 'Voce nao tem aulas programadas para hoje.'
    : 'Nenhuma aula programada para hoje.';

  async function runClassAction(classId: string, action: () => Promise<void | QrSessionPayload>) {
    setBusyByClass((current) => ({ ...current, [classId]: true }));
    setMessageByClass((current) => ({ ...current, [classId]: '' }));
    try {
      const result = await action();
      if (result && 'qrToken' in result) {
        setQrByClass((current) => ({ ...current, [classId]: result }));
        setMessageByClass((current) => ({ ...current, [classId]: 'QR atualizado.' }));
      } else {
        setMessageByClass((current) => ({ ...current, [classId]: 'Operacao concluida.' }));
      }
    } catch (error) {
      setMessageByClass((current) => ({
        ...current,
        [classId]: error instanceof Error ? error.message : 'Nao foi possivel concluir.',
      }));
    } finally {
      setBusyByClass((current) => ({ ...current, [classId]: false }));
    }
  }

  async function handleStartFinishFlow(classId: string) {
    setFinishBusy(true);
    setMessageByClass((current) => ({ ...current, [classId]: '' }));
    try {
      const freshQr = await onRefreshQr(classId);
      setFinishQrData(freshQr);
      setFinishConfirmClassId(classId);
    } catch (error) {
      setMessageByClass((current) => ({
        ...current,
        [classId]: error instanceof Error ? error.message : 'Erro ao gerar QR',
      }));
    } finally {
      setFinishBusy(false);
    }
  }

  async function handleToggleRsvp(classId: string) {
    setRsvpBusyByClass((current) => ({ ...current, [classId]: true }));
    setMessageByClass((current) => ({ ...current, [classId]: '' }));
    try {
      const result = await backendFunctions.toggleClassRsvp({ classId });
      setMyRsvpByClass((current) => ({ ...current, [classId]: result.rsvped }));
    } catch (error) {
      setMessageByClass((current) => ({
        ...current,
        [classId]: error instanceof Error ? error.message : 'Erro ao confirmar presenca.',
      }));
    } finally {
      setRsvpBusyByClass((current) => ({ ...current, [classId]: false }));
    }
  }

  async function handleMarkStudentPresent(classId: string, studentId: string) {
    const busyKey = `manual_${studentId}`;
    setBusyByClass((prev) => ({ ...prev, [busyKey]: true }));
    try {
      await onMarkStudentPresent?.(classId, studentId);
    } catch (error) {
      setMessageByClass((prev) => ({
        ...prev,
        [classId]: error instanceof Error ? error.message : 'Erro ao marcar presenca.',
      }));
    } finally {
      setBusyByClass((prev) => ({ ...prev, [busyKey]: false }));
    }
  }

  async function handleConfirmFinish() {
    if (!finishConfirmClassId) {
      return;
    }

    setFinishBusy(true);
    try {
      await onFinishClass(finishConfirmClassId);
      setQrByClass((current) => {
        const next = { ...current };
        delete next[finishConfirmClassId];
        return next;
      });
    } finally {
      setFinishBusy(false);
      setFinishConfirmClassId(null);
      setFinishQrData(null);
      setSelectedClassId(null);
    }
  }

  async function handleEditSubmit(payload: EditClassPayload) {
    const result = await onEditClass(payload);
    setFeedbackToast(buildEditToast(result));
    return result;
  }

  async function handleDeleteSubmit(payload: DeleteClassPayload) {
    const result = await onDeleteClass(payload);
    setFeedbackToast(buildDeleteToast(result));

    if (payload.scope === 'single' || selectedClass?.status === 'scheduled') {
      setSelectedClassId(null);
    }

    return result;
  }

  const openClassDetails = useCallback((classId: string) => {
    setSelectedClassId(classId);
  }, []);

  const selectCalendarDay = useCallback((day: Date) => {
    setSelectedDay(stripDate(day));
  }, []);

  const openClassDetailsFromGrid = useCallback((classId: string, day: Date) => {
    setSelectedDay(stripDate(day));
    setSelectedClassId(classId);
  }, []);

  const goToToday = useCallback(() => {
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(today);
  }, [today]);

  const shiftMonth = useCallback((dir: -1 | 1) => {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + dir, 1);
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    setVisibleMonth(nextMonth);
    setSelectedDay((current) => new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(current.getDate(), lastDay)));
  }, [visibleMonth]);

  return (
    <div className="view-shell">
      {feedbackToast ? (
        <div className="fixed top-24 left-4 right-4 z-[72] mx-auto max-w-lg">
          <div className="app-toast text-sm">
            <div className="font-semibold">{feedbackToast.title}</div>
            {feedbackToast.note ? <div className="mt-1 text-xs opacity-80">{feedbackToast.note}</div> : null}
          </div>
        </div>
      ) : null}

      {!isCompactMonthGrid ? (
        <section className="app-panel app-panel-pad">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="app-section-label">Agenda</p>
              <h1 className="app-section-title">Calendario de aulas</h1>
              <p className="app-section-copy mt-4">
                {surfaceTab === 'calendar'
                  ? 'Use o calendario mensal para localizar as aulas do dia e abrir a agenda logo abaixo.'
                  : 'Veja as aulas de hoje em lista, com leitura rapida e acesso direto aos detalhes.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="app-segment">
                <button
                  type="button"
                  onClick={() => setSurfaceTab('calendar')}
                  className={`app-segment__button ${surfaceTab === 'calendar' ? 'is-active' : ''}`}
                >
                  Calendario
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceTab('today')}
                  className={`app-segment__button ${surfaceTab === 'today' ? 'is-active' : ''}`}
                >
                  Hoje
                </button>
              </div>

              {isStaff ? (
                <button type="button" onClick={() => setCreateModalOpen(true)} className="app-button app-button--dark">
                  <Plus size={14} />
                  Criar aula
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {surfaceTab === 'calendar' || isCompactMonthGrid ? (
        <>
          {isCompactMonthGrid ? (
            <>
              <section className="calendar-mobile__hero">
                <div className="calendar-mobile__hero-head">
                  <div>
                    <p className="calendar-mobile__eyebrow">Mes em foco</p>
                    <h2 className="calendar-mobile__month-title">{capitalize(monthFormatter.format(visibleMonth))}</h2>
                  </div>

                  <div className="calendar-mobile__month-nav">
                    <button type="button" onClick={() => shiftMonth(-1)} className="calendar-mobile__month-button" aria-label="Mes anterior">
                      <ChevronLeft size={16} />
                    </button>
                    <button type="button" onClick={() => shiftMonth(1)} className="calendar-mobile__month-button" aria-label="Proximo mes">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <CompactMonthGrid
                  monthCells={monthCells}
                  classesByDay={classesByDay}
                  selectedDay={selectedDay}
                  today={today}
                  onSelectDay={selectCalendarDay}
                />

                <p className="calendar-mobile__month-summary">{selectedDaySummaryLabel}</p>
              </section>

              <section className="calendar-mobile__day-section">
                <div className="calendar-mobile__day-head">
                  <div>
                    <p className="calendar-mobile__day-label">Aulas do dia</p>
                    <p className="calendar-mobile__day-title">{selectedDayLabel}</p>
                  </div>

                  {isStaff ? (
                    <button type="button" onClick={() => setCreateModalOpen(true)} className="app-button app-button--gold calendar-mobile__create-button">
                      <Plus size={14} />
                      Criar aula
                    </button>
                  ) : null}
                </div>

                <div className="calendar-mobile__day-list">
                  {selectedDayClasses.length > 0 ? (
                    selectedDayClasses.map((lesson) => (
                      <ClassListItem key={lesson.id} lesson={lesson} onOpen={openClassDetails} compact isConfirmed={!!myRsvpByClass[lesson.id]} />
                    ))
                  ) : (
                    <div className="calendar-mobile__empty">{selectedDayEmptyMessage}</div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="app-panel app-panel-pad">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="app-section-label">Mes em foco</p>
                    <h2 className="text-2xl font-bold capitalize">{capitalize(monthFormatter.format(visibleMonth))}</h2>
                    <p className="mt-3 text-sm text-[color:var(--text-muted)]">
                      Toque em um dia para listar as aulas abaixo. O filtro atual vale para o calendario inteiro.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => shiftMonth(-1)} className="app-button app-button--ghost app-button--icon">
                      <ChevronLeft size={16} />
                    </button>
                    <button type="button" onClick={() => shiftMonth(1)} className="app-button app-button--ghost app-button--icon">
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" onClick={goToToday} className="app-button app-button--ghost">
                      Hoje
                    </button>
                    <span className={visibleMonthClassCount > 0 ? 'app-badge app-badge--gold' : 'app-badge app-badge--muted'}>
                      {visibleMonthClassCount} {visibleMonthClassCount === 1 ? 'aula no mes' : 'aulas no mes'}
                    </span>
                  </div>
                </div>

                <div className="mt-6">
                  <DesktopMonthGrid
                    monthCells={monthCells}
                    classesByDay={classesByDay}
                    selectedDay={selectedDay}
                    today={today}
                    onSelectDay={selectCalendarDay}
                    onOpenClass={openClassDetailsFromGrid}
                  />
                </div>
              </section>

              <section className="app-panel app-panel-pad">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="app-section-label">{sameCalendarDay(selectedDay, today) ? 'Agenda de hoje' : 'Dia selecionado'}</p>
                    <h2 className="text-2xl font-bold" style={{ textTransform: 'capitalize' }}>{selectedDayLabel}</h2>
                    <p className="app-section-copy mt-4">
                      {selectedDayClasses.length > 0
                        ? 'Selecione uma aula para abrir detalhes, presenca e QR.'
                        : selectedDayEmptyMessage}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={selectedDayClasses.length > 0 ? 'app-badge app-badge--gold' : 'app-badge app-badge--muted'}>
                      {selectedDayClasses.length} {selectedDayClasses.length === 1 ? 'aula' : 'aulas'}
                    </span>
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
                  </div>
                </div>

                <div className="mt-6 app-list">
                  {selectedDayClasses.length > 0 ? (
                    selectedDayClasses.map((lesson) => (
                      <ClassListItem key={lesson.id} lesson={lesson} onOpen={openClassDetails} isConfirmed={!!myRsvpByClass[lesson.id]} />
                    ))
                  ) : (
                    <div className="app-empty">{selectedDayEmptyMessage}</div>
                  )}
                </div>
              </section>
            </>
          )}
        </>
      ) : (
        <section className="app-panel app-panel-pad">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="app-section-label">Aulas de hoje</p>
              <h2 className="text-2xl font-bold" style={{ textTransform: 'capitalize' }}>{todayLabel}</h2>
              <p className="app-section-copy mt-4">
                Visualizacao em lista para acompanhar rapidamente as aulas do dia sem usar o formato de calendario.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={todayClasses.length > 0 ? 'app-badge app-badge--gold' : 'app-badge app-badge--muted'}>
                {todayClasses.length} {todayClasses.length === 1 ? 'aula hoje' : 'aulas hoje'}
              </span>
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
            </div>
          </div>

          <div className="mt-6 app-list">
            {todayClasses.length > 0 ? (
              todayClasses.map((lesson) => (
                <ClassListItem key={lesson.id} lesson={lesson} onOpen={openClassDetails} isConfirmed={!!myRsvpByClass[lesson.id]} />
              ))
            ) : (
              <div className="app-empty">{todayEmptyMessage}</div>
            )}
          </div>
        </section>
      )}

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
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <ClassSessionCard lesson={selectedClass} showDate />

              {/* Aluno: ação principal visível imediatamente, sem scroll */}
              {!canManageSelected ? (
                <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {message ? <div className="app-list-card text-sm text-[color:var(--text-muted)]">{message}</div> : null}

                  {selectedClass.status === 'scheduled' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleToggleRsvp(selectedClass.id)}
                        disabled={rsvpBusyByClass[selectedClass.id]}
                        className={`app-button app-button--block ${myRsvpByClass[selectedClass.id] ? 'app-button--ghost' : 'app-button--gold'}`}
                      >
                        <CheckCircle size={14} />
                        {rsvpBusyByClass[selectedClass.id] ? 'Aguarde...' : myRsvpByClass[selectedClass.id] ? 'Cancelar confirmacao' : 'Confirmar presenca'}
                      </button>
                    </>
                  ) : (
                    <>
                      {attendanceRate !== undefined ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span className="app-badge app-badge--gold">{attendanceRate}% frequencia</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>no mes atual</span>
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          ref={tokenInputRef}
                          type="text"
                          value={qrInputByClass[selectedClass.id] || ''}
                          onChange={(event) =>
                            setQrInputByClass((current) => ({ ...current, [selectedClass.id]: event.target.value }))
                          }
                          placeholder={selectedClass.status === 'active' ? 'Cole aqui o token do QR' : 'A aula precisa estar ativa'}
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
                          title="Escanear QR com camera"
                          style={{ width: 42, height: 42, flexShrink: 0 }}
                        >
                          <Camera size={16} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void runClassAction(selectedClass.id, () => onRegisterAttendance(selectedClass.id, qrInputByClass[selectedClass.id]))
                        }
                        disabled={selectedClass.status !== 'active' || busy}
                        className="app-button app-button--gold app-button--block"
                      >
                        <ShieldCheck size={14} />
                        {busy ? 'Registrando...' : 'Registrar presenca'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runClassAction(selectedClass.id, () => onSubmitAttendanceRequest(selectedClass.id))}
                        disabled={selectedClass.status !== 'active' || busy || !!pendingRequest}
                        className="app-button app-button--ghost app-button--block"
                      >
                        <CheckCircle size={14} />
                        {pendingRequest ? 'Solicitacao pendente' : 'Solicitar presenca'}
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              {/* Staff: tabs Detalhes / Histórico */}
              {canManageSelected ? (
                <>
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
                        Historico ({myAttendances.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetTab('presencas')}
                        className={`app-segment__button ${sheetTab === 'presencas' ? 'is-active' : ''}`}
                      >
                        Presencas ({classAttendances.length})
                      </button>
                    </div>
                  </div>

                  {sheetTab === 'presencas' ? (
                    <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
                        Alunos
                      </p>
                      {academyStudents.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                          Nenhum aluno cadastrado
                        </div>
                      ) : (
                        academyStudents.map((student) => {
                          const record = classAttendances.find((a) => a.userId === student.id);
                          const markBusy = !!busyByClass[`manual_${student.id}`];
                          return (
                            <div key={student.id} className="app-list-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              {record ? (
                                <CheckCircle size={16} style={{ color: methodColor(record.checkInMethod), flexShrink: 0 }} />
                              ) : (
                                <span style={{ width: 16, height: 16, border: '2px solid var(--border)', borderRadius: 4, flexShrink: 0, display: 'inline-block' }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {student.displayName}
                                </p>
                                {record ? (
                                  <p style={{ fontSize: '0.72rem', color: 'var(--text-soft)', marginTop: 2 }}>
                                    {record.checkedInAt ? formatTimeLabel(record.checkedInAt) : '-'}
                                  </p>
                                ) : null}
                              </div>
                              {record ? (
                                <span className={methodBadgeClass(record.checkInMethod)} style={{ flexShrink: 0, fontSize: '0.65rem' }}>
                                  {methodLabel(record.checkInMethod)}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={markBusy || selectedClass.status === 'cancelled'}
                                  onClick={() => void handleMarkStudentPresent(selectedClass.id, student.id)}
                                  className="app-button app-button--ghost app-button--small"
                                  style={{ fontSize: '0.7rem', padding: '4px 10px', flexShrink: 0 }}
                                >
                                  {markBusy ? '...' : 'Marcar presente'}
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : sheetTab === 'detalhes' ? (
                    <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {qrData ? (
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
                          <div
                            style={{
                              background: '#fff',
                              padding: 12,
                              borderRadius: 14,
                              marginTop: 12,
                              display: 'flex',
                              justifyContent: 'center',
                            }}
                          >
                            <QRCodeSVG
                              value={`${window.location.origin}?checkin=${encodeURIComponent(qrData.qrToken)}&classId=${encodeURIComponent(qrData.classId)}`}
                              size={200}
                              level="M"
                            />
                          </div>
                          <p className="mt-2 text-center text-xs text-[color:var(--text-soft)]">
                            {qrCountdown && qrCountdown !== '00:00' ? `Expira em ${qrCountdown}` : 'QR expirado - gere um novo'}
                          </p>
                        </div>
                      ) : null}

                    </div>
                  ) : (
                    <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
                        Ultimas presencas
                      </p>
                      {myAttendances.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                          Nenhuma presenca registrada ainda
                        </div>
                      ) : (
                        myAttendances.slice(0, 30).map((attendance) => (
                          <div key={attendance.id} className="app-list-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <CheckCircle size={16} style={{ color: methodColor(attendance.checkInMethod), flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {classNameById?.get(attendance.classId) ?? 'Aula'}
                              </p>
                              <p style={{ fontSize: '0.72rem', color: 'var(--text-soft)', marginTop: 2 }}>
                                {attendance.checkedInAt ? `${formatDateLabel(attendance.checkedInAt)} - ${formatTimeLabel(attendance.checkedInAt)}` : '-'}
                              </p>
                            </div>
                            <span className={methodBadgeClass(attendance.checkInMethod)} style={{ flexShrink: 0, fontSize: '0.65rem' }}>
                              {methodLabel(attendance.checkInMethod)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* Aluno: histórico abaixo da ação principal */
                <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="app-stat-card" style={{ padding: '12px 14px' }}>
                      <p className="app-stat-card__label">Frequencia</p>
                      <p className="app-stat-card__value" style={{ fontSize: '1.4rem' }}>{attendanceRate ?? 0}%</p>
                      <p className="app-stat-card__note">no mes atual</p>
                    </div>
                    <div className="app-stat-card" style={{ padding: '12px 14px' }}>
                      <p className="app-stat-card__label">Presencas</p>
                      <p className="app-stat-card__value" style={{ fontSize: '1.4rem' }}>{myAttendances.length}</p>
                      <p className="app-stat-card__note">confirmadas</p>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
                    Ultimas presencas
                  </p>

                  {myAttendances.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                      Nenhuma presenca registrada ainda
                    </div>
                  ) : (
                    myAttendances.slice(0, 30).map((attendance) => (
                      <div key={attendance.id} className="app-list-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <CheckCircle size={16} style={{ color: methodColor(attendance.checkInMethod), flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {classNameById?.get(attendance.classId) ?? 'Aula'}
                          </p>
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-soft)', marginTop: 2 }}>
                            {attendance.checkedInAt ? `${formatDateLabel(attendance.checkedInAt)} - ${formatTimeLabel(attendance.checkedInAt)}` : '-'}
                          </p>
                        </div>
                        <span className={methodBadgeClass(attendance.checkInMethod)} style={{ flexShrink: 0, fontSize: '0.65rem' }}>
                          {methodLabel(attendance.checkInMethod)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                flexShrink: 0,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                padding: '12px 20px',
                paddingBottom: 'calc(env(safe-area-inset-bottom, 8px) + 12px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {canManageSelected ? (
                <>
                  {message ? <div className="app-list-card text-sm text-[color:var(--text-muted)]">{message}</div> : null}
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => setSelectedClassId(null)} className="app-button app-button--ghost app-button--small">
                      <X size={14} />
                      Fechar
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditModalOpen(true)}
                      disabled={busy}
                      className="app-button app-button--ghost app-button--small"
                    >
                      <Pencil size={14} />
                      Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteModalOpen(true)}
                      disabled={busy || !canDeleteSelected}
                      className="app-button app-button--ghost app-button--small"
                    >
                      <Trash2 size={14} />
                      Excluir
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
                </>
              ) : (
                <button type="button" onClick={() => setSelectedClassId(null)} className="app-button app-button--ghost app-button--block">
                  <X size={14} />
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
              Mostre este QR para quem ainda nao confirmou presenca
            </p>
            <div style={{ background: '#fff', padding: 14, borderRadius: 16 }}>
              <QRCodeSVG
                value={`${window.location.origin}?checkin=${encodeURIComponent(finishQrData.qrToken)}&classId=${encodeURIComponent(finishQrData.classId)}`}
                size={220}
                level="M"
              />
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-soft)' }}>
              {finishCountdown && finishCountdown !== '00:00' ? `Expira em ${finishCountdown}` : 'Renovando QR...'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <button type="button" onClick={() => void handleConfirmFinish()} disabled={finishBusy} className="app-button app-button--gold app-button--block">
                <CheckCircle size={14} />
                {finishBusy ? 'Encerrando...' : 'Confirmar encerramento'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFinishConfirmClassId(null);
                  setFinishQrData(null);
                }}
                disabled={finishBusy}
                className="app-button app-button--ghost app-button--block"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setScannerOpen(false)}
              className="app-button app-button--ghost app-button--icon"
              style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <X size={18} />
            </button>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>Aponte para o QR da aula</span>
          </div>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div id="qr-reader" style={{ width: '100%', height: '100%' }} />

            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div style={{ position: 'relative', width: 240, height: 240 }}>
                {[
                  { top: 0, left: 0, borderTop: '3px solid var(--gold-mid)', borderLeft: '3px solid var(--gold-mid)', borderRadius: '6px 0 0 0' },
                  { top: 0, right: 0, borderTop: '3px solid var(--gold-mid)', borderRight: '3px solid var(--gold-mid)', borderRadius: '0 6px 0 0' },
                  { bottom: 0, left: 0, borderBottom: '3px solid var(--gold-mid)', borderLeft: '3px solid var(--gold-mid)', borderRadius: '0 0 0 6px' },
                  { bottom: 0, right: 0, borderBottom: '3px solid var(--gold-mid)', borderRight: '3px solid var(--gold-mid)', borderRadius: '0 0 6px 0' },
                ].map((style, index) => (
                  <div key={index} style={{ position: 'absolute', width: 28, height: 28, ...style }} />
                ))}
              </div>
            </div>
          </div>

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

      {editModalOpen && selectedClass ? (
        <EditClassModal
          lesson={selectedClass}
          professors={professors}
          onClose={() => setEditModalOpen(false)}
          onSubmit={async (payload) => {
            const result = await handleEditSubmit(payload);
            setEditModalOpen(false);
            return result;
          }}
        />
      ) : null}

      {deleteModalOpen && selectedClass ? (
        <DeleteClassModal
          lesson={selectedClass}
          onClose={() => setDeleteModalOpen(false)}
          onSubmit={async (payload) => {
            const result = await handleDeleteSubmit(payload);
            setDeleteModalOpen(false);
            return result;
          }}
        />
      ) : null}

      {createModalOpen ? (
        <CreateClassModal
          professors={professors}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          selectedDay={surfaceTab === 'today' ? today : selectedDay}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={onCreateClass}
        />
      ) : null}
    </div>
  );
};

export default CalendarView;
