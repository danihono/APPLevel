import React, { useState } from 'react';
import { ChevronRight, Search, UserPlus } from 'lucide-react';
import AvatarWithBelt from '../components/AvatarWithBelt';
import StudentDetailView from './StudentDetailView';
import { BeltColor, type User } from '../types';

interface StudentsViewProps {
  students: User[];
  academyName?: string;
}

const StudentsView: React.FC<StudentsViewProps> = ({ students, academyName }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBelt, setFilterBelt] = useState<BeltColor | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'Adulto' | 'Kids'>('ALL');
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);

  if (selectedStudent) {
    return <StudentDetailView student={selectedStudent} onBack={() => setSelectedStudent(null)} />;
  }

  const filteredStudents = students.filter((student) => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBelt = filterBelt === 'ALL' || student.belt === filterBelt;
    const matchesType = filterType === 'ALL' || student.type === filterType;
    return matchesSearch && matchesBelt && matchesType;
  });

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alunos da Academia</h1>
          {academyName ? <p className="text-sm text-gray-500 mt-1">{academyName}</p> : null}
        </div>
        <button className="p-2 bg-gold text-dark rounded-full hover:bg-gold-dark transition-colors" disabled>
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
          {['ALL', 'Adulto', 'Kids'].map((item) => (
            <button
              key={item}
              onClick={() => setFilterType(item as 'ALL' | 'Adulto' | 'Kids')}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filterType === item
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-gray-100 text-gray-600 dark:bg-dark-card dark:text-gray-400'
              }`}
            >
              {item === 'ALL' ? 'Todos' : item}
            </button>
          ))}
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
          {Object.values(BeltColor).map((belt) => (
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
        {filteredStudents.map((student) => (
          <div
            key={student.id}
            onClick={() => setSelectedStudent(student)}
            className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between cursor-pointer hover:border-gold dark:hover:border-gold transition-colors"
          >
            <div className="flex items-center gap-4">
              <AvatarWithBelt
                avatar={student.avatar}
                name={student.name}
                belt={student.belt}
                stripes={student.stripes}
                size="sm"
              />
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">{student.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">{student.type}</span>
                </div>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </div>
        ))}

        {filteredStudents.length === 0 ? (
          <div className="text-center py-10 text-gray-500 dark:text-gray-400 bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-gray-800">
            Nenhum aluno encontrado com os filtros atuais.
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default StudentsView;
