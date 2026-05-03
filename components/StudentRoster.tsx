import React, { useEffect, useMemo, useState } from 'react';
import { ALL_BELTS, beltLabel, getUserProgressionSummary, type ProgressionRules } from '../beltCatalog';
import { ChevronRight, Search } from 'lucide-react';
import AvatarWithBelt from './AvatarWithBelt';
import StudentDetailView from '../views/StudentDetailView';
import type { FirestoreEntity } from '../services/firebase/data';
import type { GraduationApprovalRequestRecord } from '../services/firebase/models';
import type { BeltColor, User } from '../types';

type SortMode = 'name-asc' | 'name-desc' | 'belt-desc' | 'grade-desc';

export interface StudentRosterProps {
  students: User[];
  progressionRules?: ProgressionRules | null;
  graduationRequests?: Array<FirestoreEntity<GraduationApprovalRequestRecord>>;
  academyName?: string;
  academies?: Array<{ id: string; name: string }>;
  selectedAcademyId?: string;
  onSelectAcademy?: (academyId: string) => void;
  requireAcademySelection?: boolean;
  selectedStudentId?: string;
  onSelectStudent?: (studentId: string) => void;
  onApproveGraduationRequest?: (requestId: string) => Promise<void>;
  onUpdateStudentBeltGrade?: (payload: { userId: string; belt: string; grade: number; stripes?: number; kidsCategory?: string }) => Promise<void>;
  onSetStudentAttendanceBonus?: (payload: { userId: string; attendanceCountBonus: number }) => Promise<void>;
  onAdminUpdateStudentProfile?: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    cpf?: string;
    birthDate?: string;
    isCompetitor?: boolean;
  }) => Promise<void>;
  onAdminUpdateStudentTimeline?: (payload: {
    userId: string;
    trainingStartDate?: string;
    lastGraduationDateOverride?: string;
    lastStripeDateOverride?: string;
  }) => Promise<void>;
  onAdminUpdateStudentPhoto?: (payload: { userId: string; photoFile: File }) => Promise<void>;
  kicker?: string;
  title?: string;
  description?: string;
  emptySelectionMessage?: string;
  emptyResultsMessage?: string;
}

const beltOrder = new Map(ALL_BELTS.map((belt, index) => [belt, index]));

function getStudentGrade(student: User) {
  return Number(student.grade ?? student.stripes ?? 0);
}

function getProgressionHint(student: User, rules?: ProgressionRules | null): string | null {
  const prog = getUserProgressionSummary(student, rules);
  const parts: string[] = [];
  if (prog.stripeTotal > 0) {
    parts.push(`${prog.stripeProgress}/${prog.stripeTotal} grau`);
  }
  if (prog.beltTotal > 0) {
    parts.push(`${prog.beltProgress}/${prog.beltTotal} faixa`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function sortStudents(students: User[], sortMode: SortMode) {
  return [...students].sort((left, right) => {
    if (sortMode === 'name-asc') {
      return left.name.localeCompare(right.name, 'pt-BR');
    }

    if (sortMode === 'name-desc') {
      return right.name.localeCompare(left.name, 'pt-BR');
    }

    if (sortMode === 'belt-desc') {
      const beltDiff = (beltOrder.get(right.belt) ?? -1) - (beltOrder.get(left.belt) ?? -1);
      if (beltDiff !== 0) {
        return beltDiff;
      }

      const gradeDiff = getStudentGrade(right) - getStudentGrade(left);
      if (gradeDiff !== 0) {
        return gradeDiff;
      }

      return left.name.localeCompare(right.name, 'pt-BR');
    }

    const gradeDiff = getStudentGrade(right) - getStudentGrade(left);
    if (gradeDiff !== 0) {
      return gradeDiff;
    }

    const beltDiff = (beltOrder.get(right.belt) ?? -1) - (beltOrder.get(left.belt) ?? -1);
    if (beltDiff !== 0) {
      return beltDiff;
    }

    return left.name.localeCompare(right.name, 'pt-BR');
  });
}

const StudentRoster: React.FC<StudentRosterProps> = ({
  students,
  progressionRules,
  graduationRequests = [],
  academyName,
  academies = [],
  selectedAcademyId = '',
  onSelectAcademy,
  requireAcademySelection = false,
  selectedStudentId = '',
  onSelectStudent,
  onApproveGraduationRequest,
  onUpdateStudentBeltGrade,
  onSetStudentAttendanceBonus,
  onAdminUpdateStudentProfile,
  onAdminUpdateStudentTimeline,
  onAdminUpdateStudentPhoto,
  kicker = 'Roster',
  title = 'Alunos com leitura mais limpa e mais forte.',
  description,
  emptySelectionMessage = 'Escolha uma unidade da LEVEL para visualizar os alunos daquele local.',
  emptyResultsMessage = 'Nenhum aluno encontrado com os filtros atuais.',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBelt, setFilterBelt] = useState<BeltColor | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'Adulto' | 'Kids'>('ALL');
  const [filterGrade, setFilterGrade] = useState<'ALL' | string>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [internalSelectedStudentId, setInternalSelectedStudentId] = useState('');
  const shouldChooseAcademyFirst = requireAcademySelection && !selectedAcademyId;
  const graduationRequestByUserId = useMemo(() => {
    const next = new Map<string, FirestoreEntity<GraduationApprovalRequestRecord>>();
    graduationRequests
      .filter((entry) => entry.status === 'pending')
      .forEach((entry) => next.set(entry.userId, entry));
    return next;
  }, [graduationRequests]);

  const gradeOptions = useMemo(() => (
    [...new Set(students.map((student) => getStudentGrade(student)))]
      .sort((left, right) => right - left)
  ), [students]);

  const visibleStudents = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const filteredStudents = students.filter((student) => {
      const matchesSearch = !query || student.name.toLocaleLowerCase('pt-BR').includes(query);
      const matchesBelt = filterBelt === 'ALL' || student.belt === filterBelt;
      const matchesType = filterType === 'ALL' || student.type === filterType;
      const matchesGrade = filterGrade === 'ALL' || getStudentGrade(student) === Number(filterGrade);
      return matchesSearch && matchesBelt && matchesType && matchesGrade;
    });

    return sortStudents(filteredStudents, sortMode);
  }, [filterBelt, filterGrade, filterType, searchTerm, sortMode, students]);

  useEffect(() => {
    if (!selectedStudentId) {
      return;
    }

    if (students.some((student) => student.id === selectedStudentId)) {
      setInternalSelectedStudentId(selectedStudentId);
    }
  }, [selectedStudentId, students]);

  useEffect(() => {
    if (internalSelectedStudentId && !students.some((student) => student.id === internalSelectedStudentId)) {
      setInternalSelectedStudentId('');
      onSelectStudent?.('');
    }
  }, [internalSelectedStudentId, onSelectStudent, students]);

  const selectedStudent = internalSelectedStudentId
    ? students.find((student) => student.id === internalSelectedStudentId) ?? null
    : null;

  if (selectedStudent) {
    return (
      <StudentDetailView
        student={selectedStudent}
        progressionRules={progressionRules}
        graduationRequest={graduationRequestByUserId.get(selectedStudent.id) ?? null}
        onBack={() => {
          setInternalSelectedStudentId('');
          onSelectStudent?.('');
        }}
        onApproveGraduationRequest={onApproveGraduationRequest}
        onUpdateStudentBeltGrade={onUpdateStudentBeltGrade}
        onSetStudentAttendanceBonus={onSetStudentAttendanceBonus}
        onAdminUpdateStudentProfile={onAdminUpdateStudentProfile}
        onAdminUpdateStudentTimeline={onAdminUpdateStudentTimeline}
        onAdminUpdateStudentPhoto={onAdminUpdateStudentPhoto}
      />
    );
  }

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-section-label">{kicker}</p>
            <h1 className="app-section-title">{title}</h1>
            <p className="app-section-copy">
              {description ?? academyName ?? 'Selecione uma unidade da LEVEL para abrir a base de alunos.'}
            </p>
          </div>
        </div>

        {requireAcademySelection ? (
          <label className="app-field mt-6 max-w-sm">
            <span className="app-field__label">Unidade em foco</span>
            <select value={selectedAcademyId} onChange={(event) => onSelectAcademy?.(event.target.value)} className="app-select">
              <option value="">Selecione uma unidade</option>
              {academies.map((academyOption) => (
                <option key={academyOption.id} value={academyOption.id}>{academyOption.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        {!shouldChooseAcademyFirst ? (
          <div className="mt-6 student-roster__filter-grid">
            <label className="app-field student-roster__search">
              <span className="app-field__label">Buscar aluno</span>
              <div className="app-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Nome ou sobrenome"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="app-input pl-11"
                />
              </div>
            </label>

            <label className="app-field">
              <span className="app-field__label">Faixa</span>
              <select value={filterBelt} onChange={(event) => setFilterBelt(event.target.value as BeltColor | 'ALL')} className="app-select app-select--compact">
                <option value="ALL">Todas as faixas</option>
                {ALL_BELTS.map((belt) => (
                  <option key={belt} value={belt}>{beltLabel(belt)}</option>
                ))}
              </select>
            </label>

            <label className="app-field">
              <span className="app-field__label">Grau</span>
              <select value={filterGrade} onChange={(event) => setFilterGrade(event.target.value)} className="app-select app-select--compact">
                <option value="ALL">Todos os graus</option>
                {gradeOptions.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
            </label>

            <label className="app-field">
              <span className="app-field__label">Ordenar por</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="app-select app-select--compact">
                <option value="name-asc">Nome A-Z</option>
                <option value="name-desc">Nome Z-A</option>
                <option value="belt-desc">Faixa mais alta primeiro</option>
                <option value="grade-desc">Grau mais alto primeiro</option>
              </select>
            </label>

            <div className="app-chip-row student-roster__type-row">
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
          </div>
        ) : null}
      </section>

      {shouldChooseAcademyFirst ? (
        <section className="app-panel app-panel-pad">
          <div className="app-empty">{emptySelectionMessage}</div>
        </section>
      ) : (
        <section className="student-roster__cards">
          {visibleStudents.map((student) => (
            <button
              key={student.id}
              type="button"
              onClick={() => {
                setInternalSelectedStudentId(student.id);
                onSelectStudent?.(student.id);
              }}
              className="app-list-card student-roster__card"
            >
              <div className="student-roster__avatar-column">
                <AvatarWithBelt
                  avatar={student.avatar}
                  name={student.name}
                  belt={student.belt}
                  stripes={student.stripes}
                  size="md"
                />
                <p className="student-roster__rank">Faixa {beltLabel(student.belt)}</p>
                <p className="student-roster__grade">Grau {getStudentGrade(student)}</p>
              </div>

              <div className="student-roster__copy">
                <h3 className="student-roster__name">{student.name}</h3>
                <div className="student-roster__badge-row">
                  <span className="app-badge app-badge--muted">{student.type}</span>
                  {student.status ? <span className="app-badge app-badge--muted">{student.status}</span> : null}
                  {graduationRequestByUserId.has(student.id) ? (
                    <span className="app-badge app-badge--gold">Graduação pendente</span>
                  ) : null}
                </div>
                {(() => {
                  const hint = getProgressionHint(student, progressionRules);
                  return hint ? (
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">{hint}</p>
                  ) : null;
                })()}
              </div>

              <ChevronRight size={18} className="student-roster__arrow" />
            </button>
          ))}

          {visibleStudents.length === 0 ? (
            <div className="app-empty">{emptyResultsMessage}</div>
          ) : null}
        </section>
      )}
    </div>
  );
};

export default StudentRoster;
