
import React from 'react';
import { Home, Calendar, ShoppingBag, User as UserIcon, Sun, Moon, Users, Trophy, Target } from 'lucide-react';
import { UserRole } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  userRole?: UserRole;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, isDarkMode, toggleTheme, userRole }) => {
  const isProfessorOrAdmin = userRole === UserRole.PROFESSOR || userRole === UserRole.ADMIN;
  
  const navItems = [
    { id: 'home', icon: Home, label: 'Início' },
    { id: 'calendar', icon: Calendar, label: 'Agenda' },
    { id: 'competition', icon: Trophy, label: 'Compete' },
    { id: 'gamification', icon: Target, label: 'Missões' },
    ...(isProfessorOrAdmin 
      ? [{ id: 'students', icon: Users, label: 'Alunos' }] 
      : []),
    { id: 'store', icon: ShoppingBag, label: 'Store' },
    { id: 'profile', icon: UserIcon, label: 'Perfil' },
  ];

  return (
    <div className={`min-h-screen pb-20 transition-colors duration-300 ${isDarkMode ? 'dark bg-dark' : 'bg-white'}`}>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-dark/80 backdrop-blur-md border-b border-gray-100 dark:border-white/10 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gold rounded-full flex items-center justify-center font-bold text-black text-xs">LVL</div>
          <span className="font-bold text-lg tracking-tight">LEVEL <span className="text-gold">JJ</span></span>
        </div>
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
        >
          {isDarkMode ? <Sun size={20} className="text-gold" /> : <Moon size={20} className="text-gray-600" />}
        </button>
      </header>

      <main className="pt-16 px-4 max-w-lg mx-auto">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-dark border-t border-gray-100 dark:border-white/10 safe-area-bottom">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-1 w-full transition-colors ${
                  isActive ? 'text-gold' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                }`}
              >
                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
