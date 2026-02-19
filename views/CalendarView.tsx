
import React, { useState } from 'react';
import { MapPin, Users, Clock, ShieldCheck } from 'lucide-react';
import { MOCK_CLASSES } from '../constants';
import { BeltColor } from '../types';

const CalendarView: React.FC = () => {
  const [view, setView] = useState<'minhas' | 'todas'>('todas');
  const [selectedDay, setSelectedDay] = useState(0); // 0 = Mon, 6 = Sun

  const days = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

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
        {MOCK_CLASSES.map((cls) => (
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

            <button className="w-full py-3 bg-gold text-black font-bold rounded-xl text-sm shadow-lg shadow-gold/20 active:scale-[0.98] transition-all">
              Agendar Aula
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CalendarView;
