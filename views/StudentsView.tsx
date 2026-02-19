import React, { useState } from 'react';
import { Search, Filter, ChevronRight, UserPlus } from 'lucide-react';
import { User, BeltColor } from '../types';
import BjjBelt from '../components/BjjBelt';
import { MOCK_USER } from '../constants';

// Mock students list
const MOCK_STUDENTS: User[] = [
  { ...MOCK_USER, id: 's1', name: 'João Silva', belt: BeltColor.BRANCA, stripes: 2, type: 'Adulto' },
  { ...MOCK_USER, id: 's2', name: 'Maria Santos', belt: BeltColor.AZUL, stripes: 1, type: 'Adulto' },
  { ...MOCK_USER, id: 's3', name: 'Pedro Costa', belt: BeltColor.ROXA, stripes: 3, type: 'Adulto' },
  { ...MOCK_USER, id: 's4', name: 'Ana Oliveira', belt: BeltColor.BRANCA, stripes: 4, type: 'Adulto' },
  { ...MOCK_USER, id: 's5', name: 'Lucas Pereira', belt: BeltColor.MARROM, stripes: 0, type: 'Adulto' },
  { ...MOCK_USER, id: 's6', name: 'Enzo Gabriel', belt: BeltColor.BRANCA, stripes: 1, type: 'Kids' },
  { ...MOCK_USER, id: 's7', name: 'Valentina Souza', belt: BeltColor.BRANCA, stripes: 3, type: 'Kids' },
];

const StudentsView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBelt, setFilterBelt] = useState<BeltColor | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'Adulto' | 'Kids'>('ALL');

  const filteredStudents = MOCK_STUDENTS.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBelt = filterBelt === 'ALL' || student.belt === filterBelt;
    const matchesType = filterType === 'ALL' || student.type === filterType;
    return matchesSearch && matchesBelt && matchesType;
  });

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meus Alunos</h1>
        <button className="p-2 bg-gold text-dark rounded-full hover:bg-gold-dark transition-colors">
          <UserPlus size={20} />
        </button>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar aluno..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-dark-card border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold transition-colors"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filterType === 'ALL' 
                ? 'bg-black text-white dark:bg-white dark:text-black' 
                : 'bg-gray-100 text-gray-600 dark:bg-dark-card dark:text-gray-400'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilterType('Adulto')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filterType === 'Adulto' 
                ? 'bg-black text-white dark:bg-white dark:text-black' 
                : 'bg-gray-100 text-gray-600 dark:bg-dark-card dark:text-gray-400'
            }`}
          >
            Adulto
          </button>
          <button
            onClick={() => setFilterType('Kids')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filterType === 'Kids' 
                ? 'bg-black text-white dark:bg-white dark:text-black' 
                : 'bg-gray-100 text-gray-600 dark:bg-dark-card dark:text-gray-400'
            }`}
          >
            Kids
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          <button
            onClick={() => setFilterBelt('ALL')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filterBelt === 'ALL' 
                ? 'bg-gold text-dark' 
                : 'bg-gray-100 text-gray-600 dark:bg-dark-card dark:text-gray-400'
            }`}
          >
            Todas as Faixas
          </button>
          {Object.values(BeltColor).map(belt => (
            <button
              key={belt}
              onClick={() => setFilterBelt(belt)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filterBelt === belt 
                  ? 'bg-gold text-dark' 
                  : 'bg-gray-100 text-gray-600 dark:bg-dark-card dark:text-gray-400'
              }`}
            >
              {belt}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredStudents.map(student => (
          <div 
            key={student.id} 
            className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between cursor-pointer hover:border-gold dark:hover:border-gold transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                {student.avatar ? (
                  <img src={student.avatar} alt={student.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold">
                    {student.name.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">{student.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{student.type}</span>
                  <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
                  <div className="w-16">
                    <BjjBelt color={student.belt} stripes={student.stripes} />
                  </div>
                </div>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </div>
        ))}
        
        {filteredStudents.length === 0 && (
          <div className="text-center py-10 text-gray-500 dark:text-gray-400">
            Nenhum aluno encontrado com os filtros atuais.
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentsView;
