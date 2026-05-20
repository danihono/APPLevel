import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle, ChevronLeft, ChevronRight, MapPin, Pencil, Play, Plus, QrCode, RefreshCw, ShieldCheck, StopCircle, Trash2, UserCheck, Users, X } from 'lucide-react';
import QRCodeSVG from 'react-qr-code';
import { buildMonthGrid, MONTH_WEEK_HEADER, sameCalendarDay, sameCalendarMonth, stripDate, toDateKey } from '../calendarUtils';
import ClassSessionCard from '../components/ClassSessionCard';
import CreateClassModal, { type CreateClassPayload } from '../components/CreateClassModal';
import DeleteClassModal, { type DeleteClassPayload } from '../components/DeleteClassModal';
import EditClassModal, { type EditClassPayload } from '../components/EditClassModal';
import { inferTrainingTypeFromBirthDate } from '../beltCatalog';
import { getMyClassRsvp, subscribeToClassAttendances, subscribeToClassRsvps, type FirestoreEntity } from '../services/firebase/data';
import {
  backendFunctions,
  type ClassScheduleMutationSkippedItem,
  type CreateClassScheduleBatchResult,
  type DeleteClassScheduleResult,
  type UpdateRecurringClassSeriesResult,
} from '../services/firebase/functions';
import type { AttendanceRecord, AttendanceRequestRecord, ClassRecord, ClassRsvpRecord, UserRecord } from '../services/firebase/models';
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
  isSuperAdmin?: boolean;
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
  onRemoveStudentPresent?: (classId: string, targetUserId: string) => Promise<void>;
  onOpenStudent?: (studentId: string) => void;
}

type CalendarSurface = 'calendar' | 'today' | 'unfinished';
type StaffFilter = 'minhas' | 'todas';
type PresencaStudentTypeFilter = 'all' | 'kids' | 'adult';
type FeedbackToast = {
  title: string;
  note?: string;
};

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const longDayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

const CLASS_TYPE_LABELS: Record<string, string> = {
  'iniciante': 'Iniciante',
  'vida': 'Vida',
  'sport': 'Sport',
  'feminino': 'Feminino',
  'competicao': 'Competição',
  'nogi': 'No-Gi',
  'kids-01': 'Kids 1',
  'kids-02': 'Kids 2',
  'kids-03': 'Kids 3',
};

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
  const extra = skipped.length > 1 ? ` Mais ${skipped.length - 1} ocorrência${skipped.length - 1 === 1 ? '' : 's'}.` : '';
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
    return { title: 'Aula excluída.' };
  }

  if (result.deletedCount === 0) {
    return {
      title: 'Nenhuma aula foi excluída.',
      note: buildSkippedNote(result.skipped),
    };
  }

  return {
    title: `${result.deletedCount} ${result.deletedCount === 1 ? 'aula excluída' : 'aulas excluídas'}.`,
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

type DisplayClassStatus = ClassRecord['status'] | 'unfinished';

function effectiveClassStatus(lesson: FirestoreEntity<ClassRecord>, nowMs: number): DisplayClassStatus {
  if (lesson.status === 'scheduled' || lesson.status === 'active') {
    const deadline = lesson.scheduledEnd ?? lesson.scheduledStart;
    if (deadline && deadline.toDate().getTime() < nowMs) {
      return 'unfinished';
    }
  }
  return lesson.status;
}

function statusColors(status: DisplayClassStatus) {
  switch (status) {
    case 'active':
      return { bg: 'rgba(74,222,128,0.13)', border: 'rgba(74,222,128,0.5)', accent: '#4ade80' };
    case 'finished':
      return { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', accent: 'var(--text-soft)' };
    case 'cancelled':
      return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.35)', accent: '#ef4444' };
    case 'unfinished':
      return { bg: 'rgba(234,120,30,0.13)', border: 'rgba(234,120,30,0.45)', accent: 'rgba(234,120,30,0.95)' };
    default:
      return { bg: 'rgba(232,175,72,0.13)', border: 'rgba(232,175,72,0.45)', accent: 'var(--gold-mid)' };
  }
}

function statusLabel(status: DisplayClassStatus) {
  switch (status) {
    case 'active':
      return 'Ativa';
    case 'finished':
      return 'Concluída';
    case 'cancelled':
      return 'Cancelada';
    case 'unfinished':
      return 'Não finalizada';
    default:
      return 'Agendada';
  }
}

function statusBadgeClass(status: DisplayClassStatus) {
  switch (status) {
    case 'active':
      return 'app-badge app-badge--success';
    case 'finished':
      return 'app-badge app-badge--muted';
    case 'cancelled':
      return 'app-badge app-badge--danger';
    case 'unfinished':
      return 'app-badge app-badge--belt-alert';
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
  nowMs: number;
  compact?: boolean;
  isConfirmed?: boolean;
}

const ClassListItem: React.FC<ClassListItemProps> = ({ lesson, onOpen, nowMs, compact = false, isConfirmed = false }) => {
  const displayStatus = effectiveClassStatus(lesson, nowMs);
  const colors = statusColors(displayStatus);

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onOpen(lesson.id)}
        className="calendar-mobile__class-card"
      >
        <span
          className="calendar-mobile__class-accent"
          style={{ backgroundColor: displayStatus === 'scheduled' ? 'var(--gold-mid)' : colors.accent }}
          aria-hidden="true"
        />

        <div className="calendar-mobile__class-copy">
          <p className="calendar-mobile__class-title">{lesson.title}</p>
          <p className="calendar-mobile__class-time">{formatTimeLabel(lesson.scheduledStart)}</p>
        </div>

        {isConfirmed ? (
          <span className="app-badge app-badge--success" style={{ flexShrink: 0, fontSize: '0.65rem' }}>Vou</span>
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
              <span className={statusBadgeClass(displayStatus)}>{statusLabel(displayStatus)}</span>
              {isConfirmed ? (
                <span className="app-badge app-badge--success" style={{ fontSize: '0.65rem' }}>Vou</span>
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
        <span>{lesson.professorName || 'Equipe técnica'}</span>
        <span className="inline-flex items-center gap-2"><MapPin size={14} />{lesson.tatame || 'Tatame principal'}</span>
      </div>
    </button>
  );
};

interface DayOverflowModalProps {
  date: Date;
  dayClasses: Array<FirestoreEntity<ClassRecord>>;
  onOpenClass: (classId: string, day: Date) => void;
  onClose: () => void;
  nowMs: number;
}

const DayOverflowModal: React.FC<DayOverflowModalProps> = ({ date, dayClasses, onOpenClass, onClose, nowMs }) => {
  const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const title = `${DAYS[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]}`;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="app-panel app-panel-pad app-sheet-modal w-full max-w-lg rounded-b-none sm:rounded-[1.8rem]"
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
          <div>
            <p style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
              Aulas do dia
            </p>
            <p style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 2 }}>{title}</p>
          </div>
          <button type="button" onClick={onClose} className="app-icon-btn" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
          {dayClasses.map(lesson => {
            const displayStatus = effectiveClassStatus(lesson, nowMs);
            const colors = statusColors(displayStatus);
            return (
              <button
                key={lesson.id}
                type="button"
                onClick={() => { onOpenClass(lesson.id, date); onClose(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '0.75rem 1rem',
                  borderRadius: 12,
                  border: `1px solid ${colors.border}`,
                  background: colors.bg,
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span style={{ width: 3, minHeight: 36, borderRadius: 2, background: colors.accent, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: colors.accent }}>
                    {formatTimeLabel(lesson.scheduledStart)}
                  </p>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lesson.title}
                  </p>
                  {lesson.professorName ? (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-soft)', marginTop: 2 }}>
                      {lesson.professorName}
                    </p>
                  ) : null}
                </div>
                <span className={statusBadgeClass(displayStatus)} style={{ flexShrink: 0, fontSize: '0.65rem' }}>
                  {statusLabel(displayStatus)}
                </span>
                <ChevronRight size={16} style={{ color: 'var(--text-soft)', flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface MonthGridProps {
  monthCells: Array<Date | null>;
  classesByDay: Map<string, Array<FirestoreEntity<ClassRecord>>>;
  selectedDay: Date;
  today: Date;
  onSelectDay: (day: Date) => void;
  onOpenClass: (classId: string, day: Date) => void;
  nowMs: number;
  attendedDays?: Set<string>;
}

const DesktopMonthGrid: React.FC<MonthGridProps> = React.memo(function DesktopMonthGrid({
  monthCells,
  classesByDay,
  selectedDay,
  today,
  onSelectDay,
  onOpenClass,
  nowMs,
}) {
  const [overflowDay, setOverflowDay] = useState<{ date: Date; classes: Array<FirestoreEntity<ClassRecord>> } | null>(null);

  return (
  <>
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
              const colors = statusColors(effectiveClassStatus(lesson, nowMs));
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
              <button
                type="button"
                className="app-calendar-month-day__more"
                onClick={e => {
                  e.stopPropagation();
                  setOverflowDay({ date: cell, classes: dayClasses });
                }}
              >
                +{remainingCount} {remainingCount === 1 ? 'aula' : 'aulas'}
              </button>
            ) : null}
          </div>
        </div>
      );
    })}
  </div>

  {overflowDay && (
    <DayOverflowModal
      date={overflowDay.date}
      dayClasses={overflowDay.classes}
      onOpenClass={(id, day) => { onOpenClass(id, day); setOverflowDay(null); }}
      onClose={() => setOverflowDay(null)}
      nowMs={nowMs}
    />
  )}
  </>
  );
});

const CompactMonthGrid: React.FC<Omit<MonthGridProps, 'onOpenClass' | 'nowMs'>> = React.memo(function CompactMonthGrid({
  monthCells,
  classesByDay,
  selectedDay,
  today,
  onSelectDay,
  attendedDays,
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
        <button
          key={key}
          type="button"
          onClick={() => onSelectDay(stripDate(cell))}
          aria-label={`Selecionar ${formatDateLabel(cell)}`}
          aria-pressed={isSelected}
          className={`app-calendar-month-day app-calendar-month-day--compact ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`.trim()}
        >
          <div className="app-calendar-month-day__top app-calendar-month-day__top--compact">
            <span className="app-calendar-month-day__number app-calendar-month-day__number--compact">
              {cell.getDate()}
            </span>
          </div>

          <div className="app-calendar-month-day__dots" aria-hidden="true">
            {attendedDays?.has(key)
              ? <span className="app-calendar-month-day__dot app-calendar-month-day__dot--green" />
              : hasClasses ? <span className="app-calendar-month-day__dot app-calendar-month-day__dot--gold" /> : null}
          </div>
        </button>
      );
    })}
  </div>
  );
});

const ADULT_CLASS_TYPES = new Set(['iniciante', 'vida', 'sport', 'feminino', 'competicao', 'nogi']);
const INFANTIL_CLASS_TYPES = new Set(['kids-01', 'kids-02', 'kids-03']);

function isClassVisibleForStudent(
  desc: string | undefined,
  belt: string,
  stripes: number,
  kidsCategory?: KidsCategory,
): boolean {
  const d = desc ?? '';

  if (kidsCategory) {
    if (kidsCategory === 'level_infantil') return INFANTIL_CLASS_TYPES.has(d);
    return false;
  }

  if (INFANTIL_CLASS_TYPES.has(d)) return false;

  if (belt === 'white' && stripes <= 1) {
    return d === 'iniciante' || d === 'feminino' || !ADULT_CLASS_TYPES.has(d);
  }

  if (belt === 'white') {
    return true;
  }

  return true;
}

function isKidsStudent(student: FirestoreEntity<UserRecord>): boolean {
  if (student.birthDate) return inferTrainingTypeFromBirthDate(student.birthDate) === 'Kids';
  return !!student.kidsCategory;
}

const CalendarView: React.FC<CalendarViewProps> = ({
  userRole,
  currentUserId,
  isSuperAdmin: isSuperAdminProp,
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
  onRemoveStudentPresent,
  onOpenStudent,
}) => {
  const isStaff = userRole === UserRole.PROFESSOR || userRole === UserRole.SUPERADMIN;
  const isSuperAdmin = isSuperAdminProp ?? userRole === UserRole.SUPERADMIN;
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
  const [sheetTab, setSheetTab] = useState<'detalhes' | 'agendamento' | 'historico'>('detalhes');
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
  const [showParticipants, setShowParticipants] = useState(false);
  const [participantsList, setParticipantsList] = useState<Array<FirestoreEntity<ClassRsvpRecord>>>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<FeedbackToast | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [classAttendances, setClassAttendances] = useState<Array<FirestoreEntity<AttendanceRecord>>>([]);
  const [classRsvps, setClassRsvps] = useState<Array<FirestoreEntity<ClassRsvpRecord>>>([]);
  const [classRsvpsLoading, setClassRsvpsLoading] = useState(false);
  const [studentErrorById, setStudentErrorById] = useState<Record<string, string>>({});
  const [presencaSearch, setPresencaSearch] = useState('');
  const [presencaBeltFilter, setPresencaBeltFilter] = useState('all');
  const [presencaStudentTypeFilter, setPresencaStudentTypeFilter] = useState<PresencaStudentTypeFilter>('all');
  const [filterType, setFilterType] = useState('all');
  const [filterProfessor, setFilterProfessor] = useState('all');
  const [filterTatame, setFilterTatame] = useState('all');

  const tokenInputRef = useRef<HTMLInputElement>(null);
  const selectedClassDescription = useMemo(
    () => classes.find((entry) => entry.id === selectedClassId)?.description ?? '',
    [classes, selectedClassId],
  );

  useEffect(() => {
    setSheetTab('detalhes');
    setPresencaSearch('');
    setPresencaBeltFilter('all');
    setPresencaStudentTypeFilter(INFANTIL_CLASS_TYPES.has(selectedClassDescription) ? 'kids' : 'all');
    setStudentErrorById({});
    setShowParticipants(false);
  }, [selectedClassDescription, selectedClassId]);

  useEffect(() => {
    const selectedClass = classes.find((c) => c.id === selectedClassId);
    if (!selectedClassId || !isStaff || !selectedClass) {
      setClassAttendances([]);
      return undefined;
    }
    return subscribeToClassAttendances(
      selectedClassId,
      selectedClass.academyId,
      setClassAttendances,
      () => setClassAttendances([]),
    );
  }, [selectedClassId, isStaff, classes]);

  useEffect(() => {
    const selectedClass = classes.find((c) => c.id === selectedClassId);
    if (!selectedClassId || !isStaff || !selectedClass) {
      setClassRsvps([]);
      setClassRsvpsLoading(false);
      return undefined;
    }

    setClassRsvps([]);
    setClassRsvpsLoading(true);

    return subscribeToClassRsvps(
      selectedClassId,
      selectedClass.academyId,
      (records) => {
        setClassRsvps(records);
        setClassRsvpsLoading(false);
      },
      () => {
        setClassRsvpsLoading(false);
      },
    );
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
    const selectedClass = classes.find((c) => c.id === selectedClassId);
    if (!showParticipants || !selectedClass || selectedClass.status !== 'scheduled' || isStaff) {
      setParticipantsList([]);
      setParticipantsLoading(false);
      return undefined;
    }
    setParticipantsLoading(true);
    return subscribeToClassRsvps(
      selectedClass.id,
      selectedClass.academyId,
      (records) => {
        setParticipantsList(records);
        setParticipantsLoading(false);
      },
    );
  }, [showParticipants, selectedClassId, classes, isStaff]);

  useEffect(() => {
    if (!isStaff && surfaceTab === 'unfinished') {
      setSurfaceTab('calendar');
    }
  }, [isStaff, surfaceTab]);

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
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

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
        .filter((entry) => filterType === 'all' || (entry.description ?? '') === filterType)
        .filter((entry) => filterProfessor === 'all' || entry.professorId === filterProfessor)
        .filter((entry) => filterTatame === 'all' || entry.tatame === filterTatame)
        .sort(sortClasses),
    [classes, currentUserId, currentUserBelt, currentUserKidsCategory, currentUserStripes, isStaff, userRole, view, filterType, filterProfessor, filterTatame],
  );

  const unfinishedClasses = useMemo(
    () => {
      if (!isStaff) {
        return [];
      }

      return [...classes]
        .filter((entry) => {
          // Superadmin vê todas as aulas da academia; professor só as próprias
          if (!isSuperAdmin && entry.professorId !== currentUserId) {
            return false;
          }

          if (entry.status !== 'scheduled' && entry.status !== 'active') {
            return false;
          }

          if (filterProfessor !== 'all' && entry.professorId !== filterProfessor) {
            return false;
          }
          if (filterType !== 'all' && (entry.description ?? '') !== filterType) {
            return false;
          }
          if (filterTatame !== 'all' && entry.tatame !== filterTatame) {
            return false;
          }

          const deadline = entry.scheduledEnd ?? entry.scheduledStart;
          return !!deadline && deadline.toDate().getTime() < nowMs;
        })
        .sort(sortClasses);
    },
    [classes, currentUserId, filterProfessor, filterTatame, filterType, isStaff, isSuperAdmin, nowMs],
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

  const availableClassTypes = useMemo(() => {
    const seen = new Set<string>();
    classes.forEach((entry) => { seen.add(entry.description ?? ''); });
    return Array.from(seen).sort();
  }, [classes]);

  const availableTatames = useMemo(() => {
    const seen = new Set<string>();
    classes.forEach((entry) => { if (entry.tatame) seen.add(entry.tatame); });
    return Array.from(seen).sort();
  }, [classes]);

  const selectedDayLabel = useMemo(() => capitalize(longDayFormatter.format(selectedDay)), [selectedDay]);
  const todayLabel = useMemo(() => capitalize(longDayFormatter.format(today)), [today]);
  const selectedDaySummaryLabel = useMemo(
    () => `${selectedDayClasses.length} ${selectedDayClasses.length === 1 ? 'aula' : 'aulas'} em ${formatDateLabel(selectedDay)}`,
    [selectedDay, selectedDayClasses.length],
  );
  const surfaceCopy = surfaceTab === 'calendar'
    ? 'Use o calendário mensal para localizar as aulas do dia e abrir a agenda logo abaixo.'
    : surfaceTab === 'unfinished'
      ? 'Acompanhe as suas aulas que já passaram do horário e ainda precisam ser finalizadas.'
      : 'Veja as aulas de hoje em lista, com leitura rápida e acesso direto aos detalhes.';

  const selectedClass = selectedClassId ? classes.find((entry) => entry.id === selectedClassId) ?? null : null;
  const selectedClassRsvpCount = selectedClass
    ? classRsvpsLoading
      ? (selectedClass.rsvpCount ?? 0)
      : classRsvps.length
    : 0;
  const canManageSelected = isStaff
    && selectedClass
    && (userRole === UserRole.PROFESSOR || userRole === UserRole.SUPERADMIN || selectedClass.professorId === currentUserId);
  const canDeleteSelected = !!selectedClass && (selectedClass.status === 'scheduled' || !!selectedClass.recurrenceSeriesId);
  const selectedClassCanUseQr = !!selectedClass && (selectedClass.status === 'active' || selectedClass.status === 'scheduled');
  const pendingRequest = selectedClass
    ? attendanceRequests.find((entry) => entry.classId === selectedClass.id && entry.status === 'pending')
    : null;
  const qrData = selectedClassId ? qrByClass[selectedClassId] : null;
  const qrCountdown = selectedClassId ? qrCountdowns[selectedClassId] ?? '' : '';
  const displayQrToken = qrData?.qrToken ?? selectedClass?.activeQrToken ?? null;
  const busy = selectedClassId ? !!busyByClass[selectedClassId] : false;
  const message = selectedClassId ? messageByClass[selectedClassId] : '';
  const myAttendances = useMemo(
    () =>
      [...attendances]
        .filter((entry) => entry.userId === currentUserId)
        .sort((left, right) => (right.checkedInAt?.toDate().getTime() ?? 0) - (left.checkedInAt?.toDate().getTime() ?? 0)),
    [attendances, currentUserId],
  );

  const myAttendedDays = useMemo(() => {
    const keys = new Set<string>();
    myAttendances.forEach((entry) => {
      if (entry.checkedInAt) keys.add(toDateKey(entry.checkedInAt.toDate()));
    });
    return keys;
  }, [myAttendances]);

  const attendanceByUserId = useMemo(() => {
    const records = new Map<string, FirestoreEntity<AttendanceRecord>>();
    classAttendances.forEach((entry) => {
      records.set(entry.userId, entry);
    });
    return records;
  }, [classAttendances]);

  const rsvpByUserId = useMemo(() => {
    const records = new Map<string, FirestoreEntity<ClassRsvpRecord>>();
    classRsvps.forEach((entry) => {
      records.set(entry.userId, entry);
    });
    return records;
  }, [classRsvps]);

  const studentById = useMemo(() => {
    const records = new Map<string, FirestoreEntity<UserRecord>>();
    academyStudents.forEach((entry) => {
      records.set(entry.id, entry);
    });
    return records;
  }, [academyStudents]);

  const confirmedRoster = useMemo(() => {
    const userIds = new Set<string>();
    classRsvps.forEach((entry) => userIds.add(entry.userId));
    classAttendances.forEach((entry) => userIds.add(entry.userId));

    return Array.from(userIds)
      .map((userId) => {
        const rsvp = rsvpByUserId.get(userId);
        const attendance = attendanceByUserId.get(userId);
        const student = studentById.get(userId);
        return {
          userId,
          displayName: rsvp?.userDisplayName ?? student?.displayName ?? 'Aluno',
          record: attendance,
          sourceOrder: rsvp ? 0 : 1,
        };
      })
      .sort((left, right) =>
        left.sourceOrder - right.sourceOrder
        || left.displayName.localeCompare(right.displayName, 'pt-BR'),
      );
  }, [attendanceByUserId, classAttendances, classRsvps, rsvpByUserId, studentById]);

  const pendingPresencaStudents = useMemo(() => {
    return [...academyStudents]
      .filter((student) => !rsvpByUserId.has(student.id) && !attendanceByUserId.has(student.id))
      .sort((a, b) =>
        (a.displayName ?? '').localeCompare(b.displayName ?? '', 'pt-BR'),
      );
  }, [academyStudents, attendanceByUserId, rsvpByUserId]);

  const filteredPresencaStudents = useMemo(() => {
    let list = pendingPresencaStudents;
    if (presencaStudentTypeFilter !== 'all') {
      list = list.filter((student) => {
        const kidsStudent = isKidsStudent(student);
        return presencaStudentTypeFilter === 'kids' ? kidsStudent : !kidsStudent;
      });
    }
    if (presencaSearch.trim()) {
      const q = presencaSearch.toLowerCase().trim();
      list = list.filter((s) => s.displayName?.toLowerCase().includes(q));
    }
    if (presencaBeltFilter !== 'all') {
      list = list.filter((s) => s.belt === presencaBeltFilter);
    }
    return list;
  }, [pendingPresencaStudents, presencaBeltFilter, presencaSearch, presencaStudentTypeFilter]);

  const isMineView = isStaff && view === 'minhas';
  const selectedDayEmptyMessage = isMineView
    ? 'Você não tem aulas programadas nesta data.'
    : 'Nenhuma aula programada para esta data.';
  const todayEmptyMessage = isMineView
    ? 'Você não tem aulas programadas para hoje.'
    : 'Nenhuma aula programada para hoje.';
  const unfinishedEmptyMessage = 'Nenhuma aula não finalizada para você.';

  async function runClassAction(classId: string, action: () => Promise<void | QrSessionPayload>) {
    setBusyByClass((current) => ({ ...current, [classId]: true }));
    setMessageByClass((current) => ({ ...current, [classId]: '' }));
    try {
      const result = await action();
      if (result && 'qrToken' in result) {
        setQrByClass((current) => ({ ...current, [classId]: result }));
        setMessageByClass((current) => ({ ...current, [classId]: 'QR atualizado.' }));
      } else {
        setMessageByClass((current) => ({ ...current, [classId]: 'Operação concluída.' }));
      }
    } catch (error) {
      setMessageByClass((current) => ({
        ...current,
        [classId]: error instanceof Error ? error.message : 'Não foi possível concluir.',
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
        [classId]: error instanceof Error ? error.message : 'Erro ao confirmar ida.',
      }));
    } finally {
      setRsvpBusyByClass((current) => ({ ...current, [classId]: false }));
    }
  }

  async function handleMarkStudentPresent(classId: string, studentId: string) {
    const busyKey = `manual_${studentId}`;
    setStudentErrorById((prev) => ({ ...prev, [studentId]: '' }));
    setBusyByClass((prev) => ({ ...prev, [busyKey]: true }));
    try {
      await onMarkStudentPresent?.(classId, studentId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao marcar presença.';
      setStudentErrorById((prev) => ({ ...prev, [studentId]: msg }));
    } finally {
      setBusyByClass((prev) => ({ ...prev, [busyKey]: false }));
    }
  }

  async function handleRemoveStudentPresent(classId: string, studentId: string) {
    const busyKey = `remove_${studentId}`;
    const removedRecord = classAttendances.find((a) => a.userId === studentId);
    setStudentErrorById((prev) => ({ ...prev, [studentId]: '' }));
    setClassAttendances((prev) => prev.filter((a) => a.userId !== studentId));
    setBusyByClass((prev) => ({ ...prev, [busyKey]: true }));
    try {
      await onRemoveStudentPresent?.(classId, studentId);
    } catch (error) {
      if (removedRecord) {
        setClassAttendances((prev) => [...prev, removedRecord]);
      }
      const msg = error instanceof Error ? error.message : 'Erro ao remover presença.';
      setStudentErrorById((prev) => ({ ...prev, [studentId]: msg }));
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
      setSheetTab('agendamento');
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

  const activeFilterCount = [filterType, filterProfessor, filterTatame].filter((f) => f !== 'all').length;

  const clearFilters = () => {
    setFilterType('all');
    setFilterProfessor('all');
    setFilterTatame('all');
  };

  const renderCalendarFilters = () => (
    <div className="flex flex-wrap items-center gap-2 mt-4">
      <select
        value={filterType}
        onChange={(e) => setFilterType(e.target.value)}
        className="app-input"
        style={{ width: 'auto', minWidth: 140 }}
      >
        <option value="all">Todos os tipos</option>
        {availableClassTypes.map((type) => (
          <option key={type || '__sem_tipo'} value={type}>
            {type === '' ? 'Adulto / Geral' : (CLASS_TYPE_LABELS[type] ?? type)}
          </option>
        ))}
      </select>

      <select
        value={filterProfessor}
        onChange={(e) => setFilterProfessor(e.target.value)}
        className="app-input"
        style={{ width: 'auto', minWidth: 160 }}
      >
        <option value="all">Todos os professores</option>
        {professors.map((prof) => (
          <option key={prof.id} value={prof.id}>{prof.displayName}</option>
        ))}
      </select>

      {availableTatames.length > 0 ? (
        <select
          value={filterTatame}
          onChange={(e) => setFilterTatame(e.target.value)}
          className="app-input"
          style={{ width: 'auto', minWidth: 140 }}
        >
          <option value="all">Todos os tatames</option>
          {availableTatames.map((tatame) => (
            <option key={tatame} value={tatame}>{tatame}</option>
          ))}
        </select>
      ) : null}

      {activeFilterCount > 0 ? (
        <button type="button" onClick={clearFilters} className="app-button app-button--ghost">
          Limpar filtros
          <span className="app-badge app-badge--gold" style={{ marginLeft: 6 }}>{activeFilterCount}</span>
        </button>
      ) : null}
    </div>
  );

  const renderSurfaceTabs = (block = false) => (
    <div className={`app-segment${block ? ' app-segment--block' : ''}`}>
      <button
        type="button"
        onClick={() => setSurfaceTab('calendar')}
        className={`app-segment__button ${surfaceTab === 'calendar' ? 'is-active' : ''}`}
      >
        Calendário
      </button>
      <button
        type="button"
        onClick={() => setSurfaceTab('today')}
        className={`app-segment__button ${surfaceTab === 'today' ? 'is-active' : ''}`}
      >
        Hoje
      </button>
      {isStaff ? (
        <button
          type="button"
          onClick={() => setSurfaceTab('unfinished')}
          className={`app-segment__button ${surfaceTab === 'unfinished' ? 'is-active' : ''}`}
        >
          Não finalizadas
        </button>
      ) : null}
    </div>
  );

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
              <h1 className="app-section-title">Calendário de aulas</h1>
              <p className="app-section-copy mt-4">
                {surfaceCopy}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {renderSurfaceTabs()}

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

      {isCompactMonthGrid ? (
        <section className="calendar-mobile__surface-tabs">
          {renderSurfaceTabs(true)}
        </section>
      ) : null}

      {surfaceTab === 'calendar' ? (
        <>
          {isCompactMonthGrid ? (
            <>
              <section className="calendar-mobile__hero">
                <div className="calendar-mobile__hero-head">
                  <div>
                    <p className="calendar-mobile__eyebrow">Mês em foco</p>
                    <h2 className="calendar-mobile__month-title">{capitalize(monthFormatter.format(visibleMonth))}</h2>
                  </div>

                  <div className="calendar-mobile__month-nav">
                    <button type="button" onClick={() => shiftMonth(-1)} className="calendar-mobile__month-button" aria-label="Mês anterior">
                      <ChevronLeft size={16} />
                    </button>
                    <button type="button" onClick={() => shiftMonth(1)} className="calendar-mobile__month-button" aria-label="Próximo mês">
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
                  attendedDays={!isStaff ? myAttendedDays : undefined}
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

                <div style={{ padding: '0 16px' }}>
                  {renderCalendarFilters()}
                </div>

                <div className="calendar-mobile__day-list">
                  {selectedDayClasses.length > 0 ? (
                    selectedDayClasses.map((lesson) => (
                      <ClassListItem key={lesson.id} lesson={lesson} onOpen={openClassDetails} nowMs={nowMs} compact isConfirmed={!!myRsvpByClass[lesson.id]} />
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
                    <p className="app-section-label">Mês em foco</p>
                    <h2 className="text-2xl font-bold capitalize">{capitalize(monthFormatter.format(visibleMonth))}</h2>
                    <p className="mt-3 text-sm text-[color:var(--text-muted)]">
                      Toque em um dia para listar as aulas abaixo. O filtro atual vale para o calendário inteiro.
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
                      {visibleMonthClassCount} {visibleMonthClassCount === 1 ? 'aula no mês' : 'aulas no mês'}
                    </span>
                  </div>
                </div>

                {renderCalendarFilters()}

                <div className="mt-6">
                  <DesktopMonthGrid
                    monthCells={monthCells}
                    classesByDay={classesByDay}
                    selectedDay={selectedDay}
                    today={today}
                    onSelectDay={selectCalendarDay}
                    onOpenClass={openClassDetailsFromGrid}
                    nowMs={nowMs}
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
                        ? 'Selecione uma aula para abrir detalhes, presença e QR.'
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
                      <ClassListItem key={lesson.id} lesson={lesson} onOpen={openClassDetails} nowMs={nowMs} isConfirmed={!!myRsvpByClass[lesson.id]} />
                    ))
                  ) : (
                    <div className="app-empty">{selectedDayEmptyMessage}</div>
                  )}
                </div>
              </section>
            </>
          )}
        </>
      ) : surfaceTab === 'unfinished' ? (
        <section className={isCompactMonthGrid ? 'calendar-mobile__day-section' : 'app-panel app-panel-pad'}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={isCompactMonthGrid ? 'calendar-mobile__day-label' : 'app-section-label'}>Não finalizadas</p>
              <h2 className={isCompactMonthGrid ? 'calendar-mobile__day-title' : 'text-2xl font-bold'}>
                Aulas pendentes
              </h2>
              <p className={isCompactMonthGrid ? 'mt-3 text-sm text-[color:var(--text-muted)]' : 'app-section-copy mt-4'}>
                {isSuperAdmin
                  ? 'Aulas da academia que já passaram do horário e ainda estão agendadas ou ativas.'
                  : 'Aulas suas que já passaram do horário e ainda estão agendadas ou ativas.'}
              </p>
            </div>

            <span className={unfinishedClasses.length > 0 ? 'app-badge app-badge--gold' : 'app-badge app-badge--muted'}>
              {unfinishedClasses.length} {unfinishedClasses.length === 1 ? 'aula' : 'aulas'}
            </span>
          </div>

          {renderCalendarFilters()}

          <div className={isCompactMonthGrid ? 'calendar-mobile__day-list' : 'mt-6 app-list'}>
            {unfinishedClasses.length > 0 ? (
              unfinishedClasses.map((lesson) => (
                <ClassListItem
                  key={lesson.id}
                  lesson={lesson}
                  onOpen={openClassDetails}
                  nowMs={nowMs}
                  compact={isCompactMonthGrid}
                  isConfirmed={!!myRsvpByClass[lesson.id]}
                />
              ))
            ) : (
              <div className={isCompactMonthGrid ? 'calendar-mobile__empty' : 'app-empty'}>{unfinishedEmptyMessage}</div>
            )}
          </div>
        </section>
      ) : (
        <section className={isCompactMonthGrid ? 'calendar-mobile__day-section' : 'app-panel app-panel-pad'}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={isCompactMonthGrid ? 'calendar-mobile__day-label' : 'app-section-label'}>Aulas de hoje</p>
              <h2 className={isCompactMonthGrid ? 'calendar-mobile__day-title' : 'text-2xl font-bold'} style={{ textTransform: 'capitalize' }}>{todayLabel}</h2>
              <p className={isCompactMonthGrid ? 'mt-3 text-sm text-[color:var(--text-muted)]' : 'app-section-copy mt-4'}>
                Visualização em lista para acompanhar rapidamente as aulas do dia sem usar o formato de calendário.
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

          {renderCalendarFilters()}

          <div className={isCompactMonthGrid ? 'calendar-mobile__day-list' : 'mt-6 app-list'}>
            {todayClasses.length > 0 ? (
              todayClasses.map((lesson) => (
                <ClassListItem key={lesson.id} lesson={lesson} onOpen={openClassDetails} nowMs={nowMs} compact={isCompactMonthGrid} isConfirmed={!!myRsvpByClass[lesson.id]} />
              ))
            ) : (
              <div className={isCompactMonthGrid ? 'calendar-mobile__empty' : 'app-empty'}>{todayEmptyMessage}</div>
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
                        className={`app-button app-button--block ${myRsvpByClass[selectedClass.id] ? 'app-button--danger' : 'app-button--gold'}`}
                      >
                        <CheckCircle size={14} />
                        {rsvpBusyByClass[selectedClass.id] ? 'Aguarde...' : myRsvpByClass[selectedClass.id] ? 'Cancelar ida' : 'Confirmar ida'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowParticipants(true)}
                        className="app-button app-button--block app-button--ghost"
                      >
                        <Users size={14} />
                        {`Ver Participantes${selectedClass.rsvpCount ? ` (${selectedClass.rsvpCount})` : ''}`}
                      </button>
                    </>
                  ) : (
                    <>
                      {attendanceRate !== undefined ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span className="app-badge app-badge--gold">{attendanceRate}% frequência</span>
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
                          placeholder="Cole aqui o token do QR"
                          disabled={!selectedClassCanUseQr || busy}
                          className="app-input"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setScannerClassId(selectedClass.id);
                            setScannerOpen(true);
                          }}
                          disabled={!selectedClassCanUseQr || busy}
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
                        disabled={!selectedClassCanUseQr || busy}
                        className="app-button app-button--gold app-button--block"
                      >
                        <ShieldCheck size={14} />
                        {busy ? 'Registrando...' : 'Registrar presença'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runClassAction(selectedClass.id, () => onSubmitAttendanceRequest(selectedClass.id))}
                        disabled={selectedClass.status !== 'active' || busy || !!pendingRequest}
                        className="app-button app-button--ghost app-button--block"
                      >
                        <CheckCircle size={14} />
                        {pendingRequest ? 'Solicitação pendente' : 'Solicitar presença'}
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              {/* Staff: tabs Detalhes / Histórico */}
              {canManageSelected ? (
                <>
                  <div style={{ padding: '4px 20px 12px' }}>
                    <div className="app-segment class-detail-tabs">
                      <button
                        type="button"
                        onClick={() => setSheetTab('detalhes')}
                        className={`app-segment__button class-detail-tabs__button ${sheetTab === 'detalhes' ? 'is-active' : ''}`}
                      >
                        Detalhes
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetTab('agendamento')}
                        className={`app-segment__button class-detail-tabs__button ${sheetTab === 'agendamento' ? 'is-active' : ''}`}
                      >
                        Presenças
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetTab('historico')}
                        className={`app-segment__button class-detail-tabs__button ${sheetTab === 'historico' ? 'is-active' : ''}`}
                      >
                        Histórico
                      </button>
                    </div>
                  </div>

                  {sheetTab === 'agendamento' ? (
                    <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Seção confirmados */}
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
                        Confirmados ({confirmedRoster.length})
                      </p>

                      {classRsvpsLoading && confirmedRoster.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                          Carregando confirmados...
                        </div>
                      ) : confirmedRoster.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                          Nenhum aluno confirmado nesta aula
                        </div>
                      ) : (
                        confirmedRoster.map((entry) => {
                          const record = entry.record;
                          const markBusy = !!busyByClass[`manual_${entry.userId}`];
                          const removeBusy = !!busyByClass[`remove_${entry.userId}`];
                          const studentError = studentErrorById[entry.userId] ?? '';
                          return (
                            <div key={entry.userId} className="app-list-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              {record ? (
                                <CheckCircle size={16} style={{ color: methodColor(record.checkInMethod), flexShrink: 0 }} />
                              ) : (
                                <span style={{ width: 16, height: 16, border: '2px solid var(--border)', borderRadius: 4, flexShrink: 0, display: 'inline-block' }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {entry.displayName}
                                </p>
                                {record ? (
                                  <p style={{ fontSize: '0.72rem', color: 'var(--text-soft)', marginTop: 2 }}>
                                    {record.checkedInAt ? formatTimeLabel(record.checkedInAt) : '-'} · {methodLabel(record.checkInMethod)}
                                  </p>
                                ) : (
                                  <p style={{ fontSize: '0.72rem', color: 'var(--text-soft)', marginTop: 2 }}>Confirmou · não marcado</p>
                                )}
                                {studentError ? (
                                  <p style={{ fontSize: '0.7rem', color: 'var(--danger)', marginTop: 2 }}>{studentError}</p>
                                ) : null}
                              </div>
                              {record ? (
                                <button
                                  type="button"
                                  disabled={removeBusy}
                                  onClick={() => void handleRemoveStudentPresent(selectedClass.id, entry.userId)}
                                  className="app-button app-button--solid-danger app-button--small"
                                  style={{ fontSize: '0.7rem', padding: '4px 10px', flexShrink: 0 }}
                                >
                                  {removeBusy ? '...' : 'Desmarcar'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={markBusy || selectedClass.status === 'cancelled'}
                                  onClick={() => void handleMarkStudentPresent(selectedClass.id, entry.userId)}
                                  className="app-button app-button--gold app-button--small"
                                  style={{ fontSize: '0.7rem', padding: '4px 10px', flexShrink: 0 }}
                                >
                                  {markBusy ? '...' : 'Marcar'}
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* Seção não confirmados */}
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <div className="app-segment" style={{ flex: '1 1 100%', padding: 3 }}>
                          {[
                            { value: 'all', label: 'Todos' },
                            { value: 'kids', label: 'Kids' },
                            { value: 'adult', label: 'Adultos' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setPresencaStudentTypeFilter(option.value as PresencaStudentTypeFilter)}
                              className={`app-segment__button ${presencaStudentTypeFilter === option.value ? 'is-active' : ''}`}
                              style={{ minHeight: 32, fontSize: '0.75rem' }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="search"
                          value={presencaSearch}
                          onChange={(e) => setPresencaSearch(e.target.value)}
                          placeholder="Buscar aluno..."
                          className="app-input"
                          style={{ flex: '1 1 120px', fontSize: '0.82rem' }}
                        />
                        <select
                          value={presencaBeltFilter}
                          onChange={(e) => setPresencaBeltFilter(e.target.value)}
                          className="app-input"
                          style={{ flex: '0 0 auto', fontSize: '0.82rem' }}
                        >
                          <option value="all">Todas as faixas</option>
                          <option value="white">Branca</option>
                          <option value="blue">Azul</option>
                          <option value="purple">Roxa</option>
                          <option value="brown">Marrom</option>
                          <option value="black">Preta</option>
                          <option value="gray">Cinza</option>
                          <option value="yellow">Amarela</option>
                          <option value="orange">Laranja</option>
                          <option value="green">Verde</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
                          Nao confirmados
                        </p>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>
                          {filteredPresencaStudents.length !== pendingPresencaStudents.length
                            ? `${filteredPresencaStudents.length} de ${pendingPresencaStudents.length}`
                            : pendingPresencaStudents.length}
                          {' '}· {classAttendances.length} presentes
                        </p>
                      </div>

                      {selectedClass.status === 'finished' ? (
                        <div className="app-panel app-panel--tint" style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <UserCheck size={15} style={{ color: 'var(--gold-mid)', flexShrink: 0, marginTop: 1 }} />
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-soft)', lineHeight: 1.5 }}>
                            Aula encerrada. Você ainda pode marcar presenças manualmente.
                          </p>
                        </div>
                      ) : null}

                      {academyStudents.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                          Nenhum aluno cadastrado
                        </div>
                      ) : filteredPresencaStudents.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                          Nenhum aluno pendente
                        </div>
                      ) : (
                        filteredPresencaStudents.map((student) => {
                          const record = attendanceByUserId.get(student.id);
                          const markBusy = !!busyByClass[`manual_${student.id}`];
                          const removeBusy = !!busyByClass[`remove_${student.id}`];
                          const studentError = studentErrorById[student.id] ?? '';
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
                                    {record.checkedInAt ? formatTimeLabel(record.checkedInAt) : '-'} · {methodLabel(record.checkInMethod)}
                                  </p>
                                ) : null}
                                {studentError ? (
                                  <p style={{ fontSize: '0.7rem', color: 'var(--danger)', marginTop: 2 }}>{studentError}</p>
                                ) : null}
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                                {onOpenStudent ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenStudent(student.id)}
                                    className="app-button app-button--ghost app-button--small"
                                    style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                  >
                                    Ir em aluno
                                  </button>
                                ) : null}
                                {record ? (
                                  <button
                                    type="button"
                                    disabled={removeBusy}
                                    onClick={() => void handleRemoveStudentPresent(selectedClass.id, student.id)}
                                    className="app-button app-button--solid-danger app-button--small"
                                    style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                  >
                                    {removeBusy ? '...' : 'Desmarcar'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={markBusy || selectedClass.status === 'cancelled'}
                                    onClick={() => void handleMarkStudentPresent(selectedClass.id, student.id)}
                                    className="app-button app-button--gold app-button--small"
                                    style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                  >
                                    {markBusy ? '...' : 'Marcar'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : sheetTab === 'detalhes' ? (
                    <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {displayQrToken && (selectedClass.status === 'scheduled' || selectedClass.status === 'active') ? (
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
                              value={`${window.location.origin}?checkin=${encodeURIComponent(displayQrToken)}&classId=${encodeURIComponent(selectedClass.id)}`}
                              size={200}
                              level="M"
                            />
                          </div>
                          {qrData && qrCountdown && qrCountdown !== '00:00' ? (
                            <p className="mt-2 text-center text-xs text-[color:var(--text-soft)]">
                              Expira em {qrCountdown}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                    </div>
                  ) : (
                    <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
                        Últimas presenças
                      </p>
                      {myAttendances.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                          Nenhuma presença registrada ainda
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
                      <p className="app-stat-card__label">Frequência</p>
                      <p className="app-stat-card__value" style={{ fontSize: '1.4rem' }}>{attendanceRate ?? 0}%</p>
                      <p className="app-stat-card__note">no mes atual</p>
                    </div>
                    <div className="app-stat-card" style={{ padding: '12px 14px' }}>
                      <p className="app-stat-card__label">Presenças</p>
                      <p className="app-stat-card__value" style={{ fontSize: '1.4rem' }}>{myAttendances.length}</p>
                      <p className="app-stat-card__note">confirmadas</p>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
                    Últimas presenças
                  </p>

                  {myAttendances.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                      Nenhuma presença registrada ainda
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
                      className="app-button app-button--danger app-button--small"
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="app-badge app-badge--success" style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle size={11} />
                          Aula encerrada
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>
                          {classAttendances.length} presente{classAttendances.length !== 1 ? 's' : ''} · use a aba Presenças para ajustes
                        </span>
                      </div>
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
              <StopCircle size={20} style={{ color: 'var(--danger, #e05252)' }} />
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>Encerrar aula?</span>
            </div>

            {/* Resumo de presença */}
            <div style={{ display: 'flex', gap: 12, width: '100%', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-strong)' }}>{classAttendances.length}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>marcados</p>
              </div>
              <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-strong)' }}>{selectedClassRsvpCount}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>confirmaram ida</p>
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              Mostre este QR para quem ainda não marcou presença
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
              <button type="button" onClick={() => void handleConfirmFinish()} disabled={finishBusy} className="app-button app-button--danger app-button--block">
                <StopCircle size={14} />
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
                Continuar aula
              </button>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-soft)', textAlign: 'center', lineHeight: 1.5 }}>
              Após encerrar, você ainda poderá marcar presenças manualmente.
            </p>
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

      {showParticipants && selectedClass && !isStaff ? (
        <div
          className="staff-home__lesson-backdrop"
          role="presentation"
          onClick={() => setShowParticipants(false)}
        >
          <section
            className="staff-home__lesson-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="participants-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="staff-home__lesson-head">
              <div className="staff-home__lesson-title-copy">
                <p className="staff-home__section-label">Participantes confirmados</p>
                <h2 id="participants-title" className="staff-home__lesson-title">{selectedClass.title}</h2>
                <p className="staff-home__lesson-subtitle">{formatTimeLabel(selectedClass.scheduledStart)}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowParticipants(false)}
                className="app-button app-button--ghost app-button--icon staff-home__lesson-close"
                aria-label="Fechar participantes"
              >
                <X size={16} />
              </button>
            </div>

            <div className="staff-home__confirmed-list">
              <div className="staff-home__confirmed-head">
                <p className="staff-home__section-label">Quem confirmou</p>
              </div>

              {participantsLoading ? (
                <div className="staff-home__confirmed-empty">Carregando...</div>
              ) : participantsList.length > 0 ? (
                participantsList.map((rsvp) => (
                  <div key={rsvp.id} className="staff-home__confirmed-row">
                    <div className="staff-home__confirmed-avatar" aria-hidden="true">
                      <UserCheck size={16} />
                    </div>
                    <div className="staff-home__confirmed-copy">
                      <p className="staff-home__confirmed-name">{rsvp.userDisplayName}</p>
                      <p className="staff-home__confirmed-meta">Presença futura confirmada</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="staff-home__confirmed-empty">
                  Nenhum aluno confirmou ainda.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

export default CalendarView;
