
import React, { useState } from 'react';
import { MapPin, Users, Clock, ShieldCheck, Play, CheckCircle, Fingerprint, ChevronLeft } from 'lucide-react';
import { MOCK_CLASSES } from '../constants';
import { BeltColor, UserRole } from '../types';

interface CalendarViewProps {
  userRole?: UserRole;
}

type ClassStatus = 'idle' | 'started' | 'finished' | 'attendance';

const CalendarView: React.FC<CalendarViewProps> = ({ userRole }) => {
  const [view, setView] = useState<'minhas' | 'todas'>('todas');
  const [selectedDay, setSelectedDay] = useState(0); // 0 = Mon, 6 = Sun
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [classStatus, setClassStatus] = useState<Record<string, ClassStatus>>({});

  const days = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
  const isProfessor = userRole === UserRole.PROFESSOR;

  const handleClassAction = (id: string) => {
    const currentStatus = classStatus[id] || 'idle';
    
    if (currentStatus === 'idle') {
      setClassStatus({ ...classStatus, [id]: 'started' });
    } else if (currentStatus === 'started') {
      setClassStatus({ ...classStatus, [id]: 'finished' });
    } else if (currentStatus === 'finished') {
      setClassStatus({ ...classStatus, [id]: 'attendance' });
    }
  };

  const renderAttendance = (id: string) => (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setClassStatus({ ...classStatus, [id]: 'finished' })} className="p-1">
          <ChevronLeft size={20} />
        </button>
        <h3 className="font-bold">Chamada Biométrica</h3>
      </div>
      
      <div className="bg-gold/10 p-6 rounded-2xl border border-gold/20 flex flex-col items-center text-center space-y-4">
        <div className="w-20 h-20 bg-gold rounded-full flex items-center justify-center text-dark shadow-lg shadow-gold/20 animate-pulse">
          <Fingerprint size={40} />
        </div>
        <div>
          <p className="font-bold">Aguardando Biometria</p>
          <p className="text-xs text-gray-500">Peça para os alunos aproximarem o dedo do sensor ou usarem o QR Code do app.</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-400 uppercase">Presentes (3)</p>
        {['João Silva', 'Maria Santos', 'Pedro Costa'].map(name => (
          <div key={name} className="flex items-center justify-between p-3 bg-white dark:bg-dark-card rounded-xl border border-gray-100 dark:border-white/5">
            <span className="text-sm font-medium">{name}</span>
            <CheckCircle size={16} className="text-green-500" />
          </div>
        ))}
      </div>
      
      <button 
        onClick={() => setClassStatus({ ...classStatus, [id]: 'idle' })}
        className="w-full py-3 bg-dark dark:bg-white text-white dark:text-black font-bold rounded-xl text-sm"
      >
        Finalizar Chamada
      </button>
    </div>
  );

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
        {days.map((day, i) => (
          <button
            key={day}
            onClick={() => setSelectedDay(i)}
            className={`flex flex-col items-center min-w-[48px] p-2 rounded-xl transition-all ${selectedDay === i ? 'bg-gold text-black' : 'bg-gray-50 dark:bg-white/5 text-gray-500'}`}
          >
            <span className="text-[10px] font-bold">{day}</span>
            <span className="text-lg font-bold">{20 + i}</span>
            {i % 2 === 0 && <div className={`w-1 h-1 rounded-full mt-1 ${selectedDay === i ? 'bg-black' : 'bg-gold'}`}></div>}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {MOCK_CLASSES.map((cls) => {
          const status = classStatus[cls.id] || 'idle';
          
          if (status === 'attendance') {
            return <div key={cls.id}>{renderAttendance(cls.id)}</div>;
          }

          return (
            <div key={cls.id} className="bg-white dark:bg-dark-card rounded-2xl p-4 border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden relative">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg">{cls.name}</h3>
                  <span className="text-xs text-gold font-semibold uppercase tracking-wider">{cls.level}</span>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 px-3 py-1 rounded-full flex items-center gap-1.5 text-xs font-bold">
                  <Clock size={12} className="text-gold" />
                  {cls.time}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <MapPin size={14} className="text-gray-400" />
                  {cls.mat}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Users size={14} className="text-gray-400" />
                  {cls.enrolled}/{cls.capacity} Alunos
                </div>
                <div className="col-span-2 flex items-center gap-2 text-xs text-gray-500">
                  <ShieldCheck size={14} className="text-gray-400" />
                  {cls.allowedBelts.join(', ')}
                  {cls.requiredStripes > 0 && ` (+${cls.requiredStripes} graus)`}
                </div>
              </div>

              {isProfessor ? (
                <div className="flex gap-2">
                  {status === 'idle' && (
                    <button 
                      onClick={() => handleClassAction(cls.id)}
                      className="flex-1 py-3 bg-gold text-black font-bold rounded-xl text-sm flex items-center justify-center gap-2"
                    >
                      <Play size={16} fill="currentColor" />
                      Iniciar Aula
                    </button>
                  )}
                  {status === 'started' && (
                    <button 
                      onClick={() => handleClassAction(cls.id)}
                      className="flex-1 py-3 bg-red-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={16} />
                      Finalizar Aula
                    </button>
                  )}
                  {status === 'finished' && (
                    <button 
                      onClick={() => handleClassAction(cls.id)}
                      className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
                    >
                      <Fingerprint size={16} />
                      Chamada Biometria
                    </button>
                  )}
                  <button className="px-4 py-3 bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-sm">
                    Ver Aula
                  </button>
                </div>
              ) : (
                <button className="w-full py-3 bg-gold text-black font-bold rounded-xl text-sm shadow-lg shadow-gold/20 active:scale-[0.98] transition-all">
                  Agendar Aula
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarView;
