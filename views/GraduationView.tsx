import React, { useMemo } from 'react';
import { Award, BellRing, BookOpen, Medal, TimerReset } from 'lucide-react';
import {
  beltLabel,
  getBlackBeltProgressForUser,
  getClassesToNextBelt,
  getUserProgressionSummary,
  isBlackBelt,
  kidsCategoryLabel,
  normalizeProgressionRules,
} from '../beltCatalog';
import BeltImage from '../components/BeltImage';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, GraduationRecord, UserRecord } from '../services/firebase/models';
import type { User } from '../types';
import { t, getLocale } from '../i18n';
import './redesign/evolution.css';

export interface GraduationViewProps {
  user: User;
  profile: FirestoreEntity<UserRecord>;
  academy: FirestoreEntity<AcademyRecord>;
  graduations: Array<FirestoreEntity<GraduationRecord>>;
}

/**
 * Progresso de faixa/grau do aluno. Fonte unica para o GraduationView e o bloco amarelo da
 * Evolucao: tudo sai de getUserProgressionSummary, para bater com o backend.
 */
export function useGraduationProgression({ user, profile, academy }: Pick<GraduationViewProps, 'user' | 'profile' | 'academy'>) {
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
      attendanceCountBonus: profile.attendanceCountBonus ?? user.attendanceCountBonus,
      attendanceCountAtBeltStart: profile.attendanceCountAtBeltStart ?? user.attendanceCountAtBeltStart,
      currentStripeProgress: user.currentStripeProgress,
      currentBeltProgress: user.currentBeltProgress,
    }, academy.progressionRules),
    [
      academy.progressionRules,
      birthDate,
      profile.attendanceCount,
      profile.attendanceCountBonus,
      profile.attendanceCountAtBeltStart,
      profile.belt,
      profile.grade,
      profile.kidsCategory,
      profile.stripes,
      user.attendanceCountBonus,
      user.attendanceCountAtBeltStart,
      user.currentBeltProgress,
      user.currentStripeProgress,
      user.kidsCategory,
      user.type,
    ],
  );

  // Faixa preta: grau por tempo (padrao IBJJF) + override manual.
  const blackBelt = useMemo(
    () => (isBlackBelt(profile.belt) ? getBlackBeltProgressForUser({
      belt: profile.belt,
      lastGraduation: user.lastGraduation,
      blackBeltDegreeManual: user.blackBeltDegreeManual,
    }) : null),
    [profile.belt, user.lastGraduation, user.blackBeltDegreeManual],
  );

  const examWindow = (progression.beltRemaining !== null && progression.beltRemaining <= 5)
    || (progression.stripeRemaining !== null && progression.stripeRemaining <= 2);

  return { normalizedRules, progression, blackBelt, examWindow };
}

export function graduationReasonLabel(reason: string | undefined | null): string {
  switch (reason) {
    case 'automatic_progression':
      return t('Progressão automática');
    case 'manual_progression':
      return t('Progressão manual');
    default:
      return (reason ?? '').replaceAll('_', ' ');
  }
}

const percentOf = (current: number, total: number) => (total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0);

const Meter: React.FC<{ label: string; value: string; current: number; total: number; note: string }> = ({
  label,
  value,
  current,
  total,
  note,
}) => (
  <div className="rd-grad__meter">
    <div className="rd-grad__meter-row">
      <span className="rd-grad__meter-label">{label}</span>
      <span className="rd-grad__meter-value">{value}</span>
    </div>
    <div
      className="lv-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(total, 0)}
      aria-valuenow={Math.min(current, Math.max(total, 0))}
    >
      <span style={{ width: `${percentOf(current, total)}%` }} />
    </div>
    <p className="rd-grad__note">{note}</p>
  </div>
);

const CardHead: React.FC<{ icon: React.ReactNode; label: string; title: string; children?: React.ReactNode }> = ({
  icon,
  label,
  title,
  children,
}) => (
  <header className="rd-grad__card-head">
    <span className="rd-grad__icon" aria-hidden="true">{icon}</span>
    <div className="rd-grad__card-titles">
      <span className="lv-label">{label}</span>
      <h3 className="lv-title-md">{title}</h3>
      {children}
    </div>
  </header>
);

const GraduationView: React.FC<GraduationViewProps> = ({
  user,
  profile,
  academy,
  graduations,
}) => {
  const { normalizedRules, progression, blackBelt, examWindow } = useGraduationProgression({ user, profile, academy });
  const inferredKidsCategory = progression.kidsCategory ?? profile.kidsCategory ?? user.kidsCategory;
  const trainingType = progression.track;
  const currentRule = progression.currentRule;

  const stripeCycleProgress = progression.stripeCycleProgress;
  const stripeCycleTotal = progression.stripeCycleTotal;
  const stripeCycleRemaining = progression.stripeCycleRemaining;
  const beltProgress = progression.beltProgress;
  const beltTotal = progression.beltTotal;
  const nextBeltRemaining = progression.beltRemaining;

  const sortedGraduations = useMemo(() => [...graduations].sort((a, b) => {
    const aMs = a.promotedAt?.toMillis() ?? 0;
    const bMs = b.promotedAt?.toMillis() ?? 0;
    return bMs - aMs;
  }), [graduations]);

  const beltStripeSlots = Math.max(currentRule?.maxStripes ?? 0, profile.stripes ?? 0);

  return (
    <div className="lv-screen rd-grad">
      <section className="lv-card rd-grad__current">
        <div className="rd-grad__current-head">
          <div className="rd-grad__card-titles">
            <span className="lv-label">{t('Faixa atual')}</span>
            <h2 className="lv-title-lg">{beltLabel(profile.belt)}</h2>
            <p className="rd-grad__note">
              {t('Grau atual {grade} • {count} presenças nessa faixa', { grade: profile.grade, count: progression.beltProgress })}
            </p>
          </div>
        </div>

        <div className="rd-grad__chips">
          <span className="lv-chip">{t('Regra v{version}', { version: normalizedRules.version })}</span>
          <span className="lv-chip">{t('Trilha {track}', { track: t(trainingType) })}</span>
          {trainingType === 'Kids' ? (
            <span className="lv-chip">{kidsCategoryLabel(inferredKidsCategory)}</span>
          ) : null}
          {examWindow ? <span className="lv-chip lv-chip--yellow">{t('Janela de exame')}</span> : null}
        </div>

        <div className="rd-grad__belt">
          <BeltImage
            belt={progression.currentBelt}
            stripes={blackBelt ? blackBelt.degree : profile.stripes}
            maxStripes={blackBelt ? undefined : beltStripeSlots}
            blackBelt={blackBelt}
            alt={blackBelt ? blackBelt.label : beltLabel(progression.currentBelt)}
          />
        </div>
      </section>

      <div className="rd-grad__grid">
        <section className="lv-card rd-grad__card">
          <CardHead icon={<Medal size={18} strokeWidth={2} />} label={t('Requisitos')} title={t('Proximo passo')} />

          <Meter
            label={t('Próximo grau')}
            value={stripeCycleTotal > 0
              ? t('{current} / {total} aulas', { current: stripeCycleProgress, total: stripeCycleTotal })
              : t('Progressão manual')}
            current={stripeCycleProgress}
            total={stripeCycleTotal}
            note={stripeCycleRemaining === null
              ? t('Essa faixa não tem liberação automática de grau por aulas.')
              : t('Restam {count} aula(s) para atingir o próximo grau.', { count: stripeCycleRemaining })}
          />

          <Meter
            label={t('Próxima faixa')}
            value={beltTotal > 0
              ? t('{current} / {total} aulas', { current: beltProgress, total: beltTotal })
              : t('Progressão manual')}
            current={beltProgress}
            total={beltTotal}
            note={nextBeltRemaining === null
              ? t('A próxima faixa depende de avaliação manual.')
              : t('Restam {count} aula(s) para a próxima faixa.', { count: nextBeltRemaining })}
          />
        </section>

        <section className="lv-card rd-grad__card">
          <CardHead icon={<BellRing size={18} strokeWidth={2} />} label={t('Aviso')} title={t('Status de exame')} />

          <div className={`rd-grad__exam ${examWindow ? 'rd-grad__exam--hot' : ''}`}>
            <span className="rd-grad__exam-label">{t('Status')}</span>
            <p className="rd-grad__exam-title">
              {examWindow ? t('Próximo de avaliação') : t('Em acompanhamento')}
            </p>
            <p className="rd-grad__exam-text">
              {examWindow
                ? t('Seu perfil já está perto da próxima avaliação. Vale alinhar a expectativa com o professor responsável.')
                : t('Continue registrando presenças e acompanhando os marcos para a próxima graduação.')}
            </p>
          </div>

          {currentRule ? (
            <div className="rd-grad__rule">
              <p className="rd-grad__rule-title">{t('Regra atual — Faixa {belt}', { belt: beltLabel(currentRule.belt) })}</p>
              <p className="rd-grad__note">
                {currentRule.stripeEvery > 0
                  ? `${t('Novo grau a cada {every} aulas • máximo {max} graus', { every: currentRule.stripeEvery, max: currentRule.maxStripes })}${beltTotal > 0 ? ` • ${t('{count} aulas para a próxima faixa', { count: beltTotal })}` : ''}`
                  : t('Progressão manual para graus e faixas seguintes.')}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <section className="lv-card rd-grad__card">
        <CardHead icon={<Award size={18} strokeWidth={2} />} label={t('Conquistas')} title={t('Histórico de graduações')} />

        {sortedGraduations.length > 0 ? (
          <div className="lv-list rd-grad__history">
            {sortedGraduations.map((entry) => (
              <div key={entry.id} className="lv-row rd-grad__history-row">
                <BeltImage
                  belt={entry.newBelt}
                  stripes={entry.newStripes}
                  hideEmptyStripes
                  className="lv-belt-mini"
                />
                <div className="lv-row__main">
                  <span className="rd-grad__history-title">
                    {beltLabel(entry.previousBelt)} {entry.previousStripes}{' → '}{beltLabel(entry.newBelt)} {entry.newStripes}
                  </span>
                  <span className="lv-row__meta">
                    {t('{count} presenças', { count: entry.attendanceCount })} • {graduationReasonLabel(entry.reason)}
                  </span>
                </div>
                <span className="lv-chip lv-chip--gold rd-grad__date-chip">
                  {entry.promotedAt ? entry.promotedAt.toDate().toLocaleDateString(getLocale()) : t('Sem data')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rd-grad__empty">{t('Ainda não há graduações registradas para este perfil.')}</p>
        )}
      </section>

      <section className="lv-card rd-grad__card">
        <CardHead icon={<BookOpen size={18} strokeWidth={2} />} label={t('Referência')} title={t('Regra da faixa atual')}>
          <p className="rd-grad__note">
            {trainingType === 'Kids'
              ? t('Configuração oficial da academia para {category}.', { category: kidsCategoryLabel(inferredKidsCategory) })
              : t('Configuração oficial da academia para o programa adulto.')}
          </p>
        </CardHead>

        {[currentRule].map((entry, index) => (
          <div key={`${entry.belt}-${index}`} className="rd-grad__rule">
            <div className="rd-grad__rule-head">
              <p className="rd-grad__rule-title">{beltLabel(entry.belt)}</p>
              <TimerReset size={16} strokeWidth={2} className="rd-grad__rule-icon" aria-hidden="true" />
            </div>
            <p className="rd-grad__note">
              {entry.stripeEvery > 0 ? t('Grau a cada {count} aulas', { count: entry.stripeEvery }) : t('Progressão manual')}
            </p>
            <p className="rd-grad__note">
              {entry.maxStripes > 0 ? t('Máximo {count} graus', { count: entry.maxStripes }) : t('Sem regra automática de graus')}
            </p>
            <p className="rd-grad__note">
              {entry.stripeEvery > 0 && entry.maxStripes > 0
                ? t('Próxima faixa em {count} aulas', { count: getClassesToNextBelt(entry) })
                : t('Avaliação definida manualmente')}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
};

export default GraduationView;
