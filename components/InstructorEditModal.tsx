import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Save, ShieldCheck, User } from 'lucide-react';
import { ADULT_BELTS, beltLabel, getBlackBeltProgress, isBlackBelt } from '../beltCatalog';
import DateField from './DateField';
import type { FirestoreEntity } from '../services/firebase/data';
import type { UserRecord } from '../services/firebase/models';

interface InstructorEditModalProps {
  instructor: FirestoreEntity<UserRecord>;
  onClose: () => void;
  onSave: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    newPassword?: string;
    plainPassword?: string;
    phone?: string;
    belt?: string;
    grade?: number;
    lastGraduationDateOverride?: string;
    blackBeltDegreeManual?: number | null;
  }) => Promise<void>;
}

// Converte um Timestamp do Firestore para o formato yyyy-mm-dd do <input type="date">.
function timestampToInputDate(value?: { toDate?: () => Date; seconds?: number } | null): string {
  if (!value) return '';
  const date = typeof value.toDate === 'function'
    ? value.toDate()
    : typeof value.seconds === 'number'
      ? new Date(value.seconds * 1000)
      : null;
  if (!date || Number.isNaN(date.valueOf())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const InstructorEditModal: React.FC<InstructorEditModalProps> = ({ instructor, onClose, onSave }) => {
  const [firstName, setFirstName] = useState(instructor.firstName ?? '');
  const [lastName, setLastName] = useState(instructor.lastName ?? '');
  const [email, setEmail] = useState(instructor.email ?? '');
  const [phone, setPhone] = useState(instructor.phone ?? '');
  const [belt, setBelt] = useState(instructor.belt ?? 'white');
  const [grade, setGrade] = useState(instructor.grade ?? 0);
  const [blackBeltDate, setBlackBeltDate] = useState(timestampToInputDate(instructor.lastGraduationDateOverride));
  const [blackBeltManual, setBlackBeltManual] = useState(
    instructor.blackBeltDegreeManual == null ? '' : String(instructor.blackBeltDegreeManual),
  );
  const [plainPassword, setPlainPassword] = useState(instructor.plainPassword ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [showPlain, setShowPlain] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const hasStoredPassword = Boolean(instructor.plainPassword);
  const beltIsBlack = isBlackBelt(belt);
  // Faixa preta: grau por tempo a partir da data da preta; override manual (opcional) vence.
  const manualDegree = blackBeltManual.trim() === ''
    ? null
    : Math.max(0, Math.min(9, Math.floor(Number(blackBeltManual) || 0)));
  const autoBlackBeltDegree = beltIsBlack ? (getBlackBeltProgress(blackBeltDate)?.degree ?? 0) : 0;
  const blackBeltPreview = beltIsBlack ? getBlackBeltProgress(blackBeltDate, undefined, manualDegree) : null;
  const effectiveGrade = beltIsBlack && blackBeltPreview ? blackBeltPreview.degree : grade;

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    setError('');

    try {
      await onSave({
        userId: instructor.id,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim() !== instructor.email ? email.trim() : undefined,
        phone: phone.trim() || undefined,
        belt: belt || undefined,
        grade: effectiveGrade,
        lastGraduationDateOverride: beltIsBlack ? (blackBeltDate || undefined) : undefined,
        blackBeltDegreeManual: beltIsBlack ? manualDegree : undefined,
        plainPassword: newPassword.trim() ? newPassword.trim() : (plainPassword || undefined),
        newPassword: newPassword.trim() || undefined,
      });
      setFeedback('Dados do instrutor atualizados com sucesso.');
      if (newPassword.trim()) {
        setPlainPassword(newPassword.trim());
        setNewPassword('');
      }
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
          <p className="app-section-label">Edição do instrutor</p>
          <h1 className="text-2xl font-bold">{instructor.displayName}</h1>
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
              <span className="app-field__label">E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="app-input"
                placeholder="email@exemplo.com"
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
          </div>
        </section>

        <section className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="app-section-label">Graduação</p>
              <h2 className="text-xl font-bold">Faixa e grau</h2>
            </div>
          </div>

          <div className="mt-6 app-grid-2">
            <label className="app-field">
              <span className="app-field__label">Faixa</span>
              <select value={belt} onChange={(e) => setBelt(e.target.value)} className="app-input">
                {ADULT_BELTS.map((b) => (
                  <option key={b} value={b}>{beltLabel(b)}</option>
                ))}
              </select>
            </label>

            {beltIsBlack ? (
              <>
                <label className="app-field">
                  <span className="app-field__label">Data da faixa preta</span>
                  <DateField value={blackBeltDate} onChange={setBlackBeltDate} />
                  <span className="app-field__hint">
                    {blackBeltPreview
                      ? `${blackBeltPreview.label} · ${blackBeltPreview.years} ${blackBeltPreview.years === 1 ? 'ano' : 'anos'} de faixa preta${blackBeltPreview.styleNote ? ` (${blackBeltPreview.styleNote})` : ''}.`
                      : 'Informe a data em que recebeu a preta para calcular o grau por tempo (IBJJF).'}
                  </span>
                </label>

                <label className="app-field">
                  <span className="app-field__label">Grau manual (opcional)</span>
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={blackBeltManual}
                    onChange={(e) => setBlackBeltManual(
                      e.target.value === '' ? '' : String(Math.max(0, Math.min(9, Math.floor(Number(e.target.value) || 0)))),
                    )}
                    className="app-input"
                    placeholder={`Automático (${autoBlackBeltDegree}º)`}
                  />
                  <span className="app-field__hint">Deixe vazio para usar o grau automático pela data. Preencha só para ajustar manualmente.</span>
                </label>
              </>
            ) : (
              <label className="app-field">
                <span className="app-field__label">Grau</span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={grade}
                  onChange={(e) => setGrade(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  className="app-input"
                />
              </label>
            )}
          </div>
        </section>

        <section className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <KeyRound size={18} />
            </div>
            <div>
              <p className="app-section-label">Acesso</p>
              <h2 className="text-xl font-bold">Senha do instrutor</h2>
            </div>
          </div>

          {!hasStoredPassword && !newPassword && (
            <div className="mt-4 app-alert app-alert--warning">
              Senha não registrada. Este instrutor foi cadastrado antes desta funcionalidade. Defina uma nova senha abaixo para registrá-la.
            </div>
          )}

          <div className="mt-6 space-y-4">
            {hasStoredPassword && (
              <label className="app-field">
                <span className="app-field__label">Senha atual (visível)</span>
                <div className="flex gap-2">
                  <input
                    type={showPlain ? 'text' : 'password'}
                    value={plainPassword}
                    onChange={(e) => setPlainPassword(e.target.value)}
                    className="app-input flex-1"
                    placeholder="Senha salva"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPlain((v) => !v)}
                    className="app-button app-button--ghost app-button--icon"
                    title={showPlain ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPlain ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span className="app-field__hint">Senha registrada no cadastro. Edite aqui se houve troca manual.</span>
              </label>
            )}

            <label className="app-field">
              <span className="app-field__label">Redefinir senha</span>
              <div className="flex gap-2">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="app-input flex-1"
                  placeholder="Nova senha (deixe vazio para não alterar)"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="app-button app-button--ghost app-button--icon"
                  title={showNew ? 'Ocultar' : 'Mostrar'}
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span className="app-field__hint">Se preenchido, altera o acesso do instrutor e salva aqui para consulta futura.</span>
            </label>
          </div>
        </section>

        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="app-button app-button--gold flex-1">
            <Save size={16} />
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" onClick={onClose} className="app-button app-button--ghost">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
};

export default InstructorEditModal;
