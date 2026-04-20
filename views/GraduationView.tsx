import React, { useMemo } from 'react';
import { Award, BellRing, BookOpen, Medal, TimerReset } from 'lucide-react';
import {
  beltLabel,
  inferKidsCategoryFromBirthDate,
  inferTrainingTypeFromBirthDate,
  isKidsOnlyBelt,
  kidsCategoryLabel,
  normalizeBeltId,
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
  const inferredKidsCategory = profile.kidsCategory ?? user.kidsCategory ?? inferKidsCategoryFromBirthDate(birthDate);
  const currentBeltId = normalizeBeltId(profile.belt);
  const trainingType = isKidsOnlyBelt(currentBeltId)
    || Boolean(profile.kidsCategory ?? user.kidsCategory)
    || inferTrainingTypeFromBirthDate(birthDate) === 'Kids'
    ? 'Kids'
    : 'Adulto';
  const activeRules = trainingType === 'Kids'
    ? normalizedRules.kids[inferredKidsCategory ?? 'level_kids'].belts
    : normalizedRules.adult.belts;
  const currentRule = activeRules.find((entry) => normalizeBeltId(entry.belt) === currentBeltId) ?? activeRules[0];

  const stripeProgress = Math.max(0, user.currentStripeProgress ?? 0);
  const stripeTotal = Math.max(0, user.classesToNextStripe ?? 0);
  const beltProgress = Math.max(0, user.currentBeltProgress ?? 0);
  const beltTotal = Math.max(0, user.totalClassesToNextBelt ?? 0);
  const nextStripeRemaining = stripeTotal > 0 ? Math.max(stripeTotal - stripeProgress, 0) : null;
  const nextBeltRemaining = beltTotal > 0 ? Math.max(beltTotal - beltProgress, 0) : null;
  const examWindow = (nextBeltRemaining !== null && nextBeltRemaining <= 5)
    || (nextStripeRemaining !== null && nextStripeRemaining <= 2);

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
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
          <BjjBelt color={normalizeBeltId(profile.belt)} stripes={profile.stripes} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-gray-100 dark:border-white/5 bg-white dark:bg-dark-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gold/10 p-3 text-gold">
              <Medal size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Requisitos para o proximo passo</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Calculado pelas regras atuais da academia.</p>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-semibold">Proximo grau</span>
                <span>
                  {stripeTotal > 0 ? `${stripeProgress} / ${stripeTotal} aulas` : 'Progressao manual'}
                </span>
              </div>
              <ProgressBar current={stripeProgress} total={stripeTotal} />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {nextStripeRemaining === null
                  ? 'Essa faixa nao tem liberacao automatica de grau por aulas.'
                  : `Restam ${nextStripeRemaining} aula(s) para atingir o proximo grau.`}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-semibold">Proxima faixa</span>
                <span>
                  {beltTotal > 0 ? `${beltProgress} / ${beltTotal} aulas` : 'Progressao manual'}
                </span>
              </div>
              <ProgressBar current={beltProgress} total={beltTotal} color="bg-zinc-950 dark:bg-gold" />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {nextBeltRemaining === null
                  ? 'A proxima faixa depende de avaliacao manual.'
                  : `Restam ${nextBeltRemaining} aula(s) para a proxima faixa.`}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-gray-100 dark:border-white/5 bg-white dark:bg-dark-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gold/10 p-3 text-gold">
              <BellRing size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Aviso de exame</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Sinalizacao automatica pelo progresso.</p>
            </div>
          </div>

          <div className={`mt-6 rounded-3xl p-5 ${examWindow ? 'bg-gold text-black' : 'bg-gray-50 dark:bg-white/5'}`}>
            <p className="text-xs uppercase tracking-[0.3em] opacity-70">Status</p>
            <p className="mt-3 text-2xl font-black">
              {examWindow ? 'Proximo de avaliacao' : 'Acompanhamento em andamento'}
            </p>
            <p className="mt-3 text-sm">
              {examWindow
                ? 'Seu perfil ja esta perto da proxima avaliacao. Vale alinhar a expectativa com o professor responsavel.'
                : 'Continue registrando presencas e acompanhando os marcos para a proxima graduacao.'}
            </p>
          </div>

          {currentRule ? (
            <div className="mt-5 rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5 p-4 text-sm">
              <p className="font-semibold">Regra atual da faixa {beltLabel(currentRule.belt)}</p>
              <p className="mt-2 text-gray-500 dark:text-gray-400">
                {currentRule.stripeEvery > 0
                  ? `Novo grau a cada ${currentRule.stripeEvery} aulas • maximo ${currentRule.maxStripes} graus`
                  : 'Progressao manual para graus e faixas seguintes.'}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[28px] border border-gray-100 dark:border-white/5 bg-white dark:bg-dark-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gold/10 p-3 text-gold">
            <Award size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Historico de graduacoes</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Faixas, graus e motivo de promocao.</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {[...graduations].sort((a, b) => {
            const aMs = a.promotedAt?.toMillis() ?? 0;
            const bMs = b.promotedAt?.toMillis() ?? 0;
            return bMs - aMs;
          }).map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">
                    {beltLabel(entry.previousBelt)} {entry.previousStripes}{' -> '}{beltLabel(entry.newBelt)} {entry.newStripes}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {entry.attendanceCount} presencas • motivo: {entry.reason.replaceAll('_', ' ')}
                  </p>
                </div>
                <div className="text-sm font-semibold text-gold">
                  {entry.promotedAt ? entry.promotedAt.toDate().toLocaleDateString('pt-BR') : 'Sem data'}
                </div>
              </div>
            </div>
          ))}

          {graduations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 p-5 text-sm text-gray-500 dark:text-gray-400">
              Ainda nao ha graduacoes registradas para este perfil.
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[28px] border border-gray-100 dark:border-white/5 bg-white dark:bg-dark-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gold/10 p-3 text-gold">
            <BookOpen size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Regras por faixa</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {trainingType === 'Kids'
                ? `Configuracao oficial da academia para ${kidsCategoryLabel(inferredKidsCategory)}.`
                : 'Configuracao oficial da academia para o programa adulto.'}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {activeRules.map((entry, index) => (
            <div key={`${entry.belt}-${index}`} className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">{beltLabel(entry.belt)}</p>
                <TimerReset size={16} className="text-gold" />
              </div>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {entry.stripeEvery > 0 ? `Grau a cada ${entry.stripeEvery} aulas` : 'Progressao manual'}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {entry.maxStripes > 0 ? `Maximo ${entry.maxStripes} graus` : 'Sem regra automatica de graus'}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {entry.stripeEvery > 0 && entry.maxStripes > 0
                  ? `Proxima faixa em ${entry.stripeEvery * entry.maxStripes} aulas`
                  : 'Avaliacao definida manualmente'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default GraduationView;
