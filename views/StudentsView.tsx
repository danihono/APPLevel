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
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-section-label">Roster</p>
            <h1 className="app-section-title">Alunos com leitura mais limpa e mais forte.</h1>
            <p className="app-section-copy">{academyName || 'Academia ativa'}.</p>
          </div>
          <button type="button" className="app-button app-button--gold app-button--icon" disabled aria-label="Adicionar aluno">
            <UserPlus size={18} />
          </button>
        </div>

        <div className="mt-6 app-form-grid">
          <label className="app-field">
            <span className="app-field__label">Buscar aluno</span>
            <div className="app-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Nome do aluno"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="app-input pl-11"
              />
            </div>
          </label>

          <div className="app-chip-row">
            {['ALL', 'Adulto', 'Kids'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilterType(item as 'ALL' | 'Adulto' | 'Kids')}
                className={`app-chip ${filterType === item ? 'is-active' : ''}`}
              >
                {item === 'ALL' ? 'Todos' : item}
              </button>
            ))}
          </div>

          <div className="app-chip-row">
            <button
              type="button"
              onClick={() => setFilterBelt('ALL')}
              className={`app-chip ${filterBelt === 'ALL' ? 'is-active' : ''}`}
            >
              Todas as faixas
            </button>
            {Object.values(BeltColor).map((belt) => (
              <button
                key={belt}
                type="button"
                onClick={() => setFilterBelt(belt)}
                className={`app-chip ${filterBelt === belt ? 'is-active' : ''}`}
              >
                {belt}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="app-list">
        {filteredStudents.map((student) => (
          <button
            key={student.id}
            type="button"
            onClick={() => setSelectedStudent(student)}
            className="app-panel app-panel-pad w-full text-left"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <AvatarWithBelt
                  avatar={student.avatar}
                  name={student.name}
                  belt={student.belt}
                  stripes={student.stripes}
                  size="sm"
                />
                <div>
                  <h3 className="text-lg font-bold">{student.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="app-badge app-badge--muted">{student.type}</span>
                    <span className="app-badge app-badge--gold">{student.belt}</span>
                  </div>
                </div>
              </div>
              <ChevronRight size={18} className="text-[color:var(--text-soft)]" />
            </div>
          </button>
        ))}

        {filteredStudents.length === 0 ? (
          <div className="app-empty">Nenhum aluno encontrado com os filtros atuais.</div>
        ) : null}
      </section>
    </div>
  );
};

export default StudentsView;
