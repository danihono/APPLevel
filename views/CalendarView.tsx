import React, { useMemo, useState } from 'react';
import {
  CheckCircle,
  Clock,
  MapPin,
  Play,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { formatDateLabel, formatTimeLabel } from '../services/firebase/adapters';
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

function toMondayFirstDay(date: Date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function getStatusBadge(status: ClassRecord['status']) {
  switch (status) {
    case 'active':
      return 'app-badge app-badge--success';
    case 'finished':
      return 'app-badge app-badge--muted';
    default:
      return 'app-badge app-badge--gold';
  }
}

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
  const [view, setView] = useState<'minhas' | 'todas'>('todas');
  const [selectedDay, setSelectedDay] = useState(toMondayFirstDay(new Date()));
  const [qrByClass, setQrByClass] = useState<Record<string, QrSessionPayload>>({});
  const [qrInputByClass, setQrInputByClass] = useState<Record<string, string>>({});
  const [messageByClass, setMessageByClass] = useState<Record<string, string>>({});
  const [busyByClass, setBusyByClass] = useState<Record<string, boolean>>({});
  const [creatingQuickClass, setCreatingQuickClass] = useState(false);

  const isStaff =
    userRole === UserRole.PROFESSOR ||
    userRole === UserRole.ADMIN ||
    userRole === UserRole.SUPERADMIN;

  const days = useMemo(() => ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'], []);

  const filteredClasses = classes.filter((lesson) => {
    if (view === 'minhas' && isStaff && lesson.professorId !== currentUserId) {
      return false;
    }

    if (!lesson.scheduledStart) {
      return true;
    }

    return toMondayFirstDay(lesson.scheduledStart.toDate()) === selectedDay;
  });

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

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <p className="app-section-label">Agenda</p>
        <h1 className="app-section-title">Sua operacao diaria de treino.</h1>
        <p className="app-section-copy">
          Alterna rapido entre aulas, gerencia sessoes ativas e registra presencas sem sair do fluxo.
        </p>

        <div className="mt-6 flex flex-col gap-4">
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
              Todas as aulas
            </button>
          </div>

          <div className="app-chip-row">
            {days.map((day, index) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(index)}
                className={`app-chip ${selectedDay === index ? 'is-active' : ''}`}
              >
                {day} {index + 1}
              </button>
            ))}
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
            <article key={lesson.id} className="app-panel app-panel-pad">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold">{lesson.title}</h2>
                    <span className={getStatusBadge(lesson.status)}>{lesson.status}</span>
                  </div>
                  <p className="app-section-copy mt-3">
                    {lesson.professorName || 'Professor nao definido'} - {formatDateLabel(lesson.scheduledStart)}
                  </p>
                </div>

                <div className="app-orb">
                  <Clock size={14} />
                  {formatTimeLabel(lesson.scheduledStart)}
                </div>
              </div>

              <div className="app-grid-2 mt-6">
                <div className="app-list-card">
                  <div className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                    <MapPin size={16} />
                    {lesson.tatame}
                  </div>
                </div>
                <div className="app-list-card">
                  <div className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                    <Users size={16} />
                    {lesson.currentAttendanceCount}/{lesson.capacity ?? 'sem limite'} atletas
                  </div>
                </div>
              </div>

              {qrData ? (
                <div className="app-panel app-panel--tint mt-5 p-4">
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
                <div className="app-list-card mt-5 text-sm text-[color:var(--text-muted)]">
                  {messageByClass[lesson.id]}
                </div>
              ) : null}

              {canManage ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  {lesson.status === 'scheduled' ? (
                    <button
                      type="button"
                      onClick={() => void runClassAction(lesson.id, () => onStartClass(lesson.id))}
                      disabled={busy}
                      className="app-button app-button--gold"
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
                        className="app-button app-button--ghost"
                      >
                        <RefreshCw size={16} />
                        Novo QR
                      </button>
                      <button
                        type="button"
                        onClick={() => void runClassAction(lesson.id, () => onFinishClass(lesson.id))}
                        disabled={busy}
                        className="app-button app-button--danger"
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
                <div className="mt-5 app-form-grid">
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
            </article>
          );
        })}

        {filteredClasses.length === 0 ? (
          <div className="app-empty">Nenhuma aula encontrada para o filtro atual.</div>
        ) : null}
      </section>
    </div>
  );
};

export default CalendarView;
