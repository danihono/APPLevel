
import React, { useState } from 'react';
import { Camera, Users, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { MOCK_CLASSES } from '../constants';

const ProfessorView: React.FC = () => {
  const [showAttendance, setShowAttendance] = useState(false);
  const activeClass = MOCK_CLASSES[1]; // Advanced No-Gi

  const students = [
    { name: 'Ricardo Cavalcanti', belt: 'Roxa', status: 'confirmed' },
    { name: 'Ana Souza', belt: 'Azul', status: 'pending' },
    { name: 'Felipe Melo', belt: 'Preta', status: 'confirmed' },
    { name: 'Bia Ferreira', belt: 'Azul', status: 'absent' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      <div className="bg-gold text-black p-5 rounded-2xl">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Aula em Andamento</p>
        <h2 className="text-2xl font-bold mb-1">{activeClass.name}</h2>
        <div className="flex items-center gap-4 text-sm font-medium mt-3">
          <span className="flex items-center gap-1.5"><Clock size={16} /> {activeClass.time}</span>
          <span className="flex items-center gap-1.5"><Users size={16} /> {activeClass.enrolled}/{activeClass.capacity} Alunos</span>
        </div>
      </div>

      {!showAttendance ? (
        <div className="space-y-4">
          <button 
            onClick={() => setShowAttendance(true)}
            className="w-full flex items-center justify-between p-5 bg-white dark:bg-dark-card border border-gray-100 dark:border-white/5 rounded-2xl shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gold/10 rounded-full text-gold">
                <Camera size={24} />
              </div>
              <div className="text-left">
                <h3 className="font-bold">Chamada Facial</h3>
                <p className="text-xs text-gray-500">Confirmar presença via reconhecimento</p>
              </div>
            </div>
            <ChevronDown size={20} className="text-gray-300" />
          </button>

          <h3 className="font-bold pt-4 text-gray-500 uppercase text-xs tracking-widest">Aulas do Dia</h3>
          {MOCK_CLASSES.map(cls => (
            <div key={cls.id} className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex items-center justify-between">
              <div>
                <h4 className="font-bold">{cls.name}</h4>
                <p className="text-xs text-gray-500">{cls.time} • {cls.level}</p>
              </div>
              <div className="bg-gray-50 dark:bg-white/5 px-3 py-1 rounded-full text-[10px] font-bold text-gray-400">
                LISTA DE ALUNOS
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold">Lista de Presença</h3>
            <button onClick={() => setShowAttendance(false)} className="text-xs font-bold text-gold">VOLTAR</button>
          </div>
          
          <div className="space-y-2">
            {students.map((std, i) => (
              <div key={i} className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-8 rounded-full ${std.belt === 'Preta' ? 'bg-black' : std.belt === 'Roxa' ? 'bg-purple-800' : 'bg-blue-600'}`}></div>
                  <div>
                    <h4 className="font-bold text-sm">{std.name}</h4>
                    <p className="text-[10px] text-gray-400">Faixa {std.belt}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className={`p-2 rounded-lg ${std.status === 'confirmed' ? 'bg-green-500 text-white' : 'bg-gray-50 dark:bg-white/5 text-gray-400'}`}>
                    <CheckCircle2 size={18} />
                  </button>
                  <button className={`p-2 rounded-lg ${std.status === 'absent' ? 'bg-red-500 text-white' : 'bg-gray-50 dark:bg-white/5 text-gray-400'}`}>
                    <XCircle size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button className="w-full py-4 bg-gold text-black font-bold rounded-2xl shadow-lg mt-4">
            Finalizar Chamada
          </button>
        </div>
      )}
    </div>
  );
};

// Internal icon for usage in ProfessorView
const Clock: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

export default ProfessorView;
