import React, { useEffect, useMemo, useState } from 'react';
import {
  beltLabel,
  getBeltOptions,
  getUserProgressionSummary,
  inferKidsCategoryFromBirthDate,
  inferTrainingTypeFromBirthDate,
  isKidsOnlyBelt,
  kidsCategoryLabel,
  KIDS_CATEGORIES,
  type ProgressionRules,
} from '../beltCatalog';
import { ArrowLeft, Award, Calendar, CheckCircle2, Clock, Edit, Mail, Save, TrendingUp, Video, BookOpen } from 'lucide-react';
import AppVideoContent from '../components/AppVideoContent';
import AvatarWithBelt from '../components/AvatarWithBelt';
import ProgressBar from '../components/ProgressBar';
import StudentProfileEditModal from '../components/StudentProfileEditModal';
import type { FirestoreEntity } from '../services/firebase/data';
import type { GraduationApprovalRequestRecord } from '../services/firebase/models';
import type { KidsCategory, User } from '../types';

interface StudentDetailViewProps {
  student: User;
  progressionRules?: ProgressionRules | null;
  graduationRequest?: FirestoreEntity<GraduationApprovalRequestRecord> | null;
  onBack: () => void;
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
}

function formatDate(value?: string) {
  if (!value) {
    return 'Sem registro';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return parsed.toLocaleDateString('pt-BR');
}

function graduationTargetLabel(request: FirestoreEntity<GraduationApprovalRequestRecord>) {
  return request.targetType === 'belt'
    ? `Faixa ${beltLabel(request.targetBelt)}`
    : `${request.targetStripes} grau(s) na faixa ${beltLabel(request.targetBelt)}`;
}

const StudentDetailView: React.FC<StudentDetailViewProps> = ({
  student,
  progressionRules,
  graduationRequest = null,
  onBack,
  onApproveGraduationRequest,
  onUpdateStudentBeltGrade,
  onSetStudentAttendanceBonus,
  onAdminUpdateStudentProfile,
  onAdminUpdateStudentTimeline,
}) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const age = student.birthDate
    ? new Date().getFullYear() - new Date(student.birthDate).getFullYear()
    : 28;
  const inferredKidsCategory = inferKidsCategoryFromBirthDate(student.birthDate);
  const inferredTrainingType = inferTrainingTypeFromBirthDate(student.birthDate);
  const canUseAdultGraduation = inferredTrainingType === 'Adulto';
  const [studentBelt, setStudentBelt] = useState(student.belt);
  const [studentGrade, setStudentGrade] = useState(student.stripes);
  const [studentKidsCategory, setStudentKidsCategory] = useState<KidsCategory | ''>(student.kidsCategory ?? inferredKidsCategory ?? '');
  const [attendanceBonus, setAttendanceBonus] = useState(student.attendanceCountBonus ?? 0);
  const [approveBusy, setApproveBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [bonusBusy, setBonusBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setStudentBelt(student.belt);
    setStudentGrade(student.stripes);
    setStudentKidsCategory(student.kidsCategory ?? inferKidsCategoryFromBirthDate(student.birthDate) ?? '');
    setAttendanceBonus(student.attendanceCountBonus ?? 0);
  }, [student]);

  const studentTrack = useMemo<'Adulto' | 'Kids'>(() => {
    if (isKidsOnlyBelt(studentBelt)) {
      return 'Kids';
    }

    if (!canUseAdultGraduation && studentKidsCategory) {
      return 'Kids';
    }

    return inferredTrainingType;
  }, [canUseAdultGraduation, inferredTrainingType, studentBelt, studentKidsCategory]);

  const studentBeltOptions = useMemo(() => {
    const baseOptions = canUseAdultGraduation
      ? getBeltOptions('Adulto')
      : getBeltOptions(studentTrack, studentKidsCategory || undefined);
    if (baseOptions.some((entry) => entry.value === studentBelt)) {
      return baseOptions;
    }

    return [...baseOptions, { value: studentBelt, label: beltLabel(studentBelt) }];
  }, [canUseAdultGraduation, studentBelt, studentKidsCategory, studentTrack]);

  function handleStudentBeltChange(value: string) {
    const nextBelt = value as typeof student.belt;
    setStudentBelt(nextBelt);

    if (canUseAdultGraduation && !isKidsOnlyBelt(nextBelt)) {
      setStudentKidsCategory('');
    }
  }
  const progression = useMemo(
    () => getUserProgressionSummary({
      ...student,
      belt: studentBelt,
      stripes: studentGrade,
    }, progressionRules),
    [progressionRules, student, studentBelt, studentGrade],
  );
  const stripeTotal = progression.stripeTotal;
  const beltTotal = progression.beltTotal;
  const stripeProgress = progression.stripeProgress;
  const beltProgress = progression.beltProgress;

  useEffect(() => {
    if (!studentBeltOptions.length) {
      return;
    }

    if (!studentBeltOptions.some((entry) => entry.value === studentBelt)) {
      setStudentBelt(studentBeltOptions[0].value);
      setStudentGrade(0);
    }
  }, [studentBelt, studentBeltOptions]);

  async function handleApproveSuggested() {
    if (!graduationRequest || !onApproveGraduationRequest) {
      return;
    }

    setApproveBusy(true);
    setFeedback('');
    setError('');

    try {
      await onApproveGraduationRequest(graduationRequest.id);
      setFeedback('Graduação aprovada com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível aprovar a graduação.');
    } finally {
      setApproveBusy(false);
    }
  }

  async function handleSaveManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onUpdateStudentBeltGrade) {
      return;
    }

    setSaveBusy(true);
    setFeedback('');
    setError('');

    try {
      await onUpdateStudentBeltGrade({
        userId: student.id,
        belt: studentBelt,
        grade: studentGrade,
        stripes: studentGrade,
        kidsCategory: studentTrack === 'Kids' ? studentKidsCategory : '',
      });
      if (onSetStudentAttendanceBonus) {
        await onSetStudentAttendanceBonus({ userId: student.id, attendanceCountBonus: attendanceBonus });
      }
      setFeedback('Graduação do aluno atualizada com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível atualizar a graduação.');
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleSaveAttendanceBonus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onSetStudentAttendanceBonus) {
      return;
    }

    setBonusBusy(true);
    setFeedback('');
    setError('');

    try {
      await onSetStudentAttendanceBonus({ userId: student.id, attendanceCountBonus: attendanceBonus });
      setFeedback('Aulas extras salvas com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar as aulas extras.');
    } finally {
      setBonusBusy(false);
    }
  }

  if (showEditModal) {
    return (
      <StudentProfileEditModal
        student={student}
        onClose={() => setShowEditModal(false)}
        onAdminUpdateStudentProfile={onAdminUpdateStudentProfile}
        onAdminUpdateStudentTimeline={onAdminUpdateStudentTimeline}
        onSetStudentAttendanceBonus={onSetStudentAttendanceBonus}
      />
    );
  }

  return (
    <div className="view-shell">
      <div className="flex items-center gap-4">
        <button type="button" onClick={onBack} className="app-button app-button--ghost app-button--icon">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="app-section-label">Perfil do aluno</p>
          <h1 className="text-2xl font-bold">{student.name}</h1>
        </div>
      </div>

      <section className="app-panel app-panel--hero app-panel-pad text-center">
        <div className="flex justify-center">
          <AvatarWithBelt
            avatar={student.avatar}
            name={student.name}
            belt={student.belt}
            stripes={student.stripes}
            size="lg"
          />
        </div>
        <h2 className="mt-4 text-3xl font-bold">{student.name}</h2>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">{student.type} - {age} anos</p>

        <div className="app-panel app-panel--soft mt-6 px-4 py-4">
          <div className="flex items-center justify-center gap-2 text-sm text-[color:var(--text-muted)]">
            <Mail size={16} />
            {student.email}
          </div>
        </div>

        {(onAdminUpdateStudentProfile || onAdminUpdateStudentTimeline) ? (
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="app-button app-button--ghost mt-4 w-full"
          >
            <Edit size={16} />
            Editar dados completos
          </button>
        ) : null}
      </section>

      {graduationRequest ? (
        <section className="app-panel app-panel-pad">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="app-section-label">Graduação pendente</p>
              <h2 className="text-xl font-bold">Aprovação sugerida pela progressão</h2>
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                {graduationRequest.remainingClasses <= 0
                  ? 'A meta já foi atingida e o aluno aguarda sua aprovação.'
                  : `Falta ${graduationRequest.remainingClasses} presença para liberar a avaliação formal.`}
              </p>
            </div>
            <span className="app-badge app-badge--gold">{graduationRequest.targetType === 'belt' ? 'Faixa' : 'Grau'}</span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="app-badge app-badge--muted">Atual: {beltLabel(graduationRequest.currentBelt)} • {graduationRequest.currentStripes} grau(s)</span>
            <span className="app-badge app-badge--muted">Próximo passo: {graduationTargetLabel(graduationRequest)}</span>
            <span className="app-badge app-badge--muted">
              {graduationRequest.remainingClasses <= 0 ? 'Meta atingida' : `Restam ${graduationRequest.remainingClasses} aula(s)`}
            </span>
          </div>

          {onApproveGraduationRequest ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleApproveSuggested()}
                disabled={approveBusy}
                className="app-button app-button--gold"
              >
                <CheckCircle2 size={16} />
                {approveBusy ? 'Aprovando...' : 'Aprovar próxima graduação'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {(feedback || error) ? (
        <section className="space-y-3">
          {feedback ? <div className="app-alert app-alert--success">{feedback}</div> : null}
          {error ? <div className="app-alert app-alert--error">{error}</div> : null}
        </section>
      ) : null}

      {onUpdateStudentBeltGrade ? (
        <form onSubmit={handleSaveManual} className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Save size={18} />
            </div>
            <div>
              <p className="app-section-label">Graduação manual</p>
              <h2 className="text-xl font-bold">Adiantar ou ajustar faixa e grau</h2>
            </div>
          </div>

          <div className="mt-6 app-grid-2">
            <label className="app-field">
              <span className="app-field__label">Faixa</span>
              <select value={studentBelt} onChange={(event) => handleStudentBeltChange(event.target.value)} className="app-select">
                {studentBeltOptions.map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </select>
              {canUseAdultGraduation ? (
                <span className="app-field__hint">Aluno liberado para faixas adultas pelo ano em que completa 16.</span>
              ) : null}
            </label>

            <label className="app-field">
              <span className="app-field__label">Grau</span>
              <input
                type="number"
                min={0}
                value={studentGrade}
                onChange={(event) => setStudentGrade(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                className="app-input"
              />
            </label>

            {onSetStudentAttendanceBonus ? (
              <label className="app-field">
                <span className="app-field__label">Aulas anteriores</span>
                <input
                  type="number"
                  min={0}
                  value={attendanceBonus}
                  onChange={(event) => setAttendanceBonus(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                  className="app-input"
                />
                <span className="app-field__hint">Aulas realizadas antes do cadastro no sistema</span>
              </label>
            ) : null}

            {studentTrack === 'Kids' ? (
              <label className="app-field md:col-span-2">
                <span className="app-field__label">Categoria kids</span>
                <select
                  value={studentKidsCategory}
                  onChange={(event) => setStudentKidsCategory(event.target.value as KidsCategory | '')}
                  className="app-select"
                >
                  <option value="">Inferir pela idade</option>
                  {KIDS_CATEGORIES.map((entry) => (
                    <option key={entry.value} value={entry.value}>{entry.label}</option>
                  ))}
                </select>
                <span className="app-field__hint">
                  {studentKidsCategory
                    ? `Categoria atual: ${kidsCategoryLabel(studentKidsCategory)}`
                    : `Categoria sugerida: ${kidsCategoryLabel(inferredKidsCategory)}`}
                </span>
              </label>
            ) : null}
          </div>

          <button type="submit" disabled={saveBusy} className="app-button app-button--gold mt-6">
            <Save size={16} />
            {saveBusy ? 'Salvando...' : 'Salvar graduação do aluno'}
          </button>
        </form>
      ) : null}


      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="app-section-label">Progresso</p>
            <h2 className="text-xl font-bold">Avanço atual</h2>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <ProgressBar current={stripeProgress} total={stripeTotal} />
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              {stripeTotal > 0
                ? `Próximo grau: ${stripeProgress}/${stripeTotal} aulas`
                : 'Próximo grau: progressão manual'}
            </p>
          </div>
          <div>
            <ProgressBar current={beltProgress} total={beltTotal} color="bg-gold" />
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              {beltTotal > 0
                ? `Próxima faixa: ${beltProgress}/${beltTotal} aulas`
                : 'Próxima faixa: progressão manual'}
            </p>
          </div>
          <p className="text-xs text-[color:var(--text-soft)]">
            {progression.classesPerStripe > 0
              ? `Regra da faixa: ${progression.classesPerStripe} aulas por grau${progression.beltTotal > 0 ? ` / ${progression.beltTotal} aulas para a próxima faixa` : ''}.`
              : 'Regra da faixa: progressão manual.'}
          </p>
        </div>
      </section>

      {student.videos && student.videos.length > 0 ? (
        <section className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Video size={18} />
            </div>
            <div>
              <p className="app-section-label">Vídeos</p>
              <h2 className="text-xl font-bold">Arquivo de vídeos</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            {student.videos.map((video) => (
              <div key={video.id} className="app-list-card">
                <AppVideoContent
                  title={video.title}
                  sourceUrl={video.url}
                  sourceKind={video.sourceKind}
                />
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{video.title}</p>
                    <span className="app-badge app-badge--muted">
                      {video.origin === 'submission' ? 'Enviado pelo aluno' : 'Luta oficial'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">{video.date}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <Clock size={18} />
          </div>
          <div>
            <p className="app-section-label">Histórico</p>
            <h2 className="text-xl font-bold">Linha do tempo</h2>
          </div>
        </div>

        <div className="mt-6 app-list">
          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <Calendar size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Início dos treinos</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(student.startDate)}</p>
            </div>
          </div>

          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <Award size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Última graduação</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(student.lastGraduation)}</p>
            </div>
          </div>

          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Último grau recebido</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(student.lastStripeDate)}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default StudentDetailView;
