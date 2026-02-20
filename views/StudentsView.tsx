import React, { useState } from 'react';
import { Search, Filter, ChevronRight, UserPlus } from 'lucide-react';
import { User, BeltColor } from '../types';
import AvatarWithBelt from '../components/AvatarWithBelt';
import StudentDetailView from './StudentDetailView';
import { MOCK_USER } from '../constants';

// Mock students list
const MOCK_STUDENTS: User[] = [
  { 
    ...MOCK_USER, 
    id: 's1', 
    name: 'João Silva', 
    belt: BeltColor.BRANCA, 
    stripes: 2, 
    type: 'Adulto', 
    email: 'joao.silva@email.com', 
    birthDate: '1995-05-12', 
    startDate: '10/01/2023', 
    lastStripeDate: '15/11/2023',
    videos: [
      { id: 'v1', title: 'Final de Campeonato - Curitiba Open', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', date: '15/06/2023' },
      { id: 'v2', title: 'Treino de Sparring - Passagem de Guarda', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', date: '20/07/2023' }
    ]
  },
  { 
    ...MOCK_USER, 
    id: 's2', 
    name: 'Maria Santos', 
    belt: BeltColor.AZUL, 
    stripes: 1, 
    type: 'Adulto', 
    email: 'maria.santos@email.com', 
    birthDate: '1992-08-22', 
    startDate: '05/03/2021', 
    lastStripeDate: '20/01/2024',
    videos: [
      { id: 'v3', title: 'Brasileiro 2023 - Semifinal', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', date: '25/04/2023' }
    ]
  },
  { ...MOCK_USER, id: 's3', name: 'Pedro Costa', belt: BeltColor.ROXA, stripes: 3, type: 'Adulto', email: 'pedro.costa@email.com', birthDate: '1988-11-05', startDate: '12/06/2018', lastStripeDate: '05/12/2023' },
  { ...MOCK_USER, id: 's4', name: 'Ana Oliveira', belt: BeltColor.BRANCA, stripes: 4, type: 'Adulto', email: 'ana.oliveira@email.com', birthDate: '1998-02-15', startDate: '20/08/2022', lastStripeDate: '10/02/2024' },
  { ...MOCK_USER, id: 's5', name: 'Lucas Pereira', belt: BeltColor.MARROM, stripes: 0, type: 'Adulto', email: 'lucas.pereira@email.com', birthDate: '1985-09-30', startDate: '15/01/2015', lastStripeDate: '01/12/2023' },
  { ...MOCK_USER, id: 's6', name: 'Enzo Gabriel', belt: BeltColor.BRANCA, stripes: 1, type: 'Kids', email: 'enzo.gabriel@email.com', birthDate: '2015-04-10', startDate: '10/02/2023', lastStripeDate: '20/10/2023' },
  { ...MOCK_USER, id: 's7', name: 'Valentina Souza', belt: BeltColor.BRANCA, stripes: 3, type: 'Kids', email: 'valentina.souza@email.com', birthDate: '2014-07-25', startDate: '05/05/2022', lastStripeDate: '15/01/2024' },
];

const StudentsView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBelt, setFilterBelt] = useState<BeltColor | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'Adulto' | 'Kids'>('ALL');
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);

  if (selectedStudent) {
    return <StudentDetailView student={selectedStudent} onBack={() => setSelectedStudent(null)} />;
  }

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
