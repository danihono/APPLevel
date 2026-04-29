import React, { useMemo } from 'react';
import { Award, BellRing, BookOpen, Medal, TimerReset } from 'lucide-react';
import {
  beltLabel,
  getClassesToNextBelt,
  getUserProgressionSummary,
  kidsCategoryLabel,
  normalizeProgressionRules,
} from '../beltCatalog';
import BjjBelt from '../components/BjjBelt';
import ProgressBar from '../components/ProgressBar';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, GraduationRecord, UserRecord } from '../services/firebase/models';
import type { User } from '../types';

interface GraduationViewProps {
  user: User;
  profile: FirestoreEntity<UserRecord>;
  academy: FirestoreEntity<AcademyRecord>;
  graduations: Array<FirestoreEntity<GraduationRecord>>;
}

const GraduationView: React.FC<GraduationViewProps> = ({
  user,
  profile,
  academy,
  graduations,
}) => {
  const normalizedRules = useMemo(
    () => normalizeProgressionRules(academy.progressionRules),
    [academy.progressionRules],
  );

  const birthDate = profile.birthDate ?? user.birthDate;
  const progression = useMemo(
    () => getUserProgressionSummary({
      belt: profile.belt,
      grade: profile.grade,
      stripes: profile.stripes,
      type: user.type,
      kidsCategory: profile.kidsCategory ?? user.kidsCategory,
      birthDate,
      attendanceCount: profile.attendanceCount,
      currentStripeProgress: user.currentStripeProgress,
      currentBeltProgress: user.currentBeltProgress,
    }, academy.progressionRules),
    [
      academy.progressionRules,
      birthDate,
      profile.attendanceCount,
      profile.belt,
      profile.grade,
      profile.kidsCategory,
      profile.stripes,
      user.currentBeltProgress,
      user.currentStripeProgress,
      user.kidsCategory,
      user.type,
    ],
  );
  const inferredKidsCategory = progression.kidsCategory ?? profile.kidsCategory ?? user.kidsCategory;
  const trainingType = progression.track;
  const activeRules = progression.activeRules;
  const currentRule = progression.currentRule;

  const stripeProgress = progression.stripeProgress;
  const stripeTotal = progression.stripeTotal;
  const beltProgress = progression.beltProgress;
  const beltTotal = progression.beltTotal;
  const nextStripeRemaining = progression.stripeRemaining;
  const nextBeltRemaining = progression.beltRemaining;
  const examWindow = (nextBeltRemaining !== null && nextBeltRemaining <= 5)
    || (nextStripeRemaining !== null && nextStripeRemaining <= 2);

  return (
    <div className="view-shell">
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="app-section-label">Faixa atual</p>
            <h2 className="mt-2 text-2xl font-bold">{beltLabel(profile.belt)}</h2>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              Grau atual {profile.grade} • {profile.attendanceCount} presencas registradas
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="app-badge app-badge--muted">Regra v{normalizedRules.version}</span>
            <span className="app-badge app-badge--muted">Trilha {trainingType}</span>
            {trainingType === 'Kids' ? (
              <span className="app-badge app-badge--muted">{kidsCategoryLabel(inferredKidsCategory)}</span>
            ) : null}
            {examWindow ? <span className="app-badge app-badge--gold">Janela de exame</span> : null}
          </div>
        </div>

        <div className="mt-5">
          <BjjBelt color={progression.currentBelt} stripes={profile.stripes} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Medal size={20} />
            </div>
            <div>
              <p className="app-section-label">Requisitos</p>
              <h2 className="text-xl font-bold">Proximo passo</h2>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-semibold">Próximo grau</span>
                <span className="text-[color:var(--text-muted)]">
                  {stripeTotal > 0 ? `${stripeProgress} / ${stripeTotal} aulas` : 'Progressão manual'}
                </span>
              </div>
              <ProgressBar current={stripeProgress} total={stripeTotal} />
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                {nextStripeRemaining === null
                  ? 'Essa faixa não tem liberação automática de grau por aulas.'
                  : `Restam ${nextStripeRemaining} aula(s) para atingir o próximo grau.`}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-semibold">Próxima faixa</span>
                <span className="text-[color:var(--text-muted)]">
                  {beltTotal > 0 ? `${beltProgress} / ${beltTotal} aulas` : 'Progressão manual'}
                </span>
              </div>
              <ProgressBar current={beltProgress} total={beltTotal} />
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                {nextBeltRemaining === null
                  ? 'A próxima faixa depende de avaliação manual.'
                  : `Restam ${nextBeltRemaining} aula(s) para a próxima faixa.`}
              </p>
            </div>
          </div>
        </div>

        <div className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <BellRing size={20} />
            </div>
            <div>
              <p className="app-section-label">Aviso</p>
              <h2 className="text-xl font-bold">Status de exame</h2>
            </div>
          </div>

          <div
            className="mt-6 rounded-3xl p-5"
            style={examWindow
              ? { background: 'var(--gold-mid)', color: '#000' }
              : { background: 'var(--bg-deep)' }}
          >
            <p className="text-xs uppercase tracking-[0.3em] opacity-70">Status</p>
            <p className="mt-3 text-2xl font-black">
              {examWindow ? 'Próximo de avaliação' : 'Em acompanhamento'}
            </p>
            <p className="mt-3 text-sm">
              {examWindow
                ? 'Seu perfil já está perto da próxima avaliação. Vale alinhar a expectativa com o professor responsável.'
                : 'Continue registrando presenças e acompanhando os marcos para a próxima graduação.'}
            </p>
          </div>

          {currentRule ? (
            <div className="mt-5 app-list-card">
              <p className="text-sm font-semibold">Regra atual — Faixa {beltLabel(currentRule.belt)}</p>
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                {currentRule.stripeEvery > 0
                  ? `Novo grau a cada ${currentRule.stripeEvery} aulas • máximo ${currentRule.maxStripes} graus${beltTotal > 0 ? ` • ${beltTotal} aulas para a próxima faixa` : ''}`
                  : 'Progressão manual para graus e faixas seguintes.'}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <Award size={20} />
          </div>
          <div>
            <p className="app-section-label">Conquistas</p>
            <h2 className="text-xl font-bold">Histórico de graduações</h2>
          </div>
        </div>

        <div className="mt-6 app-list">
          {[...graduations].sort((a, b) => {
            const aMs = a.promotedAt?.toMillis() ?? 0;
            const bMs = b.promotedAt?.toMillis() ?? 0;
            return bMs - aMs;
          }).map((entry) => (
            <div key={entry.id} className="app-list-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">
                    {beltLabel(entry.previousBelt)} {entry.previousStripes}{' → '}{beltLabel(entry.newBelt)} {entry.newStripes}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {entry.attendanceCount} presenças • {entry.reason.replaceAll('_', ' ')}
                  </p>
                </div>
                <span className="app-badge app-badge--gold">
                  {entry.promotedAt ? entry.promotedAt.toDate().toLocaleDateString('pt-BR') : 'Sem data'}
                </span>
              </div>
            </div>
          ))}

          {graduations.length === 0 ? (
            <div className="app-empty">Ainda não há graduações registradas para este perfil.</div>
          ) : null}
        </div>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <BookOpen size={20} />
          </div>
          <div>
            <p className="app-section-label">Referência</p>
            <h2 className="text-xl font-bold">Regra da faixa atual</h2>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              {trainingType === 'Kids'
                ? `Configuração oficial da academia para ${kidsCategoryLabel(inferredKidsCategory)}.`
                : 'Configuração oficial da academia para o programa adulto.'}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {[currentRule].map((entry, index) => (
            <div key={`${entry.belt}-${index}`} className="app-list-card">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold">{beltLabel(entry.belt)}</p>
                <TimerReset size={16} style={{ color: 'var(--gold-mid)' }} />
              </div>
              <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                {entry.stripeEvery > 0 ? `Grau a cada ${entry.stripeEvery} aulas` : 'Progressão manual'}
              </p>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                {entry.maxStripes > 0 ? `Máximo ${entry.maxStripes} graus` : 'Sem regra automática de graus'}
              </p>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                {entry.stripeEvery > 0 && entry.maxStripes > 0
                  ? `Próxima faixa em ${getClassesToNextBelt(entry)} aulas`
                  : 'Avaliação definida manualmente'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default GraduationView;
