import React from 'react';
import { Award, BellRing, BookOpen, Medal, TimerReset } from 'lucide-react';
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

function beltLabel(value: string) {
  switch (value.trim().toLowerCase()) {
    case 'white':
    case 'branca':
      return 'Branca';
    case 'blue':
    case 'azul':
      return 'Azul';
    case 'purple':
    case 'roxa':
      return 'Roxa';
    case 'brown':
    case 'marrom':
      return 'Marrom';
    case 'black':
    case 'preta':
      return 'Preta';
    default:
      return value;
  }
}

const GraduationView: React.FC<GraduationViewProps> = ({
  user,
  profile,
  academy,
  graduations,
}) => {
  const rules = academy.progressionRules?.milestones ?? [];
  const currentRule = rules.find((entry) => entry.belt === profile.belt.toLowerCase()) ?? rules[0];
  const nextStripeRemaining = Math.max(user.classesToNextStripe - user.currentStripeProgress, 0);
  const nextBeltRemaining = Math.max(user.totalClassesToNextBelt - user.currentBeltProgress, 0);
  const examWindow = nextBeltRemaining <= 5 || nextStripeRemaining <= 2;

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      <section className="rounded-[28px] border border-gray-100 dark:border-white/5 bg-white dark:bg-dark-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Graduacao</p>
            <h1 className="mt-2 text-3xl font-black">Faixa atual: {beltLabel(profile.belt)}</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Grau atual {profile.grade} • {profile.attendanceCount} presencas registradas
            </p>
          </div>
          <div className="rounded-2xl border border-gold/20 bg-gold/5 px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Versao da regra</p>
            <p className="mt-1 text-lg font-bold">v{academy.progressionRules?.version ?? 1}</p>
          </div>
        </div>

        <div className="mt-6">
          <BjjBelt color={user.belt} stripes={user.stripes} />
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
                <span>{user.currentStripeProgress} / {user.classesToNextStripe} aulas</span>
              </div>
              <ProgressBar current={user.currentStripeProgress} total={user.classesToNextStripe} />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Restam {nextStripeRemaining} aula(s) para atingir o proximo marco.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-semibold">Proxima faixa</span>
                <span>{user.currentBeltProgress} / {user.totalClassesToNextBelt} aulas</span>
              </div>
              <ProgressBar current={user.currentBeltProgress} total={user.totalClassesToNextBelt} color="bg-zinc-950 dark:bg-gold" />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Restam {nextBeltRemaining} aula(s) para chegar no proximo ciclo de faixa.
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
                ? 'Seu perfil ja esta perto da proxima avaliacao. Vale alinhar expectativa com o professor responsavel.'
                : 'Continue registrando presencas e acompanhando os marcos para a proxima graduacao.'}
            </p>
          </div>

          {currentRule ? (
            <div className="mt-5 rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5 p-4 text-sm">
              <p className="font-semibold">Regra atual da faixa {beltLabel(currentRule.belt)}</p>
              <p className="mt-2 text-gray-500 dark:text-gray-400">
                Minimo {currentRule.minAttendances} presencas • novo grau a cada {currentRule.stripeEvery} aulas • maximo {currentRule.maxStripes} graus
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
          {graduations.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">
                    {beltLabel(entry.previousBelt)} {entry.previousStripes} → {beltLabel(entry.newBelt)} {entry.newStripes}
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
            <p className="text-sm text-gray-500 dark:text-gray-400">Configuracao oficial da academia.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {rules.map((entry) => (
            <div key={`${entry.belt}-${entry.minAttendances}`} className="rounded-2xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold">{beltLabel(entry.belt)}</p>
                <TimerReset size={16} className="text-gold" />
              </div>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Minimo {entry.minAttendances} presencas
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Grau a cada {entry.stripeEvery} aulas
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Maximo {entry.maxStripes} graus
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default GraduationView;
