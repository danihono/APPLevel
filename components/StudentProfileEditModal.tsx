import React, { useState } from 'react';
import { ArrowLeft, Save, User, Calendar } from 'lucide-react';
import type { User as UserType } from '../types';
import { useConfirm } from './ConfirmDialog';

interface StudentProfileEditModalProps {
  student: UserType;
  onClose: () => void;
  onAdminUpdateStudentProfile?: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    cpf?: string;
    birthDate?: string;
    email?: string;
    isCompetitor?: boolean;
  }) => Promise<void>;
  onAdminUpdateStudentTimeline?: (payload: {
    userId: string;
    trainingStartDate?: string;
    lastGraduationDateOverride?: string;
    lastStripeDateOverride?: string;
  }) => Promise<void>;
  onSetStudentAttendanceBonus?: (payload: { userId: string; attendanceCountBonus: number }) => Promise<void>;
}

function toInputDate(isoOrFormatted?: string): string {
  if (!isoOrFormatted) return '';
  const d = new Date(isoOrFormatted);
  if (Number.isNaN(d.valueOf())) return '';
  return d.toISOString().slice(0, 10);
}

const StudentProfileEditModal: React.FC<StudentProfileEditModalProps> = ({
  student,
  onClose,
  onAdminUpdateStudentProfile,
  onAdminUpdateStudentTimeline,
  onSetStudentAttendanceBonus,
}) => {
  const [firstName, setFirstName] = useState(student.firstName ?? student.name.split(' ')[0] ?? '');
  const [lastName, setLastName] = useState(
    student.lastName ?? student.name.split(' ').slice(1).join(' ') ?? '',
  );
  const [phone, setPhone] = useState(student.phone ?? '');
  const [cpf, setCpf] = useState(student.cpf ?? '');
  const [birthDate, setBirthDate] = useState(toInputDate(student.birthDate));
  const [email, setEmail] = useState(student.email ?? '');
  const [isCompetitor, setIsCompetitor] = useState(student.isCompetitor ?? false);

  const [trainingStartDate, setTrainingStartDate] = useState(toInputDate(student.trainingStartDate ?? student.startDate));
  const [lastGraduationDate, setLastGraduationDate] = useState(toInputDate(student.lastGraduationDateOverride ?? student.lastGraduation));
  const [lastStripeDate, setLastStripeDate] = useState(toInputDate(student.lastStripeDateOverride ?? student.lastStripeDate));
  const [attendanceBonus, setAttendanceBonus] = useState(student.attendanceCountBonus ?? 0);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const confirm = useConfirm();

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onAdminUpdateStudentProfile && !onAdminUpdateStudentTimeline) return;

    const emailTrimmed = email.trim();
    const emailChanged =
      !!emailTrimmed && emailTrimmed.toLowerCase() !== (student.email ?? '').toLowerCase();
    if (
      emailChanged
      && !(await confirm({
        title: 'Alterar e-mail',
        message: `Alterar o e-mail de ${student.name} para "${emailTrimmed}"?\n\n`
          + 'O aluno passará a entrar no app com este novo e-mail.',
        confirmLabel: 'Alterar e-mail',
      }))
    ) {
      return;
    }

    setBusy(true);
    setFeedback('');
    setError('');

    try {
      if (onAdminUpdateStudentProfile) {
        await onAdminUpdateStudentProfile({
          userId: student.id,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          phone: phone.trim() || undefined,
          cpf: cpf.trim() || undefined,
          birthDate: birthDate || undefined,
          email: emailTrimmed || undefined,
          isCompetitor,
        });
      }

      if (onAdminUpdateStudentTimeline) {
        await onAdminUpdateStudentTimeline({
          userId: student.id,
          trainingStartDate: trainingStartDate || undefined,
          lastGraduationDateOverride: lastGraduationDate || undefined,
          lastStripeDateOverride: lastStripeDate || undefined,
        });
      }

      if (onSetStudentAttendanceBonus) {
        await onSetStudentAttendanceBonus({ userId: student.id, attendanceCountBonus: attendanceBonus });
      }

      setFeedback('Dados do aluno atualizados com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar os dados.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view-shell">
      <div className="flex items-center gap-4">
        <button type="button" onClick={onClose} className="app-button app-button--ghost app-button--icon">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="app-section-label">Edição completa</p>
          <h1 className="text-2xl font-bold">{student.name}</h1>
        </div>
      </div>

      {(feedback || error) ? (
        <section className="space-y-3">
          {feedback ? <div className="app-alert app-alert--success">{feedback}</div> : null}
          {error ? <div className="app-alert app-alert--error">{error}</div> : null}
        </section>
      ) : null}

      <form onSubmit={handleSave} className="space-y-6">
        <section className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <User size={18} />
            </div>
            <div>
              <p className="app-section-label">Dados pessoais</p>
              <h2 className="text-xl font-bold">Informações cadastrais</h2>
            </div>
          </div>

          <div className="mt-6 app-grid-2">
            <label className="app-field">
              <span className="app-field__label">Nome</span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="app-input"
                placeholder="Nome"
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">Sobrenome</span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="app-input"
                placeholder="Sobrenome"
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">Telefone</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="app-input"
                placeholder="(11) 99999-9999"
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">CPF</span>
              <input
                type="text"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                className="app-input"
                placeholder="000.000.000-00"
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">Data de nascimento</span>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="app-input"
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="app-input"
                placeholder="aluno@email.com"
              />
              <span className="app-field__hint">Alterar o e-mail muda o login do aluno: ele passará a entrar com o novo e-mail.</span>
            </label>
          </div>

          <label className="mt-4 flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isCompetitor}
              onChange={(e) => setIsCompetitor(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm font-medium">Aluno competidor</span>
          </label>
        </section>

        <section className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Calendar size={18} />
            </div>
            <div>
              <p className="app-section-label">Histórico</p>
              <h2 className="text-xl font-bold">Datas da linha do tempo</h2>
            </div>
          </div>

          <p className="mt-4 text-sm text-[color:var(--text-muted)]">
            Corrija as datas que aparecem na linha do tempo do aluno. Util para alunos cadastrados depois de ja terem iniciado os treinos.
          </p>

          <div className="mt-6 space-y-4">
            <label className="app-field">
              <span className="app-field__label">Início dos treinos</span>
              <input
                type="date"
                value={trainingStartDate}
                onChange={(e) => setTrainingStartDate(e.target.value)}
                className="app-input"
              />
              <span className="app-field__hint">Data real em que o aluno começou a treinar na academia</span>
            </label>

            <label className="app-field">
              <span className="app-field__label">Última graduação</span>
              <input
                type="date"
                value={lastGraduationDate}
                onChange={(e) => setLastGraduationDate(e.target.value)}
                className="app-input"
              />
              <span className="app-field__hint">Substitui a data calculada automaticamente pelo sistema</span>
            </label>

            <label className="app-field">
              <span className="app-field__label">Último grau recebido</span>
              <input
                type="date"
                value={lastStripeDate}
                onChange={(e) => setLastStripeDate(e.target.value)}
                className="app-input"
              />
              <span className="app-field__hint">Substitui a data calculada automaticamente pelo sistema</span>
            </label>

            {onSetStudentAttendanceBonus ? (
              <label className="app-field">
                <span className="app-field__label">Aulas anteriores</span>
                <input
                  type="number"
                  min={0}
                  value={attendanceBonus}
                  onChange={(e) => setAttendanceBonus(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  className="app-input"
                />
                <span className="app-field__hint">Aulas realizadas antes do cadastro no sistema</span>
              </label>
            ) : null}
          </div>
        </section>

        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="app-button app-button--gold flex-1">
            <Save size={16} />
            {busy ? 'Salvando...' : 'Salvar todos os dados'}
          </button>
          <button type="button" onClick={onClose} className="app-button app-button--ghost">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudentProfileEditModal;
