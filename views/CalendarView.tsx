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
        setMessageByClass((previous) => ({ ...previous, [classId]: 'Operação concluída com sucesso.' }));
      }
    } catch (error) {
      setMessageByClass((previous) => ({
        ...previous,
        [classId]: error instanceof Error ? error.message : 'Não foi possível concluir esta operação.',
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
    <div className="space-y-6 animate-fadeIn pb-8">
      <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-xl">
        <button
          onClick={() => setView('minhas')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${view === 'minhas' ? 'bg-white dark:bg-dark-card shadow-sm text-gold' : 'text-gray-500'}`}
        >
          Minhas Aulas
        </button>
        <button
          onClick={() => setView('todas')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${view === 'todas' ? 'bg-white dark:bg-dark-card shadow-sm text-gold' : 'text-gray-500'}`}
        >
          Todas as Aulas
        </button>
      </div>

      <div className="flex justify-between items-center overflow-x-auto no-scrollbar gap-2 py-2">
        {days.map((day, index) => (
          <button
            key={day}
            onClick={() => setSelectedDay(index)}
            className={`flex flex-col items-center min-w-[48px] p-2 rounded-xl transition-all ${selectedDay === index ? 'bg-gold text-black' : 'bg-gray-50 dark:bg-white/5 text-gray-500'}`}
          >
            <span className="text-[10px] font-bold">{day}</span>
            <span className="text-lg font-bold">{index + 1}</span>
          </button>
        ))}
      </div>

      {isStaff ? (
        <button
          onClick={() => void handleQuickClassCreation()}
          disabled={creatingQuickClass}
          className="w-full py-3 bg-dark dark:bg-white text-white dark:text-black font-bold rounded-xl text-sm"
        >
          {creatingQuickClass ? 'Criando aula...' : 'Criar Aula Rápida'}
        </button>
      ) : null}

      <div className="space-y-4">
        {filteredClasses.map((lesson) => {
          const qrData = qrByClass[lesson.id];
          const busy = !!busyByClass[lesson.id];
          const canManage =
            isStaff &&
            (userRole === UserRole.ADMIN ||
              userRole === UserRole.SUPERADMIN ||
              lesson.professorId === currentUserId);

          return (
            <div key={lesson.id} className="bg-white dark:bg-dark-card rounded-2xl p-4 border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg">{lesson.title}</h3>
                  <span className="text-xs text-gold font-semibold uppercase tracking-wider">{lesson.status}</span>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 px-3 py-1 rounded-full flex items-center gap-1.5 text-xs font-bold">
                  <Clock size={12} className="text-gold" />
                  {formatTimeLabel(lesson.scheduledStart)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <MapPin size={14} className="text-gray-400" />
                  {lesson.tatame}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Users size={14} className="text-gray-400" />
                  {lesson.currentAttendanceCount}/{lesson.capacity ?? '∞'} atletas
                </div>
                <div className="col-span-2 flex items-center gap-2 text-xs text-gray-500">
                  <ShieldCheck size={14} className="text-gray-400" />
                  {lesson.professorName || 'Professor não definido'} • {formatDateLabel(lesson.scheduledStart)}
                </div>
              </div>

              {qrData ? (
                <div className="mb-4 bg-gold/10 border border-gold/20 rounded-xl p-3 text-sm">
                  <div className="flex items-center gap-2 font-bold text-gold mb-1">
                    <QrCode size={16} />
                    QR da Aula
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 break-all">Token: {qrData.qrToken}</p>
                  <p className="text-xs text-gray-500 mt-1">Expira em {new Date(qrData.expiresAt).toLocaleTimeString('pt-BR')}</p>
                </div>
              ) : null}

              {messageByClass[lesson.id] ? (
                <div className="mb-4 bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-300">
                  {messageByClass[lesson.id]}
                </div>
              ) : null}

              {canManage ? (
                <div className="flex gap-2 flex-wrap">
                  {lesson.status === 'scheduled' ? (
                    <button
                      onClick={() => void runClassAction(lesson.id, () => onStartClass(lesson.id))}
                      disabled={busy}
                      className="flex-1 py-3 bg-gold text-black font-bold rounded-xl text-sm flex items-center justify-center gap-2"
                    >
                      <Play size={16} fill="currentColor" />
                      {busy ? 'Iniciando...' : 'Iniciar Aula'}
                    </button>
                  ) : null}

                  {lesson.status === 'active' ? (
                    <>
                      <button
                        onClick={() => void runClassAction(lesson.id, () => onRefreshQr(lesson.id))}
                        disabled={busy}
                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
                      >
                        <RefreshCw size={16} />
                        Novo QR
                      </button>
                      <button
                        onClick={() => void runClassAction(lesson.id, () => onFinishClass(lesson.id))}
                        disabled={busy}
                        className="flex-1 py-3 bg-red-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
                      >
                        <CheckCircle size={16} />
                        Finalizar
                      </button>
                    </>
                  ) : null}

                  {lesson.status === 'finished' ? (
                    <div className="w-full py-3 bg-gray-100 dark:bg-white/5 text-center rounded-xl text-sm font-semibold text-gray-500">
                      Aula encerrada
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={qrInputByClass[lesson.id] || ''}
                    onChange={(event) =>
                      setQrInputByClass((previous) => ({ ...previous, [lesson.id]: event.target.value }))
                    }
                    placeholder={lesson.status === 'active' ? 'Cole aqui o token do QR' : 'A aula precisa estar ativa'}
                    disabled={lesson.status !== 'active' || busy}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-gold disabled:opacity-60"
                  />
                  <button
                    onClick={() =>
                      void runClassAction(lesson.id, () => onRegisterAttendance(lesson.id, qrInputByClass[lesson.id]))
                    }
                    disabled={lesson.status !== 'active' || busy}
                    className="w-full py-3 bg-gold text-black font-bold rounded-xl text-sm shadow-lg shadow-gold/20 disabled:opacity-60"
                  >
                    {busy ? 'Registrando...' : 'Registrar Presença'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {filteredClasses.length === 0 ? (
          <div className="bg-white dark:bg-dark-card rounded-2xl p-6 border border-gray-100 dark:border-white/5 text-center text-sm text-gray-500">
            Nenhuma aula encontrada para o filtro atual.
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CalendarView;
