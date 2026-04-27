import React, { useEffect, useMemo, useState } from 'react';
import {
  beltLabel,
  getClassesToNextBelt,
  getBeltOptions,
  getProgressionRuleForUser,
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

    if (studentKidsCategory) {
      return 'Kids';
    }

    return inferTrainingTypeFromBirthDate(student.birthDate);
  }, [student.birthDate, studentBelt, studentKidsCategory]);

  const studentBeltOptions = useMemo(() => {
    const baseOptions = getBeltOptions(studentTrack, studentKidsCategory || undefined);
    if (baseOptions.some((entry) => entry.value === studentBelt)) {
      return baseOptions;
    }

    return [...baseOptions, { value: studentBelt, label: beltLabel(studentBelt) }];
  }, [studentBelt, studentKidsCategory, studentTrack]);
  const progressionRule = useMemo(
    () => getProgressionRuleForUser({
      belt: student.belt,
      type: student.type,
      kidsCategory: student.kidsCategory,
      birthDate: student.birthDate,
    }, progressionRules),
    [progressionRules, student.belt, student.birthDate, student.kidsCategory, student.type],
  );
  const stripeTotal = progressionRule && progressionRule.stripeEvery > 0
    ? progressionRule.stripeEvery
    : student.classesToNextStripe;
  const beltTotal = progressionRule && progressionRule.stripeEvery > 0
    ? getClassesToNextBelt(progressionRule)
    : student.totalClassesToNextBelt;
  const stripeProgress = Math.max(0, Math.min(student.currentStripeProgress, stripeTotal || student.currentStripeProgress));
  const beltProgress = Math.max(0, Math.min(student.currentBeltProgress, beltTotal || student.currentBeltProgress));

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
      setFeedback('Graduacao aprovada com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nao foi possivel aprovar a graduacao.');
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
      setFeedback('Graduacao do aluno atualizada com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nao foi possivel atualizar a graduacao.');
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
      setError(submitError instanceof Error ? submitError.message : 'Nao foi possivel salvar as aulas extras.');
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
              <p className="app-section-label">Graduacao pendente</p>
              <h2 className="text-xl font-bold">Aprovacao sugerida pela progressao</h2>
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                {graduationRequest.remainingClasses <= 0
                  ? 'A meta ja foi atingida e o aluno aguarda sua aprovacao.'
                  : `Falta ${graduationRequest.remainingClasses} presenca para liberar a avaliacao formal.`}
              </p>
            </div>
            <span className="app-badge app-badge--gold">{graduationRequest.targetType === 'belt' ? 'Faixa' : 'Grau'}</span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="app-badge app-badge--muted">Atual: {beltLabel(graduationRequest.currentBelt)} • {graduationRequest.currentStripes} grau(s)</span>
            <span className="app-badge app-badge--muted">Proximo passo: {graduationTargetLabel(graduationRequest)}</span>
            <span className="app-badge app-badge--muted">Meta: {graduationRequest.attendanceTarget} presencas</span>
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
                {approveBusy ? 'Aprovando...' : 'Aprovar proxima graduacao'}
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
              <p className="app-section-label">Graduacao manual</p>
              <h2 className="text-xl font-bold">Adiantar ou ajustar faixa e grau</h2>
            </div>
          </div>

          <div className="mt-6 app-grid-2">
            <label className="app-field">
              <span className="app-field__label">Faixa</span>
              <select value={studentBelt} onChange={(event) => setStudentBelt(event.target.value as typeof student.belt)} className="app-select">
                {studentBeltOptions.map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </select>
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
            {saveBusy ? 'Salvando...' : 'Salvar graduacao do aluno'}
          </button>
        </form>
      ) : null}

      {onSetStudentAttendanceBonus ? (
        <form onSubmit={handleSaveAttendanceBonus} className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <BookOpen size={18} />
            </div>
            <div>
              <p className="app-section-label">Aulas anteriores</p>
              <h2 className="text-xl font-bold">Aulas antes do cadastro</h2>
            </div>
          </div>

          <p className="mt-4 text-sm text-[color:var(--text-muted)]">
            Informe quantas aulas o aluno ja realizou antes de ser cadastrado no sistema. Esse valor sera somado aos check-ins futuros.
          </p>

          <div className="mt-6">
            <label className="app-field">
              <span className="app-field__label">Aulas anteriores</span>
              <input
                type="number"
                min={0}
                value={attendanceBonus}
                onChange={(event) => setAttendanceBonus(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                className="app-input"
              />
              <span className="app-field__hint">
                {attendanceBonus > 0
                  ? `${attendanceBonus} aula(s) anteriores somadas ao total do aluno`
                  : 'Nenhuma aula anterior registrada'}
              </span>
            </label>
          </div>

          <button type="submit" disabled={bonusBusy} className="app-button app-button--gold mt-6">
            <Save size={16} />
            {bonusBusy ? 'Salvando...' : 'Salvar ajuste de aulas'}
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
            <h2 className="text-xl font-bold">Avanco atual</h2>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <ProgressBar current={stripeProgress} total={stripeTotal} />
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              Proximo grau: {stripeProgress}/{stripeTotal} aulas
            </p>
          </div>
          <div>
            <ProgressBar current={beltProgress} total={beltTotal} color="bg-gold" />
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              Proxima faixa: {beltProgress}/{beltTotal} aulas
            </p>
          </div>
        </div>
      </section>

      {student.videos && student.videos.length > 0 ? (
        <section className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Video size={18} />
            </div>
            <div>
              <p className="app-section-label">Videos</p>
              <h2 className="text-xl font-bold">Arquivo de videos</h2>
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
            <p className="app-section-label">Historico</p>
            <h2 className="text-xl font-bold">Linha do tempo</h2>
          </div>
        </div>

        <div className="mt-6 app-list">
          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <Calendar size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Inicio dos treinos</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(student.startDate)}</p>
            </div>
          </div>

          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <Award size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Ultima graduacao</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(student.lastGraduation)}</p>
            </div>
          </div>

          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Ultimo grau recebido</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(student.lastStripeDate)}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default StudentDetailView;
