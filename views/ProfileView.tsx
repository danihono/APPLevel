import React from 'react';
import { Award, BookOpen, ChevronRight, History, Settings } from 'lucide-react';
import type { User } from '../types';

interface ProfileViewProps {
  user: User;
  totalClasses: number;
  rankingPosition?: number | null;
  academyName?: string;
  onLogout: () => void | Promise<void>;
}

const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  totalClasses,
  rankingPosition,
  academyName,
  onLogout,
}) => {
  const menuItems = [
    { label: 'Dados Pessoais', icon: Award },
    { label: 'Histórico de Graduações', icon: History },
    { label: 'Minhas Aulas', icon: BookOpen },
    { label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      <div className="flex flex-col items-center pt-4">
        <div className="relative">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-24 h-24 rounded-full border-4 border-gold p-1 object-cover" />
          ) : (
            <div className="w-24 h-24 rounded-full border-4 border-gold bg-gray-100 dark:bg-white/5 flex items-center justify-center text-3xl font-bold">
              {user.name.charAt(0)}
            </div>
          )}
          <div className="absolute bottom-0 right-0 bg-gold text-black p-1 rounded-full border-4 border-white dark:border-dark">
            <Award size={14} />
          </div>
        </div>
        <h2 className="mt-4 text-xl font-bold">{user.name}</h2>
        <p className="text-sm text-gray-500">Faixa {user.belt} - {user.stripes} graus</p>
        {academyName ? (
          <p className="text-xs text-gray-400 mt-1">{academyName}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 text-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Total Aulas</p>
          <p className="text-xl font-bold">{totalClasses}</p>
        </div>
        <div className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 text-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Ranking da Academia</p>
          <p className="text-xl font-bold">{rankingPosition ? `#${rankingPosition}` : '--'}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/5 overflow-hidden">
        {menuItems.map((item, index) => {
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              className={`w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${
                index !== menuItems.length - 1 ? 'border-b border-gray-100 dark:border-white/5' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg text-gold">
                  <Icon size={18} />
                </div>
                <span className="text-sm font-semibold">{item.label}</span>
              </div>
              <ChevronRight size={18} className="text-gray-300" />
            </button>
          );
        })}
      </div>

      <button
        onClick={() => void onLogout()}
        className="w-full py-4 text-red-500 font-bold text-sm bg-red-50 dark:bg-red-500/10 rounded-2xl mt-4"
      >
        Sair da Conta
      </button>
    </div>
  );
};

export default ProfileView;
